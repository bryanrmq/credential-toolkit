import {
  type ClaimsPath,
  type Group,
  type GroupLink,
  type LangTag,
  type Project,
  emptyProject,
  ensureLanguageSlots,
  newAttribute,
  newGroupLink,
} from '../model.ts';
import { ImportError, type ImportResult, type ReportNote, isPlainObject } from './report.ts';

export interface CredentialConfigurationChoice {
  id: string;
  name: string;
}

interface ClaimDescription {
  path: ClaimsPath;
  labels: Record<LangTag, string>;
}

function configurations(input: unknown): Record<string, Record<string, unknown>> {
  if (!isPlainObject(input) || !isPlainObject(input.credential_configurations_supported)) {
    throw new ImportError('Credential Issuer Metadata must contain a "credential_configurations_supported" object.');
  }
  const entries = Object.entries(input.credential_configurations_supported).filter(
    (entry): entry is [string, Record<string, unknown>] => isPlainObject(entry[1]),
  );
  if (entries.length === 0) throw new ImportError('"credential_configurations_supported" is empty.');
  return Object.fromEntries(entries);
}

/** OID4VCI 1.0 keeps display data in `credential_metadata`; older drafts put it on the configuration. */
function displaySource(configuration: Record<string, unknown>): { source: Record<string, unknown>; legacy: boolean } {
  return isPlainObject(configuration.credential_metadata)
    ? { source: configuration.credential_metadata, legacy: false }
    : { source: configuration, legacy: true };
}

function displayLabels(display: unknown, nameKey: string): Record<LangTag, string> {
  const labels: Record<LangTag, string> = {};
  if (!Array.isArray(display)) return labels;
  for (const entry of display) {
    if (isPlainObject(entry) && typeof entry.locale === 'string' && typeof entry[nameKey] === 'string') {
      labels[entry.locale] = entry[nameKey] as string;
    }
  }
  return labels;
}

export function listCredentialConfigurations(input: unknown): CredentialConfigurationChoice[] {
  return Object.entries(configurations(input)).map(([id, configuration]) => {
    const labels = displayLabels(displaySource(configuration).source.display, 'name');
    return { id, name: Object.values(labels)[0] ?? id };
  });
}

/** Older drafts describe claims as a nested object whose leaves carry `display`, `value_type` or `mandatory`. */
function flattenLegacyClaims(claims: Record<string, unknown>, prefix: ClaimsPath = []): ClaimDescription[] {
  const result: ClaimDescription[] = [];
  for (const [key, value] of Object.entries(claims)) {
    if (!isPlainObject(value)) continue;
    const path = [...prefix, key];
    const isLeaf = 'display' in value || 'value_type' in value || 'mandatory' in value;
    if (isLeaf) result.push({ path, labels: displayLabels(value.display, 'name') });
    const nested = Object.fromEntries(Object.entries(value).filter(([nestedKey]) => !['display', 'value_type', 'mandatory'].includes(nestedKey)));
    result.push(...flattenLegacyClaims(nested, path));
  }
  return result;
}

function readClaims(claims: unknown, note: (message: string) => void): ClaimDescription[] {
  if (Array.isArray(claims)) {
    const result: ClaimDescription[] = [];
    for (const claim of claims) {
      if (!isPlainObject(claim) || !Array.isArray(claim.path) || claim.path.length === 0) {
        note('Skipped a claim description without a valid "path".');
        continue;
      }
      result.push({ path: claim.path as ClaimsPath, labels: displayLabels(claim.display, 'name') });
    }
    return result;
  }
  if (isPlainObject(claims)) {
    note('Claims were read from the older object format.');
    return flattenLegacyClaims(claims);
  }
  return [];
}

function findOrCreateLink(group: Group, key: string, array: boolean, source: ClaimsPath): GroupLink {
  const existing = group.children.find((child): child is GroupLink => child.kind === 'group' && child.key === key);
  if (existing) {
    if (array && !existing.array) {
      existing.array = true;
      existing.source = source;
    }
    return existing;
  }
  const link = newGroupLink(key, { array, source });
  group.children.push(link);
  return link;
}

/** Walks `segments` from the root, creating group links. A `null` after a key makes that link an array. */
function ensureGroups(root: Group, segments: ClaimsPath): { group: Group; link?: GroupLink; path: ClaimsPath } | null {
  let group = root;
  let link: GroupLink | undefined;
  const path: ClaimsPath = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (typeof segment !== 'string') return null;
    const array = segments[index + 1] === null;
    path.push(segment);
    if (array) path.push(null);
    link = findOrCreateLink(group, segment, array, [...path]);
    group = link.group;
    if (array) index++;
  }
  return { group, link, path };
}

export function importIssuerMetadata(input: unknown, configurationId: string): ImportResult {
  const configuration = configurations(input)[configurationId];
  if (!configuration) throw new ImportError(`No credential configuration named "${configurationId}".`);
  const report: ReportNote[] = [];
  const note = (message: string, level: ReportNote['level'] = 'info') => report.push({ level, message });
  const { source, legacy } = displaySource(configuration);
  if (legacy) note('Display data was read from the configuration itself (pre-1.0 OID4VCI layout).');

  const languages: LangTag[] = [];
  const addLanguage = (lang: LangTag) => {
    if (!languages.includes(lang)) languages.push(lang);
  };
  const displays = Array.isArray(source.display) ? source.display.filter(isPlainObject) : [];
  for (const display of displays) if (typeof display.locale === 'string') addLanguage(display.locale);
  const claims = readClaims(source.claims, note);
  for (const claim of claims) for (const lang of Object.keys(claim.labels)) addLanguage(lang);
  if (languages.length === 0) addLanguage('en-GB');

  const project: Project = emptyProject(languages);
  for (const display of displays) {
    if (typeof display.locale !== 'string') {
      note('Skipped a display entry without "locale".', 'warning');
      continue;
    }
    const lang = display.locale;
    ensureLanguageSlots(project, lang);
    project.meta[lang] = {
      name: typeof display.name === 'string' ? display.name : '',
      description: typeof display.description === 'string' ? display.description : '',
    };
    const light = project.branding[lang].light;
    if (typeof display.background_color === 'string') light.primaryBackgroundColor = display.background_color;
    const logo = isPlainObject(display.logo) && typeof display.logo.uri === 'string' ? display.logo.uri : undefined;
    if (logo?.startsWith('data:')) light.logo = logo;
    else if (logo) note(`The ${lang} logo is a URL; swiyu wallets need a data URL, so upload the image instead.`, 'warning');
  }

  const prefixes = new Set<string>();
  for (const claim of claims) {
    for (let length = 1; length < claim.path.length; length++) prefixes.add(JSON.stringify(claim.path.slice(0, length)));
  }

  for (const claim of claims) {
    const path = claim.path;
    if (prefixes.has(JSON.stringify(path))) {
      // The claim describes an object that other claims live in: its labels become the group headline.
      const ensured = ensureGroups(project.root, path);
      if (ensured?.link) Object.assign(ensured.link.labels, claim.labels);
      else note(`Skipped claim ${JSON.stringify(path)}: unsupported path shape.`, 'warning');
      continue;
    }
    const arrayLeaf = path[path.length - 1] === null;
    const segments = arrayLeaf ? path.slice(0, -1) : path;
    const key = segments[segments.length - 1];
    if (typeof key !== 'string') {
      note(`Skipped claim ${JSON.stringify(path)}: unsupported path shape.`, 'warning');
      continue;
    }
    const parent = segments.length > 1 ? ensureGroups(project.root, segments.slice(0, -1)) : { group: project.root };
    if (!parent) {
      note(`Skipped claim ${JSON.stringify(path)}: unsupported path shape.`, 'warning');
      continue;
    }
    parent.group.children.push(
      newAttribute(key, { type: arrayLeaf ? { array: 'Text' } : 'Text', source: path, labels: { ...claim.labels } }),
    );
  }

  if (claims.length) note('Issuer Metadata has no attribute types, so every attribute was set to Text. Adjust dates, numbers and booleans.');
  return { project, report };
}
