import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGES, hasRegion, isValidLanguageTag, languageLabel } from './langs';

describe('language tags', () => {
  it('accepts exactly what the swiyu wallets accept', () => {
    for (const tag of [...DEFAULT_LANGUAGES, 'de', 'en-US']) expect(isValidLanguageTag(tag)).toBe(true);
    for (const tag of ['gsw', 'de-ch', 'DE-CH', 'de_CH', 'de-CH-1996', 'sr-Latn', '']) expect(isValidLanguageTag(tag)).toBe(false);
  });

  it('detects a region', () => {
    expect(hasRegion('de-CH')).toBe(true);
    expect(hasRegion('de')).toBe(false);
  });

  it('names known languages', () => {
    expect(languageLabel('rm-CH')).toBe('Romansh (rm-CH)');
    expect(languageLabel('en-US')).toBe('en-US');
  });
});
