import {
  type AttrType,
  type ClaimsPath,
  type Group,
  KNOWN_STANDARDS,
  type LangTag,
  type PrimitiveType,
  emptyGroup,
  emptyProject,
  newAttribute,
  newGroupLink,
} from '../model';
import { ImportError, type ImportResult, type ReportNote, isPlainObject, parseJsonText } from './report';

/** SD-JWT VC claims that carry protocol data rather than credential content. */
export const TECHNICAL_CLAIMS = ['iss', 'iat', 'exp', 'nbf', 'vct', 'vct#integrity', 'cnf', 'status', 'sub', '_sd', '_sd_alg'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg);base64,/;

interface Inferred {
  type: PrimitiveType;
  standard?: string;
}

export function inferPrimitive(value: unknown): Inferred {
  if (typeof value === 'number') return { type: 'Numeric' };
  if (typeof value === 'boolean') return { type: 'Boolean' };
  if (typeof value === 'string' && ISO_DATE.test(value)) return { type: 'DateTime', standard: KNOWN_STANDARDS.iso8601 };
  if (typeof value === 'string' && IMAGE_DATA_URL.test(value)) return { type: 'Text', standard: KNOWN_STANDARDS.dataUrl };
  return { type: 'Text' };
}

/** Merges the keys of several objects, keeping the first non-null value seen for each key. */
function mergeObjects(objects: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const object of objects) {
    for (const [key, value] of Object.entries(object)) {
      if (!(key in merged) || merged[key] === null) merged[key] = value;
    }
  }
  return merged;
}

function buildGroup(object: Record<string, unknown>, basePath: ClaimsPath, note: (message: string) => void): Group {
  const group = emptyGroup();
  for (const [key, value] of Object.entries(object)) {
    const path: ClaimsPath = [...basePath, key];
    if (Array.isArray(value)) {
      const objects = value.filter(isPlainObject);
      if (objects.length) {
        if (objects.length !== value.length) note(`"${key}" mixes objects and other values; only the objects were used.`);
        const arrayPath = [...path, null];
        group.children.push(
          newGroupLink(key, { array: true, source: arrayPath, group: buildGroup(mergeObjects(objects), arrayPath, note) }),
        );
        continue;
      }
      const first = value.find((item) => item !== null);
      if (first === undefined) note(`"${key}" is an empty array, so its element type was set to Text.`);
      const inferred = inferPrimitive(first);
      const type: AttrType = { array: inferred.type };
      group.children.push(newAttribute(key, { type, source: [...path, null], standard: inferred.standard }));
    } else if (isPlainObject(value)) {
      group.children.push(newGroupLink(key, { source: path, group: buildGroup(value, path, note) }));
    } else {
      if (value === null) note(`"${key}" is null in the sample, so its type was set to Text.`);
      const inferred = inferPrimitive(value);
      group.children.push(newAttribute(key, { type: inferred.type, source: path, standard: inferred.standard }));
    }
  }
  return group;
}

const COMPACT_SD_JWT = /^[\w-]+\.[\w-]+\.[\w-]*(?:~[\w-]*)*$/;

/** Parses the pasted sample, explaining what to paste when it is a raw SD-JWT instead of JSON. */
export function parseSampleText(text: string): unknown {
  if (COMPACT_SD_JWT.test(text.trim())) {
    throw new ImportError(
      'This looks like an encoded SD-JWT. Paste the decoded claims as a JSON object instead, for example {"given_name": "Seraina", "birth_date": "1988-04-05"}.',
    );
  }
  return parseJsonText(text);
}

export function importSample(input: unknown, languages: LangTag[]): ImportResult {
  if (!isPlainObject(input)) throw new ImportError('The sample credential must be a JSON object of claims.');
  const report: ReportNote[] = [];
  const note = (message: string) => report.push({ level: 'info', message });

  const skipped = TECHNICAL_CLAIMS.filter((claim) => claim in input);
  if (skipped.length) note(`Skipped technical claims: ${skipped.join(', ')}.`);
  const content = Object.fromEntries(Object.entries(input).filter(([key]) => !TECHNICAL_CLAIMS.includes(key)));
  if (Object.keys(content).length === 0) throw new ImportError('The sample has no credential claims besides technical ones.');

  const project = emptyProject(languages);
  project.root = buildGroup(content, [], note);
  project.sample = input;
  return { project, report };
}
