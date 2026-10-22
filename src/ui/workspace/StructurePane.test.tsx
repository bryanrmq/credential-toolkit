// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Node, emptyProject, newAttribute, newGroupLink } from '../../core/model';
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
    // Tab from the Add button goes to the filter box, then lands on the selected row, and the next Tab leaves the tree.
    within(screen.getByRole('region', { name: 'Structure' })).getByRole('button', { name: 'Add' }).focus();
    await user.tab();
    expect(screen.getByRole('searchbox', { name: 'Filter the structure' })).toHaveFocus();
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

  describe('drag and drop', () => {
    // jsdom has no layout: every row (and an empty group's drop line) is 32px tall, stacked in document order.
    const rowBoxes = () => [...document.querySelectorAll<HTMLElement>('[role="tree"] [data-row], .tree__empty--drop')];
    beforeEach(() => {
      const measure = HTMLElement.prototype.getBoundingClientRect;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const at = rowBoxes().indexOf(this);
        if (at < 0) return measure.call(this);
        return { top: at * 32, bottom: at * 32 + 32, left: 0, right: 300, width: 300, height: 32, x: 0, y: at * 32, toJSON: () => ({}) };
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** The pointer's height over `element`'s box: its middle by default. */
    const yOver = (element: HTMLElement, offset = 16) => rowBoxes().indexOf(element) * 32 + offset;
    /** Presses the handle of row `key` and moves past the activation distance; returns the moves and the release. */
    function startDrag(key: string) {
      const handle = within(row(key)).getByRole('button', { name: `Move ${key}` });
      const y = yOver(row(key));
      fireEvent.pointerDown(handle, { isPrimary: true, button: 0, clientX: 10, clientY: y });
      fireEvent.pointerMove(document, { clientX: 10, clientY: y + 6 });
      return {
        moveTo: (y: number) => fireEvent.pointerMove(document, { clientX: 10, clientY: y }),
        drop: () => fireEvent.pointerUp(document, { clientX: 10 }),
      };
    }
    /** The tree as nested keys, e.g. ['a', { person: ['b'] }]. */
    type Shape = (string | { [key: string]: Shape })[];
    const shapeOf = (children: Node[]): Shape => children.map((child) => (child.kind === 'group' ? { [child.key]: shapeOf(child.group.children) } : child.key));
    const shape = () => shapeOf(useStore.getState().project!.root.children);
    const addEmptyGroup = () => act(() => useStore.getState().update((draft) => void draft.root.children.push(newGroupLink('empty'))));

    it('drops on the middle of a group row inside it, at its end, as one undo step', () => {
      render(<Workspace />);
      const drag = startDrag('a');
      drag.moveTo(yOver(row('person')));
      expect(row('person')).toHaveAttribute('data-drop', 'inside');
      expect(tree().querySelectorAll('[data-drop]')).toHaveLength(1);
      drag.drop();
      expect(shape()).toEqual([{ person: ['b', 'c', 'a'] }, 'd']);
      expect(tree().querySelector('[data-drop]')).toBeNull();
      act(() => useStore.getState().undo());
      expect(shape()).toEqual(['a', { person: ['b', 'c'] }, 'd']);
    });

    it('reorders on the upper or lower part of a row, with an insertion line', () => {
      render(<Workspace />);
      const drag = startDrag('d');
      drag.moveTo(yOver(row('person'), 2));
      expect(row('person')).toHaveAttribute('data-drop', 'before');
      drag.moveTo(yOver(row('b'), 28));
      expect(row('b')).toHaveAttribute('data-drop', 'after');
      expect(row('person')).not.toHaveAttribute('data-drop');
      drag.drop();
      expect(shape()).toEqual(['a', { person: ['b', 'd', 'c'] }]);
    });

    it('shows an empty group its drop line only while dragging, and drops into it', () => {
      addEmptyGroup();
      render(<Workspace />);
      expect(screen.queryByText('Empty, drop items here')).not.toBeInTheDocument();
      expect(within(tree()).getByText('No attributes yet.')).toBeInTheDocument();
      const drag = startDrag('b');
      const line = screen.getByText('Empty, drop items here');
      expect(within(tree()).queryByText('No attributes yet.')).not.toBeInTheDocument();
      drag.moveTo(yOver(line));
      expect(row('empty')).toHaveAttribute('data-drop', 'inside');
      drag.drop();
      expect(shape()).toEqual(['a', { person: ['c'] }, 'd', { empty: ['b'] }]);
      expect(screen.queryByText('Empty, drop items here')).not.toBeInTheDocument();
    });

    it('drags the whole selection, in order, behind a chip counting it', async () => {
      addEmptyGroup();
      const user = userEvent.setup();
      render(<Workspace />);
      await user.click(row('d'));
      await user.keyboard('{Meta>}');
      await user.click(row('a'));
      await user.click(row('c'));
      await user.keyboard('{/Meta}');
      const drag = startDrag('c');
      expect(screen.getByText('3 items')).toBeInTheDocument();
      for (const key of ['a', 'c', 'd']) expect(row(key).parentElement).toHaveClass('tree__dragging');
      expect(row('b').parentElement).not.toHaveClass('tree__dragging');
      drag.moveTo(yOver(row('empty')));
      drag.drop();
      expect(shape()).toEqual([{ person: ['b'] }, { empty: ['a', 'c', 'd'] }]);
      expect(selectedKeys()).toEqual(['a', 'c', 'd']);
      act(() => useStore.getState().undo());
      expect(shape()).toEqual(['a', { person: ['b', 'c'] }, 'd', { empty: [] }]);
    });

    it('drags an unselected row on its own, previewing the row', async () => {
      const user = userEvent.setup();
      render(<Workspace />);
      await user.click(row('a'));
      await user.keyboard('{Meta>}');
      await user.click(row('b'));
      await user.keyboard('{/Meta}');
      const drag = startDrag('d');
      expect(screen.queryByText(/ items$/)).not.toBeInTheDocument();
      expect(document.querySelector('.tree__overlay .tree__key')).toHaveTextContent('d');
      drag.moveTo(yOver(row('a'), 2));
      drag.drop();
      expect(shape()).toEqual(['d', 'a', { person: ['b', 'c'] }]);
    });

    it('never drops a group into itself or its descendants', () => {
      render(<Workspace />);
      const drag = startDrag('person');
      drag.moveTo(yOver(row('person')));
      drag.moveTo(yOver(row('b'), 28));
      expect(tree().querySelector('[data-drop]')).toBeNull();
      drag.drop();
      expect(shape()).toEqual(['a', { person: ['b', 'c'] }, 'd']);
      expect(useStore.getState().past).toHaveLength(0);
    });

    it('keeps {{…}} references resolving after a drop into and out of a group', () => {
      act(() => useStore.getState().update((draft) => void (draft.branding['de-CH'] = { light: { primaryField: '{{d}} {{person.b}}' } })));
      render(<Workspace />);
      let drag = startDrag('d');
      drag.moveTo(yOver(row('person')));
      drag.drop();
      drag = startDrag('b');
      drag.moveTo(yOver(row('a'), 2));
      drag.drop();
      expect(shape()).toEqual(['b', 'a', { person: ['c', 'd'] }]);
      expect(useStore.getState().project!.branding['de-CH'].light.primaryField).toBe('{{person.d}} {{b}}');
    });

    it('never opens a collapsed group while dragging: its lower part drops after it, its middle inside at its end', () => {
      render(<Workspace />);
      act(() => useStore.getState().setGroupOpen(row('person').dataset.row!, false));
      let drag = startDrag('a');
      drag.moveTo(yOver(row('person'), 30));
      expect(row('person')).toHaveAttribute('data-drop', 'after');
      drag.drop();
      expect(shape()).toEqual([{ person: ['b', 'c'] }, 'a', 'd']);

      drag = startDrag('d');
      drag.moveTo(yOver(row('person')));
      expect(row('person')).toHaveAttribute('data-drop', 'inside');
      expect(row('person')).toHaveAttribute('aria-expanded', 'false');
      drag.drop();
      expect(shape()).toEqual([{ person: ['b', 'c', 'd'] }, 'a']);
      // `d` was not selected, so nothing needs revealing.
      expect(row('person')).toHaveAttribute('aria-expanded', 'false');
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

  it('⌘D duplicates the selection after the originals, selects the copies and keeps focus on the tree', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.keyboard('{Meta>}');
    await user.click(row('person'));
    await user.keyboard('{/Meta}');
    // The browser's own ⌘D (bookmark) is held back.
    expect(fireEvent.keyDown(row('person'), { key: 'd', metaKey: true })).toBe(false);
    expect(topKeys()).toEqual(['a', 'a_2', 'person', 'person_2', 'd']);
    expect(selectedKeys()).toEqual(['a_2', 'person_2']);
    expect(primaryKey()).toBe('person_2');
    await waitFor(() => expect(row('person_2')).toHaveFocus());
    await user.keyboard('{Control>}d{/Control}');
    expect(topKeys()).toEqual(['a', 'a_2', 'a_2_2', 'person', 'person_2', 'person_2_2', 'd']);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(topKeys()).toEqual(['a', 'a_2', 'person', 'person_2', 'd']);
    expect(selectedKeys()).toEqual(['a_2', 'person_2']);
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
    await user.keyboard('{Meta>}g{/Meta}{Alt>}{ArrowDown}{/Alt}{Meta>}d{/Meta}');
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
      fireEvent.keyDown(row('a'), { key: 'd', metaKey: true });
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
    await user.keyboard('n{Backspace}{Alt>}{ArrowDown}{/Alt}{Meta>}g{/Meta}{Meta>}d{/Meta}');
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

describe('inline rename', () => {
  const renameInput = () => within(tree()).getByRole('textbox');
  const primaryField = () => useStore.getState().project!.branding['de-CH'].light.primaryField;

  it('F2 turns the selected row’s key into an input; ⏎ commits and puts focus back on the row', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('b'));
    await user.keyboard('{F2}');
    expect(renameInput()).toHaveAccessibleName('Rename b');
    expect(renameInput()).toHaveFocus();
    expect(renameInput()).toHaveValue('b');
    // The old key is selected, so typing replaces it.
    await user.keyboard('given_name{Enter}');
    expect(within(tree()).queryByRole('textbox')).toBeNull();
    expect(primaryKey()).toBe('given_name');
    await waitFor(() => expect(row('given_name')).toHaveFocus());
    expect(screen.getByLabelText('Key')).toHaveValue('given_name');
  });

  it('a double-click starts it; leaving the input commits', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.dblClick(row('d'));
    expect(renameInput()).toHaveFocus();
    await user.keyboard('date');
    await user.click(row('a'));
    expect(within(tree()).queryByRole('textbox')).toBeNull();
    expect(selectedKeys()).toEqual(['a']);
    expect(row('date')).toBeInTheDocument();
  });

  it('Escape restores the old key and puts focus back on the row', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.keyboard('{F2}other{Escape}');
    expect(within(tree()).queryByRole('textbox')).toBeNull();
    expect(row('a')).toBeInTheDocument();
    await waitFor(() => expect(row('a')).toHaveFocus());
    expect(useStore.getState().past).toHaveLength(0);
  });

  it('makes {{…}} references follow, as one undo step', async () => {
    act(() => useStore.getState().update((draft) => void (draft.branding['de-CH'] = { light: { primaryField: '{{d}} {{person.b}}' } })));
    const steps = useStore.getState().past.length;
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('person'));
    await user.keyboard('{F2}holder{Enter}');
    expect(primaryField()).toBe('{{d}} {{holder.b}}');
    expect(useStore.getState().past).toHaveLength(steps + 1);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(primaryField()).toBe('{{d}} {{person.b}}');
    expect(row('person')).toBeInTheDocument();
  });

  it('types N and ⌫ into the input instead of running the tree shortcuts', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('c'));
    await user.keyboard('{F2}{ArrowRight}n{Backspace}{Backspace}{Delete}');
    expect(renameInput()).toHaveValue('');
    await user.keyboard('name');
    expect(renameInput()).toHaveValue('name');
    await user.keyboard('{ArrowUp}{Alt>}{ArrowDown}{/Alt}{Meta>}g{/Meta}');
    expect(renameInput()).toHaveFocus();
    await user.keyboard('{Control>}a{/Control}name{Enter}');
    expect(useStore.getState().project!.root.children.map((node) => node.key)).toEqual(['a', 'person', 'd']);
    expect(row('name')).toBeInTheDocument();
  });

  it('does nothing on the credential, a multi-selection or under 1000 px', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Workspace />);
    await user.click(row('Credential'));
    await user.keyboard('{F2}');
    await user.dblClick(row('Credential'));
    expect(within(tree()).queryByRole('textbox')).toBeNull();
    await user.click(row('a'));
    await user.keyboard('{Meta>}');
    await user.click(row('d'));
    await user.keyboard('{/Meta}{F2}');
    expect(within(tree()).queryByRole('textbox')).toBeNull();
    unmount();

    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<Workspace />);
    await user.dblClick(row('a'));
    act(() => row('a').focus());
    await user.keyboard('{F2}');
    expect(within(tree()).queryByRole('textbox')).toBeNull();
  });
});

describe('collapse and expand', () => {
  const chevron = (key: string, action: 'Collapse' | 'Expand') => within(row(key)).getByRole('button', { name: `${action} ${key}` });
  const rowKeys = () => within(tree()).getAllByRole('treeitem').map((item) => item.querySelector('.tree__key')?.textContent);

  it('a chevron on each group row, lists of objects too, toggles it without changing the selection', async () => {
    act(() => useStore.getState().update((draft) => void draft.root.children.push(newGroupLink('items', { array: true, group: { id: 'items-group', children: [newAttribute('e')], passthrough: [] } }))));
    const user = userEvent.setup();
    render(<Workspace />);
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    expect(row('items')).toHaveAttribute('aria-expanded', 'true');
    expect(row('a')).not.toHaveAttribute('aria-expanded');
    expect(within(row('a')).queryByRole('button', { name: /^(Collapse|Expand) / })).toBeNull();
    // Like the drag handles, the chevrons are out of the tab order.
    expect(chevron('person', 'Collapse')).toHaveAttribute('tabindex', '-1');

    await user.click(row('a'));
    await user.click(chevron('person', 'Collapse'));
    expect(row('person')).toHaveAttribute('aria-expanded', 'false');
    expect(rowKeys()).toEqual(['Credential', 'a', 'person', 'd', 'items', 'e']);
    expect(selectedKeys()).toEqual(['a']);
    await user.click(chevron('items', 'Collapse'));
    expect(rowKeys()).toEqual(['Credential', 'a', 'person', 'd', 'items']);

    await user.click(chevron('person', 'Expand'));
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    expect(rowKeys()).toEqual(['Credential', 'a', 'person', 'b', 'c', 'd', 'items']);
    expect(selectedKeys()).toEqual(['a']);
  });

  it('collapsing a group that holds selected rows selects the group in their place', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.keyboard('{Meta>}');
    await user.click(row('c'));
    await user.keyboard('{/Meta}');
    await user.click(chevron('person', 'Collapse'));
    expect(selectedKeys()).toEqual(['a', 'person']);
    expect(primaryKey()).toBe('person');
    await waitFor(() => expect(row('person')).toHaveFocus());
  });

  it('→ expands a collapsed group, then goes to its first child; ← goes to the group around, then collapses it', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('person'));
    await user.keyboard('{ArrowLeft}');
    expect(row('person')).toHaveAttribute('aria-expanded', 'false');
    expect(row('person')).toHaveFocus();
    // Nothing above the top level, and nothing to the right of an attribute.
    await user.keyboard('{ArrowLeft}');
    expect(selectedKeys()).toEqual(['person']);

    await user.keyboard('{ArrowRight}');
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    expect(selectedKeys()).toEqual(['person']);
    await user.keyboard('{ArrowRight}');
    expect(selectedKeys()).toEqual(['b']);
    expect(row('b')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(selectedKeys()).toEqual(['b']);

    await user.keyboard('{ArrowLeft}');
    expect(selectedKeys()).toEqual(['person']);
    expect(row('person')).toHaveFocus();
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
  });

  it('↑ / ↓, End and ⇧ ranges skip the rows inside a collapsed group', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(chevron('person', 'Collapse'));
    await user.click(row('a'));
    await user.keyboard('{ArrowDown}');
    expect(selectedKeys()).toEqual(['person']);
    await user.keyboard('{ArrowDown}');
    expect(selectedKeys()).toEqual(['d']);
    await user.keyboard('{Shift>}{ArrowUp}{ArrowUp}{/Shift}');
    expect(selectedKeys()).toEqual(['a', 'person', 'd']);
    expect(row('person')).toHaveAttribute('aria-expanded', 'false');

    await user.click(row('d'));
    await user.keyboard('{Shift>}');
    await user.click(row('a'));
    await user.keyboard('{/Shift}');
    expect(selectedKeys()).toEqual(['a', 'person', 'd']);
    await user.keyboard('{End}');
    expect(selectedKeys()).toEqual(['d']);
  });

  it('remembers the collapsed groups per project', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Workspace />);
    const first = useStore.getState().project!;
    await user.click(chevron('person', 'Collapse'));
    unmount();

    // Another project starts with its groups expanded.
    loadProject();
    const second = render(<Workspace />);
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    second.unmount();

    act(() => useStore.getState().load(first));
    render(<Workspace />);
    expect(row('person')).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree()).queryByText('b')).toBeNull();
  });

  it('expands the groups around a node selected any other way: undo, a new node, the store', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('b'));
    act(() => useStore.getState().update((draft) => void (draft.meta['de-CH'].description = 'Edited')));
    await user.click(row('d'));
    await user.click(chevron('person', 'Collapse'));
    act(() => useStore.getState().undo());
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    expect(selectedKeys()).toEqual(['b']);

    // N with a collapsed group selected adds inside it, at its end, and shows the new row.
    await user.click(chevron('person', 'Collapse'));
    expect(selectedKeys()).toEqual(['person']);
    act(() => row('person').focus());
    await user.keyboard('n');
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    expect(rowKeys()).toEqual(['Credential', 'a', 'person', 'b', 'c', 'attribute', 'd']);

    await user.click(chevron('person', 'Collapse'));
    const c = useStore.getState().project!.root.children[1];
    act(() => useStore.getState().select({ kind: 'node', id: c.kind === 'group' ? c.group.children[1].id : '' }));
    expect(selectedKeys()).toEqual(['c']);
  });

  it('jumping to an issue on a node inside a collapsed group reveals it', async () => {
    act(() =>
      useStore.getState().update((draft) => {
        const person = draft.root.children[1];
        if (person.kind === 'group') person.group.children.push(newAttribute('broken', { source: [] }));
      }),
    );
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(chevron('person', 'Collapse'));
    await user.click(within(screen.getByRole('region', { name: 'Issues' })).getByRole('button', { name: /"broken" has no source path/ }));
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    expect(selectedKeys()).toEqual(['broken']);
  });
});

describe('filter box', () => {
  const filterBox = () => screen.getByRole<HTMLInputElement>('searchbox', { name: 'Filter the structure' });
  const rowKeys = () => within(tree()).getAllByRole('treeitem').map((item) => item.querySelector('.tree__key')?.textContent);
  const setLabel = (key: string, label: string) =>
    act(() =>
      useStore.getState().update((draft) => {
        const stack = [...draft.root.children];
        while (stack.length) {
          const node = stack.shift()!;
          if (node.key === key) node.labels['de-CH'] = label;
          if (node.kind === 'group') stack.push(...node.group.children);
        }
      }),
    );

  it('shows the nodes whose key matches, ignoring case, with the groups around them', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(filterBox(), 'C');
    expect(rowKeys()).toEqual(['Credential', 'person', 'c']);
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    await user.clear(filterBox());
    expect(rowKeys()).toEqual(['Credential', 'a', 'person', 'b', 'c', 'd']);
  });

  it('matches labels in the editing language', async () => {
    setLabel('b', 'Vorname');
    setLabel('d', 'Nachname');
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(filterBox(), 'NAME');
    expect(rowKeys()).toEqual(['Credential', 'person', 'b', 'd']);
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    expect(screen.queryByText('No matches')).toBeNull();
    await user.type(filterBox(), 'zzz');
    expect(rowKeys()).toEqual(['Credential']);
    expect(screen.getByText('No matches')).toHaveAttribute('role', 'status');
  });

  it('shows matches inside collapsed groups without expanding them for good', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(row('person')).getByRole('button', { name: 'Collapse person' }));
    await user.type(filterBox(), 'b');
    expect(rowKeys()).toEqual(['Credential', 'person', 'b']);
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    // The chevron only tells while filtering.
    expect(within(row('person')).queryByRole('button', { name: /^(Collapse|Expand) person$/ })).toBeNull();
    expect(useStore.getState().collapsed).toHaveLength(1);

    await user.clear(filterBox());
    expect(rowKeys()).toEqual(['Credential', 'a', 'person', 'd']);
    expect(row('person')).toHaveAttribute('aria-expanded', 'false');
  });

  it('⌘F and Ctrl+F in the tree focus it; elsewhere they keep the browser’s behaviour', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.type(filterBox(), 'b');
    await user.click(row('b'));
    expect(fireEvent.keyDown(row('b'), { key: 'f', metaKey: true })).toBe(false);
    expect(filterBox()).toHaveFocus();
    // The text is selected, so typing replaces it.
    expect([filterBox().selectionStart, filterBox().selectionEnd]).toEqual([0, 1]);

    act(() => row('b').focus());
    expect(fireEvent.keyDown(row('b'), { key: 'f', ctrlKey: true })).toBe(false);
    expect(filterBox()).toHaveFocus();

    const key = screen.getByLabelText('Key');
    act(() => key.focus());
    expect(fireEvent.keyDown(key, { key: 'f', metaKey: true })).toBe(true);
    expect(key).toHaveFocus();
  });

  it('Escape clears it and goes back to the tree, on the selected row', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(filterBox(), 'c');
    await user.click(row('c'));
    await user.click(filterBox());
    await user.keyboard('{Escape}');
    expect(filterBox()).toHaveValue('');
    expect(rowKeys()).toEqual(['Credential', 'a', 'person', 'b', 'c', 'd']);
    await waitFor(() => expect(row('c')).toHaveFocus());
  });

  it('↓ in it goes to the first row it shows; ↑ / ↓ and ⇧ ranges follow the rows it shows', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    // The selected a is filtered out: the Credential row is the tree's tab stop.
    await user.type(filterBox(), '{Backspace}d');
    expect(rowKeys()).toEqual(['Credential', 'd']);
    expect(row('Credential')).toHaveAttribute('tabindex', '0');
    await user.clear(filterBox());
    await user.type(filterBox(), 'c');
    act(() => useStore.getState().update((draft) => void draft.root.children.push(newAttribute('cc'))));
    expect(rowKeys()).toEqual(['Credential', 'person', 'c', 'cc']);

    await user.keyboard('{ArrowDown}');
    expect(selectedKeys()).toEqual(['person']);
    expect(row('person')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selectedKeys()).toEqual(['cc']);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(selectedKeys()).toEqual(['c', 'cc']);

    await user.click(row('person'));
    await user.keyboard('{Shift>}');
    await user.click(row('cc'));
    await user.keyboard('{/Shift}');
    // b and d sit between person and cc in the tree, but the filter hides them.
    expect(selectedKeys()).toEqual(['person', 'c', 'cc']);
  });

  it('← and → step across levels without collapsing or expanding groups', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(filterBox(), 'c');
    await user.click(row('person'));
    await user.keyboard('{ArrowLeft}');
    expect(row('person')).toHaveAttribute('aria-expanded', 'true');
    expect(useStore.getState().collapsed).toEqual([]);
    await user.keyboard('{ArrowRight}');
    expect(selectedKeys()).toEqual(['c']);
    await user.keyboard('{ArrowLeft}');
    expect(selectedKeys()).toEqual(['person']);
  });

  it('keeps the tree shortcuts working on the selection; Delete selects the next row it shows', async () => {
    act(() => useStore.getState().update((draft) => void draft.root.children.push(newAttribute('bb'))));
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(filterBox(), 'b');
    expect(rowKeys()).toEqual(['Credential', 'person', 'b', 'bb']);
    await user.click(row('b'));
    await user.keyboard('{Meta>}d{/Meta}');
    expect(rowKeys()).toEqual(['Credential', 'person', 'b', 'b_2', 'bb']);
    expect(selectedKeys()).toEqual(['b_2']);

    await user.keyboard('{Backspace}');
    // d comes after b_2 in the tree, but the filter hides it.
    expect(selectedKeys()).toEqual(['bb']);
    await waitFor(() => expect(row('bb')).toHaveFocus());
  });

  it('turns off drag and drop while filtering', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(filterBox(), 'a');
    expect(tree()).toHaveAttribute('data-filtered', 'true');
    const before = useStore.getState().project;
    const handle = within(row('a')).getByRole('button', { name: 'Move a' });
    fireEvent.pointerDown(handle, { isPrimary: true, button: 0, clientX: 10, clientY: 16 });
    fireEvent.pointerMove(document, { clientX: 10, clientY: 80 });
    expect(row('a').parentElement).not.toHaveClass('tree__dragging');
    fireEvent.pointerUp(document, { clientX: 10 });
    expect(useStore.getState().project).toBe(before);
  });
});
