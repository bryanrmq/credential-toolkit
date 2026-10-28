/**
 * Last step of the conformance run: reads what each wallet made of every sample (`android.json`, `ios.json`), the
 * hash checks (`hashes.json`) and our preview (`preview.json`), compares them and writes `report.json` and
 * `report.md` (also appended to the GitHub job summary). It fails when a wallet rejected a sample, a hash doesn't
 * match, or the wallet's display differs from the preview in a way `known-differences.json` doesn't list.
 *
 * The wallet code the harnesses run stops before the screens. Where the screens then sort, filter or pick a
 * language, the comparison applies the wallet's rule to the wallet's output first; README.md lists each one.
 *
 * Usage: node conformance/compare.ts [out] [--require android,ios]
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Manifest } from './generate.ts';
import type { CardDisplay, ClaimDisplay, GroupDisplay, PreviewDisplay } from './preview.ts';

type Platform = 'android' | 'ios';
const PLATFORMS: Platform[] = ['android', 'ios'];

export interface Difference {
  sample: string;
  platform: Platform;
  /** `card`, `details`, `attribute` or `order`. */
  check: string;
  /** Where in the display, e.g. `de-CH › section 1 › ["address","street"] › label`. */
  where: string;
  wallet: unknown;
  preview: unknown;
  /** The known-differences entry that explains it. */
  known?: string;
}

interface KnownDifference {
  id: string;
  platform: Platform | 'both';
  sample: string;
  check: string;
  /** A substring of `where`; every difference of the check matches without it. */
  where?: string;
  reason: string;
  walletCode: string;
}

interface Rejection {
  accepted: false;
  step: string;
  error: string;
}

interface AndroidDisplay {
  locale: string | null;
  theme: string | null;
  name: string | null;
  description: string | null;
  logo: string | null;
  backgroundColor: string | null;
}

interface AndroidClaim {
  path: string;
  value: string | null;
  valueType: string | null;
  order: number;
  displays: { locale: string | null; name: string; value: string | null }[];
}

interface AndroidCluster {
  path: string;
  order: number;
  displays: { locale: string; name: string }[];
  claims: AndroidClaim[];
  childClusters: AndroidCluster[];
}

interface AndroidResult {
  accepted: true;
  credentialDisplays: AndroidDisplay[];
  clusters: AndroidCluster[];
}

interface IosDisplay {
  captureBaseDigest: string;
  language: string;
  theme: string | null;
  logo: string | null;
  primaryBackgroundColor: string | null;
  primaryField: string | null;
  metaName: string | null;
  metaDescription: string | null;
}

interface IosAttribute {
  captureBaseDigest: string;
  name: string;
  attributeType: string;
  characterEncoding: string | null;
  dataSources: Record<string, unknown[]>;
  entryMapping: Record<string, Record<string, string>>;
  format: string | null;
  labels: Record<string, string>;
  order: number | null;
  isSensitive: boolean;
  standard: string | null;
}

interface IosResult {
  accepted: true;
  captureBaseDisplays: IosDisplay[];
  attributes: IosAttribute[];
}

interface HashResult {
  sample: string;
  check: string;
  expected: string;
  actual: string;
  ok: boolean;
}

interface SampleReport {
  id: string;
  source: string;
  claims: Manifest['claims'];
  hosting: string;
  wallets: Partial<Record<Platform, { accepted: boolean; step?: string; error?: string; differences: number; known: number } | null>>;
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

const show = (path: unknown) => (typeof path === 'string' ? path : JSON.stringify(path));

// --- Android ----------------------------------------------------------------------------------------------------

/** `DisplayLanguage.FALLBACK`: the display every claim gets, labelled with its path. */
const ANDROID_FALLBACK = 'fallback';

/** `CredentialElementCollectionExt.elementComparator`: a negative order sorts last. Kotlin's sort is stable. */
function androidSort<T extends { order: number }>(items: T[]): T[] {
  const rank = (order: number) => (order < 0 ? Number.MAX_SAFE_INTEGER : order);
  return [...items].sort((a, b) => rank(a.order) - rank(b.order));
}

/** Whether a claim is somewhere below `cluster` (`MapToCredentialClaimClusterImpl.filterEmptyItems`). */
function hasClaims(cluster: AndroidCluster): boolean {
  return cluster.claims.length > 0 || cluster.childClusters.some(hasClaims);
}

/** Picks the display in `lang`, else the fallback one; the wallet's own picking (`GetLocalizedDisplayImpl`) is not run. */
function androidClaimDisplay(claim: AndroidClaim, lang: string) {
  const exact = claim.displays.filter((display) => display.locale === lang);
  return exact.find((display) => display.name !== claim.path) ?? exact[0] ?? claim.displays.find((display) => display.locale === ANDROID_FALLBACK);
}

function androidValueKind(valueType: string | null): string {
  return valueType === 'bool' ? 'boolean' : (valueType ?? 'string');
}

type AndroidRow = { kind: 'claim'; claim: AndroidClaim; order: number } | { kind: 'group'; cluster: AndroidCluster; order: number };

function androidRows(cluster: AndroidCluster): AndroidRow[] {
  const rows: AndroidRow[] = [
    ...cluster.claims.map((claim) => ({ kind: 'claim' as const, claim, order: claim.order })),
    ...cluster.childClusters.filter(hasClaims).map((child) => ({ kind: 'group' as const, cluster: child, order: child.order })),
  ];
  return androidSort(rows);
}

function compareAndroidDetails(lang: string, wallet: AndroidCluster[], preview: GroupDisplay[], add: (d: Omit<Difference, 'sample' | 'platform'>) => void): void {
  const sections = androidSort(wallet.filter(hasClaims));
  const count = Math.max(sections.length, preview.length);
  for (let index = 0; index < count; index++) {
    const where = `${lang} › section ${index + 1}`;
    const cluster = sections[index];
    const group = preview[index];
    if (!cluster || !group) {
      add({ check: 'details', where, wallet: cluster?.path ?? null, preview: group ? JSON.stringify(group.path) : null });
      continue;
    }
    compareAndroidGroup(cluster, group, lang, where, add);
  }
}

function compareAndroidGroup(cluster: AndroidCluster, group: GroupDisplay, lang: string, where: string, add: (d: Omit<Difference, 'sample' | 'platform'>) => void): void {
  if (cluster.path !== JSON.stringify(group.path)) add({ check: 'details', where: `${where} › path`, wallet: cluster.path, preview: JSON.stringify(group.path) });
  const title = cluster.displays.find((display) => display.locale === lang)?.name ?? null;
  // Titles with `{{…}}` templates are filled in by the screen (`ResolveClaimTemplateImpl`), which the harness doesn't run.
  if (!group.unmapped && !title?.includes('{{') && title !== group.title) add({ check: 'details', where: `${where} › title`, wallet: title, preview: group.title });
  const rows = androidRows(cluster);
  const count = Math.max(rows.length, group.rows.length);
  for (let index = 0; index < count; index++) {
    const row = rows[index];
    const expected = group.rows[index];
    const at = `${where} › row ${index + 1}`;
    if (!row || !expected || row.kind !== expected.kind) {
      add({ check: 'order', where: at, wallet: row ? (row.kind === 'claim' ? row.claim.path : row.cluster.path) : null, preview: expected ? JSON.stringify(expected.path) : null });
      continue;
    }
    if (row.kind === 'group') {
      compareAndroidGroup(row.cluster, expected as GroupDisplay, lang, `${at} ${row.cluster.path}`, add);
      continue;
    }
    compareAndroidClaim(row.claim, expected as ClaimDisplay, lang, `${at} ${row.claim.path}`, add);
  }
}

function compareAndroidClaim(claim: AndroidClaim, expected: ClaimDisplay, lang: string, where: string, add: (d: Omit<Difference, 'sample' | 'platform'>) => void): void {
  if (claim.path !== JSON.stringify(expected.path)) {
    add({ check: 'order', where: `${where} › path`, wallet: claim.path, preview: JSON.stringify(expected.path) });
    return;
  }
  const display = androidClaimDisplay(claim, lang);
  if (display?.name !== expected.label) add({ check: 'details', where: `${where} › label`, wallet: display?.name ?? null, preview: expected.label });
  const kind = androidValueKind(claim.valueType);
  if (kind !== expected.valueKind) add({ check: 'details', where: `${where} › value type`, wallet: kind, preview: expected.valueKind });
  // `MapToCredentialClaimDataImpl`: the entry label of the display, else the value. Dates and images are formatted
  // or decoded by the screen, so only text values are compared.
  if (kind === 'string' || kind === 'boolean' || kind === 'numeric') {
    const value = display?.value ?? claim.value;
    if (value !== expected.value) add({ check: 'details', where: `${where} › value`, wallet: value, preview: expected.value });
  }
}

function compareAndroidCard(wallet: AndroidDisplay[], preview: CardDisplay[], languages: string[], add: (d: Omit<Difference, 'sample' | 'platform'>) => void): void {
  for (const lang of languages) {
    const displays = wallet.filter((display) => display.locale === lang);
    if (!displays.length) add({ check: 'card', where: `${lang}`, wallet: null, preview: 'a display' });
    for (const display of displays) {
      const theme = display.theme === 'dark' ? 'dark' : 'light';
      const card = preview.find((entry) => entry.lang === lang && entry.theme === theme)!;
      const where = `${lang} › ${display.theme ?? 'no branding'}`;
      // `GenerateOcaCredentialDataImpl`: the description is the branding's primary field, else the meta description.
      const expected = {
        name: card.name,
        description: display.theme === null ? card.description : (card.primaryField ?? card.description),
        logo: display.theme === null ? null : card.logo,
        backgroundColor: display.theme === null ? null : card.backgroundColor,
      };
      if (display.theme === null && (card.logo || card.backgroundColor || card.primaryField)) {
        add({ check: 'card', where: `${where} › branding`, wallet: null, preview: { logo: card.logo, backgroundColor: card.backgroundColor, primaryField: card.primaryField } });
      }
      for (const field of ['name', 'description', 'logo', 'backgroundColor'] as const) {
        if ((display[field] ?? null) !== expected[field]) add({ check: 'card', where: `${where} › ${field}`, wallet: display[field], preview: expected[field] });
      }
    }
  }
}

// --- iOS --------------------------------------------------------------------------------------------------------

/** The capture base no other one references: the credential's root. */
function rootDigest(bundle: { capture_bases: { digest: string; attributes: Record<string, string> }[] }): string | undefined {
  const referenced = new Set(bundle.capture_bases.flatMap((base) => Object.values(base.attributes).flatMap((type) => /refs:([^\]]+)/.exec(type)?.[1] ?? [])));
  return bundle.capture_bases.find((base) => !referenced.has(base.digest))?.digest;
}

function compareIosCard(wallet: IosDisplay[], root: string | undefined, preview: CardDisplay[], languages: string[], add: (d: Omit<Difference, 'sample' | 'platform'>) => void): void {
  const displays = wallet.filter((display) => display.captureBaseDigest === root);
  for (const lang of languages) {
    const forLang = displays.filter((display) => display.language === lang);
    if (!forLang.length) add({ check: 'card', where: `${lang}`, wallet: null, preview: 'a display' });
    for (const display of forLang) {
      const theme = display.theme === 'dark' ? 'dark' : 'light';
      const card = preview.find((entry) => entry.lang === lang && entry.theme === theme)!;
      const where = `${lang} › ${display.theme ?? 'no branding'}`;
      const branded = display.theme !== null;
      const pairs: [string, unknown, unknown][] = [
        ['name', display.metaName, card.name],
        ['description', display.metaDescription, card.description],
        ['primaryField', display.primaryField, branded ? card.primaryField : null],
        ['logo', display.logo, branded ? card.logo : null],
        ['backgroundColor', display.primaryBackgroundColor, branded ? card.backgroundColor : null],
      ];
      for (const [field, value, expected] of pairs) {
        if ((value ?? null) !== expected) add({ check: 'card', where: `${where} › ${field}`, wallet: value, preview: expected });
      }
    }
  }
}

/** `AttributeType` cases as the preview names the types. */
const IOS_TYPES: Record<string, string> = { text: 'Text', numeric: 'Numeric', boolean: 'Boolean', dateTime: 'DateTime', binary: 'Binary' };
const IOS_STANDARDS: Record<string, string> = {
  dataURLScheme: 'urn:ietf:rfc:2397',
  dateTimeIso8601: 'urn:iso:std:iso:8601',
  dateTimeUnixEpoch: 'urn:iso:std:iso-iec:9945',
};
const IOS_ENCODINGS: Record<string, string> = { utf8: 'utf-8', base64: 'base64' };
/** The order of an attribute without one (`OcaClaimGenerator`: `Int(Int16.max)`). */
const IOS_UNORDERED = 32767;

function unknownRaw(value: string | null, known: Record<string, string>): string | null {
  if (value === null) return null;
  return known[value] ?? /^unknown\(rawString: "(.*)"\)$/.exec(value)?.[1] ?? value;
}

/** The claim path with indices as `null`, as data sources name list items. */
function sourcePath(path: unknown[]): string {
  return JSON.stringify(path.map((segment) => (typeof segment === 'number' ? null : segment)));
}

function iosAttributeFor(attributes: IosAttribute[], path: unknown[], format: string): IosAttribute | undefined {
  const wanted = sourcePath(path);
  // iOS 1.19 looks the path up by the credential's format, with the other one as fallback.
  const formats = [format, format === 'dc+sd-jwt' ? 'vc+sd-jwt' : 'dc+sd-jwt'];
  return attributes.find((attribute) => formats.some((name) => attribute.dataSources[name] && sourcePath(attribute.dataSources[name]) === wanted));
}

function compareIosDetails(attributes: IosAttribute[], format: string, lang: string, sections: GroupDisplay[], add: (d: Omit<Difference, 'sample' | 'platform'>) => void): void {
  const visit = (group: GroupDisplay, where: string) => {
    if (group.unmapped) return;
    let lastOrder = -Infinity;
    for (const row of group.rows) {
      if (row.kind === 'group') {
        visit(row, `${where} › ${JSON.stringify(row.path)}`);
        continue;
      }
      if (!row.format) continue;
      const at = `${where} › ${JSON.stringify(row.path)}`;
      const attribute = iosAttributeFor(attributes, row.path, format);
      if (!attribute) {
        add({ check: 'attribute', where: at, wallet: null, preview: 'an attribute with this data source' });
        continue;
      }
      if (attribute.labels[lang] !== undefined && attribute.labels[lang] !== row.label) add({ check: 'attribute', where: `${at} › label`, wallet: attribute.labels[lang], preview: row.label });
      if (row.entryCode !== null) {
        const label = attribute.entryMapping[lang]?.[row.entryCode] ?? null;
        if (label !== row.value) add({ check: 'attribute', where: `${at} › entry ${row.entryCode}`, wallet: label, preview: row.value });
      }
      const type = /^array\(type: (\w+)\)$/.exec(attribute.attributeType)?.[1] ?? attribute.attributeType;
      const formats: [string, unknown, unknown][] = [
        ['type', IOS_TYPES[type] ?? type, row.format.type],
        ['format', attribute.format, row.format.format ?? null],
        ['standard', unknownRaw(attribute.standard, IOS_STANDARDS), row.format.standard ?? null],
        ['characterEncoding', unknownRaw(attribute.characterEncoding, IOS_ENCODINGS), row.format.characterEncoding ?? null],
      ];
      for (const [field, value, expected] of formats) {
        if (value !== expected) add({ check: 'attribute', where: `${at} › ${field}`, wallet: value, preview: expected });
      }
      const order = attribute.order ?? IOS_UNORDERED;
      if (order < lastOrder) add({ check: 'order', where: `${at} › order`, wallet: order, preview: `after order ${lastOrder}` });
      lastOrder = Math.max(lastOrder, order);
    }
  };
  sections.forEach((section, index) => visit(section, `${lang} › section ${index + 1}`));
}

// --- Report -----------------------------------------------------------------------------------------------------

function matches(known: KnownDifference, difference: Difference): boolean {
  return (
    (known.platform === 'both' || known.platform === difference.platform) &&
    (known.sample === '*' || known.sample === difference.sample) &&
    known.check === difference.check &&
    (known.where === undefined || difference.where.includes(known.where))
  );
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

async function compare(out: string, required: Platform[]): Promise<number> {
  const samples = await json<{ id: string }[]>(`${out}/samples.json`);
  const known = await json<KnownDifference[]>(new URL('known-differences.json', import.meta.url).pathname);
  const hashes = existsSync(`${out}/hashes.json`) ? await json<HashResult[]>(`${out}/hashes.json`) : null;
  const differences: Difference[] = [];
  const reports: SampleReport[] = [];
  const problems: string[] = [];
  if (!hashes) problems.push('hashes.json is missing: run conformance/hashes/check.py first.');

  for (const { id } of samples) {
    const dir = `${out}/${id}`;
    const manifest = await json<Manifest>(`${dir}/manifest.json`);
    const preview = await json<PreviewDisplay>(`${dir}/preview.json`);
    const bundle = await json<{ capture_bases: { digest: string; attributes: Record<string, string> }[] }>(`${dir}/oca-bundle.json`);
    const report: SampleReport = { id, source: manifest.source, claims: manifest.claims, hosting: manifest.bundleUrl ? 'URL' : 'data URL', wallets: {} };
    for (const platform of PLATFORMS) {
      const file = `${dir}/${platform}.json`;
      if (!existsSync(file)) {
        report.wallets[platform] = null;
        if (required.includes(platform)) problems.push(`${id}: no ${platform} result (${file}).`);
        continue;
      }
      const result = await json<AndroidResult | IosResult | Rejection>(file);
      if (!result.accepted) {
        report.wallets[platform] = { accepted: false, step: result.step, error: result.error, differences: 0, known: 0 };
        problems.push(`${id}: ${platform} rejected it at "${result.step}": ${result.error}`);
        continue;
      }
      const found: Difference[] = [];
      const add = (difference: Omit<Difference, 'sample' | 'platform'>) => found.push({ sample: id, platform, ...difference });
      if (platform === 'android') {
        const android = result as AndroidResult;
        compareAndroidCard(android.credentialDisplays, preview.card, manifest.languages, add);
        for (const lang of manifest.languages) compareAndroidDetails(lang, android.clusters, preview.details.android[lang], add);
      } else {
        const ios = result as IosResult;
        compareIosCard(ios.captureBaseDisplays, rootDigest(bundle), preview.card, manifest.languages, add);
        for (const lang of manifest.languages) compareIosDetails(ios.attributes, manifest.format, lang, preview.details.ios[lang], add);
      }
      for (const difference of found) difference.known = known.find((entry) => matches(entry, difference))?.id;
      differences.push(...found);
      report.wallets[platform] = {
        accepted: true,
        differences: found.filter((difference) => !difference.known).length,
        known: found.filter((difference) => difference.known).length,
      };
    }
    reports.push(report);
  }

  const failedHashes = hashes?.filter((result) => !result.ok) ?? [];
  const unexplained = differences.filter((difference) => !difference.known);
  for (const result of failedHashes) problems.push(`${result.sample}: ${result.check}: expected ${result.expected}, got ${result.actual}`);
  if (unexplained.length) problems.push(`${unexplained.length} display differences are not in known-differences.json.`);

  const versions = await json<Record<Platform, { tag: string; commit: string }>>(new URL('versions.json', import.meta.url).pathname);
  const status = (platform: Platform, report: SampleReport) => {
    const result = report.wallets[platform];
    if (result === null || result === undefined) return 'not run';
    if (!result.accepted) return `**rejected** (${cell(result.step ?? '')}: ${cell(result.error ?? '')})`;
    const parts = [`accepted`, result.differences ? `**${result.differences} differences**` : 'display matches'];
    if (result.known) parts.push(`${result.known} known`);
    return parts.join(', ');
  };
  const lines = [
    '## Wallet conformance',
    '',
    `Android ${versions.android.tag} (\`${versions.android.commit.slice(0, 7)}\`), iOS ${versions.ios.tag} (\`${versions.ios.commit.slice(0, 7)}\`).`,
    '',
    '| Sample | Claims | OCA bundle | Android | iOS |',
    '|---|---|---|---|---|',
    ...reports.map((report) => `| \`${report.id}\` | ${report.claims} | ${report.hosting} | ${status('android', report)} | ${status('ios', report)} |`),
    '',
    hashes
      ? `Hashes recomputed with openssl, keripy and rfc8785: ${hashes.length - failedHashes.length} of ${hashes.length} match.`
      : 'Hashes: not checked.',
    '',
  ];
  if (unexplained.length) {
    lines.push('### Display differences', '', '| Sample | Wallet | Check | Where | Wallet shows | Preview shows |', '|---|---|---|---|---|---|');
    for (const difference of unexplained.slice(0, 200)) {
      lines.push(`| \`${difference.sample}\` | ${difference.platform} | ${difference.check} | ${cell(difference.where)} | ${cell(show(difference.wallet))} | ${cell(show(difference.preview))} |`);
    }
    if (unexplained.length > 200) lines.push('', `…and ${unexplained.length - 200} more in report.json.`);
    lines.push('');
  }
  const usedKnown = known.filter((entry) => differences.some((difference) => difference.known === entry.id));
  if (usedKnown.length) {
    lines.push('### Known differences', '');
    for (const entry of usedKnown) {
      const count = differences.filter((difference) => difference.known === entry.id).length;
      lines.push(`- \`${entry.id}\` (${entry.platform}, ${count}): ${entry.reason} ([wallet code](${entry.walletCode}))`);
    }
    lines.push('');
  }
  if (problems.length) lines.push('### Failures', '', ...problems.map((problem) => `- ${cell(problem)}`), '');
  const markdown = lines.join('\n');
  await writeFile(`${out}/report.md`, markdown);
  await writeFile(`${out}/report.json`, JSON.stringify({ versions, samples: reports, differences, hashes, problems }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  console.log(markdown);
  return problems.length ? 1 : 0;
}

const args = process.argv.slice(2);
const requireIndex = args.indexOf('--require');
const required = requireIndex === -1 ? [] : (args.splice(requireIndex, 2)[1]?.split(',') as Platform[]);
process.exitCode = await compare(args[0] ?? new URL('out', import.meta.url).pathname, required);
