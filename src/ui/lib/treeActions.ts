import { type Node, type Project, findGroup, findNode, newAttribute, newGroupLink, walkNodes } from '../../core/model';
import { NEW_NODE_KEYS, duplicateNodes, groupNodes, insertNode, moveNodes, removeNodes, sourcePrefixFor, uniqueKey, ungroupNode } from '../../core/operations';
import { CREDENTIAL, type Selection, type SelectionRequest, selectedIds } from '../../state/selection';
import { useStore } from '../../state/store';
import { visibleRows } from '../../state/treeView';
import { fieldId, focusField } from '../issues';

/*
 * The Structure tree's actions, shared by its keyboard shortcuts, its buttons and the Edit pane. Each
 * `canX` says whether `x` applies to the current selection; `x` does nothing when it does not.
 */

export type NewNodeKind = keyof typeof NEW_NODE_KEYS;
export type MoveDirection = 'up' | 'down';
/** Where a new node goes: into group `groupId`, before its child at `index` or at its end. */
export type NodePlace = { groupId: string; index?: number };

/**
 * Where a new node goes: right after the selected attribute in its group, at the end of the selected
 * group, or at the end of the top level when the credential is selected. In a multi-selection the primary counts.
 */
export function newNodePlace(project: Project, selection: Selection): NodePlace {
  const visit = selection.kind === 'node' ? findNode(project.root, selection.id) : undefined;
  if (!visit) return { groupId: project.root.id };
  if (visit.node.kind === 'group') return { groupId: visit.node.group.id };
  return { groupId: visit.parent.id, index: visit.parent.children.indexOf(visit.node) + 1 };
}

/**
 * What to select once `removedIds` (and everything inside them) leave `project`: the first row left
 * after the last removed one, else the last row left before it, else the credential. Only the rows the
 * tree shows count, so the rows inside the `collapsed` groups are passed over.
 */
export function selectionAfterRemoval(project: Project, removedIds: Iterable<string>, collapsed: readonly string[] = []): SelectionRequest {
  const removed = new Set(removedIds);
  for (const { node } of walkNodes(project.root)) {
    if (node.kind === 'group' && removed.has(node.id)) for (const { node: inner } of walkNodes(node.group)) removed.add(inner.id);
  }
  const order = visibleRows(project, collapsed);
  const last = order.findLastIndex((id) => removed.has(id));
  const next = order.slice(last + 1).find((id) => !removed.has(id)) ?? order.slice(0, Math.max(last, 0)).findLast((id) => !removed.has(id));
  return next ? { kind: 'node', id: next } : CREDENTIAL;
}

/** Focuses the Edit pane's key field of node `nodeId` once it is shown. */
function focusKey(nodeId: string): void {
  focusField(fieldId({ kind: 'node', nodeId, field: 'key' }));
}

/**
 * Adds a new attribute, group or list of objects at `place` (by default `newNodePlace`), selects it and
 * focuses its key field. Returns its id.
 */
export function addNode(kind: NewNodeKind = 'attribute', place?: NodePlace): string | undefined {
  const { project, selection, update, select } = useStore.getState();
  if (!project) return undefined;
  const { groupId, index } = place ?? newNodePlace(project, selection);
  const group = findGroup(project.root, groupId) ?? project.root;
  const prefix = sourcePrefixFor(project, groupId);
  const key = uniqueKey(group, NEW_NODE_KEYS[kind]);
  const node: Node =
    kind === 'attribute'
      ? newAttribute(key, { source: [...prefix, key] })
      : newGroupLink(key, kind === 'list' ? { array: true, source: [...prefix, key, null] } : { source: [...prefix, key] });
  update((draft) => insertNode(draft, groupId, node, index));
  select({ kind: 'node', id: node.id });
  focusKey(node.id);
  return node.id;
}

/** Whether the selection holds nodes to delete. */
export function canDeleteSelection(selection: Selection = useStore.getState().selection): boolean {
  return selection.kind === 'node';
}

/** Deletes the given nodes without asking (undo brings them back) and selects the row after them. */
export function deleteNodes(nodeIds: string[]): void {
  const { project, collapsed, update, select } = useStore.getState();
  if (!project || nodeIds.length === 0) return;
  const next = selectionAfterRemoval(project, nodeIds, collapsed);
  update((draft) => void removeNodes(draft, nodeIds));
  select(next);
}

/** Deletes every selected node. */
export function deleteSelection(): void {
  if (canDeleteSelection()) deleteNodes(selectedIds(useStore.getState().selection));
}

/** Whether the selection holds nodes to group. */
export function canGroupSelection(selection: Selection = useStore.getState().selection): boolean {
  return selection.kind === 'node';
}

/** Wraps the selected nodes in a new group, selects the group and focuses its key field so it can be named. */
export function groupSelection(): void {
  const { selection, update, select } = useStore.getState();
  if (!canGroupSelection(selection)) return;
  let linkId: string | undefined;
  update((draft) => void (linkId = groupNodes(draft, selectedIds(selection))));
  if (!linkId) return;
  select({ kind: 'node', id: linkId });
  focusKey(linkId);
}

/** Whether the selection holds nodes to duplicate. */
export function canDuplicateSelection(selection: Selection = useStore.getState().selection): boolean {
  return selection.kind === 'node';
}

/**
 * Duplicates the selected nodes, each right after its original (`duplicateNodes`), and selects the
 * copies in place of the originals, the copy of the primary as the primary.
 */
export function duplicateSelection(): void {
  const { selection, update, select } = useStore.getState();
  if (selection.kind !== 'node') return;
  let copies = new Map<string, string>();
  update((draft) => void (copies = duplicateNodes(draft, selection.ids)));
  const id = copies.get(selection.id);
  if (!id) return;
  const ids = selection.ids.flatMap((nodeId) => copies.get(nodeId) ?? []);
  select({ kind: 'node', id, ids, anchor: copies.get(selection.anchor) });
}

/** Whether the selection is one group to ungroup; a list of objects never is, its children describe array items. */
export function canUngroupSelection(state = useStore.getState()): boolean {
  const { project, selection } = state;
  if (!project || selection.kind !== 'node' || selection.ids.length !== 1) return false;
  const node = findNode(project.root, selection.id)?.node;
  return node?.kind === 'group' && !node.array;
}

/** Lifts the selected group's children into its parent and selects them (the row after it when it was empty). */
export function ungroupSelection(): void {
  const state = useStore.getState();
  const { project, selection, update, select } = state;
  if (!project || selection.kind !== 'node' || !canUngroupSelection(state)) return;
  const next = selectionAfterRemoval(project, [selection.id], state.collapsed);
  let lifted: string[] = [];
  update((draft) => void (lifted = ungroupNode(draft, selection.id) ?? []));
  select(lifted.length ? { kind: 'node', id: lifted[0], ids: lifted } : next);
}

/** Whether moving the selection one place up or down changes anything, by the edge rules of `moveNodes`. */
export function canMoveSelection(direction: MoveDirection, state = useStore.getState()): boolean {
  const { project, selection } = state;
  if (!project || selection.kind !== 'node') return false;
  return moveNodes(structuredClone(project), selection.ids, direction);
}

/** Moves the selected nodes one place up or down; they stay selected. */
export function moveSelection(direction: MoveDirection): void {
  const state = useStore.getState();
  if (!canMoveSelection(direction, state)) return;
  state.update((draft) => void moveNodes(draft, selectedIds(state.selection), direction));
}

/** Whether a node is selected whose key field can be edited. */
export function canEditSelection(selection: Selection = useStore.getState().selection): boolean {
  return selection.kind === 'node';
}

/** Focuses the Edit pane's key field of the selected node (the primary in a multi-selection). */
export function editSelection(): void {
  const { selection } = useStore.getState();
  if (selection.kind === 'node') focusKey(selection.id);
}
