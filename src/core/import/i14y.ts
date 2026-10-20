import { type AttrType, type AttributeNode, type Entries, type Group, type I14yLink, type LangTag, type Project, KNOWN_STANDARDS, findGroup, findNode, newAttribute } from '../model';
import { PLACEHOLDER_KEY, insertNode, renameNode, sourcePrefixFor, uniqueKey } from '../operations';
import { FORBIDDEN_KEY_CHARACTERS } from '../validate';
import { ImportError, type ReportNote, isPlainObject } from './report';

/** The public I14Y API (https://apiconsole.i14y.admin.ch/public/v1/index.html). It needs no key and allows any origin. */
export const I14Y_API = 'https://api.i14y.admin.ch/api/public/v1';

export const I14Y_LANGUAGES = ['de', 'fr', 'it', 'en', 'rm'] as const;
export type I14yLanguage = (typeof I14Y_LANGUAGES)[number];
export type I14yText = Partial<Record<I14yLanguage, string>>;
export type I14yConceptType = 'CodeList' | 'Date' | 'Numeric' | 'String';

export interface I14yHit {
  id: string;
  identifier: string;
  name: I14yText;
  conceptType: I14yConceptType;
  registrationStatus: string;
  publisher: I14yText;
}

export interface I14yConcept {
  id: string;
  identifier: string;
  name: I14yText;
  conceptType: I14yConceptType;
  registrationStatus: string;
  publisher: I14yText;
  entries: { code: string; name: I14yText }[];
}

const CONCEPT_TYPES: readonly string[] = ['CodeList', 'Date', 'Numeric', 'String'];
/** Registration statuses from most to least authoritative. Superseded and retired concepts are not offered. */
const STATUS_RANK: readonly string[] = ['PreferredStandard', 'Standard', 'Qualified', 'Recorded', 'Candidate', 'Incomplete'];

/** I14Y text cleaned for a label: line breaks and repeated spaces in the source become one space. */
function readText(value: unknown): I14yText {
  const text: I14yText = {};
  if (!isPlainObject(value)) return text;
  for (const lang of I14Y_LANGUAGES) {
    const raw = value[lang];
    const clean = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
    if (clean) text[lang] = clean;
  }
  return text;
}

/** The I14Y language for a project language tag: de-CH reads German, and so on. */
export function i14yLanguage(tag: LangTag): I14yLanguage | undefined {
  return I14Y_LANGUAGES.find((lang) => tag.split('-')[0] === lang);
}

/** `text` in the language of `tag`, else in German, French, Italian or English, whichever comes first. */
export function textIn(text: I14yText, tag: LangTag): string {
  const lang = i14yLanguage(tag);
  return (lang && text[lang]) || text.de || text.fr || text.it || text.en || text.rm || '';
}

/** Concept hits from a /search response, best registration status first. Malformed hits are skipped. */
export function parseSearchResults(body: unknown): I14yHit[] {
  const data = isPlainObject(body) && Array.isArray(body.data) ? body.data : [];
  const hits: I14yHit[] = [];
  for (const item of data) {
    if (!isPlainObject(item) || item.type !== 'Concept') continue;
    const { id, identifier, conceptType, registrationStatus } = item;
    if (typeof id !== 'string' || typeof identifier !== 'string' || typeof conceptType !== 'string') continue;
    if (!CONCEPT_TYPES.includes(conceptType) || typeof registrationStatus !== 'string' || !STATUS_RANK.includes(registrationStatus)) continue;
    hits.push({
      id,
      identifier,
      name: readText(item.title),
      conceptType: conceptType as I14yConceptType,
      registrationStatus,
      publisher: readText(isPlainObject(item.publisher) ? item.publisher.name : undefined),
    });
  }
  return hits.sort((a, b) => STATUS_RANK.indexOf(a.registrationStatus) - STATUS_RANK.indexOf(b.registrationStatus));
}

/** A concept from a /concepts/{id}?includeCodeListEntries=true response. */
export function parseConcept(body: unknown): I14yConcept {
  const data = isPlainObject(body) ? body.data : undefined;
  if (!isPlainObject(data)) throw new ImportError('I14Y returned something that is not a concept.');
  const { id, conceptType } = data;
  const identifier = Array.isArray(data.identifiers) ? data.identifiers.find((value) => typeof value === 'string') : undefined;
  if (typeof id !== 'string' || typeof identifier !== 'string' || typeof conceptType !== 'string' || !CONCEPT_TYPES.includes(conceptType)) {
    throw new ImportError('I14Y returned something that is not a concept.');
  }
  const entries = (Array.isArray(data.codeListEntries) ? data.codeListEntries : [])
    .filter((entry) => isPlainObject(entry) && typeof entry.code === 'string')
    .map((entry) => ({ code: entry.code as string, name: readText(entry.name) }));
  return {
    id,
    identifier,
    name: readText(data.name),
    conceptType: conceptType as I14yConceptType,
    registrationStatus: typeof data.registrationStatus === 'string' ? data.registrationStatus : '',
    publisher: readText(isPlainObject(data.publisher) ? data.publisher.name : undefined),
    entries,
  };
}

/** An attribute key made from an I14Y identifier: characters the bundle forbids become underscores. */
function keyFor(identifier: string): string {
  return identifier.replace(new RegExp(FORBIDDEN_KEY_CHARACTERS.source, 'g'), '_') || 'attribute';
}

/** What a concept says about an attribute, in the project's languages. Languages I14Y has no text for get none. */
function conceptFields(concept: I14yConcept, languages: LangTag[]) {
  const labels: Record<LangTag, string> = {};
  const entryLabels: Record<LangTag, Record<string, string>> = {};
  for (const tag of languages) {
    const lang = i14yLanguage(tag);
    const label = lang && concept.name[lang];
    if (label) labels[tag] = label;
    entryLabels[tag] = {};
    for (const entry of concept.entries) {
      const value = lang && entry.name[lang];
      if (value) entryLabels[tag][entry.code] = value;
    }
  }
  const type: AttrType = concept.conceptType === 'Numeric' ? 'Numeric' : concept.conceptType === 'Date' ? 'DateTime' : 'Text';
  const standard = concept.conceptType === 'Date' ? KNOWN_STANDARDS.iso8601 : undefined;
  const entries: Entries | undefined = concept.entries.length ? { codes: concept.entries.map((entry) => entry.code), labels: entryLabels } : undefined;
  return { type, standard, labels, entries };
}

function linkFor(concept: I14yConcept): I14yLink {
  return {
    conceptId: concept.id,
    identifier: concept.identifier,
    registrationStatus: concept.registrationStatus,
    name: { ...concept.name },
    publisher: { ...concept.publisher },
    values: Object.fromEntries(concept.entries.map((entry) => [entry.code, { ...entry.name }])),
  };
}

/** I14Y's label for `node` in `lang` when the attribute is linked to a concept that has one. */
export function i14yLabel(node: AttributeNode, lang: LangTag): string | undefined {
  const i14yLang = i14yLanguage(lang);
  return (i14yLang && node.i14y?.name[i14yLang]) || undefined;
}

/** I14Y's label for the value `code` of `node` in `lang`, when it has one. */
export function i14yValueLabel(node: AttributeNode, lang: LangTag, code: string): string | undefined {
  const i14yLang = i14yLanguage(lang);
  return (i14yLang && node.i14y?.values[code]?.[i14yLang]) || undefined;
}

/** How a text compares with I14Y's: unchanged, edited, or left empty. Undefined when I14Y has no text for it. */
export function compareWithI14y(current: string, i14yText: string | undefined): 'same' | 'edited' | 'empty' | undefined {
  if (i14yText === undefined) return undefined;
  if (current === '') return 'empty';
  return current === i14yText ? 'same' : 'edited';
}

/** The project languages in which `node` still lacks its label or a value label. */
function emptyLanguages(node: AttributeNode, languages: LangTag[]): LangTag[] {
  return languages.filter((tag) => !node.labels[tag] || (node.entries?.codes ?? []).some((code) => !node.entries?.labels[tag]?.[code]));
}

function missingNote(node: AttributeNode, languages: LangTag[]): ReportNote[] {
  const missing = emptyLanguages(node, languages);
  return missing.length ? [{ level: 'warning', message: `${node.key}: I14Y has no text in ${missing.join(', ')}. Fill it in the Translations view.` }] : [];
}

/**
 * Adds one attribute per concept at the end of the group `groupId`: key, type, a label in every
 * project language I14Y has text for, and the code list values with their labels. Missing
 * languages are left empty and reported.
 */
export function addConcepts(project: Project, groupId: string, concepts: I14yConcept[]): { nodes: AttributeNode[]; report: ReportNote[] } {
  const group = findGroup(project.root, groupId);
  if (!group) throw new Error(`Unknown group ${groupId}`);
  const prefix = sourcePrefixFor(project, groupId);
  const nodes: AttributeNode[] = [];
  const report: ReportNote[] = [];
  for (const concept of concepts) {
    const key = uniqueKey(group, keyFor(concept.identifier));
    const { type, standard, labels, entries } = conceptFields(concept, project.languages);
    const node = newAttribute(key, {
      type,
      source: [...prefix, key],
      labels,
      ...(standard && { standard }),
      ...(entries && { entries }),
      i14y: linkFor(concept),
    });
    insertNode(project, group.id, node);
    nodes.push(node);
    report.push(...missingNote(node, project.languages));
  }
  return { nodes, report };
}

export interface FillOptions {
  /** Take the concept's key even when the attribute has a key of its own (the suggestion was picked from the key field). */
  replaceKey?: boolean;
  /** Overwrite the label in this language (the suggestion was picked while typing it). */
  replaceLabelIn?: LangTag;
}

/**
 * Fills the attribute `nodeId` from a concept without overwriting what the issuer wrote: type and
 * format, empty labels, and the value list (or the empty labels of the values it already has). A
 * placeholder key such as attribute_2 becomes the concept's key. Returns what is still missing.
 */
export function fillFromConcept(project: Project, nodeId: string, concept: I14yConcept, options: FillOptions = {}): ReportNote[] {
  const visit = findNode(project.root, nodeId);
  if (!visit || visit.node.kind !== 'attribute') return [];
  const node = visit.node;
  const fields = conceptFields(concept, project.languages);
  node.i14y = linkFor(concept);
  node.type = fields.type;
  if (fields.standard) node.standard = fields.standard;
  else delete node.standard;
  for (const [tag, label] of Object.entries(fields.labels)) {
    if (!node.labels[tag] || tag === options.replaceLabelIn) node.labels[tag] = label;
  }
  if (fields.entries) {
    if (!node.entries || node.entries.codes.length === 0) node.entries = fields.entries;
    else {
      for (const [tag, labels] of Object.entries(fields.entries.labels)) {
        const own = (node.entries.labels[tag] ??= {});
        for (const code of node.entries.codes) if (!own[code] && labels[code]) own[code] = labels[code];
      }
    }
  }
  if (options.replaceKey || PLACEHOLDER_KEY.test(node.key)) {
    const base = keyFor(concept.identifier);
    if (node.key !== base) {
      const siblings = { ...visit.parent, children: visit.parent.children.filter((child) => child.id !== nodeId) };
      renameNode(project, nodeId, uniqueKey(siblings, base));
    }
  }
  return missingNote(node, project.languages);
}

/** Concepts from a /concepts list response, one per identifier (the most authoritative version). */
export function parseCatalogue(body: unknown): I14yHit[] {
  const data = isPlainObject(body) && Array.isArray(body.data) ? body.data : [];
  const best = new Map<string, I14yHit>();
  for (const item of data) {
    if (!isPlainObject(item)) continue;
    const { id, conceptType, registrationStatus } = item;
    const identifier = Array.isArray(item.identifiers) ? item.identifiers.find((value) => typeof value === 'string') : undefined;
    if (typeof id !== 'string' || typeof identifier !== 'string' || typeof conceptType !== 'string' || !CONCEPT_TYPES.includes(conceptType)) continue;
    if (typeof registrationStatus !== 'string' || !STATUS_RANK.includes(registrationStatus)) continue;
    const hit: I14yHit = {
      id,
      identifier,
      name: readText(item.name),
      conceptType: conceptType as I14yConceptType,
      registrationStatus,
      publisher: readText(isPlainObject(item.publisher) ? item.publisher.name : undefined),
    };
    const known = best.get(identifier);
    if (!known || STATUS_RANK.indexOf(registrationStatus) < STATUS_RANK.indexOf(known.registrationStatus)) best.set(identifier, hit);
  }
  return [...best.values()];
}

/** Lower case without accents, so "zugehorigkeit" finds "Zugehörigkeit". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** The words of a name or a camel-case identifier, folded: "dateOfBirth" → date, of, birth. */
function words(text: string): string[] {
  return fold(text.replace(/([a-z])([A-Z])/g, '$1 $2')).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** 0 exact, 1 prefix, 2 a word starts with the query, 3 anywhere; undefined when it does not match. */
function matchRank(candidate: string, query: string): number | undefined {
  const folded = fold(candidate);
  const compact = folded.replace(/[^\p{L}\p{N}]+/gu, '');
  if (folded === query || compact === query) return 0;
  if (folded.startsWith(query) || compact.startsWith(query)) return 1;
  if (words(candidate).some((word) => word.startsWith(query))) return 2;
  if (folded.includes(query) || compact.includes(query)) return 3;
  return undefined;
}

export interface MatchOptions {
  /**
   * Match names in this language only. A concept with no name in it is matched on all its names,
   * so a language I14Y rarely fills (Romansh) still finds something. Every language when omitted.
   */
  language?: I14yLanguage;
  /** Also match the identifier. Default true. */
  identifier?: boolean;
  limit?: number;
}

/**
 * The concepts in `catalogue` whose identifier or name matches `query`, best first: exact, prefix,
 * word start, anywhere, then by registration status. Needs two characters.
 */
export function matchConcepts(catalogue: I14yHit[], query: string, { language, identifier = true, limit = 6 }: MatchOptions = {}): I14yHit[] {
  const folded = fold(query.trim());
  if (folded.length < 2) return [];
  const ranked: { hit: I14yHit; rank: number }[] = [];
  for (const hit of catalogue) {
    const names = language && hit.name[language] ? [hit.name[language]] : Object.values(hit.name);
    const candidates = identifier ? [hit.identifier, ...names] : names;
    const ranks = candidates.map((candidate) => matchRank(candidate, folded)).filter((rank) => rank !== undefined);
    if (ranks.length) ranked.push({ hit, rank: Math.min(...ranks) });
  }
  ranked.sort((a, b) => a.rank - b.rank || STATUS_RANK.indexOf(a.hit.registrationStatus) - STATUS_RANK.indexOf(b.hit.registrationStatus));
  return ranked.slice(0, limit).map((entry) => entry.hit);
}

/** A key or identifier reduced to its letters and digits: date_of_birth and dateOfBirth both become dateofbirth. */
function compactKey(text: string): string {
  return fold(text).replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * How well an unlinked attribute matches a concept: one point when its key is the concept's
 * identifier (ignoring case and separators), one per label that equals the concept's name in the
 * same language. Partial matches score nothing.
 */
function linkScore(node: AttributeNode, hit: I14yHit, languages: LangTag[]): number {
  let score = node.key && compactKey(node.key) === compactKey(hit.identifier) ? 1 : 0;
  for (const tag of languages) {
    const lang = i14yLanguage(tag);
    const label = node.labels[tag]?.replace(/\s+/g, ' ').trim();
    const name = lang && hit.name[lang];
    if (label && name && fold(label) === fold(name)) score++;
  }
  return score;
}

function scoredLinks(node: AttributeNode, catalogue: I14yHit[], languages: LangTag[]): { hit: I14yHit; score: number }[] {
  if (node.i14y) return [];
  return catalogue
    .map((hit) => ({ hit, score: linkScore(node, hit, languages) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || STATUS_RANK.indexOf(a.hit.registrationStatus) - STATUS_RANK.indexOf(b.hit.registrationStatus));
}

/** The I14Y concepts an unlinked attribute looks like, best first. Empty for a linked attribute. */
export function suggestLinks(node: AttributeNode, catalogue: I14yHit[], languages: LangTag[], limit = 3): I14yHit[] {
  return scoredLinks(node, catalogue, languages)
    .slice(0, limit)
    .map((entry) => entry.hit);
}

/** The concept an unlinked attribute matches better than any other, if there is one. */
export function clearLink(node: AttributeNode, catalogue: I14yHit[], languages: LangTag[]): I14yHit | undefined {
  const [best, next] = scoredLinks(node, catalogue, languages);
  return best && (!next || best.score > next.score) ? best.hit : undefined;
}

/** Links the attribute `nodeId` to a concept without changing anything else: the markers then show where its texts differ. */
export function linkConcept(project: Project, nodeId: string, concept: I14yConcept): void {
  const node = findNode(project.root, nodeId)?.node;
  if (node?.kind === 'attribute') node.i14y = linkFor(concept);
}

/** An unlinked attribute that looks like one or more I14Y concepts, waiting for the issuer to link it or not. */
export interface PendingLink {
  nodeId: string;
  /** Keys from the root, e.g. person.gender. */
  path: string;
  hits: I14yHit[];
  /** The concept it matches better than any other, if there is one. */
  clear?: I14yHit;
}

/** Every unlinked attribute that looks like an I14Y concept, in structure order (depth-first). */
export function pendingLinks(project: Project, catalogue: I14yHit[]): PendingLink[] {
  const pending: PendingLink[] = [];
  const visit = (group: Group, prefix: string) => {
    for (const node of group.children) {
      const path = prefix ? `${prefix}.${node.key}` : node.key;
      if (node.kind === 'group') visit(node.group, path);
      else {
        const hits = suggestLinks(node, catalogue, project.languages);
        if (hits.length) pending.push({ nodeId: node.id, path, hits, clear: clearLink(node, catalogue, project.languages) });
      }
    }
  };
  visit(project.root, '');
  return pending;
}
