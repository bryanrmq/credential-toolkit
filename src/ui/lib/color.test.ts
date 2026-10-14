import { describe, expect, it } from 'vitest';
import { logoTint } from './color';

describe('logoTint', () => {
  it('picks the logo tint the swiyu iOS wallet picks for a background', () => {
    expect(logoTint('#FFFFFF')).toBe('black');
    expect(logoTint('#FA8072')).toBe('black');
    expect(logoTint('#2C75E3')).toBe('white');
    expect(logoTint('#003366')).toBe('white');
  });

  it('treats a missing or malformed colour as white', () => {
    expect(logoTint(undefined)).toBe('black');
    expect(logoTint('#12')).toBe('black');
  });
});
