import type { Group, Node } from './model';

/**
 * One `{{…}}` expression. Editor form uses key paths (`pets.name`, `/person.lastname`);
 * spec form uses `refs:<digest>:<attribute>`. Index and join suffixes are kept verbatim.
 */
export interface TemplateExpression {
  raw: string;
  refDigest?: string;
  path: string[];
  absolute: boolean;
  suffix: string;
}

export interface TemplateTarget {
  group: Group;
  node: Node;
}

/** Both swiyu wallets accept a `.join()` separator of 0 to 10 characters and empty the expression otherwise. */
export const MAX_JOIN_SEPARATOR = 10;

const TEMPLATE = /\{\{(.*?)\}\}/g;
const JOIN_SUFFIX = /\.join\((?:'([^']*)'|"([^"]*)")\)$/;
const INDEX_SUFFIX = /\[(?:\d+|null)\]$/;
const REFS_FORM = /^refs:([^:]+):(.+)$/;

export function parseExpression(raw: string): TemplateExpression {
  let rest = raw.trim();
  let suffix = '';
  const join = JOIN_SUFFIX.exec(rest);
  if (join) {
    suffix = join[0];
    rest = rest.slice(0, join.index);
  }
  const index = INDEX_SUFFIX.exec(rest);
  if (index) {
    suffix = index[0] + suffix;
    rest = rest.slice(0, index.index);
  }
  const refs = REFS_FORM.exec(rest);
  if (refs) return { raw, refDigest: refs[1], path: [refs[2]], absolute: false, suffix };
  const absolute = rest.startsWith('/');
  if (absolute) rest = rest.slice(1);
  return { raw, path: rest.split('.'), absolute, suffix };
}

/** The `.join()` separator, or undefined when the expression has none. */
export function joinSeparator(expression: TemplateExpression): string | undefined {
  const join = JOIN_SUFFIX.exec(expression.suffix);
  return join ? (join[1] ?? join[2]) : undefined;
}

export function listExpressions(text: string): TemplateExpression[] {
  return [...text.matchAll(TEMPLATE)].map((match) => parseExpression(match[1]));
}

function mapExpressions(text: string, fn: (expression: TemplateExpression) => string | null): string {
  return text.replace(TEMPLATE, (whole, inner: string) => fn(parseExpression(inner)) ?? whole);
}

/** Resolves an editor-form expression relative to `owner` (or the root when it starts with '/'). */
export function resolveEditorPath(root: Group, owner: Group, expression: TemplateExpression): TemplateTarget | null {
  if (expression.refDigest !== undefined) return null;
  let group = expression.absolute ? root : owner;
  const segments = expression.path;
  for (const segment of segments.slice(0, -1)) {
    const link = group.children.find((child) => child.kind === 'group' && child.key === segment);
    if (!link || link.kind !== 'group') return null;
    group = link.group;
  }
  const node = group.children.find((child) => child.key === segments[segments.length - 1]);
  return node ? { group, node } : null;
}

/** Keys of the group links leading from `from` down to `to`, or null when `to` is not below `from`. */
export function pathBetween(from: Group, to: Group): string[] | null {
  if (from === to) return [];
  for (const child of from.children) {
    if (child.kind !== 'group') continue;
    const rest = pathBetween(child.group, to);
    if (rest) return [child.key, ...rest];
  }
  return null;
}

/** Editor form → spec form, used on export. Unresolvable expressions are left untouched. */
export function toSpecTemplate(text: string, root: Group, owner: Group, digestOf: (group: Group) => string): string {
  return mapExpressions(text, (expression) => {
    const target = resolveEditorPath(root, owner, expression);
    if (!target) return null;
    const attribute = expression.path[expression.path.length - 1];
    if (target.group === owner) return `{{${attribute}${expression.suffix}}}`;
    return `{{refs:${digestOf(target.group)}:${attribute}${expression.suffix}}}`;
  });
}

/** Spec form → editor form, used on import. `groupsFor` returns every group built from a digest. */
export function toEditorTemplate(
  text: string,
  root: Group,
  owner: Group,
  groupsFor: (digest: string) => Group[],
): string {
  return mapExpressions(text, (expression) => {
    if (expression.refDigest === undefined) return null;
    const attribute = expression.path[0];
    const targets = groupsFor(expression.refDigest);
    if (targets.includes(owner)) return `{{${attribute}${expression.suffix}}}`;
    for (const target of targets) {
      const relative = pathBetween(owner, target);
      if (relative) return `{{${[...relative, attribute].join('.')}${expression.suffix}}}`;
    }
    for (const target of targets) {
      const absolute = pathBetween(root, target);
      if (absolute) return `{{/${[...absolute, attribute].join('.')}${expression.suffix}}}`;
    }
    return null;
  });
}

/** Paths offered by autocomplete inside a template owned by `owner`. */
export function templatePaths(owner: Group, prefix: string[] = []): string[] {
  const paths: string[] = [];
  for (const child of owner.children) {
    const path = [...prefix, child.key];
    if (child.kind === 'attribute') paths.push(path.join('.'));
    else paths.push(...templatePaths(child.group, path));
  }
  return paths;
}

/**
 * Rewrites editor-form expressions that pass through the node `nodeId` so they use `newKey`.
 * Call it before the node is renamed: paths are resolved with the current keys.
 */
export function renameInTemplate(text: string, root: Group, owner: Group, nodeId: string, newKey: string): string {
  return mapExpressions(text, (expression) => {
    if (expression.refDigest !== undefined) return null;
    let group: Group | undefined = expression.absolute ? root : owner;
    const segments = [...expression.path];
    let changed = false;
    for (let index = 0; index < segments.length && group; index++) {
      const child: Node | undefined = group.children.find((candidate) => candidate.key === segments[index]);
      if (!child) return null;
      if (child.id === nodeId) {
        segments[index] = newKey;
        changed = true;
      }
      group = child.kind === 'group' ? child.group : undefined;
    }
    return changed ? `{{${expression.absolute ? '/' : ''}${segments.join('.')}${expression.suffix}}}` : null;
  });
}

/** The node each expression in `text` resolves to from `owner`, in order (null when it does not resolve). */
export function resolveTemplate(text: string, root: Group, owner: Group): (Node | null)[] {
  return listExpressions(text).map((expression) => resolveEditorPath(root, owner, expression)?.node ?? null);
}

/**
 * Rewrites the expressions of `text` so each one resolves from `owner` to the node `targets` gives it
 * (from `resolveTemplate`, taken before the tree changed). `parentOf` returns the group a node sits in now.
 * Expressions without a target, or that still resolve to it, are left untouched. A relative expression
 * stays relative while its target is below `owner` and becomes absolute otherwise.
 */
export function retargetTemplate(
  text: string,
  root: Group,
  owner: Group,
  targets: (Node | null)[],
  parentOf: (node: Node) => Group | undefined,
): string {
  let index = 0;
  return mapExpressions(text, (expression) => {
    const target = targets[index++];
    if (!target || resolveEditorPath(root, owner, expression)?.node === target) return null;
    const parent = parentOf(target);
    if (!parent) return null;
    const relative = expression.absolute ? null : pathBetween(owner, parent);
    const path = relative ?? pathBetween(root, parent);
    if (!path) return null;
    return `{{${relative ? '' : '/'}${[...path, target.key].join('.')}${expression.suffix}}}`;
  });
}
