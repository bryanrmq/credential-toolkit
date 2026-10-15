import type { AttributeNode, Branding, ClaimsPath, LangTag, Project } from '../model';
import { parseExpression, resolveEditorPath } from '../templates';

/** A run of summary text, or an attribute shown by name because there is no sample value for it. */
export type SummarySegment = { kind: 'text'; text: string } | { kind: 'placeholder'; label: string };

const TEMPLATE = /\{\{(.*?)\}\}/g;
const INDEX = /^\[(\d+|null)\]/;
const JOIN = /\.join\((?:'([^']*)'|"([^"]*)")\)$/;
const DEFAULT_SEPARATOR = ', ';
const NULL_VALUE = '–';

/** The card's summary line: `primary_field` when set, otherwise the description, as both wallets do. */
export function cardSummary(project: Project, lang: LangTag, branding: Branding): SummarySegment[] {
  return resolveCardText(project, lang, branding.primaryField ?? project.meta[lang]?.description ?? '');
}

/**
 * Fills `{{…}}` templates the way the wallets do once the credential is issued, using the sample credential
 * as the claims. Without a sample, each attribute becomes a placeholder. Unresolvable templates become empty.
 */
export function resolveCardText(project: Project, lang: LangTag, text: string): SummarySegment[] {
  const segments: SummarySegment[] = [];
  const push = (segment: SummarySegment) => {
    if (segment.kind === 'text') {
      if (segment.text === '') return;
      const last = segments[segments.length - 1];
      if (last?.kind === 'text') {
        last.text += segment.text;
        return;
      }
    }
    segments.push(segment);
  };
  let cursor = 0;
  for (const match of text.matchAll(TEMPLATE)) {
    push({ kind: 'text', text: text.slice(cursor, match.index) });
    push(resolveExpression(project, lang, match[1]));
    cursor = match.index + match[0].length;
  }
  push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

function resolveExpression(project: Project, lang: LangTag, raw: string): SummarySegment {
  const expression = parseExpression(raw);
  const target = resolveEditorPath(project.root, project.root, expression);
  if (!target || target.node.kind !== 'attribute') return { kind: 'text', text: '' };
  const attribute = target.node;
  if (project.sample === undefined) return { kind: 'placeholder', label: attribute.labels[lang] || attribute.key };
  const { index, separator } = parseSuffix(expression.suffix);
  const path = index === undefined ? attribute.source : withIndex(attribute.source, index);
  if (!path) return { kind: 'text', text: '' };
  const values = claimValues(project.sample, path).flatMap((value) => displayValue(value, attribute, lang));
  return { kind: 'text', text: values.join(separator) };
}

function parseSuffix(suffix: string): { index?: number; separator: string } {
  const index = INDEX.exec(suffix);
  const join = JOIN.exec(suffix);
  return {
    index: index && index[1] !== 'null' ? Number(index[1]) : undefined,
    separator: join ? (join[1] ?? join[2]) : DEFAULT_SEPARATOR,
  };
}

/** iOS rule: `[N]` replaces the path's single `null`; any other path cannot be indexed. */
function withIndex(path: ClaimsPath, index: number): ClaimsPath | null {
  const nulls = path.filter((segment) => segment === null).length;
  return nulls === 1 ? path.map((segment) => (segment === null ? index : segment)) : null;
}

/** Every value at `path`; a `null` segment walks every element of an array. Missing claims give none. */
function claimValues(data: unknown, path: ClaimsPath): unknown[] {
  if (path.length === 0) return [data];
  const [segment, ...rest] = path;
  if (segment === null) return Array.isArray(data) ? data.flatMap((item) => claimValues(item, rest)) : [];
  if (typeof segment === 'number') return Array.isArray(data) && segment < data.length ? claimValues(data[segment], rest) : [];
  if (typeof data !== 'object' || data === null || Array.isArray(data) || !(segment in data)) return [];
  return claimValues((data as Record<string, unknown>)[segment], rest);
}

/** Null shows `–`; strings, numbers and booleans show as text (entry codes as their label); anything else nothing. */
function displayValue(value: unknown, attribute: AttributeNode, lang: LangTag): string[] {
  if (value === null) return [NULL_VALUE];
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return [];
  const text = String(value);
  return [attribute.entries?.labels[lang]?.[text] || text];
}
