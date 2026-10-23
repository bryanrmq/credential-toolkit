/**
 * Where the other wallet would show the credential details differently: order, labels, values, the Sensitive pill,
 * and rows or groups only one of them lists. Both screens are built from the same project and device languages and
 * compared row by row (matched by claims path), so every difference names the row it is about.
 */

import { otherPlatform } from './differences.ts';
import {
  type CredentialDetails,
  type DetailsClaim,
  type DetailsGroup,
  type DetailsOptions,
  type DetailsRow,
  type DetailsScreen,
  androidAppLocale,
  credentialDetails,
  iosLanguageCodes,
} from './details.ts';
import type { CardPlatform } from './profiles.ts';
import { type FormattedValue, type ValueOptions, formatClaim, walletLocale } from './values.ts';
import type { Project } from '../model.ts';

/** What a device set to these languages uses on each platform: label languages and value formatting. */
export interface DetailsDevice {
  languages: string[];
  valueOptions: ValueOptions;
}

export function detailsDevice(platform: CardPlatform, deviceLanguages: readonly string[], timeZone?: string): DetailsDevice {
  const zone = timeZone === undefined ? {} : { timeZone };
  if (platform === 'ios') return { languages: iosLanguageCodes(deviceLanguages), valueOptions: { locale: walletLocale(deviceLanguages), ...zone } };
  const locale = androidAppLocale(deviceLanguages);
  return { languages: [locale], valueOptions: { locale, platform: 'android', ...zone } };
}

/** Every variant describes the other platform; `label` and `title` are as the current platform shows them. */
export type DetailsDifference =
  | { kind: 'order' }
  /** iOS lists rows that share an order value in an undefined order. */
  | { kind: 'orderUndefined' }
  | { kind: 'unmapped'; first: boolean }
  | { kind: 'label'; label: string; other: string }
  | { kind: 'value'; label: string; value: FormattedValue }
  | { kind: 'sensitive'; label: string; shown: boolean }
  /**
   * A row only one platform lists (Android keeps null values, and leaves out the rows next to an image it cannot
   * decode). `shown`: the other platform lists it. `empty`: the row that is listed has a null value.
   */
  | { kind: 'row'; label: string; shown: boolean; empty: boolean }
  /** A group only one platform shows (Android drops groups without claims). `empty`: the group shown has no claims. */
  | { kind: 'group'; title?: string; shown: boolean; empty: boolean }
  | { kind: 'title'; title: string; other: string };

export interface DetailsDifferenceOptions {
  deviceLanguages: readonly string[];
  /** The device's IANA time zone. Defaults to the browser's. */
  timeZone?: string;
  screen?: DetailsScreen;
  /** As in `DetailsOptions`; defaults to the Order overlay the export writes. */
  orders?: DetailsOptions['orders'];
}

interface Entry<T> {
  row: T;
  /** Inside the section of claims without an attribute. */
  unmapped: boolean;
}

interface Flat {
  order: string[];
  claims: Map<string, Entry<DetailsClaim>>;
  groups: Map<string, Entry<DetailsGroup>>;
}

export function detailsDifferences(project: Project, current: CardPlatform, options: DetailsDifferenceOptions): DetailsDifference[] {
  const other = otherPlatform(current);
  const build = (platform: CardPlatform) => {
    const device = detailsDevice(platform, options.deviceLanguages, options.timeZone);
    const details = credentialDetails(project, {
      languages: device.languages,
      platform,
      valueOptions: device.valueOptions,
      ...(options.screen ? { screen: options.screen } : {}),
      ...(options.orders ? { orders: options.orders } : {}),
    });
    return { details, flat: flatten(details), valueOptions: device.valueOptions };
  };
  const here = build(current);
  const there = build(other);
  const differences: DetailsDifference[] = [];

  // The order of what both list, leaving the claims without an attribute to their own difference.
  const shared = (flat: Flat, otherFlat: Flat) => flat.order.filter((key) => entry(otherFlat, key) && !entry(flat, key)?.unmapped);
  if (shared(here.flat, there.flat).join('\n') !== shared(there.flat, here.flat).join('\n')) differences.push({ kind: 'order' });
  if (other === 'ios' && there.details.orderUndefined) differences.push({ kind: 'orderUndefined' });

  const unmappedIndex = (details: CredentialDetails) => details.sections.findIndex((section) => section.unmapped);
  const hereUnmapped = unmappedIndex(here.details);
  const thereUnmapped = unmappedIndex(there.details);
  if (hereUnmapped !== -1 && thereUnmapped !== -1 && there.details.sections.length > 1 && (hereUnmapped === 0) !== (thereUnmapped === 0)) {
    differences.push({ kind: 'unmapped', first: thereUnmapped === 0 });
  }

  for (const [key, { row: groupHere }] of here.flat.groups) {
    const groupThere = there.flat.groups.get(key)?.row;
    if (!groupThere) differences.push({ kind: 'group', ...titled(groupHere.title), shown: false, empty: !hasClaim(groupHere) });
    else if (groupHere.title && groupThere.title && groupHere.title !== groupThere.title) differences.push({ kind: 'title', title: groupHere.title, other: groupThere.title });
  }
  for (const [key, { row: groupThere }] of there.flat.groups) {
    if (!here.flat.groups.has(key)) differences.push({ kind: 'group', ...titled(groupThere.title), shown: true, empty: !hasClaim(groupThere) });
  }

  for (const [key, { row: claimHere }] of here.flat.claims) {
    const claimThere = there.flat.claims.get(key)?.row;
    if (!claimThere) {
      differences.push({ kind: 'row', label: claimHere.label, shown: false, empty: claimHere.value.kind === 'null' });
      continue;
    }
    if (claimHere.label !== claimThere.label) differences.push({ kind: 'label', label: claimHere.label, other: claimThere.label });
    const valueHere = formatClaim(claimHere, here.valueOptions);
    const valueThere = formatClaim(claimThere, there.valueOptions);
    if (!sameValue(valueHere, valueThere)) differences.push({ kind: 'value', label: claimHere.label, value: valueThere });
    if (claimHere.sensitive !== claimThere.sensitive) differences.push({ kind: 'sensitive', label: claimHere.label, shown: claimThere.sensitive });
  }
  for (const [key, { row: claimThere }] of there.flat.claims) {
    if (!here.flat.claims.has(key)) differences.push({ kind: 'row', label: claimThere.label, shown: true, empty: claimThere.value.kind === 'null' });
  }
  return differences;
}

function entry(flat: Flat, key: string): Entry<DetailsRow> | undefined {
  return flat.claims.get(key) ?? flat.groups.get(key);
}

function hasClaim(group: DetailsGroup): boolean {
  return group.rows.some((row) => row.kind === 'claim' || hasClaim(row));
}

function titled(title: string | undefined): { title?: string } {
  return title ? { title } : {};
}

function sameValue(a: FormattedValue, b: FormattedValue): boolean {
  if (a.kind === 'image' && b.kind === 'image') return a.base64 === b.base64 && a.mediaType === b.mediaType;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Rows and groups in the order they are drawn, keyed by claims path (groups also by their node). */
function flatten(details: CredentialDetails): Flat {
  const flat: Flat = { order: [], claims: new Map(), groups: new Map() };
  const visit = (group: DetailsGroup, unmapped: boolean) => {
    const key = groupKey(group);
    flat.order.push(key);
    flat.groups.set(key, { row: group, unmapped });
    for (const row of group.rows) {
      if (row.kind === 'group') {
        visit(row, unmapped);
        continue;
      }
      const claimKey = JSON.stringify(row.path);
      flat.order.push(claimKey);
      flat.claims.set(claimKey, { row, unmapped });
    }
  };
  for (const section of details.sections) visit(section, section.unmapped);
  return flat;
}

function groupKey(group: DetailsGroup): string {
  return `group ${JSON.stringify(group.path)} ${group.nodeId ?? ''} ${group.unmapped ? 'unmapped' : ''}`;
}
