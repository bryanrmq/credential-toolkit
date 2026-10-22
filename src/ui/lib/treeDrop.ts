import { type Group, type Project, findNode, walkNodes } from '../../core/model';
import { canMoveNodesTo } from '../../core/operations';

/** Which part of a row the pointer is over. */
export type DropZone = 'before' | 'inside' | 'after';

/**
 * The part of a row (from `top` to `bottom`) that `y` falls in. A row that can take items (a group,
 * when dropping inside is allowed) splits into a top quarter (before), a middle half (inside) and a
 * bottom quarter (after); any other row into halves. Above or below the row counts as its nearest edge.
 */
export function zoneAt(top: number, bottom: number, y: number, takesItems: boolean): DropZone {
  const at = bottom > top ? (y - top) / (bottom - top) : 0.5;
  if (!takesItems) return at < 0.5 ? 'before' : 'after';
  return at < 0.25 ? 'before' : at < 0.75 ? 'inside' : 'after';
}

/** A drop row's vertical extent on screen: a node row (by node id) or an empty group's hint line (`emptyRowId`). */
export interface RowBox {
  id: string;
  top: number;
  bottom: number;
}

/** The row id of the "drop items here" line in the empty group `groupId`. */
export const emptyRowId = (groupId: string) => `empty:${groupId}`;

/**
 * The row `y` falls on, or the nearest one when it falls between rows; `'end'` below the last row,
 * and null without rows. Rows stack vertically, so only `y` matters.
 */
export function rowAt(rows: RowBox[], y: number): RowBox | 'end' | null {
  const sorted = [...rows].sort((a, b) => a.top - b.top);
  const last = sorted.at(-1);
  if (!last) return null;
  if (y >= last.bottom) return 'end';
  const on = sorted.find((row) => y >= row.top && y < row.bottom);
  if (on) return on;
  const distance = (row: RowBox) => (y < row.top ? row.top - y : y - row.bottom);
  return sorted.reduce((best, row) => (distance(row) < distance(best) ? row : best));
}

/** What the tree shows for a drop: an outline on a group row, an insertion line above or below a row, or a line after the whole tree. */
export type DropIndicator = { kind: 'inside'; row: string } | { kind: 'line'; row: string; edge: 'top' | 'bottom' } | { kind: 'end' };

/** Where a drop puts the dragged nodes (in `moveNodesTo` terms) and how the tree shows it. */
export interface DropTarget {
  groupId: string;
  index: number;
  indicator: DropIndicator;
}

/**
 * Where dropping `draggedIds` with the pointer at `y` lands, given the rows on screen:
 * - the middle of a group row (also a list of objects), or an empty group's hint line: inside that group, at its end;
 * - the upper part of a row: just before it, in its group;
 * - the lower part of a group row with children: before its first child (the line shows above that child);
 * - the lower part of any other row: just after it, in its group;
 * - below the last row: at the end of the top level.
 * Null when the drop would change nothing or is not allowed (into a dragged group or one of its descendants).
 * With `inside` false (narrow windows), group rows split like any other row and empty groups have no hint line.
 */
export function dropTarget(project: Project, draggedIds: string[], rows: RowBox[], y: number, inside: boolean): DropTarget | null {
  const box = rowAt(rows, y);
  if (!box) return null;
  const target = box === 'end' ? endOfTree(project) : targetOn(project, box, y, inside);
  return target && canMoveNodesTo(project, draggedIds, target.groupId, target.index) ? target : null;
}

function endOfTree(project: Project): DropTarget {
  return { groupId: project.root.id, index: project.root.children.length, indicator: { kind: 'end' } };
}

function targetOn(project: Project, box: RowBox, y: number, inside: boolean): DropTarget | null {
  const empty = emptyGroup(project, box.id);
  if (empty) return inside ? { groupId: empty.group.id, index: 0, indicator: { kind: 'inside', row: empty.linkId } } : null;
  const visit = findNode(project.root, box.id);
  if (!visit) return null;
  const { node, parent } = visit;
  const index = parent.children.indexOf(node);
  const zone = zoneAt(box.top, box.bottom, y, inside && node.kind === 'group');
  if (zone === 'before') return { groupId: parent.id, index, indicator: { kind: 'line', row: node.id, edge: 'top' } };
  if (node.kind === 'group' && zone === 'inside') {
    return { groupId: node.group.id, index: node.group.children.length, indicator: { kind: 'inside', row: node.id } };
  }
  const first = node.kind === 'group' ? node.group.children[0] : undefined;
  if (node.kind === 'group' && first) return { groupId: node.group.id, index: 0, indicator: { kind: 'line', row: first.id, edge: 'top' } };
  return { groupId: parent.id, index: index + 1, indicator: { kind: 'line', row: node.id, edge: 'bottom' } };
}

/** The empty group whose hint line is row `rowId`, with its group link's id. */
function emptyGroup(project: Project, rowId: string): { group: Group; linkId: string } | undefined {
  for (const { node } of walkNodes(project.root)) {
    if (node.kind === 'group' && emptyRowId(node.group.id) === rowId) return { group: node.group, linkId: node.id };
  }
  return undefined;
}
