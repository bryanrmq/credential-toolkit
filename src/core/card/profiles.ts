/**
 * How each swiyu wallet draws the credential card, reduced to what an issuer can see: colour parsing and
 * fallback, black or white content, the missing-name text, the card geometry and gradients, and the home list
 * row. Ported from the wallet source (iOS `CredentialCard.swift`, `VerifiableCredentialCellV1.swift`,
 * `Color+Hex.swift`, `Color+Luminance.swift`; Android `CredentialCardCreditFormat.kt`, `MediumCredentialCard.kt`,
 * `CredentialCardListItem.kt`, `Gradients.kt`, `GetCredentialCardStateImpl.kt`, `GetContrastedColorImpl.kt`,
 * `CredentialCardState.kt`).
 */

import type { ClaimsPath } from '../model.ts';
import type { FallbackPattern } from './fallbackPattern.ts';
import type { Gradient } from './gradients.ts';

export type CardPlatform = 'ios' | 'android';
/** Detail and offer cards, the details screen, and the row in the home list. */
export type CardVariant = 'detail' | 'offer' | 'details' | 'home';
/** What the wallet preview offers to show: a card (detail or offer), the details screen, or the home row. */
export type PreviewView = 'card' | 'details' | 'home';
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
  /** Shading drawn over the card colour, bottom to top. */
  gradients: Gradient[];
  /** Lines tiled under the shading when the colour is the default (Android only). */
  fallbackPattern?: FallbackPattern;
}

export interface HomeRowColours {
  /** The list background behind the row. */
  page: string;
  row: string;
  name: string;
  summary: string;
}

/** The home list row: a logo-only card thumbnail, then the name and summary in the app's own text style. */
export interface HomeRowLayout {
  /** The row's width in px on a typical phone; the preview scales it down to fit. */
  referenceWidth: number;
  thumbnail: {
    width: number;
    height: number;
    radius: number;
    logo: { width: number; height: number };
    gradients: Gradient[];
    /** Lines tiled under the shading when the colour is the default (Android only). */
    fallbackPattern?: FallbackPattern;
  };
  /** Space between the thumbnail and the text. */
  gap: number;
  padding: { vertical: number; horizontal: number };
  radius: number;
  nameSize: number;
  summarySize: number;
  lineHeight: number | 'normal';
  chevron: boolean;
  /** Shown when the name is empty; null draws no name. */
  missingName: string | null;
  colours: Record<'light' | 'dark', HomeRowColours>;
}

export interface CardProfile {
  platform: CardPlatform;
  /** The colour the wallet draws, or null when it falls back to `fallbackBackground`. */
  parseBackground(value: string | undefined): Rgba | null;
  fallbackBackground: Rgba;
  /** Black or white content on this background; alpha is ignored, as on both wallets. */
  textInk(background: Rgba): Ink;
  /** Shown on a card when the name is empty; null draws no name. */
  missingName: string | null;
  /** Applies a template's `[N]` or `[null]` suffix to an attribute's claims path; null when nothing can match. */
  indexPath(path: ClaimsPath, index: number | null): ClaimsPath | null;
  /** The variants this wallet has, in tab order. */
  variants: CardVariant[];
  /** Card layouts; a wallet without an offer layout shows its detail card on the offer screen. */
  layout: { detail: CardLayout; offer?: CardLayout };
  home: HomeRowLayout;
}

/** The variant to draw: one the platform has, otherwise its detail card. */
export function shownVariant(profile: CardProfile, variant: CardVariant): CardVariant {
  return profile.variants.includes(variant) ? variant : 'detail';
}

/** The preview view a variant belongs to: both cards are the Card view. */
export function previewViewOf(variant: CardVariant): PreviewView {
  return variant === 'detail' || variant === 'offer' ? 'card' : variant;
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

/** iOS: `[black, clear]` from `UnitPoint(angle: 110°)` to `UnitPoint(angle: 290°)` at opacity 0.25, on every size. */
const IOS_LINEAR: Gradient = {
  kind: 'linear',
  start: [0.318, 0],
  end: [0.682, 1],
  stops: [
    { at: 0, alpha: 1 },
    { at: 1, alpha: 0 },
  ],
  opacity: 0.25,
};

/**
 * iOS: `EllipticalGradient([black, black, clear], center: .bottomLeading)` scaled by 0.8 × 0.5 from the bottom
 * left, opacity 0.15, blur 6, on cards larger than `.small`.
 */
const IOS_ELLIPSE: Gradient = {
  kind: 'ellipse',
  center: [0, 1],
  radii: [0.8, 0.5],
  stops: [
    { at: 0, alpha: 1 },
    { at: 0.5, alpha: 1 },
    { at: 1, alpha: 0 },
  ],
  opacity: 0.15,
  blur: 6,
};

const fade = (alpha: number) => [
  { at: 0, alpha },
  { at: 1, alpha: 0 },
];

/** Android `diagonalCredentialBrush`: black at 0.3 from the top-left corner to clear at the bottom-right. */
const ANDROID_DIAGONAL: Gradient = { kind: 'linear', start: [0, 0], end: [1, 1], stops: fade(0.3), opacity: 1 };
/** Android `leftBottomRadialCredentialBrush` (offer card). */
const ANDROID_LEFT_BOTTOM: Gradient = { kind: 'radial', center: [0.18, 1.04], radius: 0.5, radiusOf: 'shorterSide', stops: fade(0.3) };
/** Android `leftBottomRadialLargeCredentialBrush` (detail card). */
const ANDROID_LEFT_BOTTOM_LARGE: Gradient = { kind: 'radial', center: [0, 1], radius: 0.6, radiusOf: 'width', stops: fade(0.3) };
/** Android `bottomCenterRadialCredentialBrush` (detail card). */
const ANDROID_BOTTOM_CENTER: Gradient = { kind: 'radial', center: [0.55, 0.9], radius: 0.3, radiusOf: 'shorterSide', stops: fade(0.1) };

export const CARD_PROFILES: Record<CardPlatform, CardProfile> = {
  ios: {
    platform: 'ios',
    parseBackground: parseIosBackground,
    fallbackBackground: { r: 0xd7, g: 0xd4, b: 0xcd, a: 1 },
    textInk: iosTextInk,
    missingName: 'n/a',
    indexPath: iosIndexPath,
    variants: ['detail', 'details', 'home'],
    layout: {
      // CredentialCard .large: credential detail screen, and the offer screen of the current app
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
        gradients: [IOS_LINEAR, IOS_ELLIPSE],
      },
    },
    // VerifiableCredentialCellV1 in an inset grouped list, with CredentialCard .small as thumbnail
    home: {
      referenceWidth: 361,
      thumbnail: { width: 72, height: 96, radius: 12, logo: { width: 64, height: 21 }, gradients: [IOS_LINEAR] },
      gap: 12,
      padding: { vertical: 12, horizontal: 16 },
      radius: 10,
      nameSize: 17,
      summarySize: 16,
      lineHeight: 'normal',
      chevron: false,
      missingName: 'Credential',
      colours: {
        light: { page: '#F1F5F9', row: '#FFFFFF', name: '#0A2841', summary: 'rgba(10, 40, 65, 0.68)' },
        dark: { page: '#1C1C1E', row: '#2C2C2E', name: '#FFFFFF', summary: 'rgba(235, 235, 245, 0.6)' },
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
    variants: ['detail', 'offer', 'details', 'home'],
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
        gradients: [ANDROID_DIAGONAL, ANDROID_LEFT_BOTTOM_LARGE, ANDROID_BOTTOM_CENTER],
        fallbackPattern: 'large',
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
        gradients: [ANDROID_DIAGONAL, ANDROID_LEFT_BOTTOM],
        fallbackPattern: 'large',
      },
    },
    // CredentialCardListItem (Material3 ListItem) with CredentialCardVerySmall as thumbnail
    home: {
      referenceWidth: 380,
      // CredentialCardVerySmall draws the small pattern
      thumbnail: { width: 48, height: 64, radius: 8, logo: { width: 24, height: 24 }, gradients: [ANDROID_DIAGONAL], fallbackPattern: 'small' },
      gap: 16,
      padding: { vertical: 12, horizontal: 16 },
      radius: 16,
      nameSize: 16,
      summarySize: 16,
      lineHeight: 24,
      chevron: true,
      missingName: null,
      colours: {
        light: { page: '#FFFFFF', row: '#FFFFFF', name: '#092740', summary: '#41484D' },
        dark: { page: '#0F1316', row: '#242A30', name: '#FFFFFF', summary: '#C1C7CE' },
      },
    },
  },
};

/**
 * Android `CredentialCardState.useDefaultBackground`: the card colour equals the fallback, whether the wallet fell
 * back to it or the issuer picked that very colour.
 */
export function isDefaultBackground(profile: CardProfile, background: Rgba): boolean {
  const fallback = profile.fallbackBackground;
  return background.r === fallback.r && background.g === fallback.g && background.b === fallback.b && background.a === fallback.a;
}

export function formatHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function formatRgba({ r, g, b, a }: Rgba): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
