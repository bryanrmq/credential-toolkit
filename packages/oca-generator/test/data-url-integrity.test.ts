import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../../src/core/export/bundle.ts';
import { buildOutputs, bundleDataUrl, bundleIntegrity } from '../../../src/core/export/outputs.ts';
import { buildTypeMetadata } from '../../../src/core/export/typeMetadata.ts';
import { emptyProject, newAttribute } from '../../../src/core/model.ts';

// How the swiyu wallets check an embedded bundle, rebuilt with Node's own crypto and Buffer rather than the tool's
// helpers:
// - iOS v1.19.0 (42e746c) OCABundleService.fetchDataRawOcaBundle: accepts a uri starting `data:application/json;base64`,
//   base64-decodes what follows the last comma, and validates the SRI over `url.absoluteString.data(using: .utf8)`.
//   SRIValidator compares `base64EncodedString()` of the digest (standard base64, padded).
// - Android v1.19.0 FetchOcaBundleImpl: accepts a uri starting `data:application/json;base64,`, decodes the rest with
//   `Base64.getDecoder()`, and validates the SRI over `uri.encodeToByteArray()` (UTF-8). SRIValidatorImpl compares
//   `Base64.getEncoder().encodeToString(digest)`.
const DATA_URI_PREFIX = 'data:application/json;base64,';

function walletIntegrity(uri: string): string {
  return `sha256-${createHash('sha256').update(Buffer.from(uri, 'utf8')).digest('base64')}`;
}

/** The bundle text a wallet reads out of `uri`, after the checks both wallets' decoders would fail on. */
function walletPayload(uri: string): string {
  expect(uri.startsWith(DATA_URI_PREFIX)).toBe(true);
  const base64 = uri.slice(DATA_URI_PREFIX.length);
  // Strict standard base64: iOS `Data(base64Encoded:)` rejects missing padding, Android `getDecoder()` rejects `-`/`_`.
  expect(base64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
  expect(base64.length % 4).toBe(0);
  return Buffer.from(base64, 'base64').toString('utf8');
}

describe('#integrity for embedded (data URL) hosting', () => {
  it('matches a golden value computed outside the tool', async () => {
    const json = '{"name":"Führerausweis","description":"Élève à Zürich, ñ, 日本"}';
    // Python: base64.b64encode(json.encode('utf-8')), then hashlib.sha256 over the whole data URL's UTF-8 bytes.
    const dataUrl =
      'data:application/json;base64,eyJuYW1lIjoiRsO8aHJlcmF1c3dlaXMiLCJkZXNjcmlwdGlvbiI6IsOJbMOodmUgw6AgWsO8cmljaCwgw7EsIOaXpeacrCJ9';
    expect(bundleDataUrl(json)).toBe(dataUrl);
    expect(await bundleIntegrity(json, { mode: 'dataUrl' })).toBe('sha256-+7BxUYFhSNU/XqCnOrSrIOS3WoU2vOxZQ2bP9Rg2kAg=');
    // Hosted, the same text hashes as its own bytes instead.
    expect(await bundleIntegrity(json, { mode: 'url', url: 'https://issuer.example.ch/oca-bundle.json' })).toBe(
      'sha256-S7t6NH4LioewhN2ImtoYkCoJxR4DNpidRivf6aPq4TE=',
    );
  });

  it('gives a built bundle with non-ASCII texts the integrity the wallets compute', async () => {
    const project = emptyProject(['de-CH', 'fr-CH']);
    project.root.children.push(
      newAttribute('lastName', { labels: { 'de-CH': 'Familienname (für Behörden)', 'fr-CH': 'Nom de famille, élève' } }),
    );
    project.meta['de-CH'] = { name: 'Führerausweis', description: 'Ausgestellt in Zürich' };
    project.meta['fr-CH'] = { name: 'Permis de conduire', description: 'Délivré à Genève' };
    project.hosting = { mode: 'dataUrl' };
    const outputs = await buildOutputs(project, (await buildBundle(project)).bundle);

    expect(outputs.json).toContain('Führerausweis'); // not escaped as \u00fc
    expect(outputs.uri).toBe(outputs.dataUrl);
    expect(walletPayload(outputs.uri)).toBe(outputs.json);
    expect(outputs.integrity).toBe(walletIntegrity(outputs.uri));
    expect(outputs.integrity).not.toBe(`sha256-${createHash('sha256').update(outputs.json, 'utf8').digest('base64')}`);

    for (const entry of buildTypeMetadata(project, outputs).metadata.display) {
      expect(entry.rendering.oca['uri#integrity']).toBe(walletIntegrity(entry.rendering.oca.uri));
    }
  });
});
