/**
 * The wallet's credential details screen (the claims list), built from the project and its sample credential. Pure
 * data: the iOS and Android previews only draw it.
 *
 * Ported from swiyu-admin-ch/eidch-ios-wallet v1.19.0 (commit 42e746c): `OcaClusterGenerator.swift`,
 * `OcaClaimGenerator.swift`, `CredentialClaim.swift`, `CredentialClaimCluster.swift`, `ClaimClusterList.swift`,
 * `ChildClusterView.swift`, `CredentialClaimViewModel.swift`, `DisplayLocalizable.swift` and
 * `CredentialRenderingEntity+Init.swift`. Wallet quirks are copied rather than fixed, so issuers see what holders see.
 * Earlier wallets (v1.14.0 and before) only read Data Source 1.0 overlays and match nothing in the 2.0 overlays this
 * tool exports.
 *
 * Android follows swiyu-admin-ch/eidch-android-wallet v1.19.0 (commit c29a6f3) where it differs, with the same output
 * shape (paths under `app/src/main/java/ch/admin/foitt/wallet/platform/`): `oca/.../GenerateOcaDisplaysImpl.kt` and
 * `GenerateOcaClaimDisplaysImpl.kt` build the same tree, `credentialCluster/.../MapToCredentialClaimClusterImpl.kt`,
 * `utils/CredentialElementCollectionExt.kt` and `locale/.../GetLocalizedDisplayImpl.kt` read it back, and
 * `credential/presentation/CredentialElements.kt` draws it. See `ANDROID_RULES` for what differs.
 *
 * Both are the wallets' latest tags (iOS v1.19.0 has no GitHub release yet; v1.18.0 is the latest one). Every rule was
 * re-checked against them, file by file, in #113 (2026-10-23).
 *
 * Nested paths: the wallet matches each attribute's claims path against every path in the whole payload, not only
 * top-level disclosures, so `["address", "street"]` finds `address.street`. A `refs:` group whose own source is missing
 * from the payload still shows its title, with no rows when none of its claims are found.
 */

import { attributeOrders } from '../export/bundle.ts';
import { isPlainObject } from '../import/report.ts';
import {
  type AttrType,
  type AttributeNode,
  type ClaimsPath,
  type Group,
  type GroupLink,
  type LangTag,
  type PrimitiveType,
  type Project,
  isArrayType,
  walkNodes,
} from '../model.ts';
import type { CardPlatform } from './profiles.ts';
import { MAX_JOIN_SEPARATOR, joinSeparator, parseExpression, resolveEditorPath } from '../templates.ts';
import { type ValueOptions, formatClaimValue, iosEntryText, walletText } from './values.ts';

/** Claims the iOS wallet never lists, as they carry protocol data (`VcSdJWSDecoder.nonSelectivelyDisclosableClaims`). */
export const IOS_TECHNICAL_CLAIMS: readonly string[] = [
  'iss',
  'nbf',
  'exp',
  'iat',
  'cnf',
  'status',
  '_sd',
  '_sd_alg',
  'vct',
  'vct#integrity',
  'vct_metadata_uri',
  'vct_metadata_uri#integrity',
];

/** The language iOS falls back to after the device languages (`UserLanguageCode.defaultAppLanguageCode`). */
export const IOS_DEFAULT_LANGUAGE = 'en';

/** The language codes iOS picks labels with: each device language without its region, then English. */
export function iosLanguageCodes(deviceLanguages: readonly string[]): string[] {
  return [...deviceLanguages.map((tag) => tag.split('-')[0]), IOS_DEFAULT_LANGUAGE];
}

/** Which screen lists the claims; they differ only in where the claims without an attribute go. */
export type DetailsScreen = 'details' | 'offer';

/** The languages the Android app is translated into (`locales_config.xml`). */
export const ANDROID_APP_LANGUAGES: readonly string[] = ['de', 'en', 'fr', 'it', 'rm'];

/** What Android uses when no device language is one of its own (`GetCurrentAppLocaleImpl`). */
export const ANDROID_DEFAULT_LOCALE = 'en-CH';

/**
 * The Android app's locale: the first device language whose language the app is translated into, region included,
 * else `en-CH` (`GetCurrentAppLocaleImpl.useDeviceLocaleOrDefault`). Labels, numbers and dates all use it.
 */
export function androidAppLocale(deviceLanguages: readonly string[]): string {
  return deviceLanguages.find((tag) => ANDROID_APP_LANGUAGES.includes(languageOf(tag))) ?? ANDROID_DEFAULT_LOCALE;
}

export interface DetailsOptions {
  /**
   * iOS: language codes in order of preference, matched as prefixes of the label languages (see `iosLanguageCodes`).
   * Android: the app locale first (see `androidAppLocale`).
   */
  languages: readonly string[];
  platform: CardPlatform;
  /** Defaults to `details`, the screen of an accepted credential. */
  screen?: DetailsScreen;
  /** Each group's Order overlay, or undefined when it has none. Defaults to the one the export writes. */
  orders?: (group: Group) => Readonly<Record<string, number>> | undefined;
  /** How iOS formats the claim values it fills group title templates with. Defaults to the first language. */
  valueOptions?: ValueOptions;
}

export interface CredentialDetails {
  /** Top-level sections, each drawn as a titled card. */
  sections: DetailsGroup[];
  /** The project has no sample, so the values are type placeholders. The wallet never shows rows without values. */
  noSample: boolean;
  /**
   * Somewhere the wallet's order is undefined, as it comes from a Swift dictionary (see `DetailsGroup.orderUndefined`).
   * Always false on Android, which keeps ties in capture base order.
   */
  orderUndefined: boolean;
  /** Android left out a group's claims because one of them is an image it cannot decode. */
  undecodableImage: boolean;
}

export type DetailsRow = DetailsClaim | DetailsGroup;

export interface DetailsGroup {
  kind: 'group';
  /** The label of the `refs:` or array attribute in the chosen language, with its `{{…}}` templates filled in. */
  title?: string;
  /** 0 for a section, 1 for a group in a section, and so on; iOS uses a smaller title from depth 2. */
  depth: number;
  /** A list of plain values (an `Array[…]` attribute): iOS shows only the values, without their labels. */
  valuesOnly: boolean;
  /** The section of sample claims that no attribute maps to. */
  unmapped: boolean;
  /** Two rows share an order value, so their order on the wallet is undefined (usually: no Order overlay). */
  orderUndefined: boolean;
  /** The wallet's claims path of the group; empty for the root and the unmapped section. */
  path: ClaimsPath;
  /** The group link or array attribute the group comes from. */
  nodeId?: string;
  rows: DetailsRow[];
}

export interface DetailsClaim {
  kind: 'claim';
  label: string;
  value: DetailsValue;
  /** Whether the wallet draws the "Sensitive" pill; values are never masked. */
  sensitive: boolean;
  /** The claim's full claims path, with array indices filled in. */
  path: ClaimsPath;
  /** The attribute the row comes from; absent for unmapped claims. */
  attributeId?: string;
  /**
   * What the wallet formats the value with (see `formatClaim`). Absent when the wallet has no attribute for the row
   * (elements of an array, unmapped claims), so it shows the value as plain text.
   */
  format?: ClaimFormat;
}

/** An attribute's type and the overlays that change how its value is shown. */
export interface ClaimFormat {
  type: PrimitiveType;
  standard?: string;
  /** From the group's Format overlay, which the project keeps unchanged; `image/png` or `image/jpeg` marks an image. */
  format?: string;
  /** From the group's Character Encoding overlay (the attribute's, else the default), also kept unchanged. */
  characterEncoding?: string;
}

/**
 * A raw sample value still to be formatted; the entry label that replaces an entry code; a JSON `null`, which only
 * Android lists (as `–`); or, without a sample, the attribute's type. iOS turns JSON booleans into `1` and `0`, as they
 * reach it as NSNumber and are cast to Int first (`JsonPrimitive`); Android keeps `true` and `false`.
 */
export type DetailsValue =
  | { kind: 'raw'; value: string | number | boolean }
  | { kind: 'entry'; code: string; label: string }
  | { kind: 'null' }
  | { kind: 'placeholder'; type: PrimitiveType };

/** The order of a group whose attribute has none, so unordered groups come first on iOS. */
const UNORDERED_GROUP = -1;

/** Where the two wallets build or read the tree differently. */
interface PlatformRules {
  /** The order of a claim whose attribute has none. */
  unorderedClaim: number;
  /** Sorts rows; `tie` means the wallet's order of some rows is undefined. */
  sortRows<T extends { order: number }>(items: T[]): { items: T[]; tie: boolean };
  /** A JSON `null` is listed as a row. */
  listsNull: boolean;
  /** Groups with no claims anywhere below them are left out. */
  dropsEmptyGroups: boolean;
  /** The unmapped claims come first on the details screen, last on the offer. Otherwise always last. */
  unmappedFirstOnDetails: boolean;
  /** Whether a row's pill shows, given the group's depth, the flag it inherits and its own. */
  groupSensitive(depth: number, inherited: boolean, own: boolean): { rows: boolean; groups: boolean };
  /** The text entry codes are matched against. */
  text(value: string | number | boolean, format: ClaimFormat | undefined): string;
  /** The order of a claim without an attribute. */
  unmappedOrder(path: ClaimsPath): number;
  /** An `Array[refs:…]` attribute whose value is not a list gives a group of the referenced group, not a row. */
  referenceArrayAsGroup: boolean;
  /** A group's own claims are all left out when one of them is an image the wallet cannot decode. */
  hidesClaimsOfUndecodableImage: boolean;
  /** A claim's value as the group title templates show it. */
  templateText(claim: DetailsClaim, options: ValueOptions): string;
  /** The label of a row without one. */
  pathText(path: ClaimsPath): string;
  /** Picks a claim's display; `path` is the label of the fallback display. */
  pickClaim(displays: Display[], languages: readonly string[], path: string): Display | undefined;
  pickTitle(displays: Display[], languages: readonly string[]): Display | undefined;
}

/** eidch-ios-wallet v1.19.0. */
const IOS_RULES: PlatformRules = {
  // `Int(Int16.max)`.
  unorderedClaim: 32767,
  // Swift's `sorted`, on items that come from a dictionary: ties have no defined order.
  sortRows: (items) => ({ items: [...items].sort((a, b) => a.order - b.order), tie: new Set(items.map((item) => item.order)).size < items.length }),
  listsNull: false,
  dropsEmptyGroups: false,
  unmappedFirstOnDetails: true,
  // `ClaimClusterList` passes a section's flag to its rows; `ChildClusterView` passes a group's flag to its sub-groups only.
  groupSensitive: (depth, inherited, own) => ({ rows: inherited, groups: depth === 0 ? inherited : inherited || own }),
  // `OcaClaimGenerator.generate` L31-36: a DateTime value that parses is replaced by its ISO 8601 form before the entry
  // lookup, so entry codes are matched against `2024-01-05T00:00:00Z`, not `2024-01-05`.
  text: (value, format) => iosEntryText(walletText(value), format),
  // `OcaClusterGenerator.createClusterWithoutOca`: by the last index, else unordered.
  unmappedOrder: (path) => lastIndex(path) ?? 32767,
  // `OcaClusterGenerator.swift` L155-162: an array attribute with a non-list value is a plain row.
  referenceArrayAsGroup: false,
  // The wallet refuses such a credential (`ImageValidator`); the preview says so.
  hidesClaimsOfUndecodableImage: false,
  // `String+ResolveTemplates.swift`: `CredentialClaim.localizedValue`, formatted as on the details screen.
  templateText: (claim, options) => templateValue(formatClaimValue(claim.value, claim.format, { ...options, platform: 'ios' }), claim),
  // `JSONSerialization` escapes `/`.
  pathText: (path) => JSON.stringify(path).replaceAll('/', '\\/'),
  pickClaim: pickPrefix,
  pickTitle: pickPrefix,
};

/** eidch-android-wallet v1.19.0. */
const ANDROID_RULES: PlatformRules = {
  // `GenerateOcaClaimDisplaysImpl`: `order ?: ocaClaimData?.order ?: -1`.
  unorderedClaim: -1,
  // `CredentialElementCollectionExt.elementComparator`: a negative order sorts last. The sort is stable and the items
  // come from the database in capture base order (claims, then groups), so ties keep that order.
  sortRows: (items) => ({ items: [...items].sort((a, b) => androidOrder(a.order) - androidOrder(b.order)), tie: false }),
  // `JsonNull` is a `JsonPrimitive`: the row is kept with a null value, drawn as `–` (`CredentialElements.kt`).
  listsNull: true,
  // `MapToCredentialClaimClusterImpl.filterEmptyItems`.
  dropsEmptyGroups: true,
  // The unmapped cluster keeps order -1, which `sortByOrder` puts after the sections on every screen.
  unmappedFirstOnDetails: false,
  // `CredentialElements.kt`: a section passes `parentIsSensitive = false`; a nested group passes its flag to everything below.
  groupSensitive: (depth, inherited, own) => {
    const sensitive = depth === 0 ? false : inherited || own;
    return { rows: sensitive, groups: sensitive };
  },
  // `JsonPrimitive.contentOrNull`: JSON booleans stay `true` and `false`.
  text: (value) => String(value),
  // `GenerateOcaDisplaysImpl.generateClusterWithoutOca` passes no order, so every claim gets -1 and keeps payload order.
  unmappedOrder: () => -1,
  // `AttributeType.getReferenceValue` looks into arrays, so `generateElement` takes the reference branch
  // (`GenerateOcaDisplaysImpl.kt` L148-166): the value is used up and a group of the referenced group is built.
  referenceArrayAsGroup: true,
  // `MapToCredentialClaimDataImpl.kt` L72 fails to decode it, and `MapToCredentialClaimClusterImpl.kt` L46 then lists
  // none of the group's claims; its sub-groups stay.
  hidesClaimsOfUndecodableImage: true,
  // `ResolveClaimTemplateImpl.kt` L39-42: the entry label, else the stored value as is, else `–`.
  templateText: (claim) => {
    switch (claim.value.kind) {
      case 'entry':
        return claim.value.label;
      case 'raw':
        return String(claim.value.value);
      case 'null':
        return '–';
      case 'placeholder':
        return `‹${claim.label}›`;
    }
  },
  // kotlinx `Json.encodeToString`, which leaves `/` as is.
  pathText: (path) => JSON.stringify(path),
  pickClaim: (displays, languages, path) => pickAndroid([...withoutEntryOnly(displays), { locale: FALLBACK_LOCALE, name: path }, ...entryOnly(displays)], languages[0]),
  pickTitle: (displays, languages) => pickAndroid(displays, languages[0]),
};

const PLATFORM_RULES: Record<CardPlatform, PlatformRules> = { ios: IOS_RULES, android: ANDROID_RULES };

function androidOrder(order: number): number {
  return order < 0 ? Number.MAX_SAFE_INTEGER : order;
}

export function credentialDetails(project: Project, options: DetailsOptions): CredentialDetails {
  return new DetailsBuilder(project, options).build();
}

/** Stands in for a sample value when the project has no sample. */
class Placeholder {
  readonly type: PrimitiveType;

  constructor(type: PrimitiveType) {
    this.type = type;
  }
}

type OcaType = { kind: 'primitive'; type: PrimitiveType } | { kind: 'reference'; group: Group } | { kind: 'array'; of: OcaType };

/** A child of a group as the wallet reads it from the bundle. */
interface OcaAttribute {
  node: AttributeNode | GroupLink;
  /** The group whose overlays hold the attribute's labels; their templates are relative to it. */
  owner: Group;
  type: OcaType;
  order?: number;
  source?: ClaimsPath;
  format?: string;
  characterEncoding?: string;
}

type Primitive = string | number | boolean | null | Placeholder;

interface RawClaim {
  kind: 'claim';
  path: ClaimsPath;
  order: number;
  value: Primitive;
  /** The attribute the wallet reads labels, entries and the type from. */
  attribute?: AttributeNode;
  format?: string;
  characterEncoding?: string;
  nodeId?: string;
}

interface RawCluster {
  kind: 'group';
  path: ClaimsPath;
  order: number;
  sensitive: boolean;
  labels?: Record<LangTag, string>;
  /** The group the labels belong to (see `OcaAttribute.owner`). */
  owner?: Group;
  nodeId?: string;
  claims: RawClaim[];
  clusters: RawCluster[];
  unmapped?: boolean;
}

interface Display {
  locale: LangTag;
  name?: string;
  /** The entry label for the claim's value. */
  value?: string;
  /** A display for a language that translates the entry but has no label. */
  entryOnly?: boolean;
}

class DetailsBuilder {
  private readonly project: Project;
  private readonly options: DetailsOptions;
  private readonly claims: ClaimIndex;
  private readonly orders: (group: Group) => Readonly<Record<string, number>> | undefined;
  private readonly rules: PlatformRules;
  private orderUndefined = false;
  private undecodableImage = false;
  /** Titles whose templates are filled in once every claim is known. */
  private readonly titles: { group: DetailsGroup; owner: Group }[] = [];

  constructor(project: Project, options: DetailsOptions) {
    this.project = project;
    this.options = options;
    this.rules = PLATFORM_RULES[options.platform];
    const payload = project.sample === undefined ? placeholderPayload(project) : project.sample;
    const claims = isPlainObject(payload)
      ? Object.fromEntries(Object.entries(payload).filter(([key]) => !IOS_TECHNICAL_CLAIMS.includes(key)))
      : {};
    this.claims = new ClaimIndex(claims);
    this.orders = options.orders ?? attributeOrders;
  }

  build(): CredentialDetails {
    const root = this.cluster(this.project.root, undefined, []);
    const sections: RawCluster[] = [];
    this.expand(root, sections);
    const unmapped = this.unmapped();
    // iOS: the offer lists the generated clusters as they are. Saving the credential sorts them by order, which puts
    // the unmapped claims (order -1) first on the details screen.
    if (unmapped) {
      if (this.rules.unmappedFirstOnDetails && (this.options.screen ?? 'details') === 'details') sections.unshift(unmapped);
      else sections.push(unmapped);
    }
    const rendered = sections.map((section) => this.render(section, 0, section.sensitive));
    this.fillTitles(rendered);
    return {
      sections: this.rules.dropsEmptyGroups ? rendered.filter(hasClaims) : rendered,
      noSample: this.project.sample === undefined,
      orderUndefined: this.orderUndefined,
      undecodableImage: this.undecodableImage,
    };
  }

  /**
   * A root with only groups is dropped for its groups, recursively (`expandChildCluster`). Both wallets sort them
   * plainly by order here, so unordered groups (-1) come first.
   */
  private expand(cluster: RawCluster, sections: RawCluster[]): void {
    if (cluster.claims.length || !cluster.clusters.length) {
      sections.push(cluster);
      return;
    }
    const children = this.options.platform === 'ios' ? this.sorted(cluster.clusters).items : [...cluster.clusters].sort((a, b) => a.order - b.order);
    for (const child of children) this.expand(child, sections);
  }

  private attributes(group: Group): OcaAttribute[] {
    const orders = this.orders(group);
    const formats = passthroughOverlay(group, FORMAT_OVERLAY);
    const encodings = passthroughOverlay(group, CHARACTER_ENCODING_OVERLAY);
    return group.children.map((node) => ({
      node,
      owner: group,
      type: node.kind === 'attribute' ? ocaType(node.type) : linkType(node),
      order: orders && Object.hasOwn(orders, node.key) ? orders[node.key] : undefined,
      source: node.source?.length ? node.source : undefined,
      format: overlayString(formats?.attribute_formats, node.key),
      characterEncoding: overlayString(encodings?.attribute_character_encoding, node.key) ?? overlayString(encodings, 'default_character_encoding'),
    }));
  }

  private cluster(group: Group, attribute: OcaAttribute | undefined, path: ClaimsPath): RawCluster {
    const claims: RawClaim[] = [];
    const clusters: RawCluster[] = [];
    for (const child of this.attributes(group)) {
      if (child.source) {
        const element = this.element(child.type, child, resolveNulls(child.source, indices(path)), child.node.id);
        if (element?.kind === 'claim') claims.push(element);
        else if (element) clusters.push(element);
      } else if (child.type.kind === 'reference') {
        // Without a source, a group's claims are found by their own paths.
        clusters.push(this.cluster(child.type.group, child, []));
      }
    }
    return {
      kind: 'group',
      path,
      order: lastIndex(path) ?? attribute?.order ?? UNORDERED_GROUP,
      sensitive: attribute?.node.sensitive ?? false,
      labels: attribute?.node.labels,
      owner: attribute?.owner,
      nodeId: attribute?.node.id,
      claims,
      clusters,
    };
  }

  private element(type: OcaType, attribute: OcaAttribute | undefined, path: ClaimsPath, nodeId: string | undefined): RawClaim | RawCluster | undefined {
    const elementPath = this.elementPath(path, type);
    const element = elementPath ? this.claims.take(elementPath) : undefined;
    switch (type.kind) {
      case 'array': {
        if (elementPath && Array.isArray(element)) return this.arrayCluster(type.of, element, attribute, elementPath);
        const group = referencedGroup(type);
        if (group && this.rules.referenceArrayAsGroup) return this.cluster(group, attribute, path);
        return this.claimFor(element, path, undefined, nodeId);
      }
      case 'reference':
        // Shown even when the payload has nothing at `path`.
        return this.cluster(type.group, attribute, path);
      case 'primitive':
        return this.claimFor(element, path, attribute, nodeId);
    }
  }

  /** A row for a string, number or boolean, and on Android for `null`. Anything else gives no row. */
  private claimFor(element: unknown, path: ClaimsPath, attribute: OcaAttribute | undefined, nodeId: string | undefined): RawClaim | undefined {
    if (!this.isValue(element)) return undefined;
    return {
      kind: 'claim',
      path,
      order: lastIndex(path) ?? attribute?.order ?? this.rules.unorderedClaim,
      value: element,
      attribute: attribute?.node.kind === 'attribute' ? attribute.node : undefined,
      format: attribute?.format,
      characterEncoding: attribute?.characterEncoding,
      nodeId,
    };
  }

  private isValue(value: unknown): value is Primitive {
    return isPrimitive(value) || (value === null && this.rules.listsNull);
  }

  /** `path`, or for an array attribute its `[…, null]` form when that is where the array is. */
  private elementPath(path: ClaimsPath, type: OcaType): ClaimsPath | undefined {
    if (this.claims.has(path)) return path;
    if (type.kind === 'array' && path.at(-1) !== null) {
      const nullPath = [...path, null];
      if (Array.isArray(this.claims.get(nullPath))) return nullPath;
    }
    return undefined;
  }

  /** One row or group per element. Only arrays of plain values get the attribute's labels as a title. */
  private arrayCluster(of: OcaType, array: unknown[], attribute: OcaAttribute | undefined, path: ClaimsPath): RawCluster {
    const parent = path.at(-1) === null ? path.slice(0, -1) : path;
    const claims: RawClaim[] = [];
    const clusters: RawCluster[] = [];
    array.forEach((_, index) => {
      const current: ClaimsPath = of.kind === 'array' ? [...parent, index, null] : [...parent, index];
      const element = this.element(of, hasReference(of) ? attribute : undefined, current, attribute?.node.id);
      if (element?.kind === 'claim') claims.push(element);
      else if (element) clusters.push(element);
    });
    return {
      kind: 'group',
      path,
      order: lastIndex(parent) ?? attribute?.order ?? UNORDERED_GROUP,
      sensitive: attribute?.node.sensitive ?? false,
      labels: hasReference(of) ? undefined : attribute?.node.labels,
      owner: attribute?.owner,
      nodeId: attribute?.node.id,
      claims,
      clusters,
    };
  }

  /** Every value left in the payload that no attribute took, labelled with its path. */
  private unmapped(): RawCluster | undefined {
    const claims: RawClaim[] = [];
    for (const { path, value } of this.claims.rest()) {
      if (this.isValue(value)) claims.push({ kind: 'claim', path, order: this.rules.unmappedOrder(path), value });
    }
    if (!claims.length) return undefined;
    return { kind: 'group', path: [], order: UNORDERED_GROUP, sensitive: false, claims, clusters: [], unmapped: true };
  }

  /**
   * Draws the cluster as the wallet does. iOS (`ClaimClusterList`, `ChildClusterView`): a group's own sensitive flag
   * reaches its sub-groups' rows but not its own, except on a section. Android (`CredentialElements.kt`): a section's
   * flag reaches nothing, a nested group's flag every row below it. Both quirks are copied.
   */
  private render(cluster: RawCluster, depth: number, sensitive: boolean): DetailsGroup {
    const pill = this.rules.groupSensitive(depth, sensitive, cluster.sensitive);
    const { items, tie } = this.sorted<RawClaim | RawCluster>([...cluster.claims, ...cluster.clusters]);
    const title = cluster.labels && this.rules.pickTitle(this.labelDisplays(cluster.labels), this.options.languages)?.name;
    let rows: DetailsRow[] = items.map((item) => (item.kind === 'claim' ? this.renderClaim(item, pill.rows) : this.render(item, depth + 1, pill.groups)));
    if (this.rules.hidesClaimsOfUndecodableImage && rows.some((row) => row.kind === 'claim' && undecodableImage(row))) {
      rows = rows.filter((row) => row.kind === 'group');
      this.undecodableImage = true;
    }
    const group: DetailsGroup = {
      kind: 'group',
      ...(title ? { title } : {}),
      depth,
      // Before empty groups are dropped, as Android's `determineSimpleTypeClusterNodes` runs first.
      valuesOnly: cluster.path.at(-1) === null && !cluster.clusters.length,
      unmapped: cluster.unmapped ?? false,
      orderUndefined: tie,
      path: cluster.path,
      ...(cluster.nodeId ? { nodeId: cluster.nodeId } : {}),
      rows: this.rules.dropsEmptyGroups ? rows.filter((row) => row.kind === 'claim' || hasClaims(row)) : rows,
    };
    if (title?.includes('{{') && cluster.owner) this.titles.push({ group, owner: cluster.owner });
    return group;
  }

  /**
   * Fills the `{{…}}` templates of group titles with claim values. Both wallets first turn each template into a claims
   * path through the Data Source overlay of the group the label belongs to (iOS `AttributeTemplateResolver.swift`,
   * Android `TransformOcaOverlaysImpl.kt`), so a template that names no attribute with a source becomes empty. Then
   * every claim on the screen at that path is listed, with `null` segments taken from the group's own indices, joined
   * by the `.join()` separator or `, ` (iOS `String+ResolveTemplates.swift`, Android `ResolveClaimTemplateImpl.kt`).
   */
  private fillTitles(sections: DetailsGroup[]): void {
    if (!this.titles.length) return;
    const claims: DetailsClaim[] = [];
    const collect = (group: DetailsGroup) => group.rows.forEach((row) => (row.kind === 'claim' ? claims.push(row) : collect(row)));
    sections.forEach(collect);
    const valueOptions = this.options.valueOptions ?? { locale: this.options.languages[0] ?? 'en' };
    for (const { group, owner } of this.titles) {
      const title = group.title!.replace(TEMPLATE, (_, inner: string) => {
        const path = this.templatePath(inner, owner);
        if (!path) return '';
        const target = resolveNulls(path.path, indices(group.path));
        const values = claims.filter((claim) => pointsAt(target, claim.path)).map((claim) => this.rules.templateText(claim, valueOptions));
        return values.join(path.separator);
      });
      if (title) group.title = title;
      else delete group.title;
    }
  }

  /** The claims path a template stands for in the exported bundle, or undefined when the wallet empties it. */
  private templatePath(inner: string, owner: Group): { path: ClaimsPath; separator: string } | undefined {
    const expression = parseExpression(inner);
    const separator = joinSeparator(expression) ?? ', ';
    if (separator.length > MAX_JOIN_SEPARATOR) return undefined;
    const target = resolveEditorPath(this.project.root, owner, expression);
    const source = target?.node.source;
    if (!source?.length) return undefined;
    const index = /\[(\d+|null)\]/.exec(expression.suffix)?.[1];
    if (index === undefined || index === 'null') return { path: source, separator };
    // `[n]` stands for the path's single `null`; with none or several, the template is emptied.
    if (source.filter((segment) => segment === null).length !== 1) return undefined;
    return { path: source.map((segment) => (segment === null ? Number(index) : segment)), separator };
  }

  private renderClaim(claim: RawClaim, sensitive: boolean): DetailsClaim {
    const { attribute } = claim;
    const type = attribute && (isArrayType(attribute.type) ? attribute.type.array : attribute.type);
    const format: ClaimFormat | undefined = type && {
      type,
      ...(attribute.standard ? { standard: attribute.standard } : {}),
      ...(claim.format ? { format: claim.format } : {}),
      ...(claim.characterEncoding ? { characterEncoding: claim.characterEncoding } : {}),
    };
    const text = claim.value instanceof Placeholder || claim.value === null ? undefined : this.rules.text(claim.value, format);
    const path = this.rules.pathText(claim.path);
    const display = attribute
      ? this.rules.pickClaim(this.claimDisplays(attribute, text), this.options.languages, path)
      : this.rules.pickClaim([], this.options.languages, path);
    let value: DetailsValue;
    if (display?.value !== undefined && text !== undefined) value = { kind: 'entry', code: text, label: display.value };
    else if (claim.value instanceof Placeholder) value = { kind: 'placeholder', type: claim.value.type };
    else if (claim.value === null) value = { kind: 'null' };
    else value = { kind: 'raw', value: claim.value };
    return {
      kind: 'claim',
      // A display with only an entry translation has no name, so the label falls back to the path too.
      label: display?.name ?? path,
      value,
      sensitive: sensitive || (attribute?.sensitive ?? false),
      path: claim.path,
      ...(claim.nodeId ? { attributeId: claim.nodeId } : {}),
      ...(format ? { format } : {}),
    };
  }

  /** One display per exported label. The wallet reads them from a dictionary; project language order stands in. */
  private labelDisplays(labels: Record<LangTag, string>): Display[] {
    return this.project.languages.filter((lang) => labels[lang]).map((lang) => ({ locale: lang, name: labels[lang] }));
  }

  /** Label displays with their entry translation, then displays for languages that only translate the entry. */
  private claimDisplays(attribute: AttributeNode, text: string | undefined): Display[] {
    const entry = (lang: LangTag) =>
      text !== undefined && attribute.entries?.codes.includes(text) ? attribute.entries.labels[lang]?.[text] || undefined : undefined;
    const displays: Display[] = this.labelDisplays(attribute.labels).map((display) => ({ ...display, value: entry(display.locale) }));
    if (text === undefined) return displays;
    for (const lang of this.project.languages) {
      const value = entry(lang);
      if (value !== undefined && !attribute.labels[lang]) displays.push({ locale: lang, value, entryOnly: true });
    }
    return displays;
  }

  /** Sorts by order as the platform does; on iOS, ties mean the wallet's order is undefined. */
  private sorted<T extends { order: number }>(items: T[]): { items: T[]; tie: boolean } {
    const sorted = this.rules.sortRows(items);
    if (sorted.tie) this.orderUndefined = true;
    return sorted;
  }
}

const TEMPLATE = /\{\{(.*?)\}\}/g;

/** `pointsAtSetOf(…, enforceLength: true)`: the same length, with `null` matching any index. */
function pointsAt(template: ClaimsPath, path: ClaimsPath): boolean {
  return template.length === path.length && template.every((segment, index) => segment === path[index] || (segment === null && typeof path[index] === 'number'));
}

/** A formatted value as text in a title; an image gives its data, a placeholder the attribute's label. */
function templateValue(value: ReturnType<typeof formatClaimValue>, claim: DetailsClaim): string {
  switch (value.kind) {
    case 'text':
      return value.text;
    case 'image':
      return value.base64;
    case 'invalidImage':
      return '';
    case 'placeholder':
      return `‹${claim.label}›`;
  }
}

/** An image Android accepts but cannot decode for the details screen (Java's basic base64 decoder fails). */
function undecodableImage(claim: DetailsClaim): boolean {
  const value = formatClaimValue(claim.value, claim.format, { locale: 'en', platform: 'android' });
  return value.kind === 'invalidImage' && value.reason === 'invalidData';
}

/** Whether a group holds a claim anywhere below it (`numberOfNonClusterChildren`). */
function hasClaims(group: DetailsGroup): boolean {
  return group.rows.some((row) => row.kind === 'claim' || hasClaims(row));
}

/**
 * Every path in the payload with its value (`createCredentialClaims`): objects below the root, each array at
 * `[…, null]` and at each index, and every leaf. Taking a value removes it, so it is not listed as unmapped.
 */
class ClaimIndex {
  private readonly values = new Map<string, { path: ClaimsPath; value: unknown }>();

  constructor(payload: Record<string, unknown>) {
    this.add(payload, []);
  }

  has(path: ClaimsPath): boolean {
    return this.values.has(pathKey(path));
  }

  get(path: ClaimsPath): unknown {
    return this.values.get(pathKey(path))?.value;
  }

  take(path: ClaimsPath): unknown {
    const value = this.get(path);
    this.values.delete(pathKey(path));
    return value;
  }

  rest(): { path: ClaimsPath; value: unknown }[] {
    return [...this.values.values()];
  }

  private set(path: ClaimsPath, value: unknown): void {
    this.values.set(pathKey(path), { path, value });
  }

  private add(element: unknown, path: ClaimsPath): void {
    if (Array.isArray(element)) {
      this.set([...path, null], element);
      element.forEach((item, index) => {
        this.set([...path, index], item);
        this.add(item, [...path, index]);
      });
    } else if (isPlainObject(element) && !(element instanceof Placeholder)) {
      if (path.length) this.set(path, element);
      for (const [key, value] of Object.entries(element)) this.add(value, [...path, key]);
    } else {
      this.set(path, element);
    }
  }
}

/** A payload with a placeholder wherever an attribute's source points, one element per array. */
function placeholderPayload(project: Project): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const { node } of walkNodes(project.root)) {
    if (node.kind !== 'attribute' || !node.source.length) continue;
    if (!isArrayType(node.type)) place(payload, node.source, new Placeholder(node.type));
    else if (node.source.at(-1) === null) place(payload, node.source, new Placeholder(node.type.array));
    else place(payload, node.source, [new Placeholder(node.type.array)]);
  }
  return payload;
}

/** Sets `value` at `path`, with `null` as index 0, unless something else is already in the way. */
function place(payload: Record<string, unknown>, path: ClaimsPath, value: unknown): void {
  let container: unknown = payload;
  for (const [position, raw] of path.entries()) {
    const segment = raw ?? 0;
    const last = position === path.length - 1;
    const next = last ? value : typeof (path[position + 1] ?? 0) === 'string' ? {} : [];
    if (typeof segment === 'string') {
      if (!isPlainObject(container) || container instanceof Placeholder) return;
      container[segment] ??= next;
      container = container[segment];
    } else {
      if (!Array.isArray(container) || segment > container.length) return;
      container[segment] ??= next;
      container = container[segment];
    }
  }
}

function ocaType(type: AttrType): OcaType {
  return isArrayType(type) ? { kind: 'array', of: { kind: 'primitive', type: type.array } } : { kind: 'primitive', type };
}

function linkType(link: GroupLink): OcaType {
  const reference: OcaType = { kind: 'reference', group: link.group };
  return link.array ? { kind: 'array', of: reference } : reference;
}

function hasReference(type: OcaType): boolean {
  return referencedGroup(type) !== undefined;
}

/** The group a `refs:` type, or a list of them, points at. */
function referencedGroup(type: OcaType): Group | undefined {
  if (type.kind === 'reference') return type.group;
  return type.kind === 'array' ? referencedGroup(type.of) : undefined;
}

function isPrimitive(value: unknown): value is Primitive {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Placeholder;
}

const FORMAT_OVERLAY = 'spec/overlays/format/1.0';
const CHARACTER_ENCODING_OVERLAY = 'spec/overlays/character_encoding/1.0';

/** The group's first overlay of `type`; the wallet reads only the first (`OverlayBundleAttributesGenerator`). */
function passthroughOverlay(group: Group, type: string): Record<string, unknown> | undefined {
  return group.passthrough.find((overlay) => overlay.type === type);
}

function overlayString(record: unknown, key: string): string | undefined {
  const value = isPlainObject(record) ? record[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** iOS: the first display whose language starts with a preferred code, else the first display's language (`findDisplaysWithFallback`). */
function pickPrefix(displays: Display[], codes: readonly string[]): Display | undefined {
  for (const code of codes) {
    const match = displays.find((display) => display.locale.startsWith(code));
    if (match) return match;
  }
  const first = displays[0];
  return first && displays.find((display) => display.locale.startsWith(first.locale));
}

/** The locale of the display Android adds to every claim, labelled with the path (`DisplayLanguage.FALLBACK`). */
const FALLBACK_LOCALE = 'fallback';

/** `DisplayLanguage.PRIORITIES`: matched as whole locales, so `de-CH` is not `de`. */
const ANDROID_PRIORITIES = ['de', 'en', 'x-unknown', 'x-fallback'];

/** A claim's displays as Android lists them: label displays, then its path fallback, then entry-only displays. */
function withoutEntryOnly(displays: Display[]): Display[] {
  return displays.filter((display) => !display.entryOnly);
}

function entryOnly(displays: Display[]): Display[] {
  return displays.filter((display) => display.entryOnly);
}

/**
 * `GetLocalizedDisplayImpl`: the display for the app locale, else the first in its language, else `de`, `en`, then
 * the fallback (the path), else the first. `de` and `en` must match exactly, so with labels only in `de-CH` and
 * `fr-CH` an Italian or English phone shows the path, not a label.
 */
function pickAndroid(displays: Display[], appLocale = ANDROID_DEFAULT_LOCALE): Display | undefined {
  const locale = (tag: string) => (tag === FALLBACK_LOCALE ? 'x-fallback' : tag === 'unknown' ? 'x-unknown' : tag.replaceAll('_', '-').toLowerCase());
  const app = locale(appLocale);
  const exact = displays.find((display) => locale(display.locale) === app);
  if (exact) return exact;
  const sameLanguage = displays.find((display) => languageOf(locale(display.locale)) === languageOf(app));
  if (sameLanguage) return sameLanguage;
  const rank = (display: Display) => {
    const index = ANDROID_PRIORITIES.indexOf(locale(display.locale));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return displays.reduce<Display | undefined>((best, display) => (best === undefined || rank(display) < rank(best) ? display : best), undefined);
}

/** The language of a tag; private-use tags (`x-…`) have none. */
function languageOf(tag: string): string {
  const language = tag.split(/[-_]/)[0].toLowerCase();
  return language === 'x' ? '' : language;
}

/** Array indices in `path`, in order (`allIndices`). */
function indices(path: ClaimsPath): number[] {
  return path.filter((segment): segment is number => typeof segment === 'number');
}

/** Fills `null` segments with `values`, in order, while there are values left (`resolveNullElement`). */
function resolveNulls(path: ClaimsPath, values: number[]): ClaimsPath {
  let next = 0;
  return path.map((segment) => (segment === null && next < values.length ? values[next++] : segment));
}

function lastIndex(path: ClaimsPath): number | undefined {
  const last = path.at(-1);
  return typeof last === 'number' ? last : undefined;
}

function pathKey(path: ClaimsPath): string {
  return JSON.stringify(path);
}
