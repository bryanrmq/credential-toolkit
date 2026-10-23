import { structuralSignature } from '../export/bundle.ts';
import { imageInfo } from '../image.ts';
import { IDENTIFIER_PATTERN, isIssuerLogo, isIssuerUrl, issuerOf } from '../issuer.ts';
import { hasRegion, isValidLanguageTag } from '../langs.ts';
import {
  type Branding,
  type ClaimsPath,
  type Group,
  type GroupLink,
  type LangTag,
  type Node,
  type Project,
  isArrayType,
  walkGroups,
  walkNodes,
} from '../model.ts';
import { MAX_JOIN_SEPARATOR, joinSeparator, listExpressions, resolveEditorPath } from '../templates.ts';

export type Severity = 'error' | 'warning';

export type CredentialField =
  | 'name'
  | 'description'
  | 'logo'
  | 'primaryBackgroundColor'
  | 'primaryField'
  | 'secondaryField'
  | 'issuerName'
  | 'issuerLogo'
  | 'issuerUrl'
  | 'issuerConfigurationId'
  | 'issuerTypeKey';
/** The credential fields of the issuer settings, edited on the Metadata page rather than in the OCA editor. */
export const ISSUER_FIELDS: readonly CredentialField[] = ['issuerName', 'issuerLogo', 'issuerUrl', 'issuerConfigurationId', 'issuerTypeKey'];

export type NodeField = 'key' | 'type' | 'source' | 'label' | 'entries';

export type IssueTarget =
  | { kind: 'languages' }
  | { kind: 'hosting' }
  /** Without `lang` for the fields that are the same in every language: the issuer logo, URL and identifiers. */
  | { kind: 'credential'; field: CredentialField; lang?: LangTag; theme?: 'light' | 'dark' }
  | { kind: 'node'; nodeId: string; field: NodeField; lang?: LangTag };

export interface Issue {
  severity: Severity;
  code: string;
  /** Full text, naming the language when the issue belongs to one. */
  message: string;
  /** The same text without the language, used to group one issue across languages. */
  summary: string;
  target: IssueTarget;
  /** What the issue is about when the target does not say: the language tag or the value code. */
  subject?: string;
}

const COLOR = /^#[0-9A-Fa-f]{6}$/;
export const FORBIDDEN_KEY_CHARACTERS = /[\s.[\]{}:/"]/;
export const MAX_LOGO_SIZE = 512;
const MAX_CLUSTER_DEPTH = 3;

export function isValidPathSegment(segment: unknown): boolean {
  if (segment === null) return true;
  if (typeof segment === 'string') return segment.length > 0 && !segment.includes('"');
  return typeof segment === 'number' && Number.isInteger(segment) && segment >= 0;
}

/** True when the path selects at least one value in `data` (or cannot be checked because an array is empty). */
export function pathExists(data: unknown, path: ClaimsPath): boolean {
  if (path.length === 0) return true;
  const [segment, ...rest] = path;
  if (segment === null) {
    if (!Array.isArray(data)) return false;
    return data.length === 0 || data.some((item) => pathExists(item, rest));
  }
  if (typeof segment === 'number') return Array.isArray(data) && segment < data.length && pathExists(data[segment], rest);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  return segment in data && pathExists((data as Record<string, unknown>)[segment], rest);
}

/** Every value `path` selects in `data`; a null segment fans out over the items of an array. */
export function valuesAt(data: unknown, path: ClaimsPath): unknown[] {
  if (path.length === 0) return [data];
  const [segment, ...rest] = path;
  if (segment === null) return Array.isArray(data) ? data.flatMap((item) => valuesAt(item, rest)) : [];
  if (typeof segment === 'number') return Array.isArray(data) && segment < data.length ? valuesAt(data[segment], rest) : [];
  if (typeof data !== 'object' || data === null || Array.isArray(data) || !(segment in data)) return [];
  return valuesAt((data as Record<string, unknown>)[segment], rest);
}

function childFingerprint(group: Group): string {
  return JSON.stringify({
    children: group.children.map((child) => ({
      key: child.key,
      kind: child.kind,
      labels: child.labels,
      source: child.source,
      sensitive: child.sensitive,
      standard: child.kind === 'attribute' ? child.standard : undefined,
      entries: child.kind === 'attribute' ? child.entries : undefined,
    })),
    passthrough: group.passthrough.map(({ capture_base: _ignored, ...rest }) => rest),
  });
}

/** Every issue in `project`, in the order the app lists them. Any error blocks the export; warnings don't. */
export function validate(project: Project): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, message: string, target: IssueTarget, summary = message, subject?: string) =>
    issues.push({ severity: 'error', code, message, summary, target, subject });
  const warn = (code: string, message: string, target: IssueTarget, summary = message, subject?: string) =>
    issues.push({ severity: 'warning', code, message, summary, target, subject });
  const root = project.root;

  const checkTemplate = (text: string | undefined, owner: Group, report: (code: string, message: string) => void) => {
    if (!text) return;
    for (const expression of listExpressions(text)) {
      if ((joinSeparator(expression)?.length ?? 0) > MAX_JOIN_SEPARATOR) {
        report(
          'template-join-too-long',
          `"{{${expression.raw}}}" joins with more than ${MAX_JOIN_SEPARATOR} characters, so wallets show nothing for it.`,
        );
        continue;
      }
      if (expression.refDigest !== undefined) continue; // spec form kept from an import; checked by the wallet
      if (!resolveEditorPath(root, owner, expression)) report('template-unresolved', `"{{${expression.raw}}}" does not match any attribute.`);
    }
  };

  // Hosting
  if (project.hosting.mode === 'url') {
    const url = project.hosting.url.trim();
    if (url === '') warn('hosting-url-missing', 'Enter the URL where you will publish the bundle; the VCT snippet points to it.', { kind: 'hosting' });
    else if (!url.startsWith('https://')) warn('hosting-url-insecure', 'The bundle URL should start with https://.', { kind: 'hosting' });
  }

  // Languages
  if (project.languages.length === 0) error('languages-empty', 'Add at least one language.', { kind: 'languages' });
  const seenLanguages = new Set<LangTag>();
  for (const lang of project.languages) {
    if (seenLanguages.has(lang)) error('language-duplicate', `"${lang}" is listed twice.`, { kind: 'languages' }, undefined, lang);
    seenLanguages.add(lang);
    if (!isValidLanguageTag(lang)) {
      error('language-invalid', `"${lang}" is rejected by swiyu wallets. Use a tag like "de" or "de-CH".`, { kind: 'languages' }, undefined, lang);
    } else if (!hasRegion(lang)) {
      warn(
        'language-no-region',
        `"${lang}" has no region. Wallets match locales exactly, so prefer a tag like "${lang}-CH".`,
        { kind: 'languages' },
        undefined,
        lang,
      );
    }
  }

  // Credential-level fields
  for (const lang of project.languages) {
    const meta = project.meta[lang];
    if (!meta?.name) {
      warn('name-missing', `The credential name is missing in ${lang}.`, { kind: 'credential', field: 'name', lang }, 'The credential name is missing.');
    }
    const pair = project.branding[lang] ?? { light: {} };
    const themes: Array<['light' | 'dark', Branding | undefined]> = [['light', pair.light], ['dark', pair.dark]];
    for (const [theme, branding] of themes) {
      if (!branding) continue;
      const target = (field: CredentialField): IssueTarget => ({ kind: 'credential', field, lang, theme });
      if (branding.logo) {
        const info = imageInfo(branding.logo);
        if (!info.declaredMime) {
          error('logo-format', `The ${theme} logo (${lang}) must be a PNG or JPEG data URL.`, target('logo'), `The ${theme} logo must be a PNG or JPEG data URL.`);
        } else {
          if (info.actualMime && info.actualMime !== info.declaredMime) {
            warn(
              'logo-mime-mismatch',
              `The ${theme} logo (${lang}) is declared as ${info.declaredMime} but contains ${info.actualMime} data.`,
              target('logo'),
              `The ${theme} logo is declared as ${info.declaredMime} but contains ${info.actualMime} data.`,
            );
          }
          if (info.width && info.height) {
            if (info.width > MAX_LOGO_SIZE || info.height > MAX_LOGO_SIZE) {
              warn(
                'logo-too-large',
                `The ${theme} logo (${lang}) is ${info.width}×${info.height}; wallets accept at most 512×512.`,
                target('logo'),
                `The ${theme} logo is ${info.width}×${info.height}; wallets accept at most 512×512.`,
              );
            }
            if (info.width !== info.height) {
              warn(
                'logo-not-square',
                `The ${theme} logo (${lang}) is not square, so it will look small at 24×24.`,
                target('logo'),
                `The ${theme} logo is not square, so it will look small at 24×24.`,
              );
            }
          }
        }
      }
      if (branding.primaryBackgroundColor && !COLOR.test(branding.primaryBackgroundColor)) {
        error(
          'color-format',
          `The ${theme} background colour (${lang}) must look like #1A2B3C, without transparency.`,
          target('primaryBackgroundColor'),
          `The ${theme} background colour must look like #1A2B3C, without transparency.`,
        );
      }
      checkTemplate(branding.primaryField, root, (code, message) => error(code, message, target('primaryField')));
      checkTemplate(branding.secondaryField, root, (code, message) => error(code, message, target('secondaryField')));
    }
    if (!meta?.description && !pair.light.primaryField) {
      warn(
        'summary-missing',
        `The card has no summary line in ${lang}. Add a description or a primary field.`,
        { kind: 'credential', field: 'description', lang },
        'The card has no summary line. Add a description or a primary field.',
      );
    }
  }

  // Structure
  const linkByGroup = new Map<Group, GroupLink>();
  for (const { node, parent, depth } of walkNodes(root)) {
    if (node.kind === 'group') {
      linkByGroup.set(node.group, node);
      if (depth + 1 > MAX_CLUSTER_DEPTH) {
        warn('cluster-too-deep', `"${node.key}" is nested ${depth + 1} levels deep; wallets show anything below level 3 at level 3.`, { kind: 'node', nodeId: node.id, field: 'key' });
      }
    }
    checkNode(node, parent);
  }

  function checkNode(node: Node, parent: Group) {
    const target = (field: NodeField, lang?: LangTag): IssueTarget => ({ kind: 'node', nodeId: node.id, field, lang });
    const name = node.key || '(unnamed)';

    if (!node.key) error('key-empty', 'An attribute or group has no key.', target('key'));
    else if (FORBIDDEN_KEY_CHARACTERS.test(node.key)) {
      error('key-characters', `"${node.key}" contains spaces or one of . [ ] { } : / " which break templates and paths.`, target('key'));
    }
    if (node.key && parent.children.filter((sibling) => sibling.key === node.key).length > 1) {
      error('key-duplicate', `"${node.key}" is used twice in the same group.`, target('key'));
    }

    const source = node.source ?? [];
    const isArray = node.kind === 'group' ? node.array : isArrayType(node.type);
    if (node.kind === 'attribute' && source.length === 0) {
      error('source-missing', `"${name}" has no source path, so the wallet cannot find its value.`, target('source'));
    } else if (node.kind === 'group' && node.array && source.length === 0) {
      error('source-missing', `Array group "${name}" needs a source path such as ["${name}", null].`, target('source'));
    } else if (source.length) {
      if (!source.every(isValidPathSegment)) {
        error('source-invalid', `The source path of "${name}" may only contain non-empty names, positive integers and null.`, target('source'));
      } else {
        // An array may end with null or not (the spec only shows null in examples), but a single value may not.
        if (!isArray && source[source.length - 1] === null) warn('source-array-shape', `"${name}" is not an array but its source path ends with null.`, target('source'));
        if (project.sample !== undefined && !pathExists(project.sample, source)) {
          warn('source-not-in-sample', `The source path of "${name}" does not exist in the sample credential.`, target('source'));
        }
      }
    }

    for (const lang of project.languages) {
      const label = node.labels[lang];
      if (!label) warn('label-missing', `"${name}" has no label in ${lang}.`, target('label', lang), `"${name}" has no label.`);
      checkTemplate(label, parent, (code, message) => error(code, message, target('label', lang)));
    }

    if (node.kind !== 'attribute') return;
    if (node.type === 'DateTime' || (isArrayType(node.type) && node.type.array === 'DateTime')) {
      if (!node.standard) error('datetime-standard', `Choose a date format (ISO 8601 or Unix time) for "${name}".`, target('type'));
    }
    if (node.entries) {
      const codes = node.entries.codes;
      if (codes.some((code) => code === '') || new Set(codes).size !== codes.length) {
        error('entry-code-invalid', `Value translation codes of "${name}" must be unique and not empty.`, target('entries'));
      }
      for (const lang of project.languages) {
        const labels = node.entries.labels[lang] ?? {};
        for (const code of Object.keys(labels)) {
          if (!codes.includes(code) && labels[code]) {
            error(
              'entry-undeclared',
              `"${name}" translates "${code}" in ${lang}, but that code is not declared.`,
              target('entries', lang),
              `"${name}" translates "${code}", but that code is not declared.`,
              code,
            );
          }
        }
        if (codes.some((code) => !labels[code])) {
          warn('entry-missing', `Some values of "${name}" are not translated in ${lang}.`, target('entries', lang), `Some values of "${name}" are not translated.`);
        }
      }
    }
  }

  // Identical capture bases with different overlays would share one digest.
  const bySignature = new Map<string, Group[]>();
  for (const group of walkGroups(root)) {
    const signature = structuralSignature(group);
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), group]);
  }
  for (const groups of bySignature.values()) {
    if (groups.length < 2) continue;
    const first = groups[0];
    for (const other of groups.slice(1)) {
      if (childFingerprint(other) === childFingerprint(first)) continue;
      const a = linkByGroup.get(first);
      const b = linkByGroup.get(other)!;
      error(
        'digest-collision',
        `"${a?.key ?? 'root'}" and "${b.key}" have the same keys and types, so they get the same digest, but their labels or sources differ. Rename a key in one of them (its source path can stay).`,
        { kind: 'node', nodeId: b.id, field: 'key' },
      );
    }
  }

  return issues;
}

/** The codes `validateIssuer` raises. Their errors do not block the bundle download, as the bundle never has the issuer settings. */
export const ISSUER_ISSUE_CODES: readonly string[] = ['issuer-name-missing', 'issuer-logo-format', 'issuer-url-invalid', 'issuer-identifier-invalid'];

/**
 * The issues of the issuer settings (`project.issuer`), which go into the Issuer Metadata and the Type Metadata,
 * never into the bundle. Kept apart from `validate` so they never block the bundle export; the app lists both.
 */
export function validateIssuer(project: Project): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, message: string, target: IssueTarget) => issues.push({ severity: 'error', code, message, summary: message, target });
  const warn = (code: string, message: string, target: IssueTarget, summary: string) => issues.push({ severity: 'warning', code, message, summary, target });
  const issuer = issuerOf(project);
  for (const lang of project.languages) {
    if (!issuer.name[lang]) {
      warn('issuer-name-missing', `The issuer name is missing in ${lang}.`, { kind: 'credential', field: 'issuerName', lang }, 'The issuer name is missing.');
    }
  }
  if (issuer.logo && !isIssuerLogo(issuer.logo)) {
    error('issuer-logo-format', 'The issuer logo must be a PNG or JPEG data URL.', { kind: 'credential', field: 'issuerLogo' });
  }
  const issuerUrl = issuer.url?.trim();
  if (issuerUrl && !isIssuerUrl(issuerUrl)) {
    error('issuer-url-invalid', 'The Issuer URL must be an https URL such as https://issuer.example.ch.', { kind: 'credential', field: 'issuerUrl' });
  }
  // Unset or empty identifiers are derived from the credential name, which always matches the pattern.
  const identifiers: Array<[CredentialField, string, string | undefined]> = [
    ['issuerConfigurationId', 'Configuration id', issuer.configurationId],
    ['issuerTypeKey', 'Type key', issuer.typeKey],
  ];
  for (const [field, label, value] of identifiers) {
    const id = value?.trim();
    if (id && !IDENTIFIER_PATTERN.test(id)) {
      error('issuer-identifier-invalid', `The ${label} may only contain lower-case letters, digits, _ and -.`, { kind: 'credential', field });
    }
  }
  return issues;
}

/** Whether any of `issues` is an error. */
export function hasErrors(issues: Issue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
