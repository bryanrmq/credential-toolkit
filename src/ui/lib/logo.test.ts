import { describe, expect, it } from 'vitest';
import { scaledSize } from './logo';

describe('scaledSize', () => {
  it('scales the longest side down to the maximum and never up', () => {
    expect(scaledSize(1024, 512, 512)).toEqual({ width: 512, height: 256 });
    expect(scaledSize(100, 50, 512)).toEqual({ width: 100, height: 50 });
  });

  it('refuses an image whose size the browser could not read', () => {
    expect(() => scaledSize(0, 0, 512)).toThrow('could not read the size');
    expect(() => scaledSize(300, 0, 512)).toThrow('could not read the size');
  });
});
