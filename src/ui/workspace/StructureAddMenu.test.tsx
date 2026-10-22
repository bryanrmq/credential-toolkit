// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Node, emptyProject, newAttribute, newGroupLink, walkNodes } from '../../core/model';
import { useStore } from '../../state/store';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

// The real dialog searches I14Y; this one only shows which group it would add to.
vi.mock('./I14yDialog', () => ({
  I14yDialog: ({ groupId }: { groupId: string }) => <div role="dialog" aria-modal="true" aria-label="I14Y" data-group={groupId} />,
}));

/** a, person { b, c }, d: in tree order a, person, b, c, d. */
function loadProject() {
  const project = emptyProject(['de-CH']);
  const person = newGroupLink('person', { source: ['person'] });
  person.group.children.push(newAttribute('b'), newAttribute('c'));
  project.root.children.push(newAttribute('a'), person, newAttribute('d'));
  useStore.getState().load(project);
}

const project = () => useStore.getState().project!;
const keys = (children: Node[] = project().root.children) => children.map((node) => node.key);
const nodeByKey = (key: string) => [...walkNodes(project().root)].map(({ node }) => node).find((node) => node.key === key)!;
const childKeys = (key: string) => {
  const node = nodeByKey(key);
  return node.kind === 'group' ? keys(node.group.children) : [];
};

const structure = () => screen.getByRole('region', { name: 'Structure' });
const tree = () => screen.getByRole('tree', { name: 'Structure' });
const row = (key: string) => {
  const found = within(tree())
    .getAllByRole('treeitem')
    .find((item) => item.querySelector('.tree__key')?.textContent === key);
  if (!found) throw new Error(`No row "${key}"`);
  return found;
};
const addButton = () => within(structure()).getByRole('button', { name: 'Add' });
const menu = () => screen.getByRole('menu', { name: 'Add to the structure' });
const queryMenu = () => screen.queryByRole('menu');
const item = (name: string) => within(menu()).getByRole('menuitem', { name });
/** The open menu's items as "label" or "label [key]". */
const menuContents = () =>
  within(menu())
    .getAllByRole('menuitem')
    .map((element) => {
      const label = element.querySelector('.popup-menu__label')!.textContent;
      const key = element.querySelector('kbd')?.textContent;
      return key ? `${label} [${key}]` : label;
    });
/** The selected node's key, or "Credential". */
const selectedKey = () => {
  const selection = useStore.getState().selection;
  return selection.kind === 'node' ? [...walkNodes(project().root)].find(({ node }) => node.id === selection.id)!.node.key : 'Credential';
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  loadProject();
});

describe('Structure Add menu', () => {
  it('is the one button in the Structure header, in place of Attribute, Group, List and I14Y', () => {
    render(<Workspace />);
    const header = structure().querySelector('.pane__header') as HTMLElement;
    expect(within(header).getAllByRole('button')).toEqual([addButton()]);
    expect(addButton()).toHaveAttribute('aria-haspopup', 'menu');
    expect(addButton()).toHaveAttribute('aria-expanded', 'false');
    for (const name of ['Attribute', 'Group', 'List of objects', 'I14Y', 'Add attributes from I14Y']) {
      expect(within(structure()).queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('opens a menu of Attribute (N), Group and List of objects, and closes on a second click', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(addButton());
    expect(menuContents()).toEqual(['Attribute [N]', 'Group', 'List of objects']);
    expect(item('Attribute')).toHaveFocus();
    expect(addButton()).toHaveAttribute('aria-expanded', 'true');

    await user.click(addButton());
    expect(queryMenu()).not.toBeInTheDocument();
    expect(addButton()).toHaveAttribute('aria-expanded', 'false');
    expect(keys()).toEqual(['a', 'person', 'd']);
  });

  it('adds an attribute right after the selected attribute, selects it and focuses its key', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('a'));
    await user.click(addButton());
    await user.click(item('Attribute'));
    expect(queryMenu()).not.toBeInTheDocument();
    expect(keys()).toEqual(['a', 'attribute', 'person', 'd']);
    expect(selectedKey()).toBe('attribute');
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());
    expect(screen.getByLabelText('Key')).toHaveValue('attribute');
  });

  it('adds a group at the end of the selected group, and a list at the end of the top level from Credential', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(row('person'));
    await user.click(addButton());
    await user.click(item('Group'));
    expect(childKeys('person')).toEqual(['b', 'c', 'group']);
    expect(selectedKey()).toBe('group');
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());

    await user.click(row('Credential'));
    await user.click(addButton());
    await user.click(item('List of objects'));
    expect(keys()).toEqual(['a', 'person', 'd', 'items']);
    expect(nodeByKey('items')).toMatchObject({ kind: 'group', array: true });
    expect(selectedKey()).toBe('items');
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());
  });

  it('works by keyboard: Enter or ↓ opens it, the arrows move, Enter adds and Escape returns to the button', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    addButton().focus();
    await user.keyboard('{Enter}');
    expect(item('Attribute')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(queryMenu()).not.toBeInTheDocument();
    expect(addButton()).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(item('Attribute')).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(queryMenu()).not.toBeInTheDocument();
    expect(keys()).toEqual(['a', 'person', 'd', 'group']);
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());

    addButton().focus();
    await user.keyboard(' ');
    await user.keyboard('{End}{Enter}');
    expect(keys()).toEqual(['a', 'person', 'd', 'group']);
    expect(childKeys('group')).toEqual(['items']);
  });

  it('works under 1000 px too, and switches to the Edit pane with the key focused', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const user = userEvent.setup();
    const { container } = render(<Workspace />);
    await user.click(row('d'));
    await user.click(screen.getByRole('tab', { name: 'Structure' }));
    expect(container.querySelector('.panes')).toHaveAttribute('data-pane', 'structure');
    await user.click(addButton());
    await user.click(item('Attribute'));
    expect(keys()).toEqual(['a', 'person', 'd', 'attribute']);
    expect(container.querySelector('.panes')).toHaveAttribute('data-pane', 'inspector');
    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveFocus());
  });

  it('leaves the empty structure its own buttons, Add attributes from I14Y among them', async () => {
    useStore.getState().load(emptyProject(['de-CH']));
    const user = userEvent.setup();
    render(<Workspace />);
    expect(addButton()).toBeInTheDocument();
    await user.click(within(structure()).getByRole('button', { name: 'Add attributes from I14Y' }));
    expect(screen.getByRole('dialog', { name: 'I14Y' })).toHaveAttribute('data-group', project().root.id);
  });
});
