import { type ClaimsPath, type Entries, type NodeVisit, type Project, findNode, isArrayType } from '../model';
import { renameNode, sourcePrefixFor, uniqueKey } from '../operations';
import { formatPath } from '../paths';
import { FORBIDDEN_KEY_CHARACTERS, type Issue } from './index';

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
};

/** The fixes for one issue: none (no button), one (a Fix button, used by Fix all) or several (one button each). */
export function fixesFor(issue: Issue, project: Project, tools: FixTools): Fix[] {
  return FIXES[issue.code]?.(issue, project, tools) ?? [];
}
