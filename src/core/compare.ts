import { buildBundle, serializeBundle } from './export/bundle.ts';
import { importBundle } from './import/bundle.ts';
import {
  type Branding,
  type ClaimsPath,
  type Group,
  type LangTag,
  type Node,
  type Project,
  typeToString,
} from './model.ts';

export type ChangeSection = 'attributes' | 'labels' | 'branding' | 'languages' | 'other';
export type ChangeTag = 'added' | 'removed' | 'changed';

/** Sections in the order `compareProjects` lists them. */
export const CHANGE_SECTIONS: readonly ChangeSection[] = ['attributes', 'labels', 'branding', 'languages', 'other'];

/** The attribute or group a change is about. */
export interface ChangeTarget {
  /** Keys from the root to the node, e.g. `['address', 'city']`. Nodes are matched on it. */
  keyPath: string[];
  /** `keyPath` as text: `address.city`. */
  path: string;
  nodeKind: 'attribute' | 'group';
  /** The node's id in "after", when it exists there, to jump to it. Absent for a removed node. */
  nodeId?: string;
}

export type AttributeChange = ChangeTarget & { section: 'attributes' } & (
    | { kind: 'node'; tag: 'added' | 'removed' }
    /** Attribute types as in the capture base (`Text`, `Array[Numeric]`); groups are `Object` or `Array[Object]`. */
    | { kind: 'type'; tag: 'changed'; from: string; to: string }
    | { kind: 'source'; tag: ChangeTag; from: ClaimsPath; to: ClaimsPath }
    /** Position within the group, from 1. Only nodes that moved relative to their siblings are reported. */
    | { kind: 'position'; tag: 'changed'; from: number; to: number }
    | { kind: 'sensitive'; tag: 'changed'; from: boolean; to: boolean }
    | { kind: 'standard'; tag: ChangeTag; from?: string; to?: string }
    /** Entry codes, or their labels in a language both sides have. */
    | { kind: 'entries'; tag: 'changed' }
  );

/** The node's label changed in `languages` (languages both sides have). */
export type LabelChange = ChangeTarget & { section: 'labels'; kind: 'label'; tag: ChangeTag; languages: LangTag[] };

export type CredentialField = 'name' | 'description' | keyof Branding;

/**
 * A credential field changed in `languages` (languages both sides have). Name and description have no
 * theme; branding fields carry the theme they changed in.
 */
export interface BrandingChange {
  section: 'branding';
  kind: 'field';
  tag: ChangeTag;
  field: CredentialField;
  theme?: 'light' | 'dark';
  languages: LangTag[];
}

export type LanguageChange =
  | { section: 'languages'; kind: 'language'; tag: 'added' | 'removed'; language: LangTag }
  /** The languages both sides have, in a different order (it changes the overlay order). */
  | { section: 'languages'; kind: 'order'; tag: 'changed'; from: LangTag[]; to: LangTag[] };

/** The bundles differ in a way no other change explains (kept overlays, bundle extras). */
export interface OtherChange {
  section: 'other';
  kind: 'bundle';
  tag: 'changed';
}

export type ProjectChange = AttributeChange | LabelChange | BrandingChange | LanguageChange | OtherChange;

/** The project as the app reads its bundle back: export, then import. Drops editor-only data. */
export async function normaliseProject(project: Project): Promise<Project> {
  return (await exportAndImport(project)).project;
}

async function exportAndImport(project: Project): Promise<{ project: Project; bundle?: string }> {
  let bundle: string;
  try {
    bundle = serializeBundle((await buildBundle(project)).bundle);
  } catch {
    // The project cannot be exported (two identical groups with different overlays); compare it as it is.
    return { project };
  }
  return { project: (await importBundle(JSON.parse(bundle))).project, bundle };
}

/**
 * What changed from `before` to `after`, in section order (attributes, labels, branding, languages,
 * other), each section in tree order. Both sides are normalised through the bundle export and import,
 * so data the bundle leaves out (the sample, I14Y links) never counts. Nodes are matched by key path:
 * a rename is a removal plus an addition. An added or removed group is one change; its children are
 * not listed. Labels and credential fields are compared only in the languages both sides have.
 */
export async function compareProjects(before: Project, after: Project): Promise<ProjectChange[]> {
  const [left, right] = await Promise.all([exportAndImport(before), exportAndImport(after)]);
  const ids = new Map<string, string>();
  collectIds(after.root, [], ids);
  const languages = left.project.languages.filter((lang) => right.project.languages.includes(lang));

  const attributes: AttributeChange[] = [];
  const labels: LabelChange[] = [];
  compareGroups(left.project.root, right.project.root, [], { ids, languages, attributes, labels });
  const changes: ProjectChange[] = [
    ...attributes,
    ...labels,
    ...compareCredential(left.project, right.project, languages),
    ...compareLanguages(left.project.languages, right.project.languages),
  ];
  if (!changes.length && left.bundle !== undefined && right.bundle !== undefined && left.bundle !== right.bundle) {
    changes.push({ section: 'other', kind: 'bundle', tag: 'changed' });
  }
  return changes;
}

const pathKey = (keyPath: string[]) => JSON.stringify(keyPath);

function collectIds(group: Group, prefix: string[], ids: Map<string, string>): void {
  for (const node of group.children) {
    const keyPath = [...prefix, node.key];
    if (!ids.has(pathKey(keyPath))) ids.set(pathKey(keyPath), node.id);
    if (node.kind === 'group') collectIds(node.group, keyPath, ids);
  }
}

interface Walk {
  ids: Map<string, string>;
  languages: LangTag[];
  attributes: AttributeChange[];
  labels: LabelChange[];
}

function target(node: Node, keyPath: string[], ids: Map<string, string>, exists: boolean): ChangeTarget {
  const nodeId = exists ? ids.get(pathKey(keyPath)) : undefined;
  return { keyPath, path: keyPath.join('.'), nodeKind: node.kind, ...(nodeId ? { nodeId } : {}) };
}

function nodeType(node: Node): string {
  if (node.kind === 'attribute') return typeToString(node.type);
  return node.array ? 'Array[Object]' : 'Object';
}

const isEmpty = (value: unknown) => value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

function tagFor(from: unknown, to: unknown): ChangeTag {
  if (isEmpty(from)) return 'added';
  if (isEmpty(to)) return 'removed';
  return 'changed';
}

/** One tag for several values that changed: added or removed only when every one was. */
function combinedTag(tags: ChangeTag[]): ChangeTag {
  return tags.every((tag) => tag === tags[0]) ? tags[0] : 'changed';
}

function compareGroups(before: Group, after: Group, prefix: string[], walk: Walk): void {
  const beforeByKey = new Map<string, Node>();
  for (const node of before.children) if (!beforeByKey.has(node.key)) beforeByKey.set(node.key, node);
  const afterKeys = new Set(after.children.map((node) => node.key));
  const moved = movedKeys(
    before.children.map((node) => node.key).filter((key) => afterKeys.has(key)),
    after.children.map((node) => node.key).filter((key) => beforeByKey.has(key)),
  );

  after.children.forEach((node, index) => {
    const keyPath = [...prefix, node.key];
    const old = beforeByKey.get(node.key);
    const at = target(node, keyPath, walk.ids, true);
    if (!old) {
      walk.attributes.push({ ...at, section: 'attributes', kind: 'node', tag: 'added' });
      return;
    }
    const fromType = nodeType(old);
    const toType = nodeType(node);
    if (fromType !== toType) walk.attributes.push({ ...at, section: 'attributes', kind: 'type', tag: 'changed', from: fromType, to: toType });
    const fromSource = old.source ?? [];
    const toSource = node.source ?? [];
    if (JSON.stringify(fromSource) !== JSON.stringify(toSource)) {
      walk.attributes.push({ ...at, section: 'attributes', kind: 'source', tag: tagFor(fromSource, toSource), from: fromSource, to: toSource });
    }
    if (moved.has(node.key)) {
      walk.attributes.push({ ...at, section: 'attributes', kind: 'position', tag: 'changed', from: before.children.indexOf(old) + 1, to: index + 1 });
    }
    if (old.sensitive !== node.sensitive) {
      walk.attributes.push({ ...at, section: 'attributes', kind: 'sensitive', tag: 'changed', from: old.sensitive, to: node.sensitive });
    }
    const fromStandard = old.kind === 'attribute' ? old.standard || undefined : undefined;
    const toStandard = node.kind === 'attribute' ? node.standard || undefined : undefined;
    if (fromStandard !== toStandard) {
      walk.attributes.push({
        ...at,
        section: 'attributes',
        kind: 'standard',
        tag: tagFor(fromStandard, toStandard),
        ...(fromStandard ? { from: fromStandard } : {}),
        ...(toStandard ? { to: toStandard } : {}),
      });
    }
    if (old.kind === 'attribute' && node.kind === 'attribute' && entriesSignature(old, walk.languages) !== entriesSignature(node, walk.languages)) {
      walk.attributes.push({ ...at, section: 'attributes', kind: 'entries', tag: 'changed' });
    }

    const changedLabels = walk.languages.filter((lang) => (old.labels[lang] ?? '') !== (node.labels[lang] ?? ''));
    if (changedLabels.length) {
      walk.labels.push({
        ...at,
        section: 'labels',
        kind: 'label',
        tag: combinedTag(changedLabels.map((lang) => tagFor(old.labels[lang], node.labels[lang]))),
        languages: changedLabels,
      });
    }

    if (old.kind === 'group' && node.kind === 'group') compareGroups(old.group, node.group, keyPath, walk);
  });

  for (const node of before.children) {
    if (afterKeys.has(node.key) || beforeByKey.get(node.key) !== node) continue;
    walk.attributes.push({ ...target(node, [...prefix, node.key], walk.ids, false), section: 'attributes', kind: 'node', tag: 'removed' });
  }
}

function entriesSignature(node: Extract<Node, { kind: 'attribute' }>, languages: LangTag[]): string {
  const entries = node.entries;
  if (!entries || !entries.codes.length) return '';
  return JSON.stringify([entries.codes, languages.map((lang) => entries.labels[lang] ?? {})]);
}

/**
 * Keys that moved: the shared keys outside a longest common subsequence of the two orders, so one
 * attribute moved past its siblings is one move, and siblings added or removed move nothing.
 */
function movedKeys(before: string[], after: string[]): Set<string> {
  const lengths = before.map(() => after.map(() => 0));
  const at = (i: number, j: number) => (i < before.length && j < after.length ? lengths[i][j] : 0);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i][j] = before[i] === after[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const kept = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      kept.add(before[i]);
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) i++;
    else j++;
  }
  return new Set(after.filter((key) => !kept.has(key)));
}

const BRANDING_FIELDS: readonly (keyof Branding)[] = ['logo', 'primaryBackgroundColor', 'primaryField', 'secondaryField'];

function compareCredential(before: Project, after: Project, languages: LangTag[]): BrandingChange[] {
  const changes: BrandingChange[] = [];
  const field = (name: CredentialField, read: (project: Project, lang: LangTag) => string | undefined, theme?: 'light' | 'dark') => {
    const changed = languages.filter((lang) => (read(before, lang) ?? '') !== (read(after, lang) ?? ''));
    if (!changed.length) return;
    const tag = combinedTag(changed.map((lang) => tagFor(read(before, lang), read(after, lang))));
    changes.push({ section: 'branding', kind: 'field', tag, field: name, ...(theme ? { theme } : {}), languages: changed });
  };
  field('name', (project, lang) => project.meta[lang]?.name);
  field('description', (project, lang) => project.meta[lang]?.description);
  for (const theme of ['light', 'dark'] as const) {
    for (const name of BRANDING_FIELDS) field(name, (project, lang) => project.branding[lang]?.[theme]?.[name], theme);
  }
  return changes;
}

function compareLanguages(before: LangTag[], after: LangTag[]): LanguageChange[] {
  const changes: LanguageChange[] = [
    ...after.filter((lang) => !before.includes(lang)).map((language) => ({ section: 'languages', kind: 'language', tag: 'added', language }) as const),
    ...before.filter((lang) => !after.includes(lang)).map((language) => ({ section: 'languages', kind: 'language', tag: 'removed', language }) as const),
  ];
  const from = before.filter((lang) => after.includes(lang));
  const to = after.filter((lang) => before.includes(lang));
  if (from.join('\n') !== to.join('\n')) changes.push({ section: 'languages', kind: 'order', tag: 'changed', from, to });
  return changes;
}

/** Changes per section, for the tab's counts. */
export function countChanges(changes: ProjectChange[]): Record<ChangeSection, number> {
  const counts = Object.fromEntries(CHANGE_SECTIONS.map((section) => [section, 0])) as Record<ChangeSection, number>;
  for (const change of changes) counts[change.section]++;
  return counts;
}

