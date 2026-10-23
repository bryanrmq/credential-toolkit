import { isPlainObject } from './import/report';
import type { Project } from './model';

/**
 * Project files: a whole project, sample credential and I14Y links included, saved outside the browser as
 * `<credential-name>.oca-project.json`. The exported bundle drops those editor-only parts; a project file
 * keeps everything. The file is `{ format, version, project }`; `version` counts changes to that shape.
 */

export const PROJECT_FILE_FORMAT = 'oca-generator-project';
/** The version this app writes, and the newest it opens. */
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_EXTENSION = '.oca-project.json';
/** What a file picker offers: project files, and any JSON file in case the name changed. */
export const PROJECT_FILE_ACCEPT = `${PROJECT_FILE_EXTENSION},.json,application/json`;

/**
 * Brings a project saved by file version `n` up to version `n + 1`. Empty while there is only version 1:
 * the next version adds an entry at key 1, and a file is passed through every entry from its version on.
 */
const MIGRATIONS: Record<number, (project: unknown) => unknown> = {};

/** Whether `value` has the shape of a project; a quick check of its top level, as stored drafts get too. */
export function isProject(value: unknown): value is Project {
  return (
    isPlainObject(value) &&
    value.version === 1 &&
    Array.isArray(value.languages) &&
    isPlainObject(value.root) &&
    Array.isArray(value.root.children) &&
    isPlainObject(value.meta) &&
    isPlainObject(value.branding)
  );
}

/** The text of the project file for `project`. */
export function serializeProjectFile(project: Project): string {
  return `${JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, project }, null, 2)}\n`;
}

/**
 * The file name for `project`: its credential name in the first language, lower case, accents dropped and
 * anything but letters and digits turned into dashes; `untitled-credential` without one.
 */
export function projectFileName(project: Project): string {
  const name = project.meta[project.languages[0]]?.name ?? '';
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return `${slug || 'untitled-credential'}${PROJECT_FILE_EXTENSION}`;
}

/** Why a file could not be opened: it is not a project file (`invalid`), or a newer app saved it (`newer`). */
export type ProjectFileError = 'invalid' | 'newer';

export type ParsedProjectFile = { ok: true; project: Project } | { ok: false; error: ProjectFileError };

/** Reads the text of a project file. Never throws. */
export function parseProjectFile(text: string): ParsedProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (!isPlainObject(parsed) || parsed.format !== PROJECT_FILE_FORMAT) return { ok: false, error: 'invalid' };
  const { version } = parsed;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: 'invalid' };
  if (version > PROJECT_FILE_VERSION) return { ok: false, error: 'newer' };
  let project = parsed.project;
  for (let from = version; from < PROJECT_FILE_VERSION; from++) project = MIGRATIONS[from](project);
  return isProject(project) ? { ok: true, project } : { ok: false, error: 'invalid' };
}
