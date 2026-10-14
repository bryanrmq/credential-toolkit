import type { LangTag } from './model';

/** The swiyu Android wallet rejects any overlay language that fails this pattern. */
export const LANGUAGE_TAG_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;

export const DEFAULT_LANGUAGES: readonly LangTag[] = ['de-CH', 'fr-CH', 'it-CH', 'rm-CH', 'en-GB'];

export const LANGUAGE_NAMES: Record<LangTag, string> = {
  'de-CH': 'German',
  'fr-CH': 'French',
  'it-CH': 'Italian',
  'rm-CH': 'Romansh',
  'en-GB': 'English',
};

export function isValidLanguageTag(tag: string): boolean {
  return LANGUAGE_TAG_REGEX.test(tag);
}

export function hasRegion(tag: string): boolean {
  return tag.includes('-');
}

export function languageLabel(tag: LangTag): string {
  return LANGUAGE_NAMES[tag] ? `${LANGUAGE_NAMES[tag]} (${tag})` : tag;
}
