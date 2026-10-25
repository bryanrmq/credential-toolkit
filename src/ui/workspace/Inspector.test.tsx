// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Group, type GroupLink, emptyProject, newAttribute, newGroupLink, walkNodes } from '../../core/model';
import { useStore } from '../../state/store';
import { pngDataUrl } from '../../test/images';
import { Inspector } from './Inspector';

/** Root: a, b, c, d, e, f, g, box { inner }. */
function loadProject() {
  const project = emptyProject(['de-CH', 'en-GB']);
  const box = newGroupLink('box', { source: ['box'] });
  box.group.children.push(newAttribute('inner', { source: ['box', 'inner'] }));
  project.root.children.push(...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => newAttribute(key, { source: [key] })), box);
  useStore.getState().load(project);
}

const root = () => useStore.getState().project!.root;
const keys = (group: Group) => group.children.map((child) => child.key);
const idOf = (key: string) => [...walkNodes(root())].find(({ node }) => node.key === key)!.node.id;
const selectKeys = (...selected: string[]) => useStore.getState().select({ kind: 'node', id: idOf(selected[0]), ids: selected.map(idOf) });

beforeEach(loadProject);

describe('Inspector with several nodes selected', () => {
  it('heads the pane with the count and lists the first five keys in mono', () => {
    selectKeys('a', 'b', 'c', 'd', 'e', 'f', 'g');
    render(<Inspector />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('7 items selected');
    const list = screen.getByRole('list', { name: 'Selected keys' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['a', 'b', 'c', 'd', 'e', '+ 2 more']);
    expect(items[0]).toHaveClass('mono');
    expect(items[5]).not.toHaveClass('mono');
  });

  it('lists every key without "more" for five or fewer, and shows only the actions', () => {
    selectKeys('b', 'inner');
    render(<Inspector />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 items selected');
    expect(within(screen.getByRole('list', { name: 'Selected keys' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['b', 'inner']);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Key')).not.toBeInTheDocument();
    expect(screen.queryByText('en-GB', { selector: '.lang-row__code' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group' })).toHaveAttribute('aria-keyshortcuts');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-keyshortcuts', 'Backspace');
  });

  it('groups the selection, selects the new group and focuses its key', async () => {
    const user = userEvent.setup();
    selectKeys('b', 'd');
    render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Group' }));
    expect(keys(root())).toEqual(['a', 'group', 'c', 'e', 'f', 'g', 'box']);
    const group = root().children[1] as GroupLink;
    expect(keys(group.group)).toEqual(['b', 'd']);
    expect(useStore.getState().selection).toMatchObject({ kind: 'node', id: group.id, ids: [group.id] });
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());
    expect(screen.getByLabelText('Key')).toHaveValue('group');
  });

  it('moves every selected node into the chosen group, in order, with references following', async () => {
    const user = userEvent.setup();
    useStore.getState().update((draft) => void (draft.root.children[0].labels['en-GB'] = '{{c}}'));
    selectKeys('c', 'e');
    render(<Inspector />);
    const select = screen.getByRole('combobox', { name: 'Move to' });
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Move to…', 'Credential (top level)', 'box']);
    await user.selectOptions(select, 'box');
    const box = root().children.at(-1) as GroupLink;
    expect(keys(root())).toEqual(['a', 'b', 'd', 'f', 'g', 'box']);
    expect(keys(box.group)).toEqual(['inner', 'c', 'e']);
    expect(root().children[0].labels['en-GB']).toBe('{{box.c}}');
    expect(useStore.getState().selection).toMatchObject({ ids: [idOf('c'), idOf('e')] });
  });

  it('does not offer a selected group or its subtree as a target', () => {
    selectKeys('a', 'box');
    render(<Inspector />);
    expect(within(screen.getByRole('combobox', { name: 'Move to' })).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Move to…',
      'Credential (top level)',
    ]);
  });

  it('deletes the selection without asking, selects the next row, and can be undone', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    selectKeys('b', 'd');
    render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(keys(root())).toEqual(['a', 'c', 'e', 'f', 'g', 'box']);
    expect(useStore.getState().selection).toMatchObject({ kind: 'node', id: idOf('e'), ids: [idOf('e')] });
    act(() => useStore.getState().undo());
    expect(keys(root())).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'box']);
    confirm.mockRestore();
  });

  it('selects the row above when the deleted ones were last, and the credential once the tree is empty', async () => {
    const user = userEvent.setup();
    selectKeys('c', 'box');
    const { unmount } = render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useStore.getState().selection).toMatchObject({ kind: 'node', id: idOf('g') });
    unmount();

    act(() => selectKeys('a', 'b', 'd', 'e', 'f', 'g'));
    render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(root().children).toEqual([]);
    expect(useStore.getState().selection).toEqual({ kind: 'credential' });
  });

  it('shows the normal Edit pane again for a single node', () => {
    selectKeys('a', 'b');
    render(<Inspector />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 items selected');
    act(() => selectKeys('a'));
    expect(screen.queryByText(/items selected/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('a');
    expect(screen.getByRole('combobox', { name: 'Group' })).toBeInTheDocument();
    expect(screen.getByLabelText('Label (en-GB)')).toBeInTheDocument();
  });
});

describe('Inspector for the credential', () => {
  it('edits the name and branding, with the wallet preview after the form', () => {
    useStore.getState().select({ kind: 'credential' });
    render(<Inspector />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    const preview = screen.getByRole('region', { name: 'Preview' });
    const [formTheme, previewTheme] = screen.getAllByRole('group', { name: 'Wallet theme' });
    expect(formTheme.compareDocumentPosition(preview)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(preview).getByRole('group', { name: 'Wallet theme' })).toBe(previewTheme);
    expect(screen.getAllByRole('figure')).toEqual([within(preview).getByRole('figure', { name: 'iOS card' })]);
    expect(within(preview).getByRole('group', { name: 'Preview platform' })).toBeInTheDocument();
    expect(within(preview).getByText(/Approximation of the swiyu wallets/)).toBeInTheDocument();
  });

  it('shows the logo in the Logo field as the wallet tints it on the background colour', () => {
    const logo = pngDataUrl(28, 28);
    useStore.getState().update((draft) => void (draft.branding['de-CH'] = { light: { logo } }));
    useStore.getState().select({ kind: 'credential' });
    render(<Inspector />);
    const thumbnail = () => screen.getByRole('img', { name: 'Logo as the wallet draws it' });
    // No colour yet: a checkerboard, and the black the wallet uses on its default colour.
    expect(thumbnail()).toHaveClass('logo-input__thumb--none');
    expect(thumbnail().querySelector('img')).toHaveStyle({ filter: 'brightness(0)' });

    act(() => useStore.getState().update((draft) => void (draft.branding['de-CH'].light.primaryBackgroundColor = '#0A2841')));
    expect(thumbnail()).not.toHaveClass('logo-input__thumb--none');
    expect(thumbnail()).toHaveStyle({ background: 'rgba(10, 40, 65, 1)' });
    expect(thumbnail().querySelector('img')).toHaveAttribute('src', logo);
    expect(thumbnail().querySelector('img')).toHaveStyle({ filter: 'brightness(0) invert(1)' });
  });
});
