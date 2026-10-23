import { describe, expect, it } from 'vitest';
import chasseral from '../../test/fixtures/oca-bundle-chasseral.json';
import elfa from '../../test/fixtures/oca-bundle-elfa.json';
import nested from '../../test/fixtures/oca-bundle-nested.json';
import simple from '../../test/fixtures/oca-bundle-simple-sample.json';
import petPermit from '../../test/fixtures/spec-pet-permit.json';
import issuerExample from '../../test/fixtures/example_oca.json';
import { walletAcceptsDigest } from '../../test/walletCesr';
import { walletDataSources, walletPath } from '../../test/walletDataSource';
import { cesrDigest } from '../cesr';
import { OVERLAY_TYPES, buildBundle, serializeBundle } from '../export/bundle';
import { type AttributeNode, type GroupLink, walkGroups, walkNodes } from '../model';
import { importBundle, jsonPathToClaimsPath } from './bundle';
import { ImportError } from './report';

const VALID_FIXTURES = { chasseral, elfa, nested, simple, petPermit } as Record<string, { capture_bases: { digest: string }[] }>;

async function roundTrip(input: unknown) {
  const { project, report } = await importBundle(input);
  const { bundle } = await buildBundle(project);
  return { project, report, bundle };
}

function node(project: Awaited<ReturnType<typeof importBundle>>['project'], key: string) {
  return [...walkNodes(project.root)].find(({ node: candidate }) => candidate.key === key)!.node;
}

describe('importBundle round trip', () => {
  for (const [name, fixture] of Object.entries(VALID_FIXTURES)) {
    it(`${name}: keeps every capture base digest`, async () => {
      const { bundle } = await roundTrip(fixture);
      expect(new Set(bundle.capture_bases.map((captureBase) => captureBase.digest))).toEqual(
        new Set(fixture.capture_bases.map((captureBase) => captureBase.digest)),
      );
      for (const captureBase of bundle.capture_bases) expect(await walletAcceptsDigest({ ...captureBase })).toBe(true);
    });

    it(`${name}: is stable when imported again`, async () => {
      const first = await roundTrip(fixture);
      const second = await roundTrip(first.bundle);
      expect(serializeBundle(second.bundle)).toBe(serializeBundle(first.bundle));
    });
  }
});

describe('importBundle details', () => {
  it('reads labels, order, entries and standards of the simple sample', async () => {
    const { project, bundle } = await roundTrip(simple);
    expect(project.languages).toEqual(['de-CH', 'en-US']);
    expect(project.root.children.map((child) => child.key)).toEqual(['lastName', 'isOver18', 'height', 'dateOfBirth']);
    const adult = node(project, 'isOver18') as AttributeNode;
    expect(adult.entries?.codes).toEqual(['true', 'false']);
    expect(adult.entries?.labels['de-CH']).toEqual({ true: 'true de-CH', false: 'false de-CH' });
    expect((node(project, 'dateOfBirth') as AttributeNode).standard).toBe('urn:iso:std:iso:8601');
    expect(project.meta['en-US'].name).toBe('credential en-US');
    // The sample only has a "vc+sd-jwt" Data Source overlay; the export adds the "dc+sd-jwt" one.
    expect(bundle.overlays).toHaveLength(simple.overlays.length + 1);
  });

  it('keeps sensitive group links, Binary attributes and unknown overlays of chasseral', async () => {
    const { project, report, bundle } = await roundTrip(chasseral);
    expect((node(project, 'array_objects') as GroupLink).sensitive).toBe(true);
    expect((node(project, 'image_base64_png') as AttributeNode).type).toBe('Binary');
    const types = bundle.overlays.map((overlay) => overlay.type);
    expect(types).toContain('spec/overlays/format/1.0');
    expect(types).toContain('spec/overlays/character_encoding/1.0');
    expect(report.some((note) => note.message.includes('spec/overlays/format/1.0'))).toBe(true);
  });

  it('converts dotted templates of the nested fixture to the refs form', async () => {
    const { project, bundle } = await roundTrip(nested);
    expect(project.branding.de.light.primaryField).toBe('de light: {{capture_base_1.capture_base_1_claim_1}} {{capture_base_1.capture_base_1_claim_2}}');
    const branding = bundle.overlays.find((overlay) => overlay.type === OVERLAY_TYPES.branding && overlay.language === 'de')!;
    expect(branding.primary_field).toBe(
      'de light: {{refs:IACad8m8doJZoyOwmkcSOGD0OKL6JoNtC22I1K4DlFMh:capture_base_1_claim_1}} {{refs:IACad8m8doJZoyOwmkcSOGD0OKL6JoNtC22I1K4DlFMh:capture_base_1_claim_2}}',
    );
  });

  it('reads the refs templates of elfa as editor paths and drops Data Source 1.0 when 2.0 exists', async () => {
    const { project, report } = await roundTrip(elfa);
    expect(project.branding.de.light.primaryField).toBe('Kategorie {{main.categoryCode}}');
    expect(report.some((note) => note.message.includes('Data Source 1.0 overlays were dropped'))).toBe(true);
  });

  it('repairs the swiyu-issuer example and reports what it changed', async () => {
    const { project, report, bundle } = await roundTrip(issuerExample);
    const messages = report.map((note) => note.message).join('\n');
    expect(messages).toContain('incorrect digest (it used standard base64 instead of the URL-safe alphabet)');
    expect(messages).toContain('converted to Data Source 2.0');
    expect(messages).toContain('extend/overlays/cluster_ordering/1.0');
    expect((node(project, 'address_street') as AttributeNode).source).toEqual(['address', 'street']);
    expect((node(project, 'name') as AttributeNode).source).toEqual(['pets', null, 'name']);
    expect(project.bundleExtras).toEqual({ profile_version: 'swiss-profile-vc:1.0.0' });
    for (const captureBase of bundle.capture_bases) expect(await walletAcceptsDigest({ ...captureBase })).toBe(true);
  });

  it('repairs a reference written in the wrong base64 alphabet', async () => {
    const child = { type: 'spec/capture_base/1.0', digest: 'IKLvtGx1NU0007DUTTmI_6Zw-hnGRFicZ5R4vAxg4j2j', attributes: { name: 'Text', race: 'Text' } };
    const root = { type: 'spec/capture_base/1.0', digest: 'IRoot', attributes: { pets: 'Array[refs:IKLvtGx1NU0007DUTTmI/6Zw+hnGRFicZ5R4vAxg4j2j]' } };
    const { report } = await importBundle({ capture_bases: [root, child], overlays: [] });
    expect(report.map((note) => note.message).join('\n')).toContain('after fixing the base64 alphabet');
  });

  it('rejects bundles it cannot turn into a tree', async () => {
    await expect(importBundle({})).rejects.toThrow(ImportError);
    await expect(importBundle({ capture_bases: [{ digest: 'IA', attributes: { a: 'refs:IB' } }] })).rejects.toThrow(/no capture base has that digest/);
    await expect(
      importBundle({
        capture_bases: [
          { digest: 'IA', attributes: { b: 'refs:IB' } },
          { digest: 'IB', attributes: { a: 'refs:IA' } },
        ],
      }),
    ).rejects.toThrow(/no root/);
    await expect(importBundle({ capture_bases: [{ digest: 'IA', attributes: { a: 'Array[Array[Text]]' } }] })).rejects.toThrow(
      /unsupported type/,
    );
  });
});

describe('jsonPathToClaimsPath', () => {
  it('converts the Data Source 1.0 forms seen in fixtures', () => {
    expect(jsonPathToClaimsPath('$.pets[*].name')).toEqual(['pets', null, 'name']);
    expect(jsonPathToClaimsPath("$['a b'][0]")).toEqual(['a b', 0]);
    expect(jsonPathToClaimsPath('pets')).toBeNull();
    expect(jsonPathToClaimsPath('$.a..b')).toBeNull();
  });
});

describe('importBundle with a shared capture base', () => {
  it('builds one group per reference and exports the shared capture base once', async () => {
    const city = { type: 'spec/capture_base/1.0', digest: '', attributes: { city: 'Text' } };
    city.digest = await cesrDigest(city);
    const root = { type: 'spec/capture_base/1.0', digest: '', attributes: { home: `refs:${city.digest}`, work: `refs:${city.digest}` } };
    root.digest = await cesrDigest(root);
    const input = {
      capture_bases: [root, city],
      overlays: [
        { type: 'spec/overlays/label/1.1', capture_base: city.digest, language: 'de-CH', attribute_labels: { city: 'Ort' } },
        { type: 'extend/overlays/data_source/2.0', capture_base: city.digest, format: 'vc+sd-jwt', attribute_sources: { city: ['city'] } },
        { type: 'extend/overlays/data_source/2.0', capture_base: city.digest, format: 'dc+sd-jwt', attribute_sources: { city: ['city'] } },
      ],
    };
    const { project, bundle, report } = await roundTrip(input);
    const [home, work] = project.root.children as GroupLink[];
    expect(home.group).not.toBe(work.group);
    expect(home.group.children[0].labels).toEqual({ 'de-CH': 'Ort' });
    expect(work.group.children[0].labels).toEqual({ 'de-CH': 'Ort' });
    expect(bundle.capture_bases.map((captureBase) => captureBase.digest)).toEqual([root.digest, city.digest]);
    expect(bundle.overlays.filter((overlay) => overlay.capture_base === city.digest)).toHaveLength(4);
    expect(report.filter((note) => note.level === 'warning')).toEqual([]);
  });
});

describe('importBundle data source formats', () => {
  async function bundleWith(dataSources: { format?: string; attribute_sources: Record<string, unknown>; type?: string }[]) {
    const captureBase = { type: 'spec/capture_base/1.0', digest: '', attributes: { name: 'Text', city: 'Text' } };
    captureBase.digest = await cesrDigest(captureBase);
    return {
      capture_bases: [captureBase],
      overlays: dataSources.map(({ type = 'extend/overlays/data_source/2.0', ...rest }) => ({ type, capture_base: captureBase.digest, ...rest })),
    };
  }
  const warnings = (report: { level: string; message: string }[]) => report.filter((note) => note.level === 'warning').map((note) => note.message);
  const sources = { name: ['name'], city: ['address', 'city'] };
  const dataSourceFormats = (bundle: { overlays: { type: string; format?: unknown }[] }) =>
    bundle.overlays.filter((overlay) => overlay.type === OVERLAY_TYPES.dataSource).map((overlay) => overlay.format);

  it('reads both formats without a note when their paths match', async () => {
    const input = await bundleWith([
      { format: 'vc+sd-jwt', attribute_sources: sources },
      { format: 'dc+sd-jwt', attribute_sources: sources },
    ]);
    const { project, report, bundle } = await roundTrip(input);
    expect((node(project, 'city') as AttributeNode).source).toEqual(['address', 'city']);
    expect(report).toEqual([]);
    expect(bundle.overlays.filter((overlay) => overlay.type === OVERLAY_TYPES.dataSource)).toEqual(input.overlays);
  });

  it('warns about the wallets that miss "vc+sd-jwt" and exports both', async () => {
    const { report, bundle } = await roundTrip(await bundleWith([{ format: 'dc+sd-jwt', attribute_sources: sources }]));
    expect(warnings(report)).toEqual([expect.stringMatching(/no "vc\+sd-jwt" Data Source overlay.*iOS wallet up to 1\.18.*Android/)]);
    expect(dataSourceFormats(bundle)).toEqual(['vc+sd-jwt', 'dc+sd-jwt']);
  });

  it('warns about the wallets that miss "dc+sd-jwt" and exports both', async () => {
    const { report, bundle } = await roundTrip(await bundleWith([{ format: 'vc+sd-jwt', attribute_sources: sources }]));
    expect(warnings(report)).toEqual([expect.stringMatching(/no "dc\+sd-jwt" Data Source overlay.*Android/)]);
    expect(dataSourceFormats(bundle)).toEqual(['vc+sd-jwt', 'dc+sd-jwt']);
  });

  it('keeps the "dc+sd-jwt" path when the formats disagree, whatever their order', async () => {
    for (const order of [
      ['dc+sd-jwt', 'vc+sd-jwt'],
      ['vc+sd-jwt', 'dc+sd-jwt'],
    ]) {
      const input = await bundleWith(
        order.map((format) => ({ format, attribute_sources: format === 'dc+sd-jwt' ? sources : { ...sources, city: ['city'] } })),
      );
      const { project, report } = await roundTrip(input);
      expect((node(project, 'city') as AttributeNode).source).toEqual(['address', 'city']);
      expect(warnings(report)).toEqual([
        'The data source of "city" differed between formats: city for "vc+sd-jwt", address.city for "dc+sd-jwt". The address.city path was kept for every format.',
      ]);
    }
  });

  it('reads other formats, warns, and exports their paths as both formats', async () => {
    const { project, report, bundle } = await roundTrip(await bundleWith([{ format: 'jwt_vc_json', attribute_sources: sources }]));
    expect((node(project, 'name') as AttributeNode).source).toEqual(['name']);
    expect(warnings(report)).toContain(
      'Data Source overlays with format "jwt_vc_json" are not read by the wallets. Their paths are exported as "vc+sd-jwt" and "dc+sd-jwt".',
    );
    expect(dataSourceFormats(bundle)).toEqual(['vc+sd-jwt', 'dc+sd-jwt']);
  });

  it('checks the formats of Data Source 1.0 when there is no 2.0', async () => {
    const { project, report } = await roundTrip(
      await bundleWith([{ type: 'extend/overlays/data_source/1.0', format: 'vc+sd-jwt', attribute_sources: { name: '$.name', city: '$.address.city' } }]),
    );
    expect((node(project, 'city') as AttributeNode).source).toEqual(['address', 'city']);
    expect(warnings(report)).toEqual([expect.stringMatching(/no "dc\+sd-jwt" Data Source overlay/)]);
  });

  for (const [name, fixture] of Object.entries(VALID_FIXTURES)) {
    it(`${name}: labels every source on each wallet after a round trip`, async () => {
      const { project, bundle } = await roundTrip(fixture);
      const { digests } = await buildBundle(project);
      for (const group of walkGroups(project.root)) {
        const found = walletDataSources(bundle, digests.get(group.id)!);
        for (const child of group.children) {
          if (!child.source?.length) continue;
          for (const wallet of ['ios-1.18', 'ios-1.19', 'android-1.19'] as const) {
            for (const format of ['vc+sd-jwt', 'dc+sd-jwt'] as const) expect(walletPath(found.get(child.key), wallet, format)).toEqual(child.source);
          }
        }
      }
    });
  }
});
