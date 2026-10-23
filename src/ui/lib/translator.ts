import type { LangTag } from '../../core/model';

/*
 * The browser's built-in, on-device Translator API (Chrome 138+ on desktop), behind a small adapter so the rest
 * of the app, and the tests, never touch the global. The browser translates on the device and downloads its
 * models itself: the app sends no text anywhere.
 */

/** Whether the browser can translate a language pair: now, after downloading a model, or not at all. */
export type TranslatorAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface PairTranslator {
  translate: (text: string) => Promise<string>;
  destroy: () => void;
}

/** What the app uses of the browser's Translator, with language tags as the project has them. */
export interface TranslatorAdapter {
  availability: (source: LangTag, target: LangTag) => Promise<TranslatorAvailability>;
  /** A translator for the pair; `onProgress` gets the share of the model downloaded so far, from 0 to 1. */
  create: (source: LangTag, target: LangTag, onProgress?: (loaded: number) => void) => Promise<PairTranslator>;
}

/** The part of the browser's `Translator` global the adapter calls. */
interface BrowserTranslator {
  availability: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<string>;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }) => Promise<{ translate: (text: string) => Promise<string>; destroy?: () => void }>;
}

/** The language of a tag without its region (`de-CH` → `de`), which is what the browser's models are for. */
export function translatorLanguage(tag: LangTag): string {
  return tag.split('-')[0].toLowerCase();
}

function browserTranslator(): BrowserTranslator | undefined {
  const candidate = (globalThis as { Translator?: BrowserTranslator }).Translator;
  return candidate && typeof candidate.availability === 'function' && typeof candidate.create === 'function' ? candidate : undefined;
}

/** Whether this browser has the on-device Translator API. Without it, no translation action shows. */
export function hasTranslator(): boolean {
  return browserTranslator() !== undefined;
}

const AVAILABILITIES: readonly TranslatorAvailability[] = ['available', 'downloadable', 'downloading', 'unavailable'];

/** The browser's Translator, or undefined where it has none. */
export function translator(): TranslatorAdapter | undefined {
  const api = browserTranslator();
  if (!api) return undefined;
  const pair = (source: LangTag, target: LangTag) => ({ sourceLanguage: translatorLanguage(source), targetLanguage: translatorLanguage(target) });
  return {
    availability: async (source, target) => {
      try {
        const answer = await api.availability(pair(source, target));
        return AVAILABILITIES.includes(answer as TranslatorAvailability) ? (answer as TranslatorAvailability) : 'unavailable';
      } catch {
        // An unknown language tag throws instead of answering "unavailable".
        return 'unavailable';
      }
    },
    create: async (source, target, onProgress) => {
      const created = await api.create({
        ...pair(source, target),
        monitor: (monitor) =>
          monitor.addEventListener('downloadprogress', (event) => {
            const loaded = (event as Event & { loaded?: number }).loaded;
            if (typeof loaded === 'number') onProgress?.(loaded);
          }),
      });
      return { translate: (text) => created.translate(text), destroy: () => created.destroy?.() };
    },
  };
}
