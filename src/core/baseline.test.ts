import { describe, expect, it } from 'vitest';
import bundle from '../test/fixtures/oca-bundle-simple-sample.json';
import { isBaseline, makeBaseline, parseBaseline } from './baseline';
import { sriSha256, utf8 } from './cesr';
import { bundleDataUrl } from './export/outputs';

const text = `${JSON.stringify(bundle, null, 2)}\n`;
const hosted = { mode: 'url', url: 'https://issuer.example.ch/oca-bundle.json' } as const;

describe('makeBaseline', () => {
  it('hashes the bundle bytes for a hosting URL, like the current output', async () => {
    const baseline = await makeBaseline(text, hosted, 'download', 42);
    expect(baseline).toEqual({ json: text, integrity: await sriSha256(utf8(text)), source: 'download', setAt: 42 });
  });

  it('hashes the data URL when the bundle is embedded', async () => {
    const baseline = await makeBaseline(text, { mode: 'dataUrl' }, 'import');
    expect(baseline.integrity).toBe(await sriSha256(utf8(bundleDataUrl(text))));
  });
});

describe('parseBaseline', () => {
  it('keeps a valid bundle exactly as given', async () => {
    const baseline = await parseBaseline(text, hosted, 'file');
    expect(baseline).toMatchObject({ json: text, source: 'file', integrity: await sriSha256(utf8(text)) });
  });

  it('turns down text that is not an OCA bundle', async () => {
    for (const invalid of ['', 'not json', '{"capture_bases":[]}', '[]', '{"name":"x"}']) {
      expect(await parseBaseline(invalid, hosted, 'url')).toBeNull();
    }
  });
});

describe('isBaseline', () => {
  it('checks the shape of a stored baseline', async () => {
    expect(isBaseline(await makeBaseline(text, hosted, 'url'))).toBe(true);
    expect(isBaseline({ json: text, integrity: 'sha256-x', source: 'elsewhere', setAt: 1 })).toBe(false);
    expect(isBaseline({ json: text, integrity: 'sha256-x', source: 'file' })).toBe(false);
    expect(isBaseline(null)).toBe(false);
  });
});
