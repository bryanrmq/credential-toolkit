// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { type Node, emptyProject, newAttribute, newGroupLink, walkNodes } from '../../core/model';
import { useStore } from '../../state/store';
import {
  addNode,
  canDeleteSelection,
  canGroupSelection,
  canMoveSelection,
  canUngroupSelection,
  deleteSelection,
  groupSelection,
  moveSelection,
  newNodePlace,
  selectionAfterRemoval,
  ungroupSelection,
} from './treeActions';

/** a, person { b, c }, d, items[] { e }: in tree order a, person, b, c, d, items, e. */
function loadProject() {
  const project = emptyProject(['de-CH']);
  const person = newGroupLink('person', { source: ['person'] });
  person.group.children.push(newAttribute('b'), newAttribute('c'));
  const items = newGroupLink('items', { array: true, source: ['items', null] });
  items.group.children.push(newAttribute('e'));
  project.root.children.push(newAttribute('a'), person, newAttribute('d'), items);
  useStore.getState().load(project);
}

const project = () => useStore.getState().project!;
const nodes = () => [...walkNodes(project().root)].map(({ node }) => node);
const id = (key: string) => nodes().find((node) => node.key === key)!.id;
const keys = (children: Node[] = project().root.children) => children.map((node) => node.key);
const childKeys = (key: string) => {
  const node = nodes().find((found) => found.key === key)!;
  return node.kind === 'group' ? keys(node.group.children) : [];
};
const groupId = (key: string) => {
  const node = nodes().find((found) => found.key === key)!;
  if (node.kind !== 'group') throw new Error(`${key} is not a group`);
  return node.group.id;
};
const select = (...selected: string[]) =>
  useStore.getState().select({ kind: 'node', id: id(selected.at(-1)!), ids: selected.map(id) });
const selectedKeys = () => {
  const selection = useStore.getState().selection;
  return selection.kind === 'node' ? selection.ids.map((nodeId) => nodes().find((node) => node.id === nodeId)!.key) : ['Credential'];
};

beforeEach(loadProject);

describe('newNodePlace', () => {
  it('puts a new node after the selected attribute, at the end of the selected group, or at the end of the top level', () => {
    const { selection } = useStore.getState();
    expect(newNodePlace(project(), selection)).toEqual({ groupId: project().root.id });
    select('b');
    expect(newNodePlace(project(), useStore.getState().selection)).toEqual({ groupId: groupId('person'), index: 1 });
    select('person');
    expect(newNodePlace(project(), useStore.getState().selection)).toEqual({ groupId: groupId('person') });
  });
});

describe('selectionAfterRemoval', () => {
  it('picks the next row, else the previous one, else the credential', () => {
    expect(selectionAfterRemoval(project(), [id('a')])).toEqual({ kind: 'node', id: id('person') });
    // The rows inside a removed group go with it.
    expect(selectionAfterRemoval(project(), [id('person')])).toEqual({ kind: 'node', id: id('d') });
    expect(selectionAfterRemoval(project(), [id('b'), id('d')])).toEqual({ kind: 'node', id: id('items') });
    expect(selectionAfterRemoval(project(), [id('e')])).toEqual({ kind: 'node', id: id('items') });
    expect(selectionAfterRemoval(project(), [id('items')])).toEqual({ kind: 'node', id: id('d') });
    expect(selectionAfterRemoval(project(), project().root.children.map((node) => node.id))).toEqual({ kind: 'credential' });
  });
});

describe('addNode', () => {
  it('adds an attribute right after the selected one with the group’s source path, and selects it', () => {
    select('b');
    const added = addNode();
    expect(childKeys('person')).toEqual(['b', 'attribute', 'c']);
    expect(selectedKeys()).toEqual(['attribute']);
    expect(nodes().find((node) => node.id === added)!.source).toEqual(['person', 'attribute']);
  });

  it('adds at the end of the selected group, and at the end of the top level from the credential', () => {
    select('person');
    addNode();
    expect(childKeys('person')).toEqual(['b', 'c', 'attribute']);
    useStore.getState().select({ kind: 'credential' });
    addNode();
    addNode('group');
    expect(keys()).toEqual(['a', 'person', 'd', 'items', 'attribute', 'group']);
  });

  it('keeps keys unique within the group', () => {
    select('a');
    addNode();
    select('a');
    addNode();
    expect(keys()).toEqual(['a', 'attribute_2', 'attribute', 'person', 'd', 'items']);
  });
});

describe('deleteSelection', () => {
  it('deletes the selected nodes, selects the row after them, and undo brings both back', () => {
    select('a', 'c');
    deleteSelection();
    expect(keys()).toEqual(['person', 'd', 'items']);
    expect(childKeys('person')).toEqual(['b']);
    expect(selectedKeys()).toEqual(['d']);
    useStore.getState().undo();
    expect(keys()).toEqual(['a', 'person', 'd', 'items']);
    expect(selectedKeys()).toEqual(['a', 'c']);
  });

  it('does not apply to the credential', () => {
    expect(canDeleteSelection()).toBe(false);
    deleteSelection();
    expect(useStore.getState().past).toHaveLength(0);
  });
});

describe('groupSelection', () => {
  it('wraps the selection in a new group and selects it', () => {
    expect(canGroupSelection()).toBe(false);
    select('a', 'd');
    groupSelection();
    expect(keys()).toEqual(['group', 'person', 'items']);
    expect(childKeys('group')).toEqual(['a', 'd']);
    expect(selectedKeys()).toEqual(['group']);
  });
});

describe('ungroupSelection', () => {
  it('lifts a group’s children into its parent and selects them', () => {
    select('person');
    expect(canUngroupSelection()).toBe(true);
    ungroupSelection();
    expect(keys()).toEqual(['a', 'b', 'c', 'd', 'items']);
    expect(selectedKeys()).toEqual(['b', 'c']);
  });

  it('does not apply to a list of objects, an attribute or several nodes', () => {
    select('items');
    expect(canUngroupSelection()).toBe(false);
    ungroupSelection();
    expect(keys()).toEqual(['a', 'person', 'd', 'items']);
    select('a');
    expect(canUngroupSelection()).toBe(false);
    select('person', 'items');
    expect(canUngroupSelection()).toBe(false);
    expect(useStore.getState().past).toHaveLength(0);
  });
});

describe('moveSelection', () => {
  it('moves the selection by the edge rules and keeps it selected', () => {
    select('d');
    moveSelection('up');
    expect(keys()).toEqual(['a', 'd', 'person', 'items']);
    expect(selectedKeys()).toEqual(['d']);
    select('b');
    moveSelection('up');
    expect(keys()).toEqual(['a', 'd', 'b', 'person', 'items']);
  });

  it('does not apply, and records no step, at the edge of the tree', () => {
    select('a');
    expect(canMoveSelection('up')).toBe(false);
    expect(canMoveSelection('down')).toBe(true);
    moveSelection('up');
    expect(useStore.getState().past).toHaveLength(0);
    useStore.getState().select({ kind: 'credential' });
    expect(canMoveSelection('down')).toBe(false);
  });
});
