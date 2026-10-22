// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { useStore } from '../../state/store';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

/** a, person { b, c }, d: in tree order a, person, b, c, d. */
function loadProject() {
  const project = emptyProject(['de-CH']);
  const person = newGroupLink('person');
  person.group.children.push(newAttribute('b'), newAttribute('c'));
  project.root.children.push(newAttribute('a'), person, newAttribute('d'));
  useStore.getState().load(project);
}

const tree = () => screen.getByRole('tree', { name: 'Structure' });
/** The tree row whose key is `key` ("Credential" for the Credential row). */
const row = (key: string) => {
  const found = within(tree())
    .getAllByRole('treeitem')
    .find((item) => item.querySelector('.tree__key')?.textContent === key);
  if (!found) throw new Error(`No row "${key}"`);
  return found;
};
/** The keys of the selected rows, in tree order. */
const selectedKeys = () =>
  within(tree())
    .getAllByRole('treeitem', { selected: true })
    .map((item) => item.querySelector('.tree__key')?.textContent);
const primaryKey = () => {
  const selection = useStore.getState().selection;
  return selection.kind === 'node' ? keyOf(selection.id) : 'Credential';
};
function keyOf(id: string): string {
  const project = useStore.getState().project!;
  const stack = [...project.root.children];
  while (stack.length) {
    const node = stack.shift()!;
    if (node.id === id) return node.key;
    if (node.kind === 'group') stack.push(...node.group.children);
  }
  throw new Error(`No node ${id}`);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  loadProject();
});

describe('Structure tree', () => {
  it('is an ARIA tree with one tab stop', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    expect(tree()).toHaveAttribute('aria-multiselectable', 'true');
    const items = within(tree()).getAllByRole('treeitem');
    expect(items).toHaveLength(6);
    for (const item of items) expect(item).toHaveAttribute('aria-selected', item === row('Credential') ? 'true' : 'false');
    expect(row('b')).toHaveAttribute('aria-level', '2');
    expect(within(tree()).getByRole('group')).toContainElement(row('b'));
    // Only the selected row is in the tab order; the drag handles are not.
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([row('Credential')]);
    for (const handle of within(tree()).getAllByRole('button', { name: /^Move / })) expect(handle).toHaveAttribute('tabindex', '-1');

    await user.click(row('c'));
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([row('c')]);
    // Tab from the button before the tree lands on the selected row, and the next Tab leaves the tree.
    screen.getByRole('button', { name: 'List of objects' }).focus();
    await user.tab();
    expect(row('c')).toHaveFocus();
    await user.tab();
    expect(tree()).not.toContainElement(document.activeElement as HTMLElement);
  });

  it('selects one node on click and shows it in the Edit pane', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('b'));
    expect(selectedKeys()).toEqual(['b']);
    expect(screen.getByLabelText('Key')).toHaveValue('b');
    // Alone, the primary has no bar.
    expect(row('b')).not.toHaveAttribute('data-primary');
    await user.click(row('d'));
    expect(selectedKeys()).toEqual(['d']);
  });

  it('toggles nodes with ⌘-click and Ctrl-click, and the last clicked is the primary', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.keyboard('{Meta>}');
    await user.click(row('d'));
    await user.keyboard('{/Meta}');
    expect(selectedKeys()).toEqual(['a', 'd']);
    expect(primaryKey()).toBe('d');
    expect(row('d')).toHaveAttribute('data-primary');
    expect(row('a')).not.toHaveAttribute('data-primary');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 items selected');

    await user.keyboard('{Control>}');
    await user.click(row('b'));
    expect(selectedKeys()).toEqual(['a', 'b', 'd']);
    await user.click(row('a'));
    await user.keyboard('{/Control}');
    expect(selectedKeys()).toEqual(['b', 'd']);
  });

  it('never adds the credential to a multi-selection', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.keyboard('{Meta>}');
    await user.click(row('Credential'));
    await user.keyboard('{/Meta}');
    expect(selectedKeys()).toEqual(['Credential']);

    await user.keyboard('{Meta>}');
    await user.click(row('b'));
    await user.keyboard('{/Meta}');
    expect(selectedKeys()).toEqual(['b']);
    await user.keyboard('{Shift>}');
    await user.click(row('Credential'));
    await user.keyboard('{/Shift}');
    expect(selectedKeys()).toEqual(['Credential']);
  });

  it('selects a range with ⇧-click in visible tree order, across groups', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('c'));
    await user.keyboard('{Shift>}');
    await user.click(row('a'));
    expect(selectedKeys()).toEqual(['a', 'person', 'b', 'c']);
    expect(primaryKey()).toBe('a');
    // The range starts from the same row each time.
    await user.click(row('d'));
    await user.keyboard('{/Shift}');
    expect(selectedKeys()).toEqual(['c', 'd']);
    expect(primaryKey()).toBe('d');
  });

  it('moves the selection with ↑ / ↓ and extends it with ⇧↑ / ⇧↓', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('Credential'));
    await user.keyboard('{ArrowDown}');
    expect(selectedKeys()).toEqual(['a']);
    expect(row('a')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selectedKeys()).toEqual(['b']);
    expect(row('b')).toHaveFocus();

    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    expect(selectedKeys()).toEqual(['b', 'c', 'd']);
    expect(primaryKey()).toBe('d');
    expect(row('d')).toHaveFocus();
    // Past the last row nothing changes; ⇧↑ shrinks the range back towards where it started.
    await user.keyboard('{Shift>}{ArrowDown}{ArrowUp}{/Shift}');
    expect(selectedKeys()).toEqual(['b', 'c']);
    await user.keyboard('{Shift>}{ArrowUp}{ArrowUp}{ArrowUp}{/Shift}');
    expect(selectedKeys()).toEqual(['a', 'person', 'b']);
    // ⇧↑ stops before the Credential row.
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(selectedKeys()).toEqual(['a', 'person', 'b']);

    await user.keyboard('{ArrowUp}');
    expect(selectedKeys()).toEqual(['Credential']);
    expect(row('Credential')).toHaveFocus();
    await user.keyboard('{End}');
    expect(selectedKeys()).toEqual(['d']);
    await user.keyboard('{Home}');
    expect(selectedKeys()).toEqual(['Credential']);
  });

  it('leaves the arrow keys alone while focus is in a field', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.click(screen.getByLabelText('Key'));
    await user.keyboard('{ArrowDown}');
    expect(selectedKeys()).toEqual(['a']);
  });

  it('undo restores the multi-selection', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.keyboard('{Shift>}');
    await user.click(row('person'));
    await user.keyboard('{/Shift}');
    act(() => useStore.getState().update((draft) => void (draft.meta['de-CH'].description = 'Edited')));
    await user.click(row('d'));

    act(() => useStore.getState().undo());
    expect(selectedKeys()).toEqual(['a', 'person']);
    expect(row('person')).toHaveAttribute('data-primary');
  });

  describe('on narrow windows and touch', () => {
    it('selects one node on a modified click under 1000 px and switches to the Edit pane', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
      const user = userEvent.setup();
      const { container } = render(<Workspace />);
      expect(tree()).toHaveAttribute('aria-multiselectable', 'false');
      await user.click(row('a'));
      await user.keyboard('{Meta>}');
      await user.click(row('d'));
      await user.keyboard('{/Meta}');
      expect(selectedKeys()).toEqual(['d']);
      await user.keyboard('{Shift>}');
      await user.click(row('b'));
      await user.keyboard('{/Shift}');
      expect(selectedKeys()).toEqual(['b']);
      expect(container.querySelector('.panes')).toHaveAttribute('data-pane', 'inspector');
      // ⇧↓ moves instead of extending.
      await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
      expect(selectedKeys()).toEqual(['c']);
    });

    it('selects one node on a tap, even with a modifier held', async () => {
      const user = userEvent.setup();
      render(<Workspace />);
      await user.click(row('a'));
      await user.keyboard('{Shift>}');
      await user.pointer({ keys: '[TouchA]', target: row('d') });
      await user.keyboard('{/Shift}');
      expect(selectedKeys()).toEqual(['d']);
    });
  });
});

describe('tree keyboard shortcuts', () => {
  const topKeys = () => useStore.getState().project!.root.children.map((node) => node.key);
  const personKeys = () => {
    const person = useStore.getState().project!.root.children[1];
    return person.kind === 'group' ? person.group.children.map((node) => node.key) : [];
  };

  it('N adds an attribute right after the selected one and focuses its key field', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('b'));
    await user.keyboard('n');
    expect(personKeys()).toEqual(['b', 'attribute', 'c']);
    expect(selectedKeys()).toEqual(['attribute']);
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());
    expect(screen.getByLabelText('Key')).toHaveValue('attribute');

    await user.click(row('person'));
    await user.keyboard('n');
    expect(personKeys()).toEqual(['b', 'attribute', 'c', 'attribute_2']);
    await user.click(row('Credential'));
    await user.keyboard('n');
    expect(topKeys()).toEqual(['a', 'person', 'd', 'attribute']);
  });

  it('⌫ and Delete remove the selection without asking, select the next row, and ⌘Z restores it', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('person'));
    await user.keyboard('{Backspace}');
    expect(topKeys()).toEqual(['a', 'd']);
    expect(selectedKeys()).toEqual(['d']);
    await waitFor(() => expect(row('d')).toHaveFocus());
    // The last row falls back to the previous one.
    await user.keyboard('{Delete}');
    expect(topKeys()).toEqual(['a']);
    expect(selectedKeys()).toEqual(['a']);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(topKeys()).toEqual(['a', 'd']);
    expect(selectedKeys()).toEqual(['d']);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(topKeys()).toEqual(['a', 'person', 'd']);
    expect(selectedKeys()).toEqual(['person']);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('selects the credential once the tree is empty', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.keyboard('{Shift>}');
    await user.click(row('d'));
    await user.keyboard('{/Shift}');
    await user.keyboard('{Backspace}');
    expect(topKeys()).toEqual([]);
    expect(selectedKeys()).toEqual(['Credential']);
    await waitFor(() => expect(row('Credential')).toHaveFocus());
  });

  it('⏎ focuses the selected node’s key field', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('c'));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());
    expect(screen.getByLabelText('Key')).toHaveValue('c');
  });

  it('⌘G groups the selection and focuses the new group’s key field; ⇧⌘G ungroups it', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.keyboard('{Meta>}');
    await user.click(row('d'));
    await user.keyboard('g{/Meta}');
    expect(topKeys()).toEqual(['group', 'person']);
    expect(selectedKeys()).toEqual(['group']);
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveValue('group'));
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());

    await user.click(row('group'));
    await user.keyboard('{Control>}{Shift>}g{/Shift}{/Control}');
    expect(topKeys()).toEqual(['a', 'd', 'person']);
    expect(selectedKeys()).toEqual(['a', 'd']);
  });

  it('⇧⌘G does nothing on a list of objects', async () => {
    const project = useStore.getState().project!;
    const items = newGroupLink('items', { array: true, source: ['items', null] });
    items.group.children.push(newAttribute('e'));
    project.root.children.push(items);
    useStore.getState().load(project);
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('items'));
    await user.keyboard('{Meta>}{Shift>}g{/Shift}{/Meta}');
    expect(topKeys()).toEqual(['a', 'person', 'd', 'items']);
    expect(useStore.getState().past).toHaveLength(0);
  });

  it('⌥↑ / ⌥↓ move the selection by the edge rules and keep focus on it', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('b'));
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(personKeys()).toEqual(['c', 'b']);
    // At the bottom of its group it moves out, just after the group.
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(topKeys()).toEqual(['a', 'person', 'b', 'd']);
    await waitFor(() => expect(row('b')).toHaveFocus());
    expect(selectedKeys()).toEqual(['b']);
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(topKeys()).toEqual(['a', 'b', 'person', 'd']);
    await user.keyboard('{Alt>}{ArrowUp}{ArrowUp}{/Alt}');
    expect(topKeys()).toEqual(['b', 'a', 'person', 'd']);
  });

  it('types instead while focus is in a field', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    const label = screen.getByLabelText('Label');
    await user.click(label);
    await user.keyboard('Name{Backspace}');
    expect(label).toHaveValue('Nam');
    await user.keyboard('{Meta>}g{/Meta}{Alt>}{ArrowDown}{/Alt}');
    expect(topKeys()).toEqual(['a', 'person', 'd']);
  });

  it('does nothing while the tour or a dialog is open', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    // Both keep focus to themselves; the keys go straight to the row to check the tree holds back too.
    const pressOnRow = () => {
      fireEvent.keyDown(row('a'), { key: 'n' });
      fireEvent.keyDown(row('a'), { key: 'Backspace' });
    };
    act(() => useStore.getState().setTourOpen(true));
    pressOnRow();
    expect(topKeys()).toEqual(['a', 'person', 'd']);
    act(() => useStore.getState().setTourOpen(false));

    act(() => useStore.getState().setLanguagesOpen(true));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    pressOnRow();
    expect(topKeys()).toEqual(['a', 'person', 'd']);
    act(() => useStore.getState().setLanguagesOpen(false));
    fireEvent.keyDown(row('a'), { key: 'Backspace' });
    expect(topKeys()).toEqual(['person', 'd']);
  });

  it('does nothing under 1000 px', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    act(() => row('a').focus());
    await user.keyboard('n{Backspace}{Alt>}{ArrowDown}{/Alt}{Meta>}g{/Meta}');
    expect(topKeys()).toEqual(['a', 'person', 'd']);
  });

  it('the Edit pane’s Delete removes a group without asking and selects the next row', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('person'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(topKeys()).toEqual(['a', 'd']);
    expect(selectedKeys()).toEqual(['d']);
    expect(confirm).not.toHaveBeenCalled();
  });
});
