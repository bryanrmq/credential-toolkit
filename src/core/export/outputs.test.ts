import { describe, expect, it } from 'vitest';
import { sriSha256, utf8 } from '../cesr';
import { emptyProject, newAttribute } from '../model';
import { buildBundle } from './bundle';
import { buildOutputs, buildVctSnippet } from './outputs';

async function outputsFor(hosting: Parameters<typeof buildOutputs>[0]['hosting']) {
  const project = emptyProject(['de-CH', 'en-GB']);
  project.root.children.push(newAttribute('name'));
  project.meta['de-CH'] = { name: 'Ausweis', description: 'Für Tests' };
  project.meta['en-GB'] = { name: 'Card', description: '' };
  project.hosting = hosting;
  const { bundle } = await buildBundle(project);
  return { project, outputs: await buildOutputs(project, bundle) };
}

describe('buildOutputs', () => {
  it('hashes the exact file bytes when the bundle is hosted', async () => {
    const { outputs } = await outputsFor({ mode: 'url', url: 'https://issuer.example.ch/oca-bundle.json' });
    expect(outputs.uri).toBe('https://issuer.example.ch/oca-bundle.json');
    expect(outputs.integrity).toBe(await sriSha256(utf8(outputs.json)));
    expect(outputs.integrity).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
  });

  it('hashes the whole data URL when embedding', async () => {
    const { outputs } = await outputsFor({ mode: 'dataUrl' });
    expect(outputs.uri).toBe(outputs.dataUrl);
    expect(outputs.dataUrl.startsWith('data:application/json;base64,')).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(outputs.dataUrl.split(',')[1]), (c) => c.charCodeAt(0))))).toEqual(
      JSON.parse(outputs.json),
    );
    expect(outputs.integrity).toBe(await sriSha256(utf8(outputs.dataUrl)));
  });
});

describe('buildVctSnippet', () => {
  it('writes one display entry per language with lang and locale', async () => {
    const { project, outputs } = await outputsFor({ mode: 'url', url: 'https://issuer.example.ch/oca-bundle.json' });
    const snippet = buildVctSnippet(project, outputs);
    expect(snippet.display).toEqual([
      {
        lang: 'de-CH',
        locale: 'de-CH',
        name: 'Ausweis',
        description: 'Für Tests',
        rendering: { oca: { uri: 'https://issuer.example.ch/oca-bundle.json', 'uri#integrity': outputs.integrity } },
      },
      {
        lang: 'en-GB',
        locale: 'en-GB',
        name: 'Card',
        rendering: { oca: { uri: 'https://issuer.example.ch/oca-bundle.json', 'uri#integrity': outputs.integrity } },
      },
    ]);
  });
});
