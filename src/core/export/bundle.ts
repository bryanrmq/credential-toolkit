import canonicalize from 'canonicalize';
import { cesrDigest } from '../cesr';
import {
  DATA_SOURCE_FORMAT,
  type Branding,
  type Group,
  type LangTag,
  type Project,
  typeToString,
  walkGroups,
  walkNodes,
} from '../model';
import { toSpecTemplate } from '../templates';

export const CAPTURE_BASE_TYPE = 'spec/capture_base/1.0';

export const OVERLAY_TYPES = {
  meta: 'spec/overlays/meta/1.0',
  branding: 'aries/overlays/branding/1.1',
  label: 'spec/overlays/label/1.1',
  labelV1: 'spec/overlays/label/1.0',
  order: 'extend/overlays/order/1.0',
  dataSource: 'extend/overlays/data_source/2.0',
  dataSourceV1: 'extend/overlays/data_source/1.0',
  standard: 'spec/overlays/standard/1.0',
  sensitive: 'spec/overlays/sensitive/1.0',
  entryCode: 'spec/overlays/entry_code/1.0',
  entry: 'spec/overlays/entry/1.0',
} as const;

export interface CaptureBaseJson {
  type: string;
  digest: string;
  attributes: Record<string, string>;
}

export type OverlayJson = { type: string; capture_base: string } & Record<string, unknown>;

export interface BundleJson {
  capture_bases: CaptureBaseJson[];
  overlays: OverlayJson[];
  [extra: string]: unknown;
}

export interface BuiltBundle {
  bundle: BundleJson;
  /** Group id → digest */
  digests: Map<string, string>;
}

export function captureBaseAttributes(group: Group, childRef: (child: Group) => string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const child of group.children) {
    if (child.kind === 'attribute') attributes[child.key] = typeToString(child.type);
    else attributes[child.key] = child.array ? `Array[refs:${childRef(child.group)}]` : `refs:${childRef(child.group)}`;
  }
  return attributes;
}

/**
 * Synchronous stand-in for the digest: equal signatures mean equal digests. Canonicalised like the
 * digest itself, so attribute order does not matter.
 */
export function structuralSignature(group: Group): string {
  return canonicalize(captureBaseAttributes(group, structuralSignature)) ?? '';
}

/** Digests for every group, children before parents. */
export async function computeDigests(root: Group): Promise<Map<string, string>> {
  const digests = new Map<string, string>();
  const visit = async (group: Group): Promise<string> => {
    for (const child of group.children) if (child.kind === 'group') await visit(child.group);
    const attributes = captureBaseAttributes(group, (child) => digests.get(child.id)!);
    const digest = await cesrDigest({ type: CAPTURE_BASE_TYPE, digest: '', attributes });
    digests.set(group.id, digest);
    return digest;
  };
  await visit(root);
  return digests;
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function brandingOverlay(
  base: { type: string; capture_base: string },
  lang: LangTag,
  theme: 'light' | 'dark',
  branding: Branding,
  template: (text: string) => string,
): OverlayJson | null {
  const overlay: OverlayJson = { ...base, language: lang, theme };
  if (nonEmpty(branding.logo)) overlay.logo = branding.logo;
  if (nonEmpty(branding.primaryBackgroundColor)) overlay.primary_background_color = branding.primaryBackgroundColor;
  if (nonEmpty(branding.primaryField)) overlay.primary_field = template(branding.primaryField);
  if (nonEmpty(branding.secondaryField)) overlay.secondary_field = template(branding.secondaryField);
  return Object.keys(overlay).length > 4 ? overlay : null;
}

/** Overlays for one group, in the fixed order of the design spec §5.2. */
export function groupOverlays(project: Project, group: Group, digests: Map<string, string>): OverlayJson[] {
  const capture_base = digests.get(group.id)!;
  const isRoot = group === project.root;
  const template = (text: string) =>
    toSpecTemplate(text, project.root, group, (target) => digests.get(target.id)!);
  const overlays: OverlayJson[] = [];
  const base = (type: string) => ({ type, capture_base });
  const children = group.children;
  const attributes = children.flatMap((child) => (child.kind === 'attribute' ? [child] : []));

  if (isRoot) {
    for (const lang of project.languages) {
      const meta = project.meta[lang];
      if (!meta || (!meta.name && !meta.description)) continue;
      const overlay: OverlayJson = { ...base(OVERLAY_TYPES.meta), language: lang };
      if (meta.name) overlay.name = meta.name;
      if (meta.description) overlay.description = meta.description;
      overlays.push(overlay);
    }
    for (const lang of project.languages) {
      const pair = project.branding[lang];
      if (!pair) continue;
      const light = brandingOverlay(base(OVERLAY_TYPES.branding), lang, 'light', pair.light, template);
      if (light) overlays.push(light);
      if (pair.dark) {
        const dark = brandingOverlay(base(OVERLAY_TYPES.branding), lang, 'dark', pair.dark, template);
        if (dark) overlays.push(dark);
      }
    }
  }

  for (const lang of project.languages) {
    const attribute_labels: Record<string, string> = {};
    for (const child of children) if (nonEmpty(child.labels[lang])) attribute_labels[child.key] = template(child.labels[lang]);
    if (Object.keys(attribute_labels).length) overlays.push({ ...base(OVERLAY_TYPES.label), language: lang, attribute_labels });
  }

  if (children.length) {
    const attribute_orders = Object.fromEntries(children.map((child, index) => [child.key, index + 1]));
    overlays.push({ ...base(OVERLAY_TYPES.order), attribute_orders });
  }

  const attribute_sources: Record<string, unknown> = {};
  for (const child of children) {
    const source = child.source;
    if (source && source.length) attribute_sources[child.key] = source;
  }
  if (Object.keys(attribute_sources).length) {
    overlays.push({ ...base(OVERLAY_TYPES.dataSource), format: DATA_SOURCE_FORMAT, attribute_sources });
  }

  const attr_standards: Record<string, string> = {};
  for (const attribute of attributes) if (nonEmpty(attribute.standard)) attr_standards[attribute.key] = attribute.standard;
  if (Object.keys(attr_standards).length) overlays.push({ ...base(OVERLAY_TYPES.standard), attr_standards });

  const sensitive = children.filter((child) => child.sensitive).map((child) => child.key);
  if (sensitive.length) overlays.push({ ...base(OVERLAY_TYPES.sensitive), attributes: sensitive });

  const withEntries = attributes.filter((attribute) => attribute.entries && attribute.entries.codes.length);
  if (withEntries.length) {
    const attribute_entry_codes = Object.fromEntries(withEntries.map((attribute) => [attribute.key, attribute.entries!.codes]));
    overlays.push({ ...base(OVERLAY_TYPES.entryCode), attribute_entry_codes });
    for (const lang of project.languages) {
      const attribute_entries: Record<string, Record<string, string>> = {};
      for (const attribute of withEntries) {
        const labels = attribute.entries!.labels[lang] ?? {};
        const filled = Object.fromEntries(
          attribute.entries!.codes.filter((code) => nonEmpty(labels[code])).map((code) => [code, labels[code]]),
        );
        if (Object.keys(filled).length) attribute_entries[attribute.key] = filled;
      }
      if (Object.keys(attribute_entries).length) overlays.push({ ...base(OVERLAY_TYPES.entry), language: lang, attribute_entries });
    }
  }

  for (const passthrough of group.passthrough) {
    overlays.push({ ...(passthrough as OverlayJson), capture_base });
  }
  return overlays;
}

function withoutCaptureBase(overlays: OverlayJson[]): string {
  return JSON.stringify(overlays.map(({ capture_base: _ignored, ...rest }) => rest));
}

/**
 * Project → bundle object. Identical groups with identical overlays are emitted once; identical
 * groups with different overlays would give one capture base two conflicting overlay sets, so
 * building fails (the validator reports the same case as `digest-collision`).
 */
export async function buildBundle(project: Project): Promise<BuiltBundle> {
  const digests = await computeDigests(project.root);
  const capture_bases: CaptureBaseJson[] = [];
  const overlays: OverlayJson[] = [];
  const emitted = new Map<string, { fingerprint: string; groupId: string }>();
  const linkKeys = new Map<string, string>();
  for (const { node } of walkNodes(project.root)) if (node.kind === 'group') linkKeys.set(node.group.id, node.key);

  for (const group of walkGroups(project.root)) {
    const digest = digests.get(group.id)!;
    const groupOverlayList = groupOverlays(project, group, digests);
    const fingerprint = withoutCaptureBase(groupOverlayList);
    const first = emitted.get(digest);
    if (first) {
      if (first.fingerprint === fingerprint) continue;
      throw new Error(
        `"${linkKeys.get(first.groupId) ?? 'root'}" and "${linkKeys.get(group.id) ?? 'root'}" have the same keys and types, so they would share one digest, but their labels, order or sources differ. Rename a key in one of them.`,
      );
    }
    emitted.set(digest, { fingerprint, groupId: group.id });
    capture_bases.push({
      type: CAPTURE_BASE_TYPE,
      digest,
      attributes: captureBaseAttributes(group, (child) => digests.get(child.id)!),
    });
    overlays.push(...groupOverlayList);
  }

  const extras = Object.fromEntries(
    Object.entries(project.bundleExtras).filter(([key]) => key !== 'capture_bases' && key !== 'overlays'),
  );
  return { bundle: { ...extras, capture_bases, overlays }, digests };
}

export function serializeBundle(bundle: BundleJson): string {
  return JSON.stringify(bundle, null, 2);
}
