import { describe, expect, it } from 'vitest';
import type { AttributeNode, GroupLink } from '../model';
import { importIssuerMetadata, listCredentialConfigurations } from './issuerMetadata';
import { ImportError } from './report';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

const metadata = {
  credential_issuer: 'https://issuer.example.ch',
  display: [{ name: 'Canton of Bern', locale: 'de-CH' }],
  credential_configurations_supported: {
    'pet-permit': {
      format: 'dc+sd-jwt',
      vct: 'https://issuer.example.ch/vct/pet-permit',
      credential_metadata: {
        display: [
          { name: 'Hundebewilligung', locale: 'de-CH', description: 'Für Hundehalter', background_color: '#2C75E3', logo: { uri: LOGO } },
          { name: 'Dog permit', locale: 'en-GB', logo: { uri: 'https://issuer.example.ch/logo.png' } },
        ],
        claims: [
          { path: ['family_name'], display: [{ name: 'Nachname', locale: 'de-CH' }, { name: 'Last name', locale: 'en-GB' }] },
          { path: ['address'], display: [{ name: 'Adresse', locale: 'de-CH' }] },
          { path: ['address', 'city'], display: [{ name: 'Ort', locale: 'de-CH' }] },
          { path: ['nationalities', null] },
          { path: ['pets'], display: [{ name: 'Hunde', locale: 'de-CH' }] },
          { path: ['pets', null, 'name'], display: [{ name: 'Name', locale: 'de-CH' }] },
        ],
      },
    },
    legacy: {
      format: 'vc+sd-jwt',
      display: [{ name: 'Old', locale: 'en' }],
      claims: { given_name: { display: [{ name: 'Given name', locale: 'en' }] }, address: { city: { display: [{ name: 'City', locale: 'en' }] } } },
    },
  },
};

describe('listCredentialConfigurations', () => {
  it('lists configurations with their first display name', () => {
    expect(listCredentialConfigurations(metadata)).toEqual([
      { id: 'pet-permit', name: 'Hundebewilligung' },
      { id: 'legacy', name: 'Old' },
    ]);
  });

  it('rejects documents without configurations', () => {
    expect(() => listCredentialConfigurations({ credential_issuer: 'x' })).toThrow(ImportError);
  });
});

describe('importIssuerMetadata', () => {
  it('maps display to meta and light branding per locale', () => {
    const { project, report } = importIssuerMetadata(metadata, 'pet-permit');
    expect(project.languages).toEqual(['de-CH', 'en-GB']);
    expect(project.meta['de-CH']).toEqual({ name: 'Hundebewilligung', description: 'Für Hundehalter' });
    expect(project.branding['de-CH'].light).toEqual({ primaryBackgroundColor: '#2C75E3', logo: LOGO });
    expect(project.branding['en-GB'].light.logo).toBeUndefined();
    expect(report.some((note) => note.level === 'warning' && note.message.includes('en-GB logo is a URL'))).toBe(true);
  });

  it('builds attributes, groups and array groups from claim paths', () => {
    const { project } = importIssuerMetadata(metadata, 'pet-permit');
    const [family, address, nationalities, pets] = project.root.children;
    expect(family).toMatchObject({ kind: 'attribute', key: 'family_name', source: ['family_name'], labels: { 'de-CH': 'Nachname', 'en-GB': 'Last name' } });
    expect(address).toMatchObject({ kind: 'group', key: 'address', array: false, labels: { 'de-CH': 'Adresse' } });
    expect((address as GroupLink).group.children[0]).toMatchObject({ key: 'city', source: ['address', 'city'] });
    expect(nationalities).toMatchObject({ kind: 'attribute', type: { array: 'Text' }, source: ['nationalities', null] });
    expect(pets).toMatchObject({ kind: 'group', array: true, source: ['pets', null], labels: { 'de-CH': 'Hunde' } });
    expect(((pets as GroupLink).group.children[0] as AttributeNode).source).toEqual(['pets', null, 'name']);
  });

  it('reads the pre-1.0 layout with object claims', () => {
    const { project, report } = importIssuerMetadata(metadata, 'legacy');
    expect(project.meta.en.name).toBe('Old');
    expect(project.root.children.map((child) => child.key)).toEqual(['given_name', 'address']);
    expect(report.map((note) => note.message)).toContain('Claims were read from the older object format.');
  });

  it('rejects unknown configuration ids', () => {
    expect(() => importIssuerMetadata(metadata, 'nope')).toThrow(/No credential configuration/);
  });
});

/** Shaped like the swiyu generic issuer's example_issuer_metadata.json (issuer `display`, `${stage}`, `${external-url}`). */
const genericIssuer = {
  credential_issuer: '${external-url}',
  credential_endpoint: '${external-url}/oid4vci/api/credential',
  display: [
    { name: 'Mein Test Aussteller', locale: 'de-CH', logo: { uri: LOGO } },
    { name: 'My test issuer', locale: 'en-US', logo: { uri: LOGO } },
    { name: 'Mon émetteur', locale: 'fr-CH' },
  ],
  credential_configurations_supported: {
    '${stage}university_example_sd_jwt': {
      format: 'dc+sd-jwt',
      vct: 'urn:vct:com.example.credential',
      vct_metadata_uri: '${external-url}/oid4vci/vct/my-vct-v01',
      credential_metadata: {
        display: [
          { name: 'Beispiel Credential', locale: 'de-CH' },
          { name: 'Example Credential', locale: 'en-US' },
        ],
        claims: [{ path: ['degree'], display: [{ name: 'Abschluss', locale: 'de-CH' }] }],
      },
    },
  },
};

describe('importIssuerMetadata issuer settings', () => {
  it('fills the issuer name per language, the logo, the configuration id and the type key', () => {
    const { project, report } = importIssuerMetadata(genericIssuer, '${stage}university_example_sd_jwt');
    expect(project.languages).toEqual(['de-CH', 'en-US']);
    expect(project.issuer).toEqual({
      name: { 'de-CH': 'Mein Test Aussteller', 'en-US': 'My test issuer' },
      logo: LOGO,
      configurationId: 'university_example_sd_jwt',
      typeKey: 'my-vct-v01',
    });
    const messages = report.map((note) => note.message);
    expect(messages).toContain('Skipped the issuer name in fr-CH: the credential has no such language.');
    expect(messages.some((message) => message.includes('placeholder from the configuration id'))).toBe(true);
  });

  it('takes a real https credential_issuer as the Issuer URL, and the type key from vct when vct_metadata_uri has none', () => {
    const { project, report } = importIssuerMetadata(metadata, 'pet-permit');
    expect(project.issuer).toEqual({ name: { 'de-CH': 'Canton of Bern', 'en-GB': '' }, url: 'https://issuer.example.ch', configurationId: 'pet-permit' });
    expect(report.every((note) => !note.message.includes('issuer logo'))).toBe(true);

    const fromVct = structuredClone(metadata);
    fromVct.credential_issuer = 'https://issuer.example.ch/';
    fromVct.credential_configurations_supported['pet-permit'].vct = 'https://issuer.example.ch/oid4vci/vct/pet-permit-v02';
    expect(importIssuerMetadata(fromVct, 'pet-permit').project.issuer).toMatchObject({ url: 'https://issuer.example.ch', typeKey: 'pet-permit-v02' });
  });

  it('notes issuer logos the wallets cannot draw, and keeps one logo for all languages', () => {
    const input = structuredClone(genericIssuer);
    input.display[0].logo = { uri: 'https://issuer.example.ch/logo.png' };
    input.display[1].logo = { uri: 'data:image/svg+xml;base64,PHN2Zz4=' };
    const { project, report } = importIssuerMetadata(input, '${stage}university_example_sd_jwt');
    expect(project.issuer?.logo).toBeUndefined();
    const warnings = report.filter((note) => note.level === 'warning').map((note) => note.message);
    expect(warnings).toContain('The de-CH issuer logo is not a PNG or JPEG data URL, which is all swiyu wallets draw; upload the image instead.');
    expect(warnings).toContain('The en-US issuer logo is not a PNG or JPEG data URL, which is all swiyu wallets draw; upload the image instead.');

    input.display[0].logo = { uri: LOGO };
    input.display[1].logo = { uri: 'data:image/jpeg;base64,/9j/4AAQ' };
    const mixed = importIssuerMetadata(input, '${stage}university_example_sd_jwt');
    expect(mixed.project.issuer?.logo).toBe(LOGO);
    expect(mixed.report.some((note) => note.message.startsWith('The issuer logos differ by language'))).toBe(true);
  });

  it('leaves the issuer name empty and the identifiers unset when the file has none', () => {
    const { project } = importIssuerMetadata(metadata, 'legacy');
    expect(project.issuer).toEqual({ name: { en: '' }, url: 'https://issuer.example.ch', configurationId: 'legacy' });
  });
});
