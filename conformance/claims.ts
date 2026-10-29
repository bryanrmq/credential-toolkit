/**
 * Credential claims for samples that have no sample credential (imported bundles carry none): one value per
 * attribute, at its source path, of its type. The wallets build their display from claims, and so does the preview,
 * so both get the same ones.
 */
import { type AttributeNode, type ClaimsPath, type Group, type PrimitiveType, type Project, isArrayType, walkNodes } from '../src/core/model.ts';
import { PNG_BASE64 } from './samples.ts';

/** How many items a list gets. */
const ITEMS = 2;

const DATA_URL = 'urn:ietf:rfc:2397';
const UNIX_TIME = 'urn:iso:std:iso-iec:9945';

/** An overlay field of `group`'s Format or Character Encoding overlay (kept as passthrough), for `key`. */
function passthroughValue(group: Group, field: 'attribute_formats' | 'attribute_character_encoding', key: string): string | undefined {
  for (const overlay of group.passthrough) {
    const values = overlay[field];
    if (values && typeof values === 'object' && key in values) return String((values as Record<string, unknown>)[key]);
  }
  return undefined;
}

function value(node: AttributeNode, type: PrimitiveType, owner: Group, index: number): unknown {
  const code = node.entries?.codes[index % node.entries.codes.length];
  if (code !== undefined) {
    if (type === 'Numeric') return Number(code);
    if (type === 'Boolean') return code === 'true';
    return code;
  }
  const format = passthroughValue(owner, 'attribute_formats', node.key);
  switch (type) {
    case 'Numeric':
      return 42 + index;
    case 'Boolean':
      return index % 2 === 0;
    case 'DateTime':
      if (node.standard === UNIX_TIME) return 1704448800 + index * 86400;
      return format?.includes('HH') ? `2024-01-0${5 + index}T10:30:00Z` : `2024-01-0${5 + index}`;
    case 'Binary':
      return format?.startsWith('image/') ? PNG_BASE64 : 'aGVsbG8=';
    case 'Text':
      return node.standard === DATA_URL ? `data:image/png;base64,${PNG_BASE64}` : `${node.key} ${index + 1}`;
  }
}

/** Writes `make(index)` at `path` in `target`, creating objects and lists of `ITEMS` items for `null` segments. */
function place(target: Record<string, unknown> | unknown[], path: ClaimsPath, make: (index: number) => unknown, index = 0): void {
  const [segment, ...rest] = path;
  if (segment === undefined) return;
  if (segment === null || typeof segment === 'number') {
    if (!Array.isArray(target)) return;
    const indices = segment === null ? [...Array(ITEMS).keys()] : [segment];
    for (const at of indices) {
      if (rest.length === 0) {
        target[at] ??= make(at);
      } else {
        target[at] ??= rest[0] === null || typeof rest[0] === 'number' ? [] : {};
        place(target[at] as Record<string, unknown>, rest, make, at);
      }
    }
    return;
  }
  if (Array.isArray(target)) return;
  if (rest.length === 0) {
    target[segment] ??= make(index);
    return;
  }
  target[segment] ??= rest[0] === null || typeof rest[0] === 'number' ? [] : {};
  place(target[segment] as Record<string, unknown>, rest, make, index);
}

/** Claims with one value for every attribute that has a source path. */
export function synthesiseClaims(project: Project): Record<string, unknown> {
  const claims: Record<string, unknown> = {};
  const owners = new Map<string, Group>();
  const collect = (group: Group) => {
    for (const node of group.children) {
      owners.set(node.id, group);
      if (node.kind === 'group') collect(node.group);
    }
  };
  collect(project.root);
  for (const { node } of walkNodes(project.root)) {
    if (node.kind !== 'attribute' || node.source.length === 0) continue;
    const owner = owners.get(node.id)!;
    if (isArrayType(node.type)) {
      const element = node.type.array;
      const path = node.source.at(-1) === null ? node.source : [...node.source, null];
      place(claims, path, (index) => value(node, element, owner, index));
    } else {
      const type = node.type;
      place(claims, node.source, (index) => value(node, type, owner, index));
    }
  }
  return claims;
}
