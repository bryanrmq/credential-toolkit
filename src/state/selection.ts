import { type Project, walkNodes } from '../core/model';

/**
 * What the Structure tree has selected: the credential, or one or more nodes.
 * - `ids`: every selected node, in tree order. Never empty, and it holds `id`. None is ever inside a
 *   collapsed group (the store expands the group instead, see `revealSelection`).
 * - `id`: the primary, the node clicked (or moved to) last. The Edit pane shows it.
 * - `anchor`: where a ⇧-click or ⇧↑/⇧↓ range starts. It may have been deselected since.
 * The credential is never part of a multi-selection.
 */
export type Selection = { kind: 'credential' } | { kind: 'node'; id: string; ids: string[]; anchor: string };

/** What `select` takes: the credential, one node, or several nodes with `id` as the primary. */
export type SelectionRequest = { kind: 'credential' } | { kind: 'node'; id: string; ids?: string[]; anchor?: string };

export const CREDENTIAL: Selection = { kind: 'credential' };

/** Node `id` selected on its own. */
export function oneNode(id: string): Selection {
  return { kind: 'node', id, ids: [id], anchor: id };
}

/**
 * Every node id in tree order, which is depth-first pre-order, the ones inside collapsed groups too
 * (`visibleRows` in treeView.ts leaves those out).
 */
export function visibleOrder(project: Project): string[] {
  return [...walkNodes(project.root)].map(({ node }) => node.id);
}

/** Whether node `id` is in `selection`. */
export function isSelected(selection: Selection, id: string): boolean {
  return selection.kind === 'node' && selection.ids.includes(id);
}

/** The selected node ids, in tree order (none for the credential). */
export function selectedIds(selection: Selection): string[] {
  return selection.kind === 'node' ? selection.ids : [];
}

/**
 * `request` as a full selection in `project`: `ids` in tree order and holding the primary, the anchor
 * defaulting to the primary. A primary that is not in the project is kept on its own.
 */
export function normalizeSelection(project: Project | null, request: SelectionRequest): Selection {
  if (request.kind === 'credential') return CREDENTIAL;
  const { id } = request;
  const order = project ? visibleOrder(project) : [];
  if (!order.includes(id)) return oneNode(id);
  const wanted = new Set([...(request.ids ?? []), id]);
  const anchor = request.anchor !== undefined && order.includes(request.anchor) ? request.anchor : id;
  return { kind: 'node', id, ids: order.filter((nodeId) => wanted.has(nodeId)), anchor };
}

/**
 * `selection` without the nodes that are not in `project`, its `ids` back in tree order (a move may
 * have changed it): the primary moves to the first node left, and with none left the credential is
 * selected. Returns `selection` itself when nothing dropped out or changed order.
 */
export function selectionIn(project: Project, selection: Selection): Selection {
  if (selection.kind === 'credential') return selection;
  const order = new Set(visibleOrder(project));
  const ids = [...order].filter((nodeId) => selection.ids.includes(nodeId));
  const same = ids.length === selection.ids.length && ids.every((nodeId, at) => nodeId === selection.ids[at]);
  if (same && order.has(selection.id) && order.has(selection.anchor)) return selection;
  if (ids.length === 0) return CREDENTIAL;
  const id = ids.includes(selection.id) ? selection.id : ids[0];
  return { kind: 'node', id, ids, anchor: order.has(selection.anchor) ? selection.anchor : id };
}

/** The nodes from `from` to `to`, both included, in tree order. */
function range(order: string[], from: string, to: string): string[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** ⌘-click (Ctrl-click) on node `id`: adds it to the selection, or takes it out if it is in and not alone. */
export function toggleNode(project: Project, selection: Selection, id: string): SelectionRequest {
  if (selection.kind === 'credential') return { kind: 'node', id };
  if (!selection.ids.includes(id)) return { kind: 'node', id, ids: [...selection.ids, id], anchor: id };
  if (selection.ids.length === 1) return selection;
  const ids = selection.ids.filter((nodeId) => nodeId !== id);
  if (id !== selection.id) return { ...selection, ids, anchor: id };
  // The primary was taken out: the nearest selected node above it takes over, else the first one.
  const order = visibleOrder(project);
  const at = order.indexOf(id);
  const above = ids.filter((nodeId) => order.indexOf(nodeId) < at);
  return { kind: 'node', id: above.at(-1) ?? ids[0], ids, anchor: id };
}

/**
 * ⇧-click on node `id`, or ⇧↑/⇧↓ to it: selects the range from the anchor to `id` among the node rows
 * the tree shows (`rows`, see `visibleRows`), across groups.
 */
export function extendTo(rows: string[], selection: Selection, id: string): SelectionRequest {
  if (selection.kind === 'credential') return { kind: 'node', id };
  return { kind: 'node', id, ids: range(rows, selection.anchor, id), anchor: selection.anchor };
}

/**
 * The row `step` rows away from the primary among the node rows the tree shows (`nodeRows`, see
 * `visibleRows`), `'credential'` for the Credential row, or null past either end.
 */
export function rowAfter(nodeRows: string[], selection: Selection, step: 1 | -1): string | null {
  const rows = ['credential', ...nodeRows];
  const at = rows.indexOf(selection.kind === 'node' ? selection.id : 'credential');
  return rows[Math.max(at, 0) + step] ?? null;
}
