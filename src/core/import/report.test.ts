import { describe, expect, it } from 'vitest';
import { ImportError, locateJsonError, parseJsonText } from './report';

describe('locateJsonError', () => {
  it('returns -1 for valid JSON', () => {
    expect(locateJsonError('{"a": [1, -2.5e3, true, null, "x\\n\\u00e9"]}')).toBe(-1);
  });

  it('points at the first invalid character', () => {
    expect(locateJsonError('{"capture_bases": [}')).toBe(19);
    expect(locateJsonError('{"a": 1,}')).toBe(8);
    expect(locateJsonError('{"a": tru}')).toBe(6);
    expect(locateJsonError('{"a": 1} x')).toBe(9);
    expect(locateJsonError('{"a": "unterminated')).toBe(19);
  });
});

describe('parseJsonText', () => {
  it('parses valid JSON', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ a: 1 });
  });

  it('reports line and column', () => {
    expect(() => parseJsonText('{\n  "a": 1,\n  "b": ]\n}')).toThrow(new ImportError('Invalid JSON at line 3, column 8.'));
  });
});
