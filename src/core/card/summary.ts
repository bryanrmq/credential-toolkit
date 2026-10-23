import type { AttributeNode, Branding, ClaimsPath, LangTag, Project } from '../model.ts';
import { MAX_JOIN_SEPARATOR, joinSeparator, parseExpression, resolveEditorPath } from '../templates.ts';
import { CARD_PROFILES, type CardPlatform } from './profiles.ts';

/** A run of summary text, or an attribute shown by name because there is no sample value for it. */
export type SummarySegment = { kind: 'text'; text: string } | { kind: 'placeholder'; label: string };

const TEMPLATE = /\{\{(.*?)\}\}/g;
const INDEX = /^\[(\d+|null)\]/;
const DEFAULT_SEPARATOR = ', ';
const NULL_VALUE = '–';

/**
 * The card's summary line: `primary_field` when set, otherwise the description, as both wallets do. An empty
 * primary field counts as missing because the exported bundle leaves it out.
 */
export function cardSummary(project: Project, lang: LangTag, branding: Branding, platform: CardPlatform): SummarySegment[] {
  return resolveCardText(project, lang, branding.primaryField || project.meta[lang]?.description || '', platform);
}

/** The summary as one string, with placeholders as ‹label›. */
export function summaryText(segments: SummarySegment[]): string {
  return segments.map((segment) => (segment.kind === 'text' ? segment.text : `‹${segment.label}›`)).join('');
}

/**
 * Fills `{{…}}` templates the way the platform's wallet does once the credential is issued, using the sample
 * credential as the claims. Without a sample, each attribute becomes a placeholder. Unresolvable templates,
 * and those whose join separator is too long for the wallets, become empty.
 */
export function resolveCardText(project: Project, lang: LangTag, text: string, platform: CardPlatform): SummarySegment[] {
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
    push(resolveExpression(project, lang, match[1], platform));
    cursor = match.index + match[0].length;
  }
  push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

function resolveExpression(project: Project, lang: LangTag, raw: string, platform: CardPlatform): SummarySegment {
  const expression = parseExpression(raw);
  const separator = joinSeparator(expression) ?? DEFAULT_SEPARATOR;
  const target = resolveEditorPath(project.root, project.root, expression);
  if (!target || target.node.kind !== 'attribute' || separator.length > MAX_JOIN_SEPARATOR) return { kind: 'text', text: '' };
  const attribute = target.node;
  if (project.sample === undefined) return { kind: 'placeholder', label: attribute.labels[lang] || attribute.key };
  const index = parseIndex(expression.suffix);
  const path = index === undefined ? attribute.source : CARD_PROFILES[platform].indexPath(attribute.source, index);
  if (!path) return { kind: 'text', text: '' };
  const values = claimValues(project.sample, path).flatMap((value) => displayValue(value, attribute, lang));
  return { kind: 'text', text: values.join(separator) };
}

/** Undefined without an index suffix and null for `[null]`. */
function parseIndex(suffix: string): number | null | undefined {
  const index = INDEX.exec(suffix);
  return index ? (index[1] === 'null' ? null : Number(index[1])) : undefined;
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
