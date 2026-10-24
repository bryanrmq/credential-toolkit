import { describe, expect, it } from 'vitest';
import { importIssuerMetadata } from '../import/issuerMetadata';
import { type AttributeNode, type GroupLink, type Project, emptyProject, newAttribute, newGroupLink, walkNodes } from '../model';
import golden from './fixtures/issuer_metadata.json?raw';
import {
  EXTERNAL_URL_PLACEHOLDER,
  ISSUER_METADATA_FILE_NAME,
  VCT_INTEGRITY_PLACEHOLDER,
  buildIssuerMetadata,
  filePlaceholders,
  serializeIssuerMetadata,
  servedTypeMetadataText,
  servedTypeMetadataUri,
  vctIntegrityCommand,
  vctMetadataIntegrity,
} from './issuerMetadata';
import { exportProject } from './project';

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
    expect(placeholders[1].command).toBe(vctIntegrityCommand('${external-url}/oid4vci/vct/hundebewilligung-v01'));
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

const ISSUER_URL = 'https://issuer.example.ch';

/** The fixture project, without its SVG logo (an export error), with the bundle hosted at a URL and, when given, the Issuer URL. */
function hostedPetPermit(url?: string): Project {
  const project = petPermit();
  project.branding['fr-CH'].light = {};
  project.hosting = { mode: 'url', url: `${ISSUER_URL}/oca/oca-bundle.json` };
  if (url !== undefined) project.issuer = { ...project.issuer!, url };
  return project;
}

/** `exportProject` for a project that has no errors. */
async function exported(project: Project) {
  const result = await exportProject(project);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

/** `sha256-` + base64 of the SHA-256 of `text` as UTF-8, computed here rather than with the tool's `sriSha256`. */
async function sri(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `sha256-${btoa(String.fromCharCode(...digest))}`;
}

describe('vct_metadata_uri#integrity', () => {
  it('writes exactly the checked-in issuer_metadata.json with a computed integrity when the Issuer URL is set', async () => {
    const { issuerMetadata } = await exported(hostedPetPermit(ISSUER_URL));
    await expect(issuerMetadata.json).toMatchFileSnapshot('./golden/issuer_metadata.json');
  });

  it('is the SRI hash of vct.json with the Issuer URL for ${external-url}, while vct.json keeps the placeholder', async () => {
    const { vct, issuerMetadata } = await exported(hostedPetPermit(ISSUER_URL));
    const served = vct.text.replaceAll('${external-url}', ISSUER_URL);
    expect(served).toContain('"vct": "https://issuer.example.ch/oid4vci/vct/hundebewilligung-v01"');
    const integrity = issuerMetadata.metadata.credential_configurations_supported.hundebewilligung_sd_jwt['vct_metadata_uri#integrity'];
    expect(integrity).toBe(await sri(served));
    expect(issuerMetadata.json).not.toContain(VCT_INTEGRITY_PLACEHOLDER);
    expect(vct.text).toContain('"vct": "${external-url}/oid4vci/vct/hundebewilligung-v01"');
    expect(vct.text).not.toContain(ISSUER_URL + '/oid4vci');
    // The rest of the file still keeps the generic issuer's placeholder.
    expect(issuerMetadata.metadata.credential_issuer).toBe('${external-url}');
  });

  it('changes with anything that changes vct.json, and with the Issuer URL', async () => {
    const integrityOf = async (edit: (project: Project) => void) => {
      const project = hostedPetPermit(ISSUER_URL);
      edit(project);
      const { issuerMetadata } = await exported(project);
      return Object.values(issuerMetadata.metadata.credential_configurations_supported)[0]['vct_metadata_uri#integrity'];
    };
    const base = await integrityOf(() => {});
    const changed = await Promise.all([
      integrityOf((project) => (project.meta['fr-CH'].description = 'Pour les détenteurs')),
      integrityOf((project) => (project.issuer!.typeKey = 'dog-permit-v02')),
      integrityOf((project) => (project.hosting = { mode: 'url', url: `${ISSUER_URL}/oca/v2.json` })),
      integrityOf((project) => (project.root.children.find((node) => node.kind === 'attribute')!.labels['de-CH'] = 'Familienname')),
      integrityOf((project) => (project.issuer!.url = 'https://other.example.ch')),
    ]);
    for (const value of changed) expect(value).not.toBe(base);
    expect(new Set(changed).size).toBe(changed.length);
    // The issuer name is not in vct.json, so it leaves the integrity alone.
    expect(await integrityOf((project) => (project.issuer!.name['de-CH'] = 'Kanton Zürich'))).toBe(base);
  });

  it('keeps the placeholder and gives the command with the ${external-url} URL without an Issuer URL', async () => {
    for (const url of [undefined, '', '   ', 'http://issuer.example.ch']) {
      const project = hostedPetPermit(url);
      const { vct } = await exported({ ...project, issuer: { ...project.issuer!, url: undefined } });
      expect(await vctMetadataIntegrity(project, vct.text)).toBeUndefined();
      const built = buildIssuerMetadata(project);
      expect(built.metadata.credential_configurations_supported.hundebewilligung_sd_jwt['vct_metadata_uri#integrity']).toBe(VCT_INTEGRITY_PLACEHOLDER);
      expect(built.placeholders.find((placeholder) => placeholder.integrity)?.command).toBe(
        `echo "sha256-$(curl -s '\${external-url}/oid4vci/vct/hundebewilligung-v01' | openssl dgst -binary -sha256 | openssl base64 -A)"`,
      );
    }
    const { issuerMetadata } = await exported(hostedPetPermit());
    expect(issuerMetadata.json).toContain(`"vct_metadata_uri#integrity": "${VCT_INTEGRITY_PLACEHOLDER}"`);
  });

  it('serves the Type Metadata at the Issuer URL when it is set', () => {
    expect(servedTypeMetadataUri(hostedPetPermit())).toBe('${external-url}/oid4vci/vct/hundebewilligung-v01');
    expect(servedTypeMetadataUri(hostedPetPermit(` ${ISSUER_URL} `))).toBe('https://issuer.example.ch/oid4vci/vct/hundebewilligung-v01');
    // Written in as typed, as the generic issuer writes in EXTERNAL_URL.
    expect(servedTypeMetadataUri(hostedPetPermit(`${ISSUER_URL}/`))).toBe('https://issuer.example.ch//oid4vci/vct/hundebewilligung-v01');
    expect(servedTypeMetadataText('{"vct": "${external-url}/a", "b": "${external-url}", "c": "${other}"}', ISSUER_URL)).toBe(
      '{"vct": "https://issuer.example.ch/a", "b": "https://issuer.example.ch", "c": "${other}"}',
    );
  });

  it('quotes the URL in the command so the shell leaves it alone', () => {
    expect(vctIntegrityCommand('https://issuer.example.ch/oid4vci/vct/a')).toBe(
      `echo "sha256-$(curl -s 'https://issuer.example.ch/oid4vci/vct/a' | openssl dgst -binary -sha256 | openssl base64 -A)"`,
    );
    expect(vctIntegrityCommand("https://issuer.example.ch/it's")).toContain(`curl -s 'https://issuer.example.ch/it'\\''s' |`);
  });
});

describe('filePlaceholders', () => {
  const summary = (files: ReturnType<typeof filePlaceholders>) =>
    files.map(({ file, placeholders }) => ({ file, placeholders: placeholders.map(({ text, integrity }) => ({ text, integrity })) }));
  const externalUrl = { text: EXTERNAL_URL_PLACEHOLDER, integrity: false };

  it('lists ${external-url} and the integrity placeholder without an Issuer URL', async () => {
    const files = filePlaceholders(await exported(hostedPetPermit()));
    expect(summary(files)).toEqual([
      { file: 'oca-bundle.json', placeholders: [] },
      { file: 'vct.json', placeholders: [externalUrl] },
      { file: 'issuer_metadata.json', placeholders: [externalUrl, { text: VCT_INTEGRITY_PLACEHOLDER, integrity: true }] },
    ]);
    const integrity = files[2].placeholders[1];
    expect(integrity.command).toContain("curl -s '${external-url}/oid4vci/vct/hundebewilligung-v01'");
    for (const { placeholders } of files) for (const placeholder of placeholders) expect(placeholder.explanation).not.toBe('');
  });

  it('lists only ${external-url} with the Issuer URL set: the generic issuer still fills it in', async () => {
    expect(summary(filePlaceholders(await exported(hostedPetPermit(ISSUER_URL))))).toEqual([
      { file: 'oca-bundle.json', placeholders: [] },
      { file: 'vct.json', placeholders: [externalUrl] },
      { file: 'issuer_metadata.json', placeholders: [externalUrl] },
    ]);
  });
});
