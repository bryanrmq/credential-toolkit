/**
 * Android `CredentialBackgroundFallbackPattern`: diagonal lines the wallet tiles over a card whose colour is the
 * default `#F0EDE5` (`CredentialCardState.useDefaultBackground`), on the detail, offer and home thumbnail cards.
 * The path is copied from `res/drawable/wallet_ic_credential_background_fallback_pattern.xml` and its `_small`
 * twin, which differ only in stroke width.
 */

/** The large pattern (detail and offer cards) or the small one (home thumbnail). */
export type FallbackPattern = 'large' | 'small';

/** The drawable's size in dp, and the tile `BackgroundCanvas` repeats from the centre of the card. */
export const FALLBACK_PATTERN_TILE = 180;

const PATH =
  'M-199.985,200 L200,-199.985 M-186.14,200 L200,-186.14 M-172.295,200 L200,-172.295 M-158.45,200 L200,-158.45 ' +
  'M-144.605,200 L200,-144.605 M-130.76,200 L200,-130.76 M-116.915,200 L200,-116.915 M-103.07,200 L200,-103.07 ' +
  'M-89.225,200 L200,-89.225 M-75.38,200 L200,-75.38 M-61.535,200 L200,-61.535 M-47.69,200 L200,-47.69 ' +
  'M-33.845,200 L200,-33.845 M-20,200 L200,-20 M-6,200 L200,-6 M8,200 L200,8 M21.845,200 L200,21.845 ' +
  'M35.69,200 L200,35.69 M49.535,200 L200,49.535 M63.38,200 L200,63.38 M77.225,200 L200,77.225 M91.07,200 L200,91.07 ' +
  'M104.915,200 L200,104.915 M118.76,200 L200,118.76 M132.605,200 L200,132.605 M146.45,200 L200,146.45 ' +
  'M160.295,200 L200,160.295';

const STROKE_WIDTH: Record<FallbackPattern, number> = { large: 2, small: 1 };

/** The drawable as an SVG data URL: black lines at alpha 0.1, on a 180 × 180 viewport. */
export function fallbackPatternImage(pattern: FallbackPattern): string {
  const size = FALLBACK_PATTERN_TILE;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<path d="${PATH}" fill="none" stroke="#000000" stroke-opacity="0.1" stroke-width="${STROKE_WIDTH[pattern]}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
