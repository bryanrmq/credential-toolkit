import { describe, expect, it } from 'vitest';
import { importIssuerMetadata } from '../import/issuerMetadata';
import { type AttributeNode, type GroupLink, type Project, emptyProject, newAttribute, newGroupLink, walkNodes } from '../model';
import golden from './fixtures/issuer_metadata.json?raw';
import {
  EXTERNAL_URL_PLACEHOLDER,
  ISSUER_METADATA_FILE_NAME,
  VCT_INTEGRITY_PLACEHOLDER,
  buildIssuerMetadata,
  serializeIssuerMetadata,
} from './issuerMetadata';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const SVG = 'data:image/svg+xml;base64,PHN2Zy8+';

/** A pet permit in two languages with a nested group, an array group, an array attribute and a visual group. */
function petPermit(): Project {
  const project = emptyProject(['de-CH', 'fr-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.meta['fr-CH'] = { name: 'Permis pour chien', description: '' };
  project.branding['de-CH'].light = { logo: PNG, primaryBackgroundColor: '#2C75E3' };
  project.branding['fr-CH'].light = { logo: SVG };
  project.issuer = { name: { 'de-CH': 'Kanton Bern', 'fr-CH': 'Canton de Berne' }, logo: JPEG };

  const address = newGroupLink('address', { source: ['address'], labels: { 'de-CH': 'Adresse' } });
  address.group.children.push(newAttribute('city', { source: ['address', 'city'], labels: { 'de-CH': 'Ort', 'fr-CH': 'Lieu' } }));
  const pets = newGroupLink('pets', { array: true, source: ['pets', null], labels: { 'de-CH': 'Hunde' } });
  pets.group.children.push(newAttribute('name', { source: ['pets', null, 'name'], labels: { 'de-CH': 'Name', 'fr-CH': 'Nom' } }));
  const visual = newGroupLink('more');
  visual.group.children.push(newAttribute('chip', { source: ['chip'], labels: { 'fr-CH': 'Puce' } }));
  project.root.children.push(
    newAttribute('family_name', { source: ['family_name'], labels: { 'de-CH': 'Nachname', 'fr-CH': 'Nom de famille' } }),
    address,
    newAttribute('nationalities', { type: { array: 'Text' }, source: ['nationalities', null], labels: { 'de-CH': 'Nationalitäten' } }),
    pets,
    visual,
    newAttribute('unlabelled', { source: ['unlabelled'] }),
  );
  return project;
}

describe('buildIssuerMetadata', () => {
  it('writes exactly the checked-in issuer_metadata.json for the fixture project', () => {
    expect(buildIssuerMetadata(petPermit()).json).toBe(golden.trimEnd());
  });

  it('keeps the generic issuer placeholders for the infrastructure and leaves out profile_version', () => {
    const { metadata } = buildIssuerMetadata(petPermit());
    expect(metadata.credential_issuer).toBe('${external-url}');
    expect(metadata.credential_endpoint).toBe('${external-url}/oid4vci/api/credential');
    expect(metadata.nonce_endpoint).toBe('${external-url}/oid4vci/api/nonce');
    expect(metadata.deferred_credential_endpoint).toBe('${external-url}/oid4vci/api/deferred_credential');
    expect(metadata.batch_credential_issuance).toEqual({ batch_size: 10 });
    expect(metadata).not.toHaveProperty('profile_version');
  });

  it('leaves the encryption fields to the generic issuer, which injects them on every request', () => {
    // swiyu-issuer 5.0.1 JweService.issuerMetadataWithEncryptionOptions replaces both with the live keys and settings.
    const { metadata, json } = buildIssuerMetadata(petPermit());
    expect(metadata).not.toHaveProperty('credential_request_encryption');
    expect(metadata).not.toHaveProperty('credential_response_encryption');
    expect(json).not.toContain('encryption');
  });

  it('writes the issuer display in every language with the PNG or JPEG logo', () => {
    const { metadata } = buildIssuerMetadata(petPermit());
    expect(metadata.display).toEqual([
      { name: 'Kanton Bern', locale: 'de-CH', logo: { uri: JPEG } },
      { name: 'Canton de Berne', locale: 'fr-CH', logo: { uri: JPEG } },
    ]);
  });

  it('writes the issuer display without a logo when there is none, or it is not PNG or JPEG', () => {
    const project = petPermit();
    project.issuer = { name: { 'de-CH': 'Kanton Bern', 'fr-CH': 'Canton de Berne' }, logo: SVG };
    expect(buildIssuerMetadata(project).metadata.display).toEqual([
      { name: 'Kanton Bern', locale: 'de-CH' },
      { name: 'Canton de Berne', locale: 'fr-CH' },
    ]);
  });

  it('leaves out the issuer name in a language without one, so the wallets show "Unknown issuer"', () => {
    const project = petPermit();
    project.issuer = { name: { 'de-CH': 'Kanton Bern', 'fr-CH': '' }, logo: JPEG };
    expect(buildIssuerMetadata(project).metadata.display).toEqual([
      { name: 'Kanton Bern', locale: 'de-CH', logo: { uri: JPEG } },
      { locale: 'fr-CH', logo: { uri: JPEG } },
    ]);
    delete project.issuer;
    expect(buildIssuerMetadata(project).metadata.display).toEqual([{ locale: 'de-CH' }, { locale: 'fr-CH' }]);
  });

  it('writes the configuration under the configuration id with the Swiss profile values', () => {
    const { metadata } = buildIssuerMetadata(petPermit());
    expect(Object.keys(metadata.credential_configurations_supported)).toEqual(['hundebewilligung_sd_jwt']);
    const configuration = metadata.credential_configurations_supported.hundebewilligung_sd_jwt;
    expect(configuration).toMatchObject({
      format: 'dc+sd-jwt',
      vct: '${external-url}/oid4vci/vct/hundebewilligung-v01',
      vct_metadata_uri: '${external-url}/oid4vci/vct/hundebewilligung-v01',
      'vct_metadata_uri#integrity': VCT_INTEGRITY_PLACEHOLDER,
      credential_signing_alg_values_supported: ['ES256'],
      cryptographic_binding_methods_supported: ['jwk'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['ES256'] } },
    });
  });

  it('uses the identifiers set in the project', () => {
    const project = petPermit();
    project.issuer = { ...project.issuer!, configurationId: 'dog_permit', typeKey: 'dog-permit-v02' };
    const configuration = buildIssuerMetadata(project).metadata.credential_configurations_supported.dog_permit;
    expect(configuration.vct).toBe('${external-url}/oid4vci/vct/dog-permit-v02');
    expect(configuration.vct_metadata_uri).toBe('${external-url}/oid4vci/vct/dog-permit-v02');
  });

  it('writes the fallback credential display from the meta and the light branding', () => {
    const configuration = buildIssuerMetadata(petPermit()).metadata.credential_configurations_supported.hundebewilligung_sd_jwt;
    expect(configuration.credential_metadata.display).toEqual([
      { name: 'Hundebewilligung', locale: 'de-CH', description: 'Für Hundehalter', background_color: '#2C75E3', logo: { uri: PNG } },
      { name: 'Permis pour chien', locale: 'fr-CH' },
    ]);
  });

  it('describes each attribute by its source path, with null for array items, and no mandatory', () => {
    const { claims } = buildIssuerMetadata(petPermit()).metadata.credential_configurations_supported.hundebewilligung_sd_jwt.credential_metadata;
    expect(claims).toEqual([
      { path: ['family_name'], display: [{ locale: 'de-CH', name: 'Nachname' }, { locale: 'fr-CH', name: 'Nom de famille' }] },
      { path: ['address', 'city'], display: [{ locale: 'de-CH', name: 'Ort' }, { locale: 'fr-CH', name: 'Lieu' }] },
      { path: ['nationalities', null], display: [{ locale: 'de-CH', name: 'Nationalitäten' }] },
      { path: ['pets', null, 'name'], display: [{ locale: 'de-CH', name: 'Name' }, { locale: 'fr-CH', name: 'Nom' }] },
      { path: ['chip'], display: [{ locale: 'fr-CH', name: 'Puce' }] },
      { path: ['unlabelled'] },
    ]);
    for (const claim of claims) expect(claim).not.toHaveProperty('mandatory');
  });

  it('skips an attribute without a source path', () => {
    const project = emptyProject(['en-GB']);
    project.root.children.push(newAttribute('lost', { source: [] }), newAttribute('kept'));
    const { claims } = buildIssuerMetadata(project).metadata.credential_configurations_supported.credential_sd_jwt.credential_metadata;
    expect(claims).toEqual([{ path: ['kept'] }]);
  });

  it('lists the placeholders left in the file', () => {
    const { json, placeholders } = buildIssuerMetadata(petPermit());
    expect(placeholders.map(({ text, integrity }) => ({ text, integrity }))).toEqual([
      { text: EXTERNAL_URL_PLACEHOLDER, integrity: false },
      { text: VCT_INTEGRITY_PLACEHOLDER, integrity: true },
    ]);
    for (const placeholder of placeholders) {
      expect(json).toContain(placeholder.text);
      expect(placeholder.explanation).not.toBe('');
    }
    expect(json.match(/\$\{[^}]*\}/g)?.every((text) => placeholders.some((placeholder) => placeholder.text === text))).toBe(true);
  });

  it('gives the same text for the same project, and serializes as 2-space JSON', () => {
    const { metadata, json } = buildIssuerMetadata(petPermit());
    expect(buildIssuerMetadata(petPermit()).json).toBe(json);
    expect(serializeIssuerMetadata(metadata)).toBe(json);
    expect(json).toBe(JSON.stringify(JSON.parse(json), null, 2));
    expect(ISSUER_METADATA_FILE_NAME).toBe('issuer_metadata.json');
  });

  it('reads back into an equivalent project', () => {
    const project = petPermit();
    const { json, metadata } = buildIssuerMetadata(project);
    const [configurationId] = Object.keys(metadata.credential_configurations_supported);
    const imported = importIssuerMetadata(JSON.parse(json), configurationId).project;

    expect(imported.languages).toEqual(project.languages);
    expect(imported.meta).toEqual(project.meta);
    expect(imported.branding['de-CH'].light).toEqual(project.branding['de-CH'].light);
    expect(imported.issuer).toEqual({ ...project.issuer, configurationId: 'hundebewilligung_sd_jwt', typeKey: 'hundebewilligung-v01' });
    const attributes = (from: Project) =>
      [...walkNodes(from.root)]
        .map(({ node }) => node)
        .filter((node): node is AttributeNode => node.kind === 'attribute')
        .map(({ key, source, labels }) => ({ key, source, labels }))
        .sort((a, b) => JSON.stringify(a.source).localeCompare(JSON.stringify(b.source)));
    expect(attributes(imported)).toEqual(attributes(project));
    const pets = imported.root.children.find((node): node is GroupLink => node.kind === 'group' && node.key === 'pets');
    expect(pets).toMatchObject({ array: true, source: ['pets', null] });
  });
});
