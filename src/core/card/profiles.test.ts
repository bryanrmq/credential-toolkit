import { describe, expect, it } from 'vitest';
import { CARD_PROFILES, type CardPlatform, formatHex, formatRgba, isDefaultBackground, previewViewOf, shownVariant } from './profiles';

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

  it('offers Card, Details and Home on iOS, whose offer screen uses the detail card, and Detail, Offer, Details and Home on Android', () => {
    expect(CARD_PROFILES.ios.variants).toEqual(['detail', 'details', 'home']);
    expect(CARD_PROFILES.android.variants).toEqual(['detail', 'offer', 'details', 'home']);
    expect(CARD_PROFILES.ios.layout.offer).toBeUndefined();
  });

  it('lays out detail cards in landscape and the Android offer card in portrait', () => {
    expect(CARD_PROFILES.ios.layout.detail.aspectRatio).toBeGreaterThan(1);
    expect(CARD_PROFILES.android.layout.detail.aspectRatio).toBeGreaterThan(1);
    expect(CARD_PROFILES.android.layout.offer?.aspectRatio).toBeLessThan(1);
    expect(CARD_PROFILES.android.layout.offer?.textPosition).toBe('bottom');
  });

  it('shows the detail card for a variant the platform does not have', () => {
    expect(shownVariant(CARD_PROFILES.ios, 'offer')).toBe('detail');
    expect(shownVariant(CARD_PROFILES.ios, 'home')).toBe('home');
    expect(shownVariant(CARD_PROFILES.android, 'offer')).toBe('offer');
    expect(shownVariant(CARD_PROFILES.ios, 'details')).toBe('details');
  });

  it('puts both cards in the Card view', () => {
    expect(previewViewOf('detail')).toBe('card');
    expect(previewViewOf('offer')).toBe('card');
    expect(previewViewOf('details')).toBe('details');
    expect(previewViewOf('home')).toBe('home');
  });

  it('draws the home row like each wallet list', () => {
    const { ios, android } = { ios: CARD_PROFILES.ios.home, android: CARD_PROFILES.android.home };
    expect(ios.thumbnail).toMatchObject({ width: 72, height: 96, radius: 12, logo: { width: 64, height: 21 } });
    expect(android.thumbnail).toMatchObject({ width: 48, height: 64, radius: 8, logo: { width: 24, height: 24 } });
    expect([ios.chevron, android.chevron]).toEqual([false, true]);
    expect([ios.missingName, android.missingName]).toEqual(['Credential', null]);
    // betaWallet/Background/Secondary.colorset in eidch-ios-wallet 1.14.0: 241/245/249 light
    expect(ios.colours.light.page).toBe('#F1F5F9');
    expect(ios.colours.dark).toEqual({ page: '#1C1C1E', row: '#2C2C2E', name: '#FFFFFF', summary: 'rgba(235, 235, 245, 0.6)' });
    expect(android.colours.light).toEqual({ page: '#FFFFFF', row: '#FFFFFF', name: '#092740', summary: '#41484D' });
  });

  it("draws Android's fallback pattern on every card size, the small one on the home thumbnail, and none on iOS", () => {
    expect(CARD_PROFILES.android.layout.detail.fallbackPattern).toBe('large');
    expect(CARD_PROFILES.android.layout.offer?.fallbackPattern).toBe('large');
    expect(CARD_PROFILES.android.home.thumbnail.fallbackPattern).toBe('small');
    expect(CARD_PROFILES.ios.layout.detail.fallbackPattern).toBeUndefined();
    expect(CARD_PROFILES.ios.home.thumbnail.fallbackPattern).toBeUndefined();
  });

  it('writes a colour as CSS rgba', () => {
    expect(formatRgba({ r: 59, g: 130, b: 246, a: 0.5 })).toBe('rgba(59, 130, 246, 0.5)');
  });
});

describe('isDefaultBackground', () => {
  const android = CARD_PROFILES.android;
  const isDefault = (hex: string) => isDefaultBackground(android, android.parseBackground(hex) ?? android.fallbackBackground);

  it('holds for the fallback, and for the same colour picked by the issuer, in any case', () => {
    expect(isDefaultBackground(android, android.fallbackBackground)).toBe(true);
    expect(isDefault('#F0EDE5')).toBe(true);
    expect(isDefault('#f0ede5')).toBe(true);
    expect(isDefault('F0EDE5')).toBe(true);
  });

  it('fails for any other colour', () => {
    expect(isDefault('#F0EDE6')).toBe(false);
    expect(isDefault('#3B82F6')).toBe(false);
  });
});
