const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * The colour the wallet tints a logo on this background: a port of the swiyu iOS wallet's
 * `Color.suggestedColorScheme()` (W3C perceived brightness plus colour difference against
 * white and black). Missing or malformed colours count as white.
 */
export function logoTint(background: string | undefined): 'black' | 'white' {
  if (!background || !HEX.test(background)) return 'black';
  const [red, green, blue] = [1, 3, 5].map((index) => parseInt(background.slice(index, index + 2), 16) / 255);
  const brightness = 0.299 * red + 0.587 * green + 0.114 * blue;
  const sum = red + green + blue;
  const contrastWithWhite = 1 - brightness + (3 - sum);
  const contrastWithBlack = brightness + sum;
  return contrastWithWhite > contrastWithBlack ? 'white' : 'black';
}
