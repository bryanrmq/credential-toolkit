/**
 * How each swiyu wallet draws the credential card, reduced to what an issuer can see: colour parsing and
 * fallback, black or white content, the missing-name text and the card geometry. Ported from the wallet
 * source (iOS `CredentialCard.swift`, `Color+Hex.swift`, `Color+Luminance.swift`; Android
 * `CredentialCardCreditFormat.kt`, `MediumCredentialCard.kt`, `GetCredentialCardStateImpl.kt`,
 * `GetContrastedColorImpl.kt`).
 */

import type { ClaimsPath } from '../model';

export type CardPlatform = 'ios' | 'android';
export type CardVariant = 'detail' | 'offer';
export type Ink = 'black' | 'white';

/** Channels 0–255, alpha 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface CardLayout {
  /** The card's width in px on a typical phone; the preview scales it down to fit. */
  referenceWidth: number;
  /** Width / height. */
  aspectRatio: number;
  radius: number;
  padding: { top: number; end: number; bottom: number; start: number };
  /** Box the logo is fitted into, top-right. */
  logo: { width: number; height: number };
  /** Detail: least space between the text and the logo. Offer: space under the logo. */
  logoGap: number;
  /** Space between name and summary. */
  textGap: number;
  nameWeight: 400 | 500;
  lineHeight: number | 'normal';
  /** Detail cards put the text at the top, offer cards at the bottom. */
  textPosition: 'top' | 'bottom';
}

export interface CardProfile {
  platform: CardPlatform;
  /** The colour the wallet draws, or null when it falls back to `fallbackBackground`. */
  parseBackground(value: string | undefined): Rgba | null;
  fallbackBackground: Rgba;
  /** Black or white content on this background; alpha is ignored, as on both wallets. */
  textInk(background: Rgba): Ink;
  /** Shown when the name is empty; null draws no name. */
  missingName: string | null;
  /** Applies a template's `[N]` or `[null]` suffix to an attribute's claims path; null when nothing can match. */
  indexPath(path: ClaimsPath, index: number | null): ClaimsPath | null;
  layout: Record<CardVariant, CardLayout>;
}

const HEX6 = /^[0-9A-Fa-f]{6}$/;
const HEX8 = /^[0-9A-Fa-f]{8}$/;

function channels(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** iOS `Color(hex:)`: trims, drops every `#`, then 6 digits or 8 with alpha last. */
function parseIosBackground(value: string | undefined): Rgba | null {
  if (value === undefined) return null;
  const hex = value.trim().replaceAll('#', '');
  if (HEX6.test(hex)) {
    const [r, g, b] = channels(hex);
    return { r, g, b, a: 1 };
  }
  if (HEX8.test(hex)) {
    const [r, g, b] = channels(hex);
    return { r, g, b, a: parseInt(hex.slice(6, 8), 16) / 255 };
  }
  return null;
}

/** Android `GetCredentialCardStateImpl`: must start with `#` and be at most 7 characters; only `#RRGGBB` parses. */
function parseAndroidBackground(value: string | undefined): Rgba | null {
  if (!value || !value.startsWith('#') || value.length > 7) return null;
  const hex = value.slice(1);
  if (!HEX6.test(hex)) return null;
  const [r, g, b] = channels(hex);
  return { r, g, b, a: 1 };
}

/** iOS `Color.suggestedColorScheme()`: W3C perceived brightness plus colour difference against white and black. */
function iosTextInk({ r, g, b }: Rgba): Ink {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const brightness = 0.299 * red + 0.587 * green + 0.114 * blue;
  const sum = red + green + blue;
  const contrastWithWhite = 1 - brightness + (3 - sum);
  const contrastWithBlack = brightness + sum;
  return contrastWithWhite > contrastWithBlack ? 'white' : 'black';
}

/** Android `ColorUtils.calculateLuminance`: WCAG relative luminance of an 8-bit sRGB colour. */
function luminance(r: number, g: number, b: number): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value < 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Android `GetContrastedColorImpl`: composites black at alpha 77 (0.3) over the colour with the integer maths
 * of `ColorUtils.compositeColors`, then picks the content colour with the higher WCAG contrast.
 */
function androidTextInk({ r, g, b }: Rgba): Ink {
  const darken = (channel: number) => Math.floor((channel * (255 - 77)) / 255);
  const background = luminance(darken(r), darken(g), darken(b));
  const contrastWithWhite = 1.05 / (background + 0.05);
  const contrastWithBlack = (background + 0.05) / 0.05;
  return contrastWithWhite > contrastWithBlack ? 'white' : 'black';
}

/** iOS `AttributeTemplateResolver`: `[N]` replaces the path's single `null`; `[null]` leaves the path as is. */
function iosIndexPath(path: ClaimsPath, index: number | null): ClaimsPath | null {
  if (index === null) return path;
  const nulls = path.filter((segment) => segment === null).length;
  return nulls === 1 ? path.map((segment) => (segment === null ? index : segment)) : null;
}

/** Android `TransformOcaOverlaysImpl.getReplacement`: drops a trailing `null`, then appends the index. */
function androidIndexPath(path: ClaimsPath, index: number | null): ClaimsPath {
  const base = path[path.length - 1] === null ? path.slice(0, -1) : path;
  return [...base, index];
}

export const CARD_PROFILES: Record<CardPlatform, CardProfile> = {
  ios: {
    platform: 'ios',
    parseBackground: parseIosBackground,
    fallbackBackground: { r: 0xd7, g: 0xd4, b: 0xcd, a: 1 },
    textInk: iosTextInk,
    missingName: 'n/a',
    indexPath: iosIndexPath,
    layout: {
      // CredentialCard .large, credential detail screen
      detail: {
        referenceWidth: 361,
        aspectRatio: 1.586,
        radius: 20,
        padding: { top: 20, end: 20, bottom: 20, start: 20 },
        logo: { width: 60, height: 32 },
        logoGap: 24,
        textGap: 4,
        nameWeight: 500,
        lineHeight: 'normal',
        textPosition: 'top',
      },
      // CredentialCard .regular, credential offer screen
      offer: {
        referenceWidth: 233,
        aspectRatio: 0.681,
        radius: 20,
        padding: { top: 20, end: 20, bottom: 20, start: 20 },
        logo: { width: 60, height: 21 },
        logoGap: 0,
        textGap: 4,
        nameWeight: 500,
        lineHeight: 'normal',
        textPosition: 'bottom',
      },
    },
  },
  android: {
    platform: 'android',
    parseBackground: parseAndroidBackground,
    fallbackBackground: { r: 0xf0, g: 0xed, b: 0xe5, a: 1 },
    textInk: androidTextInk,
    missingName: null,
    indexPath: androidIndexPath,
    layout: {
      // CredentialCardCreditFormat, credential detail screen
      detail: {
        referenceWidth: 380,
        aspectRatio: 1.586,
        radius: 16,
        padding: { top: 24, end: 24, bottom: 16, start: 24 },
        logo: { width: 32, height: 32 },
        logoGap: 16,
        textGap: 0,
        nameWeight: 400,
        lineHeight: 22,
        textPosition: 'top',
      },
      // MediumCredentialCard, credential offer screen
      offer: {
        referenceWidth: 268,
        aspectRatio: 0.68,
        radius: 20,
        padding: { top: 16, end: 16, bottom: 16, start: 16 },
        logo: { width: 24, height: 24 },
        logoGap: 12,
        textGap: 0,
        nameWeight: 400,
        lineHeight: 22,
        textPosition: 'bottom',
      },
    },
  },
};

export function formatHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
