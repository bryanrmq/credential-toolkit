import { describe, expect, it } from 'vitest';
import { IDENTIFIER_PATTERN, defaultIdentifiers, isIssuerLogo, isIssuerUrl, issuerIdentifiers, issuerOf } from './issuer';
import { type Project, emptyProject, ensureIssuer, ensureLanguageSlots } from './model';
import { addLanguage, removeLanguage, renameLanguage } from './operations';

function named(name: string, languages = ['de-CH', 'fr-CH']): Project {
  const project = emptyProject(languages);
  project.meta[languages[0]].name = name;
  return project;
}

/** A project saved before the issuer settings existed. */
function older(): Project {
  const { issuer: _issuer, ...rest } = named('Lernfahrausweis');
  return rest;
}

describe('default identifiers', () => {
  it('derives the configuration id and the type key from the credential name', () => {
    expect(defaultIdentifiers('Lernfahrausweis')).toEqual({ configurationId: 'lernfahrausweis_sd_jwt', typeKey: 'lernfahrausweis-v01' });
  });

  it('drops accents and turns spaces and punctuation into one separator', () => {
    expect(defaultIdentifiers('Führerausweis für Lernende')).toEqual({
      configurationId: 'fuhrerausweis_fur_lernende_sd_jwt',
      typeKey: 'fuhrerausweis-fur-lernende-v01',
    });
    expect(defaultIdentifiers('  Permis de séjour (B) – 2026!  ')).toEqual({
      configurationId: 'permis_de_sejour_b_2026_sd_jwt',
      typeKey: 'permis-de-sejour-b-2026-v01',
    });
    expect(defaultIdentifiers('Straße & Œuvre, Ærø').typeKey).toBe('strasse-oeuvre-aero-v01');
    expect(defaultIdentifiers('pet_permit-v2').configurationId).toBe('pet_permit_v2_sd_jwt');
  });

  it('falls back to "credential" when nothing is left of the name', () => {
    expect(defaultIdentifiers('')).toEqual({ configurationId: 'credential_sd_jwt', typeKey: 'credential-v01' });
    expect(defaultIdentifiers(' — !? ')).toEqual({ configurationId: 'credential_sd_jwt', typeKey: 'credential-v01' });
    expect(defaultIdentifiers('身份证')).toEqual({ configurationId: 'credential_sd_jwt', typeKey: 'credential-v01' });
  });

  it('keeps long names short, cutting at a word', () => {
    const { configurationId, typeKey } = defaultIdentifiers('Bewilligung '.repeat(20));
    expect(configurationId.length).toBeLessThanOrEqual(64 + '_sd_jwt'.length);
    expect(configurationId).toMatch(/^(bewilligung_)+bewilligung_sd_jwt$/);
    expect(defaultIdentifiers('a'.repeat(100)).typeKey).toBe(`${'a'.repeat(64)}-v01`);
    expect(typeKey).toMatch(IDENTIFIER_PATTERN);
  });

  it('always matches the identifier pattern', () => {
    const names = ['Lernfahrausweis', 'ÄÖÜ äöü', 'Ça va?', 'Name\twith\nbreaks', '123', '', '🙂 Card 🙂', 'a-b_c.d/e'];
    for (const name of names) {
      const { configurationId, typeKey } = defaultIdentifiers(name);
      expect(configurationId).toMatch(IDENTIFIER_PATTERN);
      expect(typeKey).toMatch(IDENTIFIER_PATTERN);
    }
  });
});

describe('project identifiers', () => {
  it('uses the defaults from the credential name in the first language until the user sets a value', () => {
    const project = named('Lernfahrausweis');
    project.meta['fr-CH'].name = "Permis d'élève";
    expect(issuerIdentifiers(project)).toEqual({ configurationId: 'lernfahrausweis_sd_jwt', typeKey: 'lernfahrausweis-v01' });
    project.issuer!.configurationId = 'learner_permit';
    project.issuer!.typeKey = '  ';
    expect(issuerIdentifiers(project)).toEqual({ configurationId: 'learner_permit', typeKey: 'lernfahrausweis-v01' });
  });

  it('works for projects saved before the issuer settings', () => {
    expect(issuerIdentifiers(older())).toEqual({ configurationId: 'lernfahrausweis_sd_jwt', typeKey: 'lernfahrausweis-v01' });
  });
});

describe('issuer settings', () => {
  it('are part of a new project, with an empty name per language', () => {
    expect(emptyProject(['de-CH', 'en-GB']).issuer).toEqual({ name: { 'de-CH': '', 'en-GB': '' } });
  });

  it('read with a name for every language, also from a project saved before them', () => {
    expect(issuerOf(older())).toEqual({ name: { 'de-CH': '', 'fr-CH': '' } });
    const project = named('Card');
    project.issuer = { name: { 'de-CH': 'Kanton Bern', 'it-CH': 'stale' }, logo: 'data:image/png;base64,AA==', url: 'https://issuer.example.ch' };
    expect(issuerOf(project)).toEqual({
      name: { 'de-CH': 'Kanton Bern', 'fr-CH': '' },
      logo: 'data:image/png;base64,AA==',
      url: 'https://issuer.example.ch',
    });
  });

  it('are created on first write for a project saved before them', () => {
    const project = older();
    ensureIssuer(project).name['de-CH'] = 'Kanton Bern';
    expect(project.issuer).toEqual({ name: { 'de-CH': 'Kanton Bern', 'fr-CH': '' } });
    ensureLanguageSlots(project, 'fr-CH');
    expect(project.issuer).toEqual({ name: { 'de-CH': 'Kanton Bern', 'fr-CH': '' } });
  });

  it('follow the languages: added, removed and renamed', () => {
    const project = named('Card');
    project.issuer!.name = { 'de-CH': 'Kanton Bern', 'fr-CH': 'Canton de Berne' };
    addLanguage(project, 'it-CH');
    expect(project.issuer!.name).toEqual({ 'de-CH': 'Kanton Bern', 'fr-CH': 'Canton de Berne', 'it-CH': '' });
    removeLanguage(project, 'fr-CH');
    expect(project.issuer!.name).toEqual({ 'de-CH': 'Kanton Bern', 'it-CH': '' });
    renameLanguage(project, 'de-CH', 'de');
    expect(project.issuer!.name).toEqual({ de: 'Kanton Bern', 'it-CH': '' });
  });

  it('follow the languages of a project saved before them', () => {
    const project = older();
    removeLanguage(project, 'fr-CH');
    renameLanguage(project, 'de-CH', 'de');
    expect(project.issuer).toBeUndefined();
    addLanguage(project, 'en-GB');
    expect(project.issuer).toEqual({ name: { de: '', 'en-GB': '' } });
  });
});

describe('checks', () => {
  it('accepts only PNG and JPEG data URLs as the issuer logo', () => {
    expect(isIssuerLogo('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isIssuerLogo('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isIssuerLogo('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isIssuerLogo('data:image/png,raw')).toBe(false);
    expect(isIssuerLogo('https://issuer.example.ch/logo.png')).toBe(false);
  });

  it('accepts only real https URLs as the Issuer URL', () => {
    expect(isIssuerUrl('https://issuer.example.ch')).toBe(true);
    expect(isIssuerUrl('https://issuer.example.ch/base/')).toBe(true);
    expect(isIssuerUrl('http://issuer.example.ch')).toBe(false);
    expect(isIssuerUrl('${external-url}')).toBe(false);
    expect(isIssuerUrl('https://${host}')).toBe(false);
    expect(isIssuerUrl('issuer.example.ch')).toBe(false);
    expect(isIssuerUrl('')).toBe(false);
  });
});
