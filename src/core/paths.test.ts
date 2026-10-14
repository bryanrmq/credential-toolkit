import { describe, expect, it } from 'vitest';
import { formatPath, parsePath } from './paths';

describe('formatPath', () => {
  it('writes readable paths', () => {
    expect(formatPath(['pets', null, 'name'])).toBe('pets[].name');
    expect(formatPath(['address', 'city'])).toBe('address.city');
    expect(formatPath(['nationalities', null])).toBe('nationalities[]');
    expect(formatPath(['items', 0])).toBe('items[0]');
    expect(formatPath([])).toBe('');
  });

  it('falls back to JSON for names with dots or brackets', () => {
    expect(formatPath(['vct#integrity', 'a.b'])).toBe('["vct#integrity","a.b"]');
  });
});

describe('parsePath', () => {
  it('reads readable paths', () => {
    expect(parsePath('pets[].name')).toEqual(['pets', null, 'name']);
    expect(parsePath(' address.city ')).toEqual(['address', 'city']);
    expect(parsePath('items[0]')).toEqual(['items', 0]);
    expect(parsePath('first name')).toEqual(['first name']);
    expect(parsePath('[]')).toEqual([null]);
    expect(parsePath('')).toEqual([]);
  });

  it('reads JSON arrays', () => {
    expect(parsePath('["a.b", null, 2]')).toEqual(['a.b', null, 2]);
  });

  it('rejects malformed text', () => {
    expect(parsePath('a..b')).toBeNull();
    expect(parsePath('.a')).toBeNull();
    expect(parsePath('a.')).toBeNull();
    expect(parsePath('a.[]')).toBeNull();
    expect(parsePath('[1.5]')).toBeNull();
    expect(parsePath('{"a":1}')).toBeNull();
  });

  it('round-trips with formatPath', () => {
    for (const path of [['pets', null, 'name'], ['a.b', 'c'], ['x', 3, null]]) expect(parsePath(formatPath(path))).toEqual(path);
  });
});
