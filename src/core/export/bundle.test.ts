import { describe, expect, it } from 'vitest';
import { walletAcceptsDigest } from '../../test/walletCesr';
import { type CredentialFormat, type Wallet, walletDataSources, walletPath } from '../../test/walletDataSource';
import { sriSha256, utf8 } from '../cesr';
import { KNOWN_STANDARDS, emptyGroup, emptyProject, newAttribute, newGroupLink, walkGroups } from '../model';
import { OVERLAY_TYPES, buildBundle, serializeBundle } from './bundle';
import { buildOutputs } from './outputs';

/** The "Pet Permit" example from the swiyu OCA 1.0 spec, built in the editor model. */
function petPermit() {
  const project = emptyProject(['en']);
  const pets = emptyGroup();
  pets.children.push(
    newAttribute('race', { source: ['pets', null, 'race'], labels: { en: 'Race' } }),
    newAttribute('name', { source: ['pets', null, 'name'], labels: { en: 'Name' } }),
  );
  const address = emptyGroup();
  address.children.push(
    newAttribute('street', { source: ['street'], labels: { en: 'Street' } }),
    newAttribute('city', { source: ['city'], labels: { en: 'City' } }),
    newAttribute('country', { source: ['country'], labels: { en: 'Country' } }),
  );
  project.root.children.push(
    newAttribute('firstname', { source: ['firstname'], labels: { en: 'Firstname' } }),
    newAttribute('lastname', { source: ['lastname'], labels: { en: 'Lastname' } }),
    newGroupLink('address', { group: address, labels: { en: 'Address' } }),
    newGroupLink('pets', { array: true, source: ['pets', null], group: pets, labels: { en: 'Pet {{pets.name}}' } }),
  );
  project.meta.en = { name: 'Pet Permit', description: '' };
  project.branding.en = { light: { primaryBackgroundColor: '#2C75E3', primaryField: '{{firstname}} {{lastname}}' } };
  return { project, pets, address };
}

describe('buildBundle', () => {
  it('reproduces the digests of the spec example', async () => {
    const { project } = petPermit();
    const { bundle } = await buildBundle(project);
    expect(bundle.capture_bases.map((captureBase) => captureBase.digest)).toEqual([
      'IAer8X5u59cI2kaJziETEggN_Yft6gsY5tiVutLm7tyM',
      'IAuwaTn6mftTX0kOy4BQQaBYH-1jVVG9_zeEQRCwz-i5',
      'IKLvtGx1NU0007DUTTmI_6Zw-hnGRFicZ5R4vAxg4j2j',
    ]);
    for (const captureBase of bundle.capture_bases) expect(await walletAcceptsDigest({ ...captureBase })).toBe(true);
  });

  it('writes references, order, data source and spec-form templates', async () => {
    const { project } = petPermit();
    const { bundle } = await buildBundle(project);
    const [root, address, pets] = bundle.capture_bases;
    expect(root.attributes).toEqual({
      firstname: 'Text',
      lastname: 'Text',
      address: `refs:${address.digest}`,
      pets: `Array[refs:${pets.digest}]`,
    });
    const rootOverlays = bundle.overlays.filter((overlay) => overlay.capture_base === root.digest);
    expect(rootOverlays.map((overlay) => overlay.type)).toEqual([
      OVERLAY_TYPES.meta,
      OVERLAY_TYPES.branding,
      OVERLAY_TYPES.label,
      OVERLAY_TYPES.order,
      OVERLAY_TYPES.dataSource,
      OVERLAY_TYPES.dataSource,
    ]);
    const label = rootOverlays.find((overlay) => overlay.type === OVERLAY_TYPES.label)!;
    expect(label.attribute_labels).toMatchObject({ pets: `Pet {{refs:${pets.digest}:name}}` });
    const order = rootOverlays.find((overlay) => overlay.type === OVERLAY_TYPES.order)!;
    expect(order.attribute_orders).toEqual({ firstname: 1, lastname: 2, address: 3, pets: 4 });
    const dataSources = rootOverlays.filter((overlay) => overlay.type === OVERLAY_TYPES.dataSource);
    expect(dataSources.map((overlay) => overlay.format)).toEqual(['vc+sd-jwt', 'dc+sd-jwt']);
    for (const dataSource of dataSources) {
      expect(dataSource.attribute_sources).toMatchObject({ firstname: ['firstname'], pets: ['pets', null] });
    }
    expect(dataSources[0].attribute_sources).toEqual(dataSources[1].attribute_sources);
    expect(dataSources[0].attribute_sources).not.toBe(dataSources[1].attribute_sources);
    const branding = rootOverlays.find((overlay) => overlay.type === OVERLAY_TYPES.branding)!;
    expect(branding).toMatchObject({ language: 'en', theme: 'light', primary_field: '{{firstname}} {{lastname}}' });
  });

  it('emits standard, sensitive, entry code and entry overlays', async () => {
    const project = emptyProject(['de-CH', 'en-GB']);
    project.root.children.push(
      newAttribute('birth', { type: 'DateTime', standard: KNOWN_STANDARDS.iso8601, sensitive: true }),
      newAttribute('adult', {
        type: 'Boolean',
        entries: { codes: ['true', 'false'], labels: { 'de-CH': { true: 'Ja', false: 'Nein' }, 'en-GB': { true: 'Yes' } } },
      }),
    );
    const { bundle } = await buildBundle(project);
    const byType = (type: string) => bundle.overlays.filter((overlay) => overlay.type === type);
    expect(byType(OVERLAY_TYPES.standard)[0].attr_standards).toEqual({ birth: 'urn:iso:std:iso:8601' });
    expect(byType(OVERLAY_TYPES.sensitive)[0].attributes).toEqual(['birth']);
    expect(byType(OVERLAY_TYPES.entryCode)[0].attribute_entry_codes).toEqual({ adult: ['true', 'false'] });
    expect(byType(OVERLAY_TYPES.entry).map((overlay) => [overlay.language, overlay.attribute_entries])).toEqual([
      ['de-CH', { adult: { true: 'Ja', false: 'Nein' } }],
      ['en-GB', { adult: { true: 'Yes' } }],
    ]);
  });

  it('emits a dark branding overlay after the light one', async () => {
    const project = emptyProject(['en-GB']);
    project.root.children.push(newAttribute('a'));
    project.branding['en-GB'] = { light: { primaryBackgroundColor: '#FFFFFF' }, dark: { primaryBackgroundColor: '#000000' } };
    const { bundle } = await buildBundle(project);
    const themes = bundle.overlays.filter((overlay) => overlay.type === OVERLAY_TYPES.branding).map((overlay) => overlay.theme);
    expect(themes).toEqual(['light', 'dark']);
  });

  it('emits identical groups with identical overlays once', async () => {
    const project = emptyProject(['en']);
    const make = () => {
      const group = emptyGroup();
      group.children.push(newAttribute('city', { source: ['city'], labels: { en: 'City' } }));
      return group;
    };
    project.root.children.push(newGroupLink('home', { group: make() }), newGroupLink('work', { group: make() }));
    const { bundle } = await buildBundle(project);
    expect(bundle.capture_bases).toHaveLength(2);
    expect(bundle.overlays.filter((overlay) => overlay.type === OVERLAY_TYPES.label)).toHaveLength(1);
  });

  it('re-emits pass-through overlays and bundle extras', async () => {
    const project = emptyProject(['en']);
    project.root.children.push(newAttribute('a'));
    project.root.passthrough.push({ type: 'spec/overlays/format/1.0', capture_base: 'OLD', attribute_formats: { a: 'x' } });
    project.bundleExtras = { profile_version: 'swiss-profile-vc:1.0.0' };
    const { bundle } = await buildBundle(project);
    expect(Object.keys(bundle)).toEqual(['profile_version', 'capture_bases', 'overlays']);
    const format = bundle.overlays.find((overlay) => overlay.type === 'spec/overlays/format/1.0')!;
    expect(format.capture_base).toBe(bundle.capture_bases[0].digest);
  });

  it('is deterministic', async () => {
    const first = serializeBundle((await buildBundle(petPermit().project)).bundle);
    const second = serializeBundle((await buildBundle(petPermit().project)).bundle);
    expect(first).toBe(second);
  });
});

describe('buildBundle with non-ASCII content', () => {
  it('produces wallet-valid digests for keys and labels outside ASCII', async () => {
    const project = emptyProject(['fr-CH', 'de-CH']);
    project.root.children.push(
      newAttribute('straße', { source: ['adresse', 'straße'], labels: { 'de-CH': 'Straße', 'fr-CH': 'Rue' } }),
      newAttribute('prénom', { source: ['prénom'], labels: { 'fr-CH': 'Prénom', 'de-CH': 'Vorname' } }),
    );
    project.meta['fr-CH'] = { name: 'Carte d’accès « Zürich »', description: '' };
    const { bundle } = await buildBundle(project);
    expect(Object.keys(bundle.capture_bases[0].attributes)).toEqual(['straße', 'prénom']);
    expect(await walletAcceptsDigest({ ...bundle.capture_bases[0] })).toBe(true);
    expect(JSON.parse(serializeBundle(bundle)).overlays[0].name).toBe('Carte d’accès « Zürich »');
  });
});

describe('buildBundle with conflicting groups', () => {
  it('refuses to emit two different overlay sets for one capture base', async () => {
    const project = emptyProject(['en']);
    const make = (prefix: string) => {
      const group = emptyGroup();
      group.children.push(newAttribute('city', { source: [prefix, 'city'], labels: { en: 'City' } }));
      return group;
    };
    project.root.children.push(newGroupLink('home', { group: make('home') }), newGroupLink('work', { group: make('work') }));
    await expect(buildBundle(project)).rejects.toThrow(/"home" and "work" have the same keys and types/);
  });
});

describe('buildBundle data sources on each wallet', () => {
  const wallets: Wallet[] = ['ios-1.18', 'ios-1.19', 'android-1.19'];
  const formats: CredentialFormat[] = ['vc+sd-jwt', 'dc+sd-jwt'];

  for (const wallet of wallets) {
    for (const format of formats) {
      it(`${wallet} finds every source of a "${format}" credential`, async () => {
        const { project } = petPermit();
        const { bundle, digests } = await buildBundle(project);
        let checked = 0;
        for (const group of walkGroups(project.root)) {
          const sources = walletDataSources(bundle, digests.get(group.id)!);
          for (const child of group.children) {
            if (!child.source?.length) continue;
            expect(walletPath(sources.get(child.key), wallet, format)).toEqual(child.source);
            checked++;
          }
        }
        expect(checked).toBe(8);
      });
    }
  }

  it('reproduces the bug of a "dc+sd-jwt"-only bundle', async () => {
    const { project } = petPermit();
    const { bundle, digests } = await buildBundle(project);
    const dcOnly = { overlays: bundle.overlays.filter((overlay) => overlay.format !== 'vc+sd-jwt') };
    const firstname = walletDataSources(dcOnly, digests.get(project.root.id)!).get('firstname');
    expect(walletPath(firstname, 'ios-1.18', 'dc+sd-jwt')).toBeUndefined();
    expect(walletPath(firstname, 'android-1.19', 'vc+sd-jwt')).toBeUndefined();
    expect(walletPath(firstname, 'ios-1.19', 'vc+sd-jwt')).toEqual(['firstname']);
  });

  it('keeps the capture base digests and the #integrity of the text', async () => {
    const { project } = petPermit();
    const { bundle } = await buildBundle(project);
    for (const captureBase of bundle.capture_bases) expect(await walletAcceptsDigest({ ...captureBase })).toBe(true);
    const outputs = await buildOutputs(project, bundle);
    expect(outputs.json).toContain('"format": "vc+sd-jwt"');
    expect(outputs.json).toContain('"format": "dc+sd-jwt"');
    expect(outputs.integrity).toBe(await sriSha256(utf8(outputs.json)));
  });
});
