import { describe, expect, it } from 'vitest';
import { emptyProject } from '../model';
import { cardLanguage, cardLanguages } from './cardLanguage';

/** de and en have a card; fr has labels only, as in `src/test/fixtures/oca-bundle-nested.json`. */
function project() {
  const project = emptyProject(['de', 'en', 'fr']);
  project.meta.de = { name: 'Ausweis', description: '' };
  project.meta.en = { name: 'Card', description: '' };
  return project;
}

describe('cardLanguages', () => {
  it('lists the languages with a name, a description or branding', () => {
    const p = project();
    p.branding.fr.dark = { logo: 'data:image/png;base64,iVBORw0KGgo=' };
    expect(cardLanguages(p)).toEqual(['de', 'en', 'fr']);
    p.branding.fr.dark = { primaryField: '' };
    expect(cardLanguages(p)).toEqual(['de', 'en']);
  });
});

describe('cardLanguage', () => {
  it('keeps a language that has a card', () => {
    expect(cardLanguage(project(), 'en', 'android')).toBe('en');
    expect(cardLanguage(project(), 'en', 'ios')).toBe('en');
  });

  // eidch-android-wallet v1.19.0 `GetLocalizedDisplayImpl`: no `fr` display, so the first of `DisplayLanguage.PRIORITIES`
  // (`de`, `en`, …) that has one. The conformance run found the wallet showing the de card for fr (fixture-nested).
  it('falls back to de on Android', () => {
    expect(cardLanguage(project(), 'fr', 'android')).toBe('de');
  });

  // eidch-ios-wallet v1.19.0 BITCore `DisplayLocalizable.swift` `findDisplayWithFallback`: the preferred codes are the
  // device languages plus `en` (`Container.preferredUserLanguageCodes`), so English comes before the first display.
  it('falls back to en on iOS', () => {
    expect(cardLanguage(project(), 'fr', 'ios')).toBe('en');
  });

  it('matches by language on both platforms', () => {
    const p = emptyProject(['de-CH', 'fr-CH']);
    p.meta['de-CH'] = { name: 'Ausweis', description: '' };
    p.meta['fr-CH'] = { name: 'Carte', description: '' };
    expect(cardLanguage(p, 'fr-CH', 'android')).toBe('fr-CH');
    expect(cardLanguage(p, 'fr-CH', 'ios')).toBe('fr-CH');
  });

  it('keeps the language when the bundle has no card at all', () => {
    expect(cardLanguage(emptyProject(['de', 'fr']), 'fr', 'android')).toBe('fr');
  });
});
