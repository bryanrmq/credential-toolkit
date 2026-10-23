import { describe, expect, it } from 'vitest';
import { sriSha256, utf8 } from '../cesr';
import { type Hosting, type Project, emptyProject, newAttribute } from '../model';
import { buildBundle } from './bundle';
import { buildOutputs } from './outputs';
import { type TypeMetadata, buildTypeMetadata, serializeTypeMetadata, typeMetadataUri } from './typeMetadata';

const BUNDLE_URL = 'https://issuer.example.ch/oca/oca-bundle.json';

/** The golden file's project: three languages, the last without a description, and the derived Type key. */
function petPermit(hosting: Hosting = { mode: 'url', url: BUNDLE_URL }): Project {
  const project = emptyProject(['de-CH', 'fr-CH', 'en-GB']);
  project.root.children.push(
    newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name', 'fr-CH': 'Nom', 'en-GB': 'Name' } }),
    newAttribute('race', { source: ['race'], labels: { 'de-CH': 'Rasse', 'fr-CH': 'Race', 'en-GB': 'Breed' } }),
  );
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter im Kanton Bern' };
  project.meta['fr-CH'] = { name: 'Permis pour chien', description: 'Pour les détenteurs de chiens' };
  project.meta['en-GB'] = { name: 'Dog permit', description: '' };
  project.hosting = hosting;
  return project;
}

async function typeMetadataFor(project: Project) {
  const outputs = await buildOutputs(project, (await buildBundle(project)).bundle);
  return { outputs, ...buildTypeMetadata(project, outputs) };
}

describe('buildTypeMetadata', () => {
  it('gives exactly the checked-in vct.json for the fixture project', async () => {
    const { metadata, text } = await typeMetadataFor(petPermit());
    await expect(text).toMatchFileSnapshot('./golden/vct.json');
    expect(JSON.parse(text)).toEqual(metadata);
  });

  it('has the Swiss profile, the generic issuer vct, and one display entry per language that all point to the bundle', async () => {
    const { metadata, outputs } = await typeMetadataFor(petPermit());
    const oca = { uri: BUNDLE_URL, 'uri#integrity': outputs.integrity };
    expect(metadata).toEqual({
      profile_version: 'swiss-profile-vc:1.0.0',
      vct: '${external-url}/oid4vci/vct/hundebewilligung-v01',
      name: 'Hundebewilligung',
      description: 'Für Hundehalter im Kanton Bern',
      display: [
        { lang: 'de-CH', name: 'Hundebewilligung', description: 'Für Hundehalter im Kanton Bern', rendering: { oca } },
        { lang: 'fr-CH', name: 'Permis pour chien', description: 'Pour les détenteurs de chiens', rendering: { oca } },
        { lang: 'en-GB', name: 'Dog permit', rendering: { oca } },
      ],
    });
    // Nothing the Swiss profile does not support or the tool cannot give, and no `locale` beside `lang`.
    for (const key of ['claims', 'extends', 'schema', 'schema_uri', 'schema_uri#integrity']) expect(metadata).not.toHaveProperty(key);
    for (const entry of metadata.display) expect(entry).not.toHaveProperty('locale');
  });

  it('embeds the bundle as a data URL with the integrity of the whole data URL', async () => {
    const { metadata, outputs } = await typeMetadataFor(petPermit({ mode: 'dataUrl' }));
    for (const { rendering } of metadata.display) {
      expect(rendering.oca.uri).toBe(outputs.dataUrl);
      expect(rendering.oca.uri.startsWith('data:application/json;base64,')).toBe(true);
      expect(rendering.oca['uri#integrity']).toBe(await sriSha256(utf8(outputs.dataUrl)));
    }
  });

  it('uses the Type key set in the project, and leaves out the descriptions that are empty', async () => {
    const project = petPermit();
    project.issuer = { name: {}, typeKey: 'dog-permit-v02' };
    project.languages = ['en-GB', 'de-CH'];
    const { metadata } = await typeMetadataFor(project);
    expect(typeMetadataUri(project)).toBe('${external-url}/oid4vci/vct/dog-permit-v02');
    expect(metadata.vct).toBe('${external-url}/oid4vci/vct/dog-permit-v02');
    expect(metadata.name).toBe('Dog permit');
    expect(metadata).not.toHaveProperty('description');
    expect(metadata.display.map((entry) => entry.lang)).toEqual(['en-GB', 'de-CH']);
    expect(metadata.display[0]).not.toHaveProperty('description');
  });

  it('gives the same bytes every time', async () => {
    expect((await typeMetadataFor(petPermit())).text).toBe((await typeMetadataFor(petPermit())).text);
  });
});

describe('serializeTypeMetadata', () => {
  it('writes 2-space JSON in the fixed key order, whatever order the object has', () => {
    const shuffled = {
      display: [{ rendering: { oca: { 'uri#integrity': 'sha256-x', uri: 'https://x' } }, name: 'N', lang: 'en' }],
      name: 'N',
      vct: 'v',
      profile_version: 'swiss-profile-vc:1.0.0',
    } as TypeMetadata;
    expect(serializeTypeMetadata(shuffled)).toBe(
      [
        '{',
        '  "profile_version": "swiss-profile-vc:1.0.0",',
        '  "vct": "v",',
        '  "name": "N",',
        '  "display": [',
        '    {',
        '      "lang": "en",',
        '      "name": "N",',
        '      "rendering": {',
        '        "oca": {',
        '          "uri": "https://x",',
        '          "uri#integrity": "sha256-x"',
        '        }',
        '      }',
        '    }',
        '  ]',
        '}',
      ].join('\n'),
    );
  });
});
