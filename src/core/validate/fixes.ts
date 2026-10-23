import { imageInfo } from '../image.ts';
import { inferPrimitive } from '../import/sample.ts';
import { DEFAULT_LANGUAGES } from '../langs.ts';
import { type Branding, type ClaimsPath, type Entries, KNOWN_STANDARDS, type NodeVisit, type Project, findNode, isArrayType } from '../model.ts';
import { renameLanguage, renameNode, sourcePrefixFor, uniqueKey } from '../operations.ts';
import { formatPath } from '../paths.ts';
import { FORBIDDEN_KEY_CHARACTERS, type Issue, MAX_LOGO_SIZE, pathExists, valuesAt } from './index.ts';

export interface Fix {
  /** Says what will change, e.g. 'Rename to "birth_date"'. */
  label: string;
  /**
   * Changes `draft` so the issue goes away. It finds its target again by id and does nothing when the problem is
   * already gone, so fixes can run one after another on one draft.
   */
  apply: (draft: Project) => void | Promise<void>;
}

export interface FixTools {
  /** Re-encodes an image data URL as PNG with its longest side at most `max` pixels. */
  reencodePng: (dataUrl: string, max: number) => Promise<string>;
}

type FixFactory = (issue: Issue, project: Project, tools: FixTools) => Fix[];

const FORBIDDEN_RUN = new RegExp(`${FORBIDDEN_KEY_CHARACTERS.source}+`, 'g');

/** The node an issue points to, found by id so it works on any copy of the project. */
function nodeAt(project: Project, issue: Issue): NodeVisit | undefined {
  return issue.target.kind === 'node' ? findNode(project.root, issue.target.nodeId) : undefined;
}

function entriesAt(project: Project, issue: Issue): Entries | undefined {
  const node = nodeAt(project, issue)?.node;
  return node?.kind === 'attribute' ? node.entries : undefined;
}

function isKey(key: string): boolean {
  return key !== '' && !FORBIDDEN_KEY_CHARACTERS.test(key);
}

function hasSiblingKey({ node, parent }: NodeVisit, key: string): boolean {
  return parent.children.some((sibling) => sibling !== node && sibling.key === key);
}

function sanitizeKey(key: string): string {
  return key.replace(FORBIDDEN_RUN, '_').replace(/^_+|_+$/g, '');
}

function lastName(path: ClaimsPath): string | undefined {
  for (let index = path.length - 1; index >= 0; index--) {
    const segment = path[index];
    if (typeof segment === 'string') return segment;
  }
  return undefined;
}

function isArrayNode({ node }: NodeVisit): boolean {
  return node.kind === 'group' ? node.array : isArrayType(node.type);
}

/** The source a new item at this place gets: its parent's prefix, its key, and null for an array. */
function defaultSource(project: Project, visit: NodeVisit): ClaimsPath | undefined {
  if (!isKey(visit.node.key)) return undefined;
  return [...sourcePrefixFor(project, visit.parent.id), visit.node.key, ...(isArrayNode(visit) ? [null] : [])];
}

/** The https form of an http or scheme-less URL; undefined when there is nothing to change or another scheme. */
function secureUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const next = `https://${trimmed.replace(/^https?:\/\//i, '')}`;
    return next === url ? undefined : next;
  }
  if (trimmed === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return undefined;
  return `https://${trimmed}`;
}

/** The light or dark branding a credential issue points to. */
function brandingAt(project: Project, issue: Issue): Branding | undefined {
  const target = issue.target;
  if (target.kind !== 'credential' || !target.lang) return undefined;
  const pair = project.branding[target.lang];
  return target.theme === 'dark' ? pair?.dark : pair?.light;
}

/** `#RRGGBB` for `#RGB`, `#RGBA`, `#RRGGBB` and `#RRGGBBAA`, with or without `#`; undefined otherwise. */
function normalizeColor(value: string): string | undefined {
  const hex = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return undefined;
  const rgb = hex.length <= 4 ? [...hex.slice(0, 3)].map((digit) => digit + digit).join('') : hex.slice(0, 6);
  return `#${rgb.toUpperCase()}`;
}

/** `de_ch` → `de-CH`; undefined when the tag is not a two-letter language with an optional two-letter region. */
function normalizeLanguageTag(tag: string): string | undefined {
  const match = /^([a-z]{2})(?:[-_]([a-z]{2}))?$/i.exec(tag.trim());
  if (!match) return undefined;
  return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
}

/** The default tag for a language (`en` → `en-GB`), otherwise its Swiss form. */
function withRegion(tag: string): string {
  return DEFAULT_LANGUAGES.find((candidate) => candidate.startsWith(`${tag}-`)) ?? `${tag}-CH`;
}

function renameLanguageFix(project: Project, from: string | undefined, to: string | undefined): Fix[] {
  if (!from || !to || to === from || project.languages.includes(to)) return [];
  return [{ label: `Rename to "${to}"`, apply: (draft) => renameLanguage(draft, from, to) }];
}

/** The date standard the sample's values use, when they all agree. */
function sampleDateStandard(values: unknown[]): string | undefined {
  const present = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== null && value !== undefined);
  if (present.length === 0) return undefined;
  if (present.every((value) => typeof value === 'number')) return KNOWN_STANDARDS.unixEpoch;
  if (present.every((value) => inferPrimitive(value).standard === KNOWN_STANDARDS.iso8601)) return KNOWN_STANDARDS.iso8601;
  return undefined;
}

/** Every distinct path in `data` whose last name is `key`, with array items written as null. */
function pathsEndingWith(data: unknown, key: string): ClaimsPath[] {
  const found = new Map<string, ClaimsPath>();
  const walk = (value: unknown, path: ClaimsPath) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, [...path, null]);
    } else if (typeof value === 'object' && value !== null) {
      for (const [name, child] of Object.entries(value)) {
        const next = [...path, name];
        if (name === key) found.set(JSON.stringify(next), next);
        walk(child, next);
      }
    }
  };
  walk(data, []);
  return [...found.values()];
}

const IMAGE_DATA_URL = /^data:image\/[\w.+-]+;base64,/;

function isTooLarge(logo: string): boolean {
  const { width, height } = imageInfo(logo);
  return !!width && !!height && Math.max(width, height) > MAX_LOGO_SIZE;
}

function isConvertible(logo: string): boolean {
  return IMAGE_DATA_URL.test(logo) && !imageInfo(logo).declaredMime;
}

/**
 * Replaces the logo with a re-encoded PNG. The image is processed first; the logo is only written when it is still
 * the one that was processed.
 */
function reencodeLogo(issue: Issue, tools: FixTools, needed: (logo: string) => boolean) {
  return async (draft: Project) => {
    const before = brandingAt(draft, issue)?.logo;
    if (!before || !needed(before)) return;
    const after = await tools.reencodePng(before, MAX_LOGO_SIZE);
    const branding = brandingAt(draft, issue);
    if (branding?.logo === before) branding.logo = after;
  };
}

const FIXES: Record<string, FixFactory> = {
  'language-duplicate': () => [
    { label: 'Remove the duplicate', apply: (draft) => void (draft.languages = [...new Set(draft.languages)]) },
  ],

  'key-duplicate': (issue, project) => {
    const visit = nodeAt(project, issue);
    if (!visit) return [];
    return [
      {
        label: `Rename to "${uniqueKey(visit.parent, visit.node.key)}"`,
        apply: (draft) => {
          const current = nodeAt(draft, issue);
          if (current && hasSiblingKey(current, current.node.key)) {
            renameNode(draft, current.node.id, uniqueKey(current.parent, current.node.key));
          }
        },
      },
    ];
  },

  'key-characters': (issue, project) => {
    const visit = nodeAt(project, issue);
    const base = visit ? sanitizeKey(visit.node.key) : '';
    if (!visit || !base) return [];
    return [
      {
        label: `Rename to "${uniqueKey(visit.parent, base)}"`,
        apply: (draft) => {
          const current = nodeAt(draft, issue);
          if (!current || !FORBIDDEN_KEY_CHARACTERS.test(current.node.key)) return;
          const key = sanitizeKey(current.node.key);
          if (key) renameNode(draft, current.node.id, uniqueKey(current.parent, key));
        },
      },
    ];
  },

  'key-empty': (issue, project) => {
    const visit = nodeAt(project, issue);
    const key = visit ? lastName(visit.node.source ?? []) : undefined;
    if (!visit || !key || !isKey(key) || hasSiblingKey(visit, key)) return [];
    return [
      {
        label: `Use "${key}" as key`,
        apply: (draft) => {
          const current = nodeAt(draft, issue);
          if (current && current.node.key === '' && !hasSiblingKey(current, key)) renameNode(draft, current.node.id, key);
        },
      },
    ];
  },

  'source-missing': (issue, project) => {
    const visit = nodeAt(project, issue);
    const source = visit ? defaultSource(project, visit) : undefined;
    if (!source) return [];
    return [
      {
        label: `Set source to ${formatPath(source)}`,
        apply: (draft) => {
          const current = nodeAt(draft, issue);
          if (!current || current.node.source?.length) return;
          const next = defaultSource(draft, current);
          if (next) current.node.source = next;
        },
      },
    ];
  },

  'source-array-shape': (issue, project) => {
    if ((nodeAt(project, issue)?.node.source?.length ?? 0) < 2) return [];
    return [
      {
        label: 'Remove the trailing null',
        apply: (draft) => {
          const source = nodeAt(draft, issue)?.node.source;
          if (source && source.length > 1 && source[source.length - 1] === null) source.pop();
        },
      },
    ];
  },

  'entry-code-invalid': (issue, project) => {
    if (!entriesAt(project, issue)) return [];
    return [
      {
        label: 'Remove empty and duplicate codes',
        apply: (draft) => {
          const entries = entriesAt(draft, issue);
          if (!entries) return;
          entries.codes = [...new Set(entries.codes.filter((code) => code !== ''))];
          for (const labels of Object.values(entries.labels)) delete labels[''];
        },
      },
    ];
  },

  'entry-undeclared': (issue, project) => {
    const code = issue.subject;
    const lang = issue.target.kind === 'node' ? issue.target.lang : undefined;
    if (code === undefined || !lang || !entriesAt(project, issue)) return [];
    return [
      {
        label: `Declare "${code}"`,
        apply: (draft) => {
          const entries = entriesAt(draft, issue);
          if (entries && !entries.codes.includes(code)) entries.codes.push(code);
        },
      },
      {
        label: 'Delete the translation',
        apply: (draft) => {
          const entries = entriesAt(draft, issue);
          const labels = entries?.labels[lang];
          if (entries && labels && !entries.codes.includes(code)) delete labels[code];
        },
      },
    ];
  },

  'hosting-url-insecure': (_issue, project) => {
    if (project.hosting.mode !== 'url' || !secureUrl(project.hosting.url)) return [];
    return [
      {
        label: 'Use https://',
        apply: (draft) => {
          if (draft.hosting.mode !== 'url') return;
          const url = secureUrl(draft.hosting.url);
          if (url) draft.hosting.url = url;
        },
      },
    ];
  },

  'color-format': (issue, project) => {
    const color = brandingAt(project, issue)?.primaryBackgroundColor;
    const next = color === undefined ? undefined : normalizeColor(color);
    if (!next) return [];
    return [
      {
        label: `Use "${next}"`,
        apply: (draft) => {
          const branding = brandingAt(draft, issue);
          const value = branding?.primaryBackgroundColor;
          const normalized = value === undefined ? undefined : normalizeColor(value);
          if (branding && normalized) branding.primaryBackgroundColor = normalized;
        },
      },
    ];
  },

  'language-invalid': (issue, project) =>
    renameLanguageFix(project, issue.subject, issue.subject === undefined ? undefined : normalizeLanguageTag(issue.subject)),

  'language-no-region': (issue, project) =>
    renameLanguageFix(project, issue.subject, issue.subject === undefined ? undefined : withRegion(issue.subject)),

  'datetime-standard': (issue, project) => {
    const node = nodeAt(project, issue)?.node;
    if (node?.kind !== 'attribute') return [];
    const choose = (label: string, standard: string): Fix => ({
      label,
      apply: (draft) => {
        const current = nodeAt(draft, issue)?.node;
        if (current?.kind === 'attribute' && !current.standard) current.standard = standard;
      },
    });
    const iso = choose('Use ISO 8601', KNOWN_STANDARDS.iso8601);
    const unix = choose('Use Unix time', KNOWN_STANDARDS.unixEpoch);
    const detected = project.sample === undefined ? undefined : sampleDateStandard(valuesAt(project.sample, node.source));
    if (detected === KNOWN_STANDARDS.iso8601) return [iso];
    if (detected === KNOWN_STANDARDS.unixEpoch) return [unix];
    return [iso, unix];
  },

  'source-not-in-sample': (issue, project) => {
    const visit = nodeAt(project, issue);
    if (!visit || project.sample === undefined || !visit.node.key) return [];
    const matches = pathsEndingWith(project.sample, visit.node.key);
    if (matches.length !== 1) return [];
    const source: ClaimsPath = isArrayNode(visit) ? [...matches[0], null] : matches[0];
    return [
      {
        label: `Set source to ${formatPath(source)}`,
        apply: (draft) => {
          const current = nodeAt(draft, issue);
          if (current && draft.sample !== undefined && !pathExists(draft.sample, current.node.source ?? [])) {
            current.node.source = [...source];
          }
        },
      },
    ];
  },

  'logo-mime-mismatch': (issue, project) => {
    const logo = brandingAt(project, issue)?.logo;
    const info = logo ? imageInfo(logo) : undefined;
    if (!info?.declaredMime || !info.actualMime || info.declaredMime === info.actualMime) return [];
    return [
      {
        label: `Mark as ${info.actualMime === 'image/png' ? 'PNG' : 'JPEG'}`,
        apply: (draft) => {
          const branding = brandingAt(draft, issue);
          const current = branding?.logo ? imageInfo(branding.logo) : undefined;
          if (branding?.logo && current?.declaredMime && current.actualMime && current.declaredMime !== current.actualMime) {
            branding.logo = branding.logo.replace(current.declaredMime, current.actualMime);
          }
        },
      },
    ];
  },

  'logo-too-large': (issue, project, tools) => {
    const logo = brandingAt(project, issue)?.logo;
    if (!logo || !isTooLarge(logo)) return [];
    return [{ label: `Shrink to ${MAX_LOGO_SIZE} px`, apply: reencodeLogo(issue, tools, isTooLarge) }];
  },

  'logo-format': (issue, project, tools) => {
    const logo = brandingAt(project, issue)?.logo;
    if (!logo || !isConvertible(logo)) return [];
    return [{ label: 'Convert to PNG', apply: reencodeLogo(issue, tools, isConvertible) }];
  },
};

/** Codes whose fix renames a language. Run them after the others, which look their language up by its old tag. */
export const LANGUAGE_RENAME_CODES: readonly string[] = ['language-invalid', 'language-no-region'];

/** Codes with a fix rule. */
export const FIXABLE_CODES: readonly string[] = Object.keys(FIXES);

/** Codes `validate()` and `validateIssuer()` raise that deliberately have no fix: they need the issuer's own content or judgement. */
export const NO_FIX_CODES: readonly string[] = [
  'languages-empty',
  'name-missing',
  'label-missing',
  'summary-missing',
  'entry-missing',
  'hosting-url-missing',
  'template-unresolved',
  'template-join-too-long',
  'source-invalid',
  'cluster-too-deep',
  'logo-not-square',
  'digest-collision',
  'issuer-name-missing',
  'issuer-logo-format',
  'issuer-url-invalid',
  'issuer-identifier-invalid',
];

/** The fixes for one issue: none (no button), one (a Fix button, used by Fix all) or several (one button each). */
export function fixesFor(issue: Issue, project: Project, tools: FixTools): Fix[] {
  return FIXES[issue.code]?.(issue, project, tools) ?? [];
}
