export type LangTag = string;
export type PathSegment = string | number | null;
export type ClaimsPath = PathSegment[];
export type PrimitiveType = 'Text' | 'Numeric' | 'Boolean' | 'DateTime' | 'Binary';
export type AttrType = PrimitiveType | { array: PrimitiveType };

export const PRIMITIVE_TYPES: readonly PrimitiveType[] = ['Text', 'Numeric', 'Boolean', 'DateTime', 'Binary'];
/** Types offered in the type picker. Binary is import-only. */
export const EDITABLE_TYPES: readonly PrimitiveType[] = ['Text', 'Numeric', 'Boolean', 'DateTime'];

export const KNOWN_STANDARDS = {
  iso8601: 'urn:iso:std:iso:8601',
  unixEpoch: 'urn:iso:std:iso-iec:9945',
  dataUrl: 'urn:ietf:rfc:2397',
} as const;

export const DATA_SOURCE_FORMAT = 'dc+sd-jwt';

export interface Branding {
  logo?: string;
  primaryBackgroundColor?: string;
  primaryField?: string;
  secondaryField?: string;
}

export interface BrandingPair {
  light: Branding;
  dark?: Branding;
}

export interface Meta {
  name: string;
  description: string;
}

export interface Entries {
  codes: string[];
  labels: Record<LangTag, Record<string, string>>;
}

/**
 * The I14Y concept an attribute was filled from, with I14Y's texts at that moment (keyed by I14Y
 * language: de, fr, it, en, rm). Kept in the draft only; the bundle never contains it.
 */
export interface I14yLink {
  conceptId: string;
  identifier: string;
  registrationStatus: string;
  name: Record<string, string>;
  publisher: Record<string, string>;
  /** Code → its label per I14Y language. */
  values: Record<string, Record<string, string>>;
}

export interface AttributeNode {
  kind: 'attribute';
  id: string;
  key: string;
  type: AttrType;
  source: ClaimsPath;
  standard?: string;
  sensitive: boolean;
  labels: Record<LangTag, string>;
  entries?: Entries;
  i14y?: I14yLink;
}

export interface GroupLink {
  kind: 'group';
  id: string;
  key: string;
  array: boolean;
  source?: ClaimsPath;
  sensitive: boolean;
  labels: Record<LangTag, string>;
  group: Group;
}

export type Node = AttributeNode | GroupLink;

export interface Group {
  id: string;
  children: Node[];
  passthrough: Record<string, unknown>[];
}

export type Hosting = { mode: 'url'; url: string } | { mode: 'dataUrl' };

export interface Project {
  version: 1;
  languages: LangTag[];
  meta: Record<LangTag, Meta>;
  branding: Record<LangTag, BrandingPair>;
  root: Group;
  sample?: unknown;
  hosting: Hosting;
  bundleExtras: Record<string, unknown>;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyGroup(): Group {
  return { id: newId(), children: [], passthrough: [] };
}

export function newAttribute(key: string, init: Partial<Omit<AttributeNode, 'kind' | 'id' | 'key'>> = {}): AttributeNode {
  return { kind: 'attribute', id: newId(), key, type: 'Text', source: [key], sensitive: false, labels: {}, ...init };
}

export function newGroupLink(key: string, init: Partial<Omit<GroupLink, 'kind' | 'id' | 'key'>> = {}): GroupLink {
  return { kind: 'group', id: newId(), key, array: false, sensitive: false, labels: {}, group: emptyGroup(), ...init };
}

export function emptyProject(languages: LangTag[]): Project {
  const project: Project = {
    version: 1,
    languages: [...languages],
    meta: {},
    branding: {},
    root: emptyGroup(),
    hosting: { mode: 'url', url: '' },
    bundleExtras: {},
  };
  for (const lang of languages) ensureLanguageSlots(project, lang);
  return project;
}

/** Makes sure meta and branding exist for a language. */
export function ensureLanguageSlots(project: Project, lang: LangTag): void {
  project.meta[lang] ??= { name: '', description: '' };
  project.branding[lang] ??= { light: {} };
}

export function isArrayType(type: AttrType): type is { array: PrimitiveType } {
  return typeof type === 'object';
}

export function typeToString(type: AttrType): string {
  return isArrayType(type) ? `Array[${type.array}]` : type;
}

/** Parses a non-reference capture base type such as "Text" or "Array[Numeric]". */
export function parseTypeString(value: string): AttrType | null {
  const array = /^Array\[(.+)\]$/.exec(value);
  const inner = array ? array[1] : value;
  if (!(PRIMITIVE_TYPES as readonly string[]).includes(inner)) return null;
  return array ? { array: inner as PrimitiveType } : (inner as PrimitiveType);
}

export interface NodeVisit {
  node: Node;
  parent: Group;
  depth: number; // number of group links between the root and `parent`
}

/** Depth-first, pre-order walk over every node below `group`. */
export function* walkNodes(group: Group, depth = 0): Generator<NodeVisit> {
  for (const node of group.children) {
    yield { node, parent: group, depth };
    if (node.kind === 'group') yield* walkNodes(node.group, depth + 1);
  }
}

/** Every group in the tree, root first, depth-first pre-order. */
export function* walkGroups(root: Group): Generator<Group> {
  yield root;
  for (const { node } of walkNodes(root)) if (node.kind === 'group') yield node.group;
}

export function findNode(root: Group, id: string): NodeVisit | undefined {
  for (const visit of walkNodes(root)) if (visit.node.id === id) return visit;
  return undefined;
}

export function findGroup(root: Group, id: string): Group | undefined {
  for (const group of walkGroups(root)) if (group.id === id) return group;
  return undefined;
}
