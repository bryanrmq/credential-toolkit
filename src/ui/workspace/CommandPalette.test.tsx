// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { useStore } from '../../state/store';
import { availableCommands, commandLabel } from '../lib/commands';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

/** a "Alpha", person "Person" { b "Beta", c "Gamma" }, d "Delta". */
function loadProject() {
  const project = emptyProject(['de-CH']);
  const person = newGroupLink('person', { labels: { 'de-CH': 'Person' } });
  person.group.children.push(newAttribute('b', { labels: { 'de-CH': 'Beta' } }), newAttribute('c', { labels: { 'de-CH': 'Gamma' } }));
  project.root.children.push(newAttribute('a', { labels: { 'de-CH': 'Alpha' } }), person, newAttribute('d', { labels: { 'de-CH': 'Delta' } }));
  useStore.getState().load(project);
}

const idOf = (key: string) => {
  const project = useStore.getState().project!;
  const stack = [...project.root.children];
  while (stack.length) {
    const node = stack.shift()!;
    if (node.key === key) return node.id;
    if (node.kind === 'group') stack.push(...node.group.children);
  }
  throw new Error(`No node ${key}`);
};
const select = (key: string) => useStore.getState().select({ kind: 'node', id: idOf(key) });
const row = (key: string) =>
  within(screen.getByRole('tree', { name: 'Structure' }))
    .getAllByRole('treeitem')
    .find((item) => item.querySelector('.tree__key')?.textContent === key);

const palette = () => screen.queryByRole('dialog', { name: 'Search and commands' });
const search = () => screen.getByRole('combobox', { name: 'Search attributes and commands' });
/** ⌘K (or Ctrl+K with `ctrl`) on the focused element. */
const pressPalette = (ctrl = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'k', metaKey: !ctrl, ctrlKey: ctrl });
const group = (name: 'Attributes' | 'Commands') => screen.queryByRole('group', { name });
const labels = (name: 'Attributes' | 'Commands') =>
  within(group(name)!)
    .getAllByRole('option')
    .map((option) => option.querySelector('.palette__label')?.textContent);
const activeOption = () => document.getElementById(search().getAttribute('aria-activedescendant') ?? '');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  useStore.getState().close();
  loadProject();
});

afterEach(() => vi.unstubAllGlobals());

describe('command palette', () => {
  it('opens with ⌘K or Ctrl+K from anywhere in the workspace and closes with Escape, focus going back', () => {
    render(<Workspace />);
    const field = screen.getByLabelText('Name');
    field.focus();
    pressPalette();
    expect(palette()).toBeInTheDocument();
    expect(palette()).toHaveAttribute('aria-modal', 'true');
    expect(search()).toHaveFocus();
    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(palette()).not.toBeInTheDocument();
    expect(field).toHaveFocus();

    select('a');
    row('a')!.focus();
    pressPalette(true);
    expect(palette()).toBeInTheDocument();
    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(row('a')).toHaveFocus();
  });

  it('closes on a click outside it', () => {
    render(<Workspace />);
    pressPalette();
    fireEvent.mouseDown(palette()!.parentElement!);
    expect(palette()).not.toBeInTheDocument();
  });

  it('does not open while another dialog or the tour is open', () => {
    useStore.getState().setLanguagesOpen(true);
    const { unmount } = render(<Workspace />);
    pressPalette();
    expect(palette()).not.toBeInTheDocument();
    useStore.getState().setLanguagesOpen(false);
    unmount();

    useStore.getState().setTourOpen(true);
    render(<Workspace />);
    pressPalette();
    expect(palette()).not.toBeInTheDocument();
  });

  it('lists only the commands that apply now while the query is empty, not itself', () => {
    render(<Workspace />);
    select('a');
    const expected = availableCommands()
      .filter((entry) => entry.id !== 'workspace.palette')
      .map((entry) => commandLabel(entry.id));
    pressPalette();
    expect(group('Attributes')).not.toBeInTheDocument();
    expect(labels('Commands')).toEqual(expected);
    expect(labels('Commands')).toContain('Delete');
    expect(labels('Commands')).not.toContain('Undo');
    expect(labels('Commands')).not.toContain('Search and commands');
    // A command shows its keys.
    const rename = within(group('Commands')!).getByRole('option', { name: /Rename/ });
    expect(rename.querySelector('kbd')).toHaveTextContent('F2');
  });

  it('finds attributes and groups by label, key and path, before commands, ranked', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    pressPalette();
    await user.type(search(), 'person');
    // The group by its key, and what is inside it by its path.
    expect(labels('Attributes')).toEqual(['Person', 'Beta', 'Gamma']);
    const beta = within(group('Attributes')!).getAllByRole('option')[1];
    expect(beta.querySelector('.palette__path')).toHaveTextContent('person.b');
    expect(beta.querySelector('.palette__meta')).toHaveTextContent('Person');
    expect(group('Commands')).not.toBeInTheDocument();

    await user.clear(search());
    await user.type(search(), 'a');
    // "Alpha" starts with it, the others hold it further in; ties keep tree order.
    expect(labels('Attributes')).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
    expect(labels('Commands')!.slice(0, 3)).toEqual(['Add attribute', 'Add group', 'Add list of objects']);
    const [first] = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveTextContent('Alpha');
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    pressPalette();
    await user.type(search(), 'zzz');
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toEqual([]);
    expect(search()).toHaveAttribute('aria-expanded', 'false');
    expect(search()).not.toHaveAttribute('aria-activedescendant');
  });

  it('selects a chosen attribute and reveals it through collapsed groups and the tree filter, focusing its row', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    act(() => {
      useStore.getState().setGroupOpen(idOf('person'), false);
      useStore.getState().setTreeFilter('delta');
    });
    expect(row('c')).toBeUndefined();
    pressPalette();
    await user.type(search(), 'gamma');
    await user.keyboard('{Enter}');
    expect(palette()).not.toBeInTheDocument();
    const state = useStore.getState();
    expect(state.selection).toMatchObject({ kind: 'node', id: idOf('c') });
    expect(state.collapsed).not.toContain(idOf('person'));
    expect(state.treeFilter).toBe('');
    await waitFor(() => expect(row('c')).toHaveFocus());
  });

  it('keeps a filter that shows the chosen attribute, and leaves the Translations view for it', async () => {
    const user = userEvent.setup();
    useStore.getState().setView('translations');
    useStore.getState().setTreeFilter('e');
    render(<Workspace />);
    pressPalette();
    await user.type(search(), 'beta');
    await user.click(within(group('Attributes')!).getByRole('option', { name: /Beta/ }));
    expect(useStore.getState().view).toBe('editor');
    expect(useStore.getState().treeFilter).toBe('e');
    await waitFor(() => expect(row('b')).toHaveFocus());
  });

  it('runs a chosen command on the current selection', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    select('d');
    row('d')!.focus();
    pressPalette();
    await user.type(search(), 'delete');
    expect(labels('Commands')).toEqual(['Delete']);
    await user.keyboard('{Enter}');
    expect(palette()).not.toBeInTheDocument();
    expect(() => idOf('d')).toThrow();

    pressPalette();
    await user.type(search(), 'undo');
    await user.click(screen.getByRole('option', { name: /Undo/ }));
    expect(idOf('d')).toBeDefined();
  });

  it('moves the active row across both groups with the arrows and the mouse, keeping focus in the search field', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    pressPalette();
    await user.type(search(), 'a');
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    const listbox = screen.getByRole('listbox');
    expect(search()).toHaveAttribute('aria-controls', listbox.id);
    expect(activeOption()).toBe(options[0]);

    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toBe(options[1]);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    // From the first row up to the last, a command.
    expect(activeOption()).toBe(options.at(-1));
    expect(within(group('Commands')!).getAllByRole('option')).toContain(activeOption());
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    // Down from the last attribute to the first command.
    expect(activeOption()).toBe(within(group('Commands')!).getAllByRole('option')[0]);

    fireEvent.mouseMove(options[2]);
    expect(activeOption()).toBe(options[2]);
    await user.keyboard('{Tab}');
    expect(search()).toHaveFocus();
  });

  it('shows the full-width sheet on narrow windows, where a chosen attribute shows the Structure pane', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const user = userEvent.setup();
    const { container } = render(<Workspace />);
    pressPalette();
    expect(palette()).toHaveClass('palette--sheet');
    await user.type(search(), 'gamma');
    await user.keyboard('{Enter}');
    expect(container.querySelector('.panes')).toHaveAttribute('data-pane', 'structure');
    await waitFor(() => expect(row('c')).toHaveFocus());
  });
});
