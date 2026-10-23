import { OVERLAY_TYPES, computeDigests } from '../export/bundle.ts';
import {
  type BrandingPair,
  type ClaimsPath,
  type Group,
  type LangTag,
  type Node,
  type Project,
  emptyGroup,
  emptyProject,
  ensureLanguageSlots,
  newAttribute,
  newGroupLink,
  parseTypeString,
  walkGroups,
} from '../model.ts';
import { toEditorTemplate } from '../templates.ts';
import { ImportError, type ImportResult, type ReportNote, isPlainObject } from './report.ts';

interface RawCaptureBase {
  digest: string;
  attributes: Record<string, string>;
}

type RawOverlay = Record<string, unknown> & { type: string; capture_base: string };

type ParsedAttribute =
  | { kind: 'value'; key: string; type: NonNullable<ReturnType<typeof parseTypeString>> }
  | { kind: 'ref'; key: string; digest: string; array: boolean };

const REF = /^refs:(.+)$/;
const ARRAY_REF = /^Array\[refs:(.+)\]$/;

function normaliseDigest(digest: string): string {
  return digest.replace(/\+/g, '-').replace(/\//g, '_');
}

function parseAttribute(key: string, value: string, digest: string): ParsedAttribute {
  const arrayRef = ARRAY_REF.exec(value);
  if (arrayRef) return { kind: 'ref', key, digest: arrayRef[1], array: true };
  const ref = REF.exec(value);
  if (ref) return { kind: 'ref', key, digest: ref[1], array: false };
  const type = parseTypeString(value);
  if (!type) throw new ImportError(`Capture base ${digest} has attribute "${key}" with unsupported type "${value}".`);
  return { kind: 'value', key, type };
}

function readShape(input: unknown): { captureBases: RawCaptureBase[]; overlays: RawOverlay[]; extras: Record<string, unknown> } {
  if (!isPlainObject(input)) throw new ImportError('An OCA bundle must be a JSON object.');
  const { capture_bases, overlays = [], ...extras } = input;
  if (!Array.isArray(capture_bases) || capture_bases.length === 0) {
    throw new ImportError('The bundle has no "capture_bases" array.');
  }
  if (!Array.isArray(overlays)) throw new ImportError('"overlays" must be an array.');
  const captureBases = capture_bases.map((value, index) => {
    if (!isPlainObject(value) || typeof value.digest !== 'string' || !isPlainObject(value.attributes)) {
      throw new ImportError(`Capture base #${index + 1} needs a "digest" string and an "attributes" object.`);
    }
    for (const [key, type] of Object.entries(value.attributes)) {
      if (typeof type !== 'string') throw new ImportError(`Attribute "${key}" in capture base #${index + 1} must have a string type.`);
    }
    return { digest: value.digest, attributes: value.attributes as Record<string, string> };
  });
  const parsedOverlays = overlays.map((value, index) => {
    if (!isPlainObject(value) || typeof value.type !== 'string' || typeof value.capture_base !== 'string') {
      throw new ImportError(`Overlay #${index + 1} needs "type" and "capture_base" strings.`);
    }
    return value as RawOverlay;
  });
  return { captureBases, overlays: parsedOverlays, extras };
}

/** Converts a Data Source 1.0 JSONPath such as `$.pets[*].name` into a claims path. */
export function jsonPathToClaimsPath(jsonPath: string): ClaimsPath | null {
  if (!jsonPath.startsWith('$')) return null;
  const token = /\.([^.[\]]+)|\[\*\]|\[(\d+)\]|\['([^']*)'\]|\["([^"]*)"\]/y;
  const path: ClaimsPath = [];
  token.lastIndex = 1;
  while (token.lastIndex < jsonPath.length) {
    const start = token.lastIndex;
    const match = token.exec(jsonPath);
    if (!match || match.index !== start) return null;
    if (match[1] !== undefined) path.push(match[1]);
    else if (match[2] !== undefined) path.push(Number(match[2]));
    else if (match[3] !== undefined) path.push(match[3]);
    else if (match[4] !== undefined) path.push(match[4]);
    else path.push(null);
  }
  return path;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function isClaimsPath(value: unknown): value is ClaimsPath {
  return Array.isArray(value) && value.every((segment) => segment === null || typeof segment === 'string' || typeof segment === 'number');
}

/**
 * A project from a parsed OCA bundle (`parseJsonText` turns text into one), with notes on what was repaired or
 * left out. Throws an `ImportError` when `input` is not a bundle it can read.
 */
export async function importBundle(input: unknown): Promise<ImportResult> {
  const report: ReportNote[] = [];
  const note = (message: string, level: ReportNote['level'] = 'info') => report.push({ level, message });
  const { captureBases, overlays, extras } = readShape(input);

  const byDigest = new Map<string, RawCaptureBase>();
  const byNormalised = new Map<string, RawCaptureBase>();
  for (const captureBase of captureBases) {
    if (byDigest.has(captureBase.digest)) throw new ImportError(`Two capture bases share the digest ${captureBase.digest}.`);
    byDigest.set(captureBase.digest, captureBase);
    byNormalised.set(normaliseDigest(captureBase.digest), captureBase);
  }
  const lookup = (digest: string, context: string): RawCaptureBase => {
    const exact = byDigest.get(digest);
    if (exact) return exact;
    const loose = byNormalised.get(normaliseDigest(digest));
    if (loose) {
      note(`${context} points to ${digest}, which only matches ${loose.digest} after fixing the base64 alphabet. The reference was repaired.`, 'warning');
      return loose;
    }
    throw new ImportError(`${context} points to ${digest}, but no capture base has that digest.`);
  };

  const parsed = new Map<RawCaptureBase, ParsedAttribute[]>();
  for (const captureBase of captureBases) {
    parsed.set(captureBase, Object.entries(captureBase.attributes).map(([key, value]) => parseAttribute(key, value, captureBase.digest)));
  }

  const referenced = new Set<RawCaptureBase>();
  for (const [captureBase, attributes] of parsed) {
    for (const attribute of attributes) {
      if (attribute.kind === 'ref') referenced.add(lookup(attribute.digest, `Attribute "${attribute.key}" in ${captureBase.digest}`));
    }
  }
  const roots = captureBases.filter((captureBase) => !referenced.has(captureBase));
  if (roots.length !== 1) {
    throw new ImportError(
      roots.length === 0
        ? 'Every capture base is referenced by another one, so there is no root (the references form a loop).'
        : `Found ${roots.length} root capture bases; a bundle must have exactly one.`,
    );
  }

  // Build the tree. Each occurrence of a capture base becomes its own Group.
  const groupsByDigest = new Map<string, Group[]>();
  const originalDigest = new Map<Group, string>();
  const nodesByGroup = new Map<Group, Map<string, Node>>();
  const build = (captureBase: RawCaptureBase, stack: RawCaptureBase[]): Group => {
    if (stack.includes(captureBase)) throw new ImportError(`Capture base ${captureBase.digest} references itself through its children (loop).`);
    const group = emptyGroup();
    const nodes = new Map<string, Node>();
    for (const attribute of parsed.get(captureBase)!) {
      let node: Node;
      if (attribute.kind === 'value') {
        node = newAttribute(attribute.key, { type: attribute.type, source: [] });
      } else {
        const child = lookup(attribute.digest, `Attribute "${attribute.key}"`);
        node = newGroupLink(attribute.key, { array: attribute.array, group: build(child, [...stack, captureBase]) });
      }
      group.children.push(node);
      nodes.set(attribute.key, node);
    }
    groupsByDigest.set(captureBase.digest, [...(groupsByDigest.get(captureBase.digest) ?? []), group]);
    originalDigest.set(group, captureBase.digest);
    nodesByGroup.set(group, nodes);
    return group;
  };
  const root = build(roots[0], []);

  // Languages in order of first appearance.
  const languages: LangTag[] = [];
  for (const overlay of overlays) {
    if (typeof overlay.language === 'string' && !languages.includes(overlay.language)) languages.push(overlay.language);
  }
  const project: Project = { ...emptyProject(languages), root, bundleExtras: extras };

  const groupsFor = (digest: string) =>
    groupsByDigest.get(digest) ?? groupsByDigest.get(byNormalised.get(normaliseDigest(digest))?.digest ?? '') ?? [];
  const templateFixes: Array<() => void> = [];
  const editorTemplate = (owner: Group, text: string, apply: (value: string) => void) => {
    templateFixes.push(() => apply(toEditorTemplate(text, root, owner, groupsFor)));
  };

  // Overlays per capture base.
  const overlaysByCaptureBase = new Map<RawCaptureBase, RawOverlay[]>();
  for (const overlay of overlays) {
    const target = byDigest.get(overlay.capture_base) ?? byNormalised.get(normaliseDigest(overlay.capture_base));
    if (!target) {
      note(`Dropped a ${overlay.type} overlay that points to an unknown capture base (${overlay.capture_base}).`, 'warning');
      continue;
    }
    overlaysByCaptureBase.set(target, [...(overlaysByCaptureBase.get(target) ?? []), overlay]);
  }

  const notedOnce = new Set<string>();
  const noteOnce = (message: string, level: ReportNote['level'] = 'info') => {
    if (!notedOnce.has(message)) {
      notedOnce.add(message);
      note(message, level);
    }
  };

  for (const [captureBase, groups] of [...groupsByDigest.entries()].map(([digest, list]) => [byDigest.get(digest)!, list] as const)) {
    const list = overlaysByCaptureBase.get(captureBase) ?? [];
    const hasDataSourceV2 = list.some((overlay) => overlay.type === OVERLAY_TYPES.dataSource);
    for (const group of groups) {
      const nodes = nodesByGroup.get(group)!;
      const isRoot = group === root;
      const orders = new Map<string, number>();

      for (const overlay of list) {
        const lang = typeof overlay.language === 'string' ? overlay.language : undefined;
        switch (overlay.type) {
          case OVERLAY_TYPES.meta: {
            if (!isRoot || !lang) {
              group.passthrough.push(overlay);
              break;
            }
            ensureLanguageSlots(project, lang);
            project.meta[lang] = {
              name: typeof overlay.name === 'string' ? overlay.name : '',
              description: typeof overlay.description === 'string' ? overlay.description : '',
            };
            const extra = Object.keys(overlay).filter((key) => !['type', 'capture_base', 'language', 'name', 'description'].includes(key));
            if (extra.length) noteOnce(`Meta overlay fields not supported by this tool were dropped: ${extra.join(', ')}.`);
            break;
          }
          case OVERLAY_TYPES.branding: {
            if (!isRoot || !lang) {
              group.passthrough.push(overlay);
              noteOnce('A Branding overlay on a nested capture base was kept unchanged; wallets only read Branding on the root.');
              break;
            }
            ensureLanguageSlots(project, lang);
            const pair: BrandingPair = project.branding[lang];
            const branding = {
              logo: typeof overlay.logo === 'string' ? overlay.logo : undefined,
              primaryBackgroundColor: typeof overlay.primary_background_color === 'string' ? overlay.primary_background_color : undefined,
              primaryField: undefined as string | undefined,
              secondaryField: undefined as string | undefined,
            };
            if (typeof overlay.primary_field === 'string') {
              const value = overlay.primary_field;
              editorTemplate(group, value, (converted) => (branding.primaryField = converted));
            }
            if (typeof overlay.secondary_field === 'string') {
              const value = overlay.secondary_field;
              editorTemplate(group, value, (converted) => (branding.secondaryField = converted));
            }
            if (overlay.theme === 'dark') pair.dark = branding;
            else pair.light = branding;
            const extra = Object.keys(overlay).filter(
              (key) => !['type', 'capture_base', 'language', 'theme', 'logo', 'primary_background_color', 'primary_field', 'secondary_field'].includes(key),
            );
            if (extra.length) noteOnce(`Branding fields not supported by this tool were dropped: ${extra.join(', ')}.`);
            break;
          }
          case OVERLAY_TYPES.label:
          case OVERLAY_TYPES.labelV1: {
            if (!lang) {
              group.passthrough.push(overlay);
              break;
            }
            if (overlay.type === OVERLAY_TYPES.labelV1) noteOnce('Label 1.0 overlays were upgraded to Label 1.1.');
            for (const [key, value] of Object.entries(asStringRecord(overlay.attribute_labels))) {
              const node = nodes.get(key);
              if (!node) continue;
              editorTemplate(group, value, (converted) => (node.labels[lang] = converted));
            }
            break;
          }
          case OVERLAY_TYPES.order: {
            if (isPlainObject(overlay.attribute_orders)) {
              for (const [key, value] of Object.entries(overlay.attribute_orders)) if (typeof value === 'number') orders.set(key, value);
            }
            break;
          }
          case OVERLAY_TYPES.dataSource:
          case OVERLAY_TYPES.dataSourceV1: {
            const v1 = overlay.type === OVERLAY_TYPES.dataSourceV1;
            if (v1 && hasDataSourceV2) {
              noteOnce('Data Source 1.0 overlays were dropped because a Data Source 2.0 overlay exists for the same capture base.');
              break;
            }
            if (v1) noteOnce('Data Source 1.0 overlays (JSONPath) were converted to Data Source 2.0 (claims paths).');
            if (overlay.format === 'vc+sd-jwt') noteOnce('Data source format "vc+sd-jwt" was changed to "dc+sd-jwt".');
            else if (overlay.format !== undefined && overlay.format !== 'dc+sd-jwt') {
              noteOnce(`Data source format "${String(overlay.format)}" is not supported and was changed to "dc+sd-jwt".`, 'warning');
            }
            const sources = isPlainObject(overlay.attribute_sources) ? overlay.attribute_sources : {};
            for (const [key, value] of Object.entries(sources)) {
              const node = nodes.get(key);
              if (!node) continue;
              const path = v1 ? (typeof value === 'string' ? jsonPathToClaimsPath(value) : null) : isClaimsPath(value) ? value : null;
              if (!path) {
                note(`The data source of "${key}" could not be read and was left empty.`, 'warning');
                continue;
              }
              node.source = path;
            }
            break;
          }
          case OVERLAY_TYPES.standard: {
            for (const [key, value] of Object.entries(asStringRecord(overlay.attr_standards))) {
              const node = nodes.get(key);
              if (node?.kind === 'attribute') node.standard = value;
            }
            break;
          }
          case OVERLAY_TYPES.sensitive: {
            if (Array.isArray(overlay.attributes)) {
              for (const key of overlay.attributes) {
                const node = typeof key === 'string' ? nodes.get(key) : undefined;
                if (node) node.sensitive = true;
              }
            }
            break;
          }
          case OVERLAY_TYPES.entryCode: {
            const codes = isPlainObject(overlay.attribute_entry_codes) ? overlay.attribute_entry_codes : {};
            if (Object.values(codes).some((value) => !Array.isArray(value))) {
              group.passthrough.push(overlay);
              noteOnce('An Entry Code overlay that references codes by digest was kept unchanged.');
              break;
            }
            for (const [key, value] of Object.entries(codes)) {
              const node = nodes.get(key);
              if (node?.kind !== 'attribute') continue;
              node.entries ??= { codes: [], labels: {} };
              node.entries.codes = (value as unknown[]).map(String);
            }
            break;
          }
          case OVERLAY_TYPES.entry: {
            const entries = isPlainObject(overlay.attribute_entries) ? overlay.attribute_entries : {};
            if (!lang || Object.values(entries).some((value) => !isPlainObject(value))) {
              group.passthrough.push(overlay);
              noteOnce('An Entry overlay that references entries by digest was kept unchanged.');
              break;
            }
            for (const [key, value] of Object.entries(entries)) {
              const node = nodes.get(key);
              if (node?.kind !== 'attribute') continue;
              node.entries ??= { codes: [], labels: {} };
              node.entries.labels[lang] = asStringRecord(value);
            }
            break;
          }
          default: {
            group.passthrough.push(overlay);
            noteOnce(`Kept "${overlay.type}" overlays unchanged. This tool does not edit them and does not update them when keys are renamed.`);
          }
        }
      }

      if (orders.size) {
        const position = (node: Node, index: number) => orders.get(node.key) ?? Number.MAX_SAFE_INTEGER - group.children.length + index;
        const indexed = group.children.map((node, index) => ({ node, rank: position(node, index), index }));
        indexed.sort((a, b) => a.rank - b.rank || a.index - b.index);
        group.children = indexed.map((entry) => entry.node);
      }
    }
  }

  for (const fix of templateFixes) fix();
  for (const lang of project.languages) ensureLanguageSlots(project, lang);

  // Report attributes without a data source and digests that were wrong.
  for (const group of walkGroups(root)) {
    for (const node of group.children) {
      if (node.kind === 'attribute' && node.source.length === 0) {
        note(`"${node.key}" has no data source mapping. Set its source path before exporting.`, 'warning');
      }
    }
  }
  const digests = await computeDigests(root);
  const wrong = new Map<string, string>(); // original → recomputed
  for (const group of walkGroups(root)) {
    const original = originalDigest.get(group)!;
    const recomputed = digests.get(group.id)!;
    if (recomputed !== original) wrong.set(original, recomputed);
  }
  for (const [original, recomputed] of wrong) {
    const reason = normaliseDigest(original) === recomputed ? ' (it used standard base64 instead of the URL-safe alphabet)' : '';
    note(`Capture base ${original} had an incorrect digest${reason}. It will be recomputed on export.`, 'warning');
  }

  return { project, report };
}

