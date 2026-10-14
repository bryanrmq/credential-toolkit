import {
  type ClaimsPath,
  type Group,
  type GroupLink,
  type LangTag,
  type Node,
  type Project,
  ensureLanguageSlots,
  findGroup,
  findNode,
  walkNodes,
} from './model';
import { renameInTemplate } from './templates';

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
 * when the target is the node's own group subtree.
 */
export function moveNode(project: Project, nodeId: string, targetGroupId: string, index: number): boolean {
  const visit = findNode(project.root, nodeId);
  const target = findGroup(project.root, targetGroupId);
  if (!visit || !target || containsGroup(visit.node, targetGroupId)) return false;
  const fromIndex = visit.parent.children.indexOf(visit.node);
  visit.parent.children.splice(fromIndex, 1);
  const adjusted = visit.parent === target && fromIndex < index ? index - 1 : index;
  target.children.splice(Math.max(0, Math.min(adjusted, target.children.length)), 0, visit.node);
  return true;
}

export function parentGroupOf(project: Project, nodeId: string): Group | undefined {
  return findNode(project.root, nodeId)?.parent;
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

/**
 * Renames a node. Templates that reference it follow the rename, and so does the last name in
 * its source path when it was the old key.
 */
export function renameNode(project: Project, nodeId: string, key: string): void {
  const visit = findNode(project.root, nodeId);
  if (!visit) return;
  const node = visit.node;
  if (key !== '' && key !== node.key) {
    const root = project.root;
    const rename = (text: string | undefined, owner: Group) => (text ? renameInTemplate(text, root, owner, nodeId, key) : text);
    for (const pair of Object.values(project.branding)) {
      for (const branding of [pair.light, pair.dark]) {
        if (!branding) continue;
        branding.primaryField = rename(branding.primaryField, root);
        branding.secondaryField = rename(branding.secondaryField, root);
      }
    }
    for (const { node: other, parent } of walkNodes(root)) {
      for (const lang of Object.keys(other.labels)) other.labels[lang] = rename(other.labels[lang], parent)!;
    }
  }
  const source = node.source;
  if (source) {
    for (let index = source.length - 1; index >= 0; index--) {
      const segment = source[index];
      if (typeof segment !== 'string') continue;
      if (segment === node.key && key !== '') source[index] = key;
      break;
    }
  }
  node.key = key;
}
