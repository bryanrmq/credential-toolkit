import { create } from 'zustand';
import { LANGUAGE_NAMES } from '../../core/langs';
import type { LangTag, Project, TextPlace } from '../../core/model';
import { suggestText, textAt } from '../../core/review';
import { endTyping, useStore } from '../../state/store';
import { t } from '../../strings';
import { allRows } from '../workspace/translationRows';
import { type PairTranslator, type TranslatorAdapter, translator } from './translator';

/*
 * Suggested translations with the browser's on-device Translator (`translator.ts`): the empty texts of the other
 * languages are filled from the editing language, marked "needs review" (`core/review.ts`), as one undo step.
 * Existing texts are never overwritten. A pair whose model the browser must download first asks the user
 * (`useTranslationState`); a pair the browser cannot translate is skipped, and the toast says so.
 */

/** One empty text to fill, with the editing language's text it is translated from. */
export interface MissingText {
  place: TextPlace;
  lang: LangTag;
  source: string;
}

/** Which texts to fill: by default every text of the project in every other language. */
export interface TranslationScope {
  place?: TextPlace;
  lang?: LangTag;
}

/** Every translatable text of the project, the dark primary field included, in form order. */
function projectPlaces(project: Project): TextPlace[] {
  const places = allRows(project).map((row) => row.place);
  const light = places.findIndex((place) => place.kind === 'primaryField');
  places.splice(light + 1, 0, { kind: 'primaryField', theme: 'dark' });
  return places;
}

/** The empty texts in `scope` whose text in `source` (the editing language) is not empty. */
export function missingTexts(project: Project, source: LangTag, scope: TranslationScope = {}): MissingText[] {
  if (!project.languages.includes(source)) return [];
  const places = scope.place ? [scope.place] : projectPlaces(project);
  const langs = project.languages.filter((lang) => lang !== source && (scope.lang === undefined || lang === scope.lang));
  const missing: MissingText[] = [];
  for (const place of places) {
    const text = textAt(project, place, source);
    if (!text?.trim()) continue;
    for (const lang of langs) if (textAt(project, place, lang) === '') missing.push({ place, lang, source: text });
  }
  return missing;
}

/** A language's English name, as the notice and the toast say it: German, or the tag itself when unknown. */
export function languageName(tag: LangTag): string {
  if (LANGUAGE_NAMES[tag]) return LANGUAGE_NAMES[tag];
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag.split('-')[0]) ?? tag;
  } catch {
    return tag;
  }
}

/** The download notice, while it waits for an answer. */
export interface DownloadNotice {
  /** The language pairs whose models the browser will download, as "German to French". */
  pairs: string[];
  answer: (download: boolean) => void;
}

/**
 * Whether a translation runs (one at a time: the actions are disabled meanwhile), and the notice before the
 * browser downloads translation models, which `TranslationNotice` shows.
 */
export const useTranslationState = create<{ running: boolean; notice: DownloadNotice | null }>(() => ({ running: false, notice: null }));

function askToDownload(source: LangTag, targets: LangTag[]): Promise<boolean> {
  return new Promise((resolve) => {
    useTranslationState.setState({
      notice: {
        pairs: targets.map((target) => t.translate.pair(languageName(source), languageName(target))),
        answer: (download) => {
          useTranslationState.setState({ notice: null });
          resolve(download);
        },
      },
    });
  });
}

const EXPRESSION = /(\{\{.*?\}\})/;

/**
 * `text` translated, with its `{{…}}` template expressions kept as they are: only the words around them are
 * translated, each run on its own, keeping its spaces at both ends.
 */
async function translateText(translate: PairTranslator, text: string): Promise<string> {
  const parts = text.split(EXPRESSION);
  const translated = await Promise.all(
    parts.map(async (part, index) => {
      if (index % 2 === 1 || !/\p{L}/u.test(part)) return part;
      const [, lead, words, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(part)!;
      return lead + (await translate.translate(words)).trim() + trail;
    }),
  );
  return translated.join('');
}

/** How long the browser's translator may take to say whether it has a pair, or to start one it has. */
export const TRANSLATOR_TIMEOUT_MS = 10_000;

/** The browser's translator did not answer in time: some embedded or background pages never get an answer. */
class NoAnswer extends Error {}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new NoAnswer()), TRANSLATOR_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Fills the empty texts in `scope` from the editing language with the browser's translation, marks them for
 * review and reports it in the toast, with Undo. Does nothing without the Translator API or anything to fill.
 */
export async function translateMissing(scope: TranslationScope = {}, api: TranslatorAdapter | undefined = translator()): Promise<void> {
  const { project, editLang, draftId } = useStore.getState();
  if (!api || !project || useTranslationState.getState().running) return;
  const missing = missingTexts(project, editLang, scope);
  if (missing.length === 0) return;
  useTranslationState.setState({ running: true });
  const translators = new Map<LangTag, PairTranslator>();
  try {
    // In project order, as the notice and the toast name them.
    const targets = project.languages.filter((lang) => missing.some((text) => text.lang === lang));
    await translateInto(api, editLang, targets, missing, draftId, translators);
  } catch (error) {
    if (useStore.getState().draftId === draftId) useStore.getState().showError(error instanceof NoAnswer ? t.translate.noAnswer : t.translate.failed);
  } finally {
    for (const created of translators.values()) created.destroy();
    useTranslationState.setState({ running: false });
  }
}

async function translateInto(
  api: TranslatorAdapter,
  source: LangTag,
  targets: LangTag[],
  missing: MissingText[],
  draftId: string | null,
  translators: Map<LangTag, PairTranslator>,
): Promise<void> {
  const store = useStore.getState;
  // Right away, so the click shows something even when the browser is slow to answer.
  store().showProgress(t.translate.checking, { detail: t.translate.direction(source, targets) });
  const availability = new Map(
    await Promise.all(targets.map(async (lang) => [lang, await withTimeout(api.availability(source, lang))] as const)),
  );
  const unsupported = targets.filter((lang) => availability.get(lang) === 'unavailable');
  const usable = targets.filter((lang) => availability.get(lang) !== 'unavailable');
  const toDownload = usable.filter((lang) => availability.get(lang) === 'downloadable');
  if (toDownload.length > 0) {
    store().dismissFixNotice();
    // Cancel does nothing at all, not even the pairs that need no download.
    if (!(await askToDownload(source, toDownload))) return;
  }

  const current = () => store().draftId === draftId;
  const downloads = usable.filter((lang) => availability.get(lang) !== 'available');
  const loaded = new Map<LangTag, number>(downloads.map((lang) => [lang, 0]));
  const showDownload = () => {
    if (!current()) return;
    const share = [...loaded.values()].reduce((sum, value) => sum + value, 0) / loaded.size;
    // The browser reports 0 before it knows how far it is: the bar runs without a share until then.
    store().showProgress(t.translate.downloading(downloads.length), {
      detail: t.translate.direction(source, downloads),
      share: share > 0 ? share : undefined,
    });
  };
  if (downloads.length > 0) showDownload();
  // Created at once, while the click that asked for the download still counts as the user's: the browser needs one to download.
  await Promise.all(
    usable.map(async (lang) => {
      const onProgress = loaded.has(lang)
        ? (share: number) => {
            loaded.set(lang, Math.min(Math.max(share, 0), 1));
            showDownload();
          }
        : undefined;
      // A download may take minutes; starting a translator the browser already has may not.
      const created = api.create(source, lang, onProgress);
      try {
        translators.set(lang, await (onProgress ? created : withTimeout(created)));
      } catch (error) {
        // One that starts after all is not kept.
        void created.then((late) => late.destroy(), () => {});
        throw error;
      }
    }),
  );

  if (!current()) return;
  const work = missing.filter((text) => translators.has(text.lang));
  if (work.length > 0) {
    const into = targets.filter((lang) => translators.has(lang));
    store().showProgress(t.translate.translating(work.length), { detail: t.translate.direction(source, into) });
  }
  const results = await Promise.all(work.map(async (text) => ({ ...text, text: await translateText(translators.get(text.lang)!, text.source) })));
  if (!current()) return;

  // Only texts still empty: whatever the user typed meanwhile stays.
  const project = store().project!;
  const fills = results.filter((result) => result.text.trim() !== '' && textAt(project, result.place, result.lang) === '');
  const notes: string[] = [];
  if (fills.length > 0) {
    endTyping();
    store().update((draft) => {
      for (const fill of fills) suggestText(draft, fill.place, fill.lang, fill.text, 'translation');
    });
    notes.push(t.translate.translated(fills.length));
  }
  if (unsupported.length > 0) notes.push(t.translate.unavailable(unsupported.map(languageName)));
  if (notes.length === 0) store().dismissFixNotice();
  else if (fills.length > 0) store().showUndoable(t.translate.report(notes), () => store().undo());
  else store().showInfo(t.translate.report(notes));
}
