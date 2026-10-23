import type { ClaimsPath } from './model.ts';

const SIMPLE_NAME = /^[^.[\]"\s](?:[^.[\]"]*[^.[\]"\s])?$/;

/**
 * Claims path → readable text: `pets[].name`, `address.city`, `items[0]`.
 * Falls back to JSON when a name cannot be written that way.
 */
export function formatPath(path: ClaimsPath): string {
  if (path.some((segment) => typeof segment === 'string' && !SIMPLE_NAME.test(segment))) return JSON.stringify(path);
  let text = '';
  for (const segment of path) {
    if (segment === null) text += '[]';
    else if (typeof segment === 'number') text += `[${segment}]`;
    else text += text === '' ? segment : `.${segment}`;
  }
  return text;
}

function parseDotted(value: string): ClaimsPath | null {
  const token = /([^.[\]"\s](?:[^.[\]"]*[^.[\]"\s])?)|\[(\d*)\]|(\.)/y;
  const path: ClaimsPath = [];
  let expectName = true;
  let afterDot = false;
  let index = 0;
  while (index < value.length) {
    token.lastIndex = index;
    const match = token.exec(value);
    if (!match) return null;
    if (match[1] !== undefined) {
      if (!expectName) return null;
      path.push(match[1]);
      expectName = false;
      afterDot = false;
    } else if (match[2] !== undefined) {
      if (afterDot) return null;
      path.push(match[2] === '' ? null : Number(match[2]));
      expectName = false;
    } else {
      if (afterDot || path.length === 0) return null;
      expectName = true;
      afterDot = true;
    }
    index = token.lastIndex;
  }
  return afterDot ? null : path;
}

/** Readable text or JSON array → claims path, or null when the text is not a path. */
export function parsePath(text: string): ClaimsPath | null {
  const value = text.trim();
  if (value === '') return [];
  const dotted = parseDotted(value);
  if (dotted) return dotted;
  try {
    const json: unknown = JSON.parse(value);
    const valid =
      Array.isArray(json) &&
      json.every((segment) => segment === null || typeof segment === 'string' || (Number.isInteger(segment) && segment >= 0));
    return valid ? (json as ClaimsPath) : null;
  } catch {
    return null;
  }
}
