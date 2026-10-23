import { isPlainObject } from './import/report';
import { type LangTag, type Project, type ReviewMark, type SuggestionSource, type TextPlace, findNode, walkNodes } from './model';

/*
 * "Needs review" marks on suggested texts: texts the app filled in (from I14Y, or by the browser's on-device
 * translation) that the user has not confirmed yet. The marks live in `project.review`, which only the editor
 * reads: drafts and project files keep them, the bundle never has them, so compare ignores them too.
 *
 * A mark holds while its text is still the suggested one. The store drops the marks that no longer hold after
 * every change (`pruneReview`), so editing a text clears its mark in the same undo step.
 *
 * To fill a text and mark it, inside one `update` so it is one undo step:
 *
 *     update((draft) => suggestText(draft, { kind: 'label', nodeId }, 'fr-CH', 'Nom', 'translation'));
 */

const SOURCES: readonly SuggestionSource[] = ['i14y', 'translation'];

/** The text at `place` in `lang`; undefined when there is no such text (a node, value code, language or dark branding that is gone). */
export function textAt(project: Project, place: TextPlace, lang: LangTag): string | undefined {
  if (!project.languages.includes(lang)) return undefined;
  switch (place.kind) {
    case 'meta':
      return project.meta[lang]?.[place.field] ?? '';
    case 'primaryField': {
      const pair = project.branding[lang];
      if (place.theme === 'dark') return pair?.dark ? (pair.dark.primaryField ?? '') : undefined;
      return pair?.light.primaryField ?? '';
    }
    case 'label': {
      const node = findNode(project.root, place.nodeId)?.node;
      return node ? (node.labels[lang] ?? '') : undefined;
    }
    case 'entry': {
      const node = findNode(project.root, place.nodeId)?.node;
      if (node?.kind !== 'attribute' || !node.entries?.codes.includes(place.code)) return undefined;
      return node.entries.labels[lang]?.[place.code] ?? '';
    }
  }
}

/** Sets the text at `place` in `lang`. An empty label or primary field is removed; nothing happens where there is no such text. */
export function setTextAt(project: Project, place: TextPlace, lang: LangTag, value: string): void {
  switch (place.kind) {
    case 'meta':
      project.meta[lang] = { ...(project.meta[lang] ?? { name: '', description: '' }), [place.field]: value };
      return;
    case 'primaryField': {
      const pair = (project.branding[lang] ??= { light: {} });
      const branding = place.theme === 'light' ? pair.light : pair.dark;
      if (!branding) return;
      if (value) branding.primaryField = value;
      else delete branding.primaryField;
      return;
    }
    case 'label': {
      const node = findNode(project.root, place.nodeId)?.node;
      if (!node) return;
      if (value) node.labels[lang] = value;
      else delete node.labels[lang];
      return;
    }
    case 'entry': {
      const node = findNode(project.root, place.nodeId)?.node;
      if (node?.kind !== 'attribute' || !node.entries) return;
      node.entries.labels[lang] = { ...(node.entries.labels[lang] ?? {}), [place.code]: value };
    }
  }
}

/** Whether two places name the same text. */
export function samePlace(a: TextPlace, b: TextPlace): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'meta':
      return a.field === (b as typeof a).field;
    case 'primaryField':
      return a.theme === (b as typeof a).theme;
    case 'label':
      return a.nodeId === (b as typeof a).nodeId;
    case 'entry':
      return a.nodeId === (b as typeof a).nodeId && a.code === (b as typeof a).code;
  }
}

function isPlace(value: unknown): value is TextPlace {
  if (!isPlainObject(value)) return false;
  switch (value.kind) {
    case 'meta':
      return value.field === 'name' || value.field === 'description';
    case 'primaryField':
      return value.theme === 'light' || value.theme === 'dark';
    case 'label':
      return typeof value.nodeId === 'string';
    case 'entry':
      return typeof value.nodeId === 'string' && typeof value.code === 'string';
    default:
      return false;
  }
}

/** Whether `value` is a well-formed mark, as one read from a stored draft or a project file must be. */
function isMark(value: unknown): value is ReviewMark {
  return (
    isPlainObject(value) &&
    isPlace(value.place) &&
    typeof value.lang === 'string' &&
    SOURCES.includes(value.source as SuggestionSource) &&
    typeof value.text === 'string'
  );
}

/** Whether `mark` still holds: its text exists and is still the suggested one. */
function holds(project: Project, mark: ReviewMark): boolean {
  return mark.text !== '' && textAt(project, mark.place, mark.lang) === mark.text;
}

/** The marks that hold, in the order they were made. */
export function reviewMarks(project: Project): ReviewMark[] {
  const marks = Array.isArray(project.review) ? project.review : [];
  return marks.filter((mark) => isMark(mark) && holds(project, mark));
}

/** Whether any suggested text is waiting for review. */
export function hasUnreviewed(project: Project): boolean {
  return reviewMarks(project).length > 0;
}

/** The mark on the text at `place` in `lang`, while it holds. */
export function reviewMarkAt(project: Project, place: TextPlace, lang: LangTag): ReviewMark | undefined {
  return reviewMarks(project).find((mark) => mark.lang === lang && samePlace(mark.place, place));
}

/**
 * Marks the text at `place` in `lang`, as it is now, as suggested by `source`, replacing an earlier mark on it.
 * Returns false, marking nothing, when the text is empty or does not exist. Call it after setting the text.
 */
export function markSuggested(project: Project, place: TextPlace, lang: LangTag, source: SuggestionSource): boolean {
  const text = textAt(project, place, lang);
  if (!text) return false;
  const others = (project.review ?? []).filter((mark) => !(mark.lang === lang && samePlace(mark.place, place)));
  project.review = [...others, { place: { ...place }, lang, source, text }];
  return true;
}

/** Fills the text at `place` in `lang` with a suggestion from `source` and marks it for review. */
export function suggestText(project: Project, place: TextPlace, lang: LangTag, text: string, source: SuggestionSource): boolean {
  if (textAt(project, place, lang) === undefined) return false;
  setTextAt(project, place, lang, text);
  return markSuggested(project, place, lang, source);
}

/** Confirms the suggested texts `which` picks (all of them by default): their marks go. Returns how many were confirmed. */
export function confirmReview(project: Project, which: (mark: ReviewMark) => boolean = () => true): number {
  const marks = reviewMarks(project);
  const kept = marks.filter((mark) => !which(mark));
  if (kept.length) project.review = kept;
  else delete project.review;
  return marks.length - kept.length;
}

/**
 * `project` without the marks that no longer hold (the text was edited, or is gone with its node, value code or
 * language) and without malformed ones; the same object when there is nothing to drop.
 */
export function pruneReview(project: Project): Project {
  if (project.review === undefined) return project;
  const marks = reviewMarks(project);
  if (Array.isArray(project.review) && marks.length === project.review.length && marks.length > 0) return project;
  const { review: _dropped, ...rest } = project;
  return marks.length ? { ...rest, review: marks } : rest;
}

/**
 * Where a place sits in the project, for listing marks in the order of the form: the credential's name,
 * description and primary fields first, then the tree depth-first.
 */
export function placeOrder(project: Project): (place: TextPlace) => number {
  const nodes = new Map<string, number>();
  for (const { node } of walkNodes(project.root)) nodes.set(node.id, nodes.size);
  const credential = { name: 0, description: 1, light: 2, dark: 3 };
  return (place) => {
    if (place.kind === 'meta') return credential[place.field];
    if (place.kind === 'primaryField') return credential[place.theme];
    return 4 + (nodes.get(place.nodeId) ?? nodes.size);
  };
}
