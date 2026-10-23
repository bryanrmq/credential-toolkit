/**
 * The wallet's credential details screen (the claims list), built from the project and its sample credential. Pure
 * data: the iOS and Android previews only draw it.
 *
 * Ported from swiyu-admin-ch/eidch-ios-wallet v1.19.0 (commit 42e746c): `OcaClusterGenerator.swift`,
 * `OcaClaimGenerator.swift`, `CredentialClaim.swift`, `CredentialClaimCluster.swift`, `ClaimClusterList.swift`,
 * `ChildClusterView.swift`, `CredentialClaimViewModel.swift`, `DisplayLocalizable.swift` and
 * `CredentialRenderingEntity+Init.swift`. Wallet quirks are copied rather than fixed, so issuers see what holders see.
 * Earlier wallets (v1.14.0 and before) only read Data Source 1.0 overlays and match nothing in the 2.0 overlays this
 * tool exports. Android rules are not in yet, so both platforms get the iOS model for now.
 *
 * Nested paths: the wallet matches each attribute's claims path against every path in the whole payload, not only
 * top-level disclosures, so `["address", "street"]` finds `address.street`. A `refs:` group whose own source is missing
 * from the payload still shows its title, with no rows when none of its claims are found.
 */

import { attributeOrders } from '../export/bundle';
import { isPlainObject } from '../import/report';
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
} from '../model';
import type { CardPlatform } from './profiles';
import { walletText } from './values';

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

export interface DetailsOptions {
  /** Language codes in order of preference, matched as prefixes of the label languages; see `iosLanguageCodes`. */
  languages: readonly string[];
  platform: CardPlatform;
  /** Defaults to `details`, the screen of an accepted credential. */
  screen?: DetailsScreen;
  /** Each group's Order overlay, or undefined when it has none. Defaults to the one the export writes. */
  orders?: (group: Group) => Readonly<Record<string, number>> | undefined;
}

export interface CredentialDetails {
  /** Top-level sections, each drawn as a titled card. */
  sections: DetailsGroup[];
  /** The project has no sample, so the values are type placeholders. The wallet never shows rows without values. */
  noSample: boolean;
  /** Somewhere the wallet's order is undefined, as it comes from a Swift dictionary (see `DetailsGroup.orderUndefined`). */
  orderUndefined: boolean;
}

export type DetailsRow = DetailsClaim | DetailsGroup;

export interface DetailsGroup {
  kind: 'group';
  /** The label of the `refs:` or array attribute in the chosen language. Templates in it are not resolved yet. */
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
  /** Whether iOS draws the "Sensitive" pill; values are never masked. */
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
 * A raw sample value still to be formatted; the entry label that replaces an entry code; or, without a sample, the
 * attribute's type. iOS turns JSON booleans into `1` and `0`, as they reach it as NSNumber and are cast to Int first
 * (`JsonPrimitive`).
 */
export type DetailsValue =
  | { kind: 'raw'; value: string | number | boolean }
  | { kind: 'entry'; code: string; label: string }
  | { kind: 'placeholder'; type: PrimitiveType };

/** `Int(Int16.max)`: the order of a claim whose attribute has none. */
const UNORDERED_CLAIM = 32767;
/** The order of a group whose attribute has none, so unordered groups come first. */
const UNORDERED_GROUP = -1;

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
  type: OcaType;
  order?: number;
  source?: ClaimsPath;
  format?: string;
  characterEncoding?: string;
}

type Primitive = string | number | boolean | Placeholder;

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
}

class DetailsBuilder {
  private readonly project: Project;
  private readonly options: DetailsOptions;
  private readonly claims: ClaimIndex;
  private readonly orders: (group: Group) => Readonly<Record<string, number>> | undefined;
  private orderUndefined = false;

  constructor(project: Project, options: DetailsOptions) {
    this.project = project;
    this.options = options;
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
    // The offer lists the generated clusters as they are. Saving the credential sorts them by order, which puts
    // the unmapped claims (order -1) first on the details screen.
    if (unmapped) {
      if ((this.options.screen ?? 'details') === 'details') sections.unshift(unmapped);
      else sections.push(unmapped);
    }
    return {
      sections: sections.map((section) => this.render(section, 0, section.sensitive)),
      noSample: this.project.sample === undefined,
      orderUndefined: this.orderUndefined,
    };
  }

  /** A root with only groups is dropped for its groups, recursively (`expandChildCluster`). */
  private expand(cluster: RawCluster, sections: RawCluster[]): void {
    if (cluster.claims.length || !cluster.clusters.length) {
      sections.push(cluster);
      return;
    }
    for (const child of this.sorted(cluster.clusters).items) this.expand(child, sections);
  }

  private attributes(group: Group): OcaAttribute[] {
    const orders = this.orders(group);
    const formats = passthroughOverlay(group, FORMAT_OVERLAY);
    const encodings = passthroughOverlay(group, CHARACTER_ENCODING_OVERLAY);
    return group.children.map((node) => ({
      node,
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
      nodeId: attribute?.node.id,
      claims,
      clusters,
    };
  }

  private element(type: OcaType, attribute: OcaAttribute | undefined, path: ClaimsPath, nodeId: string | undefined): RawClaim | RawCluster | undefined {
    const elementPath = this.elementPath(path, type);
    const element = elementPath ? this.claims.take(elementPath) : undefined;
    switch (type.kind) {
      case 'array':
        if (elementPath && Array.isArray(element)) return this.arrayCluster(type.of, element, attribute, elementPath);
        return claimFor(element, path, undefined, nodeId);
      case 'reference':
        // Shown even when the payload has nothing at `path`.
        return this.cluster(type.group, attribute, path);
      case 'primitive':
        return claimFor(element, path, attribute, nodeId);
    }
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
      nodeId: attribute?.node.id,
      claims,
      clusters,
    };
  }

  /** Every value left in the payload that no attribute took, labelled with its path. */
  private unmapped(): RawCluster | undefined {
    const claims: RawClaim[] = [];
    for (const { path, value } of this.claims.rest()) {
      if (isPrimitive(value)) claims.push({ kind: 'claim', path, order: lastIndex(path) ?? UNORDERED_CLAIM, value });
    }
    if (!claims.length) return undefined;
    return { kind: 'group', path: [], order: UNORDERED_GROUP, sensitive: false, claims, clusters: [], unmapped: true };
  }

  /**
   * Draws the cluster as `ClaimClusterList` and `ChildClusterView` do. The pill quirk is copied: a group's own
   * sensitive flag reaches its sub-groups' rows but not its own, except on a section.
   */
  private render(cluster: RawCluster, depth: number, sensitive: boolean): DetailsGroup {
    const childSensitive = depth === 0 ? sensitive : sensitive || cluster.sensitive;
    const { items, tie } = this.sorted<RawClaim | RawCluster>([...cluster.claims, ...cluster.clusters]);
    const title = cluster.labels && pickDisplay(this.labelDisplays(cluster.labels), this.options.languages)?.name;
    return {
      kind: 'group',
      ...(title ? { title } : {}),
      depth,
      valuesOnly: cluster.path.at(-1) === null && !cluster.clusters.length,
      unmapped: cluster.unmapped ?? false,
      orderUndefined: tie,
      path: cluster.path,
      ...(cluster.nodeId ? { nodeId: cluster.nodeId } : {}),
      rows: items.map((item) =>
        item.kind === 'claim' ? this.renderClaim(item, sensitive) : this.render(item, depth + 1, childSensitive),
      ),
    };
  }

  private renderClaim(claim: RawClaim, sensitive: boolean): DetailsClaim {
    const { attribute } = claim;
    const text = claim.value instanceof Placeholder ? undefined : walletText(claim.value);
    const display = attribute ? pickDisplay(this.claimDisplays(attribute, text), this.options.languages) : undefined;
    let value: DetailsValue;
    if (display?.value !== undefined && text !== undefined) value = { kind: 'entry', code: text, label: display.value };
    else if (claim.value instanceof Placeholder) value = { kind: 'placeholder', type: claim.value.type };
    else value = { kind: 'raw', value: claim.value };
    const type = attribute && (isArrayType(attribute.type) ? attribute.type.array : attribute.type);
    const format: ClaimFormat | undefined = type && {
      type,
      ...(attribute.standard ? { standard: attribute.standard } : {}),
      ...(claim.format ? { format: claim.format } : {}),
      ...(claim.characterEncoding ? { characterEncoding: claim.characterEncoding } : {}),
    };
    return {
      kind: 'claim',
      // A display with only an entry translation has no name, so the label falls back to the path too.
      label: display?.name ?? pathText(claim.path),
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
      if (value !== undefined && !attribute.labels[lang]) displays.push({ locale: lang, value });
    }
    return displays;
  }

  /** Stable sort by order, as Swift's `sorted`; ties mean the wallet's order is undefined. */
  private sorted<T extends { order: number }>(items: T[]): { items: T[]; tie: boolean } {
    const tie = new Set(items.map((item) => item.order)).size < items.length;
    if (tie) this.orderUndefined = true;
    return { items: [...items].sort((a, b) => a.order - b.order), tie };
  }
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

/** A row for a string, number or boolean. Anything else, `null` included, gives no row. */
function claimFor(element: unknown, path: ClaimsPath, attribute: OcaAttribute | undefined, nodeId: string | undefined): RawClaim | undefined {
  if (!isPrimitive(element)) return undefined;
  return {
    kind: 'claim',
    path,
    order: lastIndex(path) ?? attribute?.order ?? UNORDERED_CLAIM,
    value: element,
    attribute: attribute?.node.kind === 'attribute' ? attribute.node : undefined,
    format: attribute?.format,
    characterEncoding: attribute?.characterEncoding,
    nodeId,
  };
}

function ocaType(type: AttrType): OcaType {
  return isArrayType(type) ? { kind: 'array', of: { kind: 'primitive', type: type.array } } : { kind: 'primitive', type };
}

function linkType(link: GroupLink): OcaType {
  const reference: OcaType = { kind: 'reference', group: link.group };
  return link.array ? { kind: 'array', of: reference } : reference;
}

function hasReference(type: OcaType): boolean {
  return type.kind === 'reference' || (type.kind === 'array' && hasReference(type.of));
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

/** The first display whose language starts with a preferred code, else the first display's language (`findDisplaysWithFallback`). */
function pickDisplay(displays: Display[], codes: readonly string[]): Display | undefined {
  for (const code of codes) {
    const match = displays.find((display) => display.locale.startsWith(code));
    if (match) return match;
  }
  const first = displays[0];
  return first && displays.find((display) => display.locale.startsWith(first.locale));
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

/** The path as the wallet writes it for a row without a label: JSON from `JSONSerialization`, which escapes `/`. */
function pathText(path: ClaimsPath): string {
  return JSON.stringify(path).replaceAll('/', '\\/');
}
