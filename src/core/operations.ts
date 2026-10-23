import {
  type ClaimsPath,
  type Group,
  type GroupLink,
  type LangTag,
  type Node,
  type NodeVisit,
  type Project,
  ensureLanguageSlots,
  findGroup,
  findNode,
  newGroupLink,
  newId,
  walkNodes,
} from './model.ts';
import { renameInTemplate, resolveTemplate, retargetTemplate } from './templates.ts';

/** Inserts `node` into the group with `groupId` at `index` (end when omitted). */
export function insertNode(project: Project, groupId: string, node: Node, index?: number): void {
  const group = findGroup(project.root, groupId);
  if (!group) throw new Error(`Unknown group ${groupId}`);
  group.children.splice(index ?? group.children.length, 0, node);
}

export function removeNode(project: Project, nodeId: string): Node | undefined {
  const visit = findNode(project.root, nodeId);
  if (!visit) return undefined;
  visit.parent.children = visit.parent.children.filter((child) => child.id !== nodeId);
  return visit.node;
}

function containsGroup(node: Node, groupId: string): boolean {
  if (node.kind !== 'group') return false;
  if (node.group.id === groupId) return true;
  return [...walkNodes(node.group)].some(({ node: inner }) => inner.kind === 'group' && inner.group.id === groupId);
}

/**
 * Moves a node to `index` within the group `targetGroupId`. Returns false (and changes nothing)
 * when the target is the node's own group subtree. Templates that resolved before the move are
 * rewritten so they still point to the same nodes: references to the moved node and its
 * descendants, and the moved node's own labels, which resolve from its new parent.
 */
export function moveNode(project: Project, nodeId: string, targetGroupId: string, index: number): boolean {
  const visit = findNode(project.root, nodeId);
  const target = findGroup(project.root, targetGroupId);
  if (!visit || !target || containsGroup(visit.node, targetGroupId)) return false;
  const resolved =
    visit.parent === target
      ? undefined
      : new Map(templateSlots(project).map((slot) => [slot.id, resolveTemplate(slot.text, project.root, slot.owner)]));
  const fromIndex = visit.parent.children.indexOf(visit.node);
  visit.parent.children.splice(fromIndex, 1);
  const adjusted = visit.parent === target && fromIndex < index ? index - 1 : index;
  target.children.splice(Math.max(0, Math.min(adjusted, target.children.length)), 0, visit.node);
  if (resolved) retargetTemplates(project, resolved);
  return true;
}

function retargetTemplates(project: Project, resolved: Map<string, (Node | null)[]>): void {
  const parents = new Map<string, Group>();
  for (const { node, parent } of walkNodes(project.root)) parents.set(node.id, parent);
  for (const slot of templateSlots(project)) {
    const targets = resolved.get(slot.id);
    if (!targets?.some(Boolean)) continue;
    const text = retargetTemplate(slot.text, project.root, slot.owner, targets, (node) => parents.get(node.id));
    if (text !== slot.text) slot.write(text);
  }
}

export function parentGroupOf(project: Project, nodeId: string): Group | undefined {
  return findNode(project.root, nodeId)?.parent;
}

/**
 * The given nodes in tree order, leaving out any node that sits inside another given node (it
 * travels with that ancestor). Unknown ids are ignored.
 */
function outermostNodes(project: Project, nodeIds: Iterable<string>): NodeVisit[] {
  const wanted = new Set(nodeIds);
  const found: NodeVisit[] = [];
  const visit = (group: Group, depth: number) => {
    for (const node of group.children) {
      if (wanted.has(node.id)) found.push({ node, parent: group, depth });
      else if (node.kind === 'group') visit(node.group, depth + 1);
    }
  };
  visit(project.root, 0);
  return found;
}

/** The group link that owns `group`, with the group it sits in; undefined for the root. */
function linkOfGroup(project: Project, group: Group): { link: GroupLink; parent: Group } | undefined {
  for (const { node, parent } of walkNodes(project.root)) if (node.kind === 'group' && node.group === group) return { link: node, parent };
  return undefined;
}

/**
 * Wraps the given nodes in a new group without a source path (a visual group, so the wrapped
 * attributes keep reading the same claims), keyed `group`, `group_2`… The group takes the place of
 * the first node in tree order, inside that node's parent; the nodes keep their relative order and a
 * node inside another given node comes along with it. Returns the new group link's id, or
 * undefined (and changes nothing) when no given id names a node.
 */
export function groupNodes(project: Project, nodeIds: Iterable<string>): string | undefined {
  const visits = outermostNodes(project, nodeIds);
  if (!visits.length) return undefined;
  const { node: first, parent } = visits[0];
  const link = newGroupLink(uniqueKey(parent, NEW_NODE_KEYS.group));
  parent.children.splice(parent.children.indexOf(first), 0, link);
  for (const { node } of visits) moveNode(project, node.id, link.group.id, link.group.children.length);
  return link.id;
}

/**
 * Lifts a group's children into its parent at the group's position, in order, and removes the
 * then empty group. Refuses (returns undefined, changes nothing) a list of objects, whose children
 * describe the items of an array, and any node that is not a group. Returns the lifted children's ids.
 */
export function ungroupNode(project: Project, nodeId: string): string[] | undefined {
  const visit = findNode(project.root, nodeId);
  if (!visit || visit.node.kind !== 'group' || visit.node.array) return undefined;
  const { node: link, parent } = visit;
  const children = [...link.group.children];
  const index = parent.children.indexOf(link);
  children.forEach((child, offset) => moveNode(project, child.id, parent.id, index + offset));
  removeNode(project, link.id);
  return children.map((child) => child.id);
}

/**
 * Moves the given nodes one place up or down within their group. A node at the top or bottom edge
 * of a group moves out into the parent group, just before or after that group; a neighbouring group
 * is passed over, never entered. Nodes at the very top or bottom of the tree stay where they are,
 * and so do given nodes stacked against them, so the given nodes always keep their relative order.
 * Returns whether anything moved.
 */
export function moveNodes(project: Project, nodeIds: Iterable<string>, direction: 'up' | 'down'): boolean {
  const visits = outermostNodes(project, nodeIds);
  const moving = new Set(visits.map(({ node }) => node.id));
  const step = direction === 'up' ? -1 : 1;
  let moved = false;
  // Nodes nearest the edge go first, so a node never overtakes another given node.
  for (const { node } of direction === 'up' ? visits : visits.reverse()) {
    const parent = parentGroupOf(project, node.id)!;
    const index = parent.children.indexOf(node);
    const neighbour = parent.children[index + step];
    if (neighbour) {
      if (moving.has(neighbour.id)) continue;
      moved = moveNode(project, node.id, parent.id, direction === 'up' ? index - 1 : index + 2) || moved;
      continue;
    }
    const outer = linkOfGroup(project, parent);
    if (!outer) continue;
    const linkIndex = outer.parent.children.indexOf(outer.link);
    moved = moveNode(project, node.id, outer.parent.id, direction === 'up' ? linkIndex : linkIndex + 1) || moved;
  }
  return moved;
}

/** The given node ids that do not sit inside another given node, in tree order. Unknown ids are left out. */
export function outermostIds(project: Project, nodeIds: Iterable<string>): string[] {
  return outermostNodes(project, nodeIds).map(({ node }) => node.id);
}

/**
 * Where `moveNodesTo` puts the nodes: the target group and the first of its children, from `index`
 * on, that is not moving (undefined for the end). Undefined when no given id names a node or the
 * target group is missing or sits inside (or is) one of the moving nodes.
 */
function placement(project: Project, nodeIds: Iterable<string>, groupId: string, index: number) {
  const visits = outermostNodes(project, nodeIds);
  const group = findGroup(project.root, groupId);
  if (!visits.length || !group || visits.some(({ node }) => containsGroup(node, groupId))) return undefined;
  const moving = new Set(visits.map(({ node }) => node));
  const anchor = group.children.slice(Math.max(0, index)).find((child) => !moving.has(child));
  return { visits, group, anchor };
}

/**
 * Whether `moveNodesTo` with the same arguments would change the tree: the target is valid and the
 * nodes are not already side by side, in tree order, just before that spot in that group.
 */
export function canMoveNodesTo(project: Project, nodeIds: Iterable<string>, groupId: string, index: number): boolean {
  const place = placement(project, nodeIds, groupId, index);
  if (!place) return false;
  const { visits, group, anchor } = place;
  const end = anchor ? group.children.indexOf(anchor) : group.children.length;
  const before = group.children.slice(end - visits.length, end);
  return end < visits.length || visits.some(({ node }, at) => before[at] !== node);
}

/**
 * Moves the given nodes, in tree order, into the group `groupId` just before the child now at
 * `index` (the end when `index` is past the last child); a node inside another given node comes
 * along with it. Every move goes through `moveNode`, so template references follow. Refuses
 * (returns false, changes nothing) a target inside one of the nodes, and does nothing (returns
 * false) when the nodes are already there.
 */
export function moveNodesTo(project: Project, nodeIds: Iterable<string>, groupId: string, index: number): boolean {
  const ids = [...nodeIds];
  if (!canMoveNodesTo(project, ids, groupId, index)) return false;
  const { visits, group, anchor } = placement(project, ids, groupId, index)!;
  for (const { node } of visits) moveNode(project, node.id, group.id, anchor ? group.children.indexOf(anchor) : group.children.length);
  return true;
}

/**
 * "Move to" for several nodes: appends the given nodes to the group `targetGroupId`, keeping their
 * tree order; a node inside another given node comes along with it. A node whose own subtree holds
 * the target stays where it is. Templates follow as with `moveNode`. Returns whether anything moved.
 */
export function moveNodesInto(project: Project, nodeIds: Iterable<string>, targetGroupId: string): boolean {
  let moved = false;
  for (const { node } of outermostNodes(project, nodeIds)) moved = moveNode(project, node.id, targetGroupId, Number.MAX_SAFE_INTEGER) || moved;
  return moved;
}

/**
 * A deep copy of `node`, with its whole subtree for a group, and fresh ids throughout (node and group
 * ids alike). Keys, labels, source paths and I14Y links are copied as they are. `ids` maps the id of
 * each node in the subtree to the id of its copy.
 */
export function cloneNode(node: Node): { copy: Node; ids: Map<string, string> } {
  const copy = structuredClone(node);
  const ids = new Map<string, string>();
  const refresh = (original: Node, cloned: Node) => {
    cloned.id = newId();
    ids.set(original.id, cloned.id);
    if (original.kind !== 'group' || cloned.kind !== 'group') return;
    cloned.group.id = newId();
    original.group.children.forEach((child, index) => refresh(child, cloned.group.children[index]));
  };
  refresh(node, copy);
  return { copy, ids };
}

/**
 * Duplicates each given node, a group with its whole subtree, right after the original in the same
 * group; a node inside another given node is copied with that ancestor only. Copies get fresh ids and
 * a key unique among their siblings (`uniqueKey`). Labels are copied as they are, except that a
 * `{{…}}` reference from inside a copy to the original or a node inside it points to the
 * corresponding copied node instead (relative references inside a copied group already do).
 * Returns a map from the id of every copied node, inner ones included, to the id of its copy, in
 * tree order of the originals; it is empty (and nothing changes) when no given id names a node.
 */
export function duplicateNodes(project: Project, nodeIds: Iterable<string>): Map<string, string> {
  const copied = new Map<string, string>();
  const copies: { copy: Node; ids: Map<string, string> }[] = [];
  for (const { node, parent } of outermostNodes(project, nodeIds)) {
    const { copy, ids } = cloneNode(node);
    copy.key = uniqueKey(parent, node.key);
    parent.children.splice(parent.children.indexOf(node) + 1, 0, copy);
    copies.push({ copy, ids });
    for (const [from, to] of ids) copied.set(from, to);
  }
  // Point the copies' references to an original node, or a node inside it, at the matching copy.
  const byId = new Map<string, Node>();
  const parents = new Map<string, Group>();
  for (const { node, parent } of walkNodes(project.root)) {
    byId.set(node.id, node);
    parents.set(node.id, parent);
  }
  for (const { copy, ids } of copies) {
    const copyOf = (target: Node | null) => {
      const id = target && ids.get(target.id);
      return (id && byId.get(id)) || null;
    };
    const visits = [{ node: copy, parent: parents.get(copy.id)! }, ...(copy.kind === 'group' ? walkNodes(copy.group) : [])];
    for (const { node, parent } of visits) {
      for (const [lang, text] of Object.entries(node.labels)) {
        if (!text) continue;
        const targets = resolveTemplate(text, project.root, parent).map(copyOf);
        if (targets.some(Boolean)) node.labels[lang] = retargetTemplate(text, project.root, parent, targets, (target) => parents.get(target.id));
      }
    }
  }
  return copied;
}

/** Removes every given node in one go; a node inside another given node goes with it. Returns the removed nodes. */
export function removeNodes(project: Project, nodeIds: Iterable<string>): Node[] {
  return outermostNodes(project, nodeIds).map(({ node, parent }) => {
    parent.children = parent.children.filter((child) => child !== node);
    return node;
  });
}

export function addLanguage(project: Project, lang: LangTag): void {
  if (project.languages.includes(lang)) return;
  project.languages.push(lang);
  ensureLanguageSlots(project, lang);
}

/** Removes a language and every string written in it. */
export function removeLanguage(project: Project, lang: LangTag): void {
  project.languages = project.languages.filter((tag) => tag !== lang);
  delete project.meta[lang];
  delete project.branding[lang];
  for (const { node } of walkNodes(project.root)) {
    delete node.labels[lang];
    if (node.kind === 'attribute' && node.entries) delete node.entries.labels[lang];
  }
}

export function moveLanguage(project: Project, lang: LangTag, index: number): void {
  const rest = project.languages.filter((tag) => tag !== lang);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, lang);
  project.languages = rest;
}

/** Renames a language tag everywhere it is used. Does nothing when `from` is not listed or `to` already is. */
export function renameLanguage(project: Project, from: LangTag, to: LangTag): void {
  if (!project.languages.includes(from) || project.languages.includes(to)) return;
  project.languages = project.languages.map((tag) => (tag === from ? to : tag));
  const move = <T>(record: Record<LangTag, T>) => {
    if (!(from in record)) return;
    record[to] = record[from];
    delete record[from];
  };
  move(project.meta);
  move(project.branding);
  for (const { node } of walkNodes(project.root)) {
    move(node.labels);
    if (node.kind === 'attribute' && node.entries) move(node.entries.labels);
  }
}

/** Keys the editor gives new items (made unique with `_2`, `_3`…). */
export const NEW_NODE_KEYS = { attribute: 'attribute', group: 'group', list: 'items' } as const;

export const PLACEHOLDER_KEY = new RegExp(`^(?:${Object.values(NEW_NODE_KEYS).join('|')})(?:_\\d+)?$`);

/** `base`, or `base_2`, `base_3`… — the first key not used in `group`. */
export function uniqueKey(group: Group, base: string): string {
  const taken = new Set(group.children.map((child) => child.key));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

/**
 * The source path that children of `groupId` start from: the source of the nearest enclosing
 * group link that has one (visual clusters without a source are skipped), or [] at the root.
 */
export function sourcePrefixFor(project: Project, groupId: string): ClaimsPath {
  const linkOf = new Map<string, { link: GroupLink; parent: Group }>();
  for (const { node, parent } of walkNodes(project.root)) if (node.kind === 'group') linkOf.set(node.group.id, { link: node, parent });
  let current = linkOf.get(groupId);
  while (current) {
    if (current.link.source && current.link.source.length) return [...current.link.source];
    current = linkOf.get(current.parent.id);
  }
  return [];
}

interface TemplateSlot {
  id: string;
  owner: Group;
  text: string;
  write: (text: string) => void;
}

/**
 * Every non-empty editor-form template in the project: the branding primary and secondary fields
 * in every language and theme (resolved from the root) and every node label (resolved from the
 * node's group). `id` names the slot independently of where the node sits in the tree.
 */
function templateSlots(project: Project): TemplateSlot[] {
  const slots: TemplateSlot[] = [];
  for (const [lang, pair] of Object.entries(project.branding)) {
    for (const theme of ['light', 'dark'] as const) {
      const branding = pair[theme];
      if (!branding) continue;
      for (const field of ['primaryField', 'secondaryField'] as const) {
        const text = branding[field];
        if (!text) continue;
        slots.push({ id: `branding:${lang}:${theme}:${field}`, owner: project.root, text, write: (value) => void (branding[field] = value) });
      }
    }
  }
  for (const { node, parent } of walkNodes(project.root)) {
    for (const [lang, text] of Object.entries(node.labels)) {
      if (!text) continue;
      slots.push({ id: `label:${node.id}:${lang}`, owner: parent, text, write: (value) => void (node.labels[lang] = value) });
    }
  }
  return slots;
}

/**
 * Renames a node. Templates that reference it follow the rename. The source path stays as it is
 * (spec §5.1), except for a newly added item that still has its placeholder key: its path was only
 * derived from that key, so the last name in it follows.
 */
export function renameNode(project: Project, nodeId: string, key: string): void {
  const visit = findNode(project.root, nodeId);
  if (!visit) return;
  const node = visit.node;
  if (key !== '' && key !== node.key) {
    for (const slot of templateSlots(project)) slot.write(renameInTemplate(slot.text, project.root, slot.owner, nodeId, key));
  }
  const source = node.source;
  if (source && PLACEHOLDER_KEY.test(node.key)) {
    for (let index = source.length - 1; index >= 0; index--) {
      const segment = source[index];
      if (typeof segment !== 'string') continue;
      if (segment === node.key && key !== '') source[index] = key;
      break;
    }
  }
  node.key = key;
}
