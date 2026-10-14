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
