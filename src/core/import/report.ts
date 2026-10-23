import type { Project } from '../model.ts';

export interface ReportNote {
  level: 'info' | 'warning';
  message: string;
}

export interface ImportResult {
  project: Project;
  report: ReportNote[];
}

/** Input that cannot be turned into a project at all. The message is shown to the user as is. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Offset of the first character where `text` stops being valid JSON, or -1 when it is valid.
 * Browsers word JSON.parse errors differently and often omit the position, so we find it ourselves.
 */
export function locateJsonError(text: string): number {
  let index = 0;
  const stop = (): never => {
    throw { position: index };
  };
  const skipSpace = () => {
    while (index < text.length && ' \t\n\r'.includes(text[index])) index++;
  };
  const literal = (word: string) => {
    if (!text.startsWith(word, index)) stop();
    index += word.length;
  };
  const string = () => {
    index++;
    while (index < text.length) {
      const char = text[index];
      if (char === '"') {
        index++;
        return;
      }
      if (char === '\\') {
        index++;
        if (text[index] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) stop();
          index += 5;
        } else if ('"\\/bfnrt'.includes(text[index] ?? '')) index++;
        else stop();
      } else if (char < ' ') stop();
      else index++;
    }
    stop();
  };
  const number = () => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!match) stop();
    else index += match[0].length;
  };
  const value = (): void => {
    skipSpace();
    const char = text[index];
    if (char === '{') {
      index++;
      skipSpace();
      if (text[index] === '}') {
        index++;
        return;
      }
      for (;;) {
        skipSpace();
        if (text[index] !== '"') stop();
        string();
        skipSpace();
        if (text[index] !== ':') stop();
        index++;
        value();
        skipSpace();
        if (text[index] === ',') index++;
        else if (text[index] === '}') {
          index++;
          return;
        } else stop();
      }
    }
    if (char === '[') {
      index++;
      skipSpace();
      if (text[index] === ']') {
        index++;
        return;
      }
      for (;;) {
        value();
        skipSpace();
        if (text[index] === ',') index++;
        else if (text[index] === ']') {
          index++;
          return;
        } else stop();
      }
    }
    if (char === '"') return string();
    if (char === 't') return literal('true');
    if (char === 'f') return literal('false');
    if (char === 'n') return literal('null');
    if (char === '-' || (char >= '0' && char <= '9')) return number();
    stop();
  };
  try {
    value();
    skipSpace();
    if (index < text.length) stop();
    return -1;
  } catch (error) {
    return isPlainObject(error) && typeof error.position === 'number' ? error.position : -1;
  }
}

/** Parses JSON text, turning syntax errors into an ImportError that names the line and column. */
export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const offset = Math.max(0, locateJsonError(text));
    const lines = text.slice(0, offset).split('\n');
    throw new ImportError(`Invalid JSON at line ${lines.length}, column ${lines[lines.length - 1].length + 1}.`);
  }
}
