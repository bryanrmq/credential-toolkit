import { describe, expect, it } from 'vitest';
import main from '../main.tsx?raw';

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true });
/** Every stylesheet, by path (`./styles/tokens.css`). */
const sheets = import.meta.glob<string>('./styles/*.css', { query: '?raw', import: 'default', eager: true });
const tokensCss = sheets['./styles/tokens.css'];

/** The dark theme's token blocks: for System on a dark OS, and for a chosen Dark. */
const DARK_SYSTEM = /^@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme='light'\]\) \{\n([\s\S]*?)^ {2}\}\n\}/m;
const DARK_CHOSEN = /^:root\[data-theme='dark'\] \{\n([\s\S]*?)^\}/m;

/**
 * The chrome: every stylesheet but what tokens.css holds before and in `:root` and the dark theme's blocks, without
 * the wallet preview blocks (the wallets' values).
 */
function chrome(): string {
  const tokensRest = tokensCss.replace(/^[\s\S]*?^:root \{[\s\S]*?^\}/m, '').replace(DARK_SYSTEM, '').replace(DARK_CHOSEN, '');
  const others = Object.entries(sheets).filter(([path]) => path !== './styles/tokens.css');
  return [tokensRest, ...others.map(([, css]) => css)]
    .join('\n')
    .replace(/\/\* wallet-preview:start[\s\S]*?\/\* wallet-preview:end \*\//g, '');
}

const declarations = (property: string) =>
  [...chrome().matchAll(new RegExp(`^\\s*${property}:\\s*([^;]+);`, 'gm'))].map((match) => match[1].trim());

describe('design tokens', () => {
  it('keeps colour literals out of the chrome', () => {
    expect(chrome().match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? []).toEqual([]);
  });

  it('sets font sizes, radii and shadows through tokens only', () => {
    expect(declarations('font-size').length).toBeGreaterThan(50);
    expect(declarations('font-size').filter((value) => !/^var\(--text-[a-z0-9]+\)$|^inherit$/.test(value))).toEqual([]);
    expect(declarations('border-radius').filter((value) => !/^var\(--radius(-[a-z]+)?\)$|^0$/.test(value))).toEqual([]);
    expect(declarations('box-shadow').filter((value) => /rgb|\d+px \d+px/.test(value) && !/^(inset )?0 0 0 /.test(value))).toEqual([]);
  });

  it('wraps every wallet preview block, inside one file', () => {
    for (const css of Object.values(sheets)) expect(css.match(/wallet-preview:start/g)?.length).toBe(css.match(/wallet-preview:end/g)?.length);
  });

  it('defines the tokens in tokens.css only', () => {
    expect(tokensCss).toMatch(/^:root \{/m);
    const elsewhere = Object.entries(sheets).filter(([path, css]) => path !== './styles/tokens.css' && /^:root\b/m.test(css));
    expect(elsewhere.map(([path]) => path)).toEqual([]);
  });
});

describe('stylesheets', () => {
  it('are each imported once from main.tsx, tokens first', () => {
    const imported = [...main.matchAll(/^import '\.\/ui\/styles\/([\w-]+\.css)';$/gm)].map((match) => `./styles/${match[1]}`);
    expect(Object.keys(sheets).length).toBeGreaterThan(10);
    expect([...imported].sort()).toEqual(Object.keys(sheets).sort());
    expect(imported[0]).toBe('./styles/tokens.css');
  });
});

/** The custom properties a block sets, by name. */
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1], match[2].trim()]));
}

/** WCAG 2 contrast ratio of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => {
      const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('dark theme', () => {
  const system = tokensCss.match(DARK_SYSTEM)?.[1] ?? '';
  const chosen = tokensCss.match(DARK_CHOSEN)?.[1] ?? '';
  const dark = tokens(chosen);

  it('gives System on a dark OS the same tokens as a chosen Dark', () => {
    expect(Object.keys(dark).length).toBeGreaterThan(20);
    expect(tokens(system)).toEqual(dark);
    expect(system).toContain('color-scheme: dark;');
    expect(chosen).toContain('color-scheme: dark;');
  });

  it('redefines colour, shadow, backdrop and caret tokens only', () => {
    expect(Object.keys(dark).filter((name) => !/^--(canvas|surface|backdrop|border|text|accent|on-accent|(red|blue|green|yellow)-|shadow-|select-caret)/.test(name))).toEqual([]);
  });

  it('keeps text at 4.5:1 on every surface, and each meaning pair at 4.5:1', () => {
    const surfaces = ['--canvas', '--surface', '--surface-muted', '--surface-hover', '--surface-selected'];
    const texts = ['--text', '--text-strong', '--text-muted', '--red-text', '--blue-text', '--green-text', '--yellow-text'];
    const low = surfaces.flatMap((surface) =>
      texts.filter((text) => contrast(dark[text], dark[surface]) < 4.5).map((text) => `${text} on ${surface}`),
    );
    expect(low).toEqual([]);
    for (const tone of ['red', 'blue', 'green', 'yellow']) expect(contrast(dark[`--${tone}-text`], dark[`--${tone}-bg`])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark['--on-accent'], dark['--accent'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('inline styles', () => {
  it('carry no spacing', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const offenders = Object.entries(sources).flatMap(([path, source]) =>
      [...source.matchAll(/style=\{\{([^}]*)\}\}/g)]
        .filter((match) => /\b(margin|padding|gap)\w*\s*:/.test(match[1]))
        .map((match) => `${path}: ${match[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
