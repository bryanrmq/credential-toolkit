import { describe, expect, it } from 'vitest';
import { CARD_PROFILES, type CardPlatform, formatHex } from './profiles';

const ink = (platform: CardPlatform, hex: string) => {
  const profile = CARD_PROFILES[platform];
  return profile.textInk(profile.parseBackground(hex)!);
};

describe('textInk', () => {
  it('switches greys to black text where each wallet does', () => {
    expect(ink('ios', '#7F7F7F')).toBe('white');
    expect(ink('ios', '#808080')).toBe('black');
    expect(ink('android', '#A9A9A9')).toBe('white');
    expect(ink('android', '#AAAAAA')).toBe('black');
  });

  it.each([
    ['#3B82F6', 'black', 'white'],
    ['#1E90FF', 'black', 'white'],
    ['#808080', 'black', 'white'],
    ['#A0A0A0', 'black', 'white'],
    ['#22C55E', 'white', 'black'],
  ])('disagrees between the wallets on %s', (hex, ios, android) => {
    expect(ink('ios', hex)).toBe(ios);
    expect(ink('android', hex)).toBe(android);
  });

  it.each([
    ['#FF0000', 'white'],
    ['#0000FF', 'white'],
    ['#14B8A6', 'white'],
    ['#FFCC00', 'black'],
    ['#F0EDE5', 'black'],
    ['#D7D4CD', 'black'],
  ])('agrees between the wallets on %s', (hex, expected) => {
    expect(ink('ios', hex)).toBe(expected);
    expect(ink('android', hex)).toBe(expected);
  });

  it('keeps the iOS logo tint cases of the former logoTint helper', () => {
    expect(ink('ios', '#FFFFFF')).toBe('black');
    expect(ink('ios', '#FA8072')).toBe('black');
    expect(ink('ios', '#2C75E3')).toBe('white');
    expect(ink('ios', '#003366')).toBe('white');
  });

  it('gives black text on both fallback colours', () => {
    for (const platform of ['ios', 'android'] as const) {
      const profile = CARD_PROFILES[platform];
      expect(profile.textInk(profile.fallbackBackground)).toBe('black');
    }
  });
});

describe('parseBackground', () => {
  const blue = { r: 59, g: 130, b: 246, a: 1 };

  it('follows iOS Color(hex:): trims, drops #, accepts 6 digits or 8 with alpha last', () => {
    const parse = CARD_PROFILES.ios.parseBackground;
    expect(parse('#3B82F6')).toEqual(blue);
    expect(parse('#3b82f6')).toEqual(blue);
    expect(parse(' #3B82F6 ')).toEqual(blue);
    expect(parse('3B82F6')).toEqual(blue);
    expect(parse('#3B82F680')).toEqual({ ...blue, a: 128 / 255 });
    expect(parse('#ABC')).toBeNull();
    expect(parse('#3B82FG')).toBeNull();
    expect(parse('blue')).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse(undefined)).toBeNull();
  });

  it('follows Android: must start with #, at most 7 characters, only #RRGGBB', () => {
    const parse = CARD_PROFILES.android.parseBackground;
    expect(parse('#3B82F6')).toEqual(blue);
    expect(parse('#3b82f6')).toEqual(blue);
    expect(parse(' #3B82F6')).toBeNull();
    expect(parse('3B82F6')).toBeNull();
    expect(parse('#3B82F680')).toBeNull();
    expect(parse('#ABC')).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse(undefined)).toBeNull();
  });
});

describe('profiles', () => {
  it('uses each wallet fallback colour and missing-name text', () => {
    expect(formatHex(CARD_PROFILES.ios.fallbackBackground)).toBe('#D7D4CD');
    expect(formatHex(CARD_PROFILES.android.fallbackBackground)).toBe('#F0EDE5');
    expect(CARD_PROFILES.ios.missingName).toBe('n/a');
    expect(CARD_PROFILES.android.missingName).toBeNull();
  });

  it('lays out the detail card in landscape and the offer card in portrait', () => {
    for (const platform of ['ios', 'android'] as const) {
      const { detail, offer } = CARD_PROFILES[platform].layout;
      expect(detail.aspectRatio).toBeGreaterThan(1);
      expect(detail.textPosition).toBe('top');
      expect(offer.aspectRatio).toBeLessThan(1);
      expect(offer.textPosition).toBe('bottom');
    }
  });
});
