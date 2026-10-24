import { describe, expect, it } from 'vitest';
import css from './styles.css?raw';

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true });

/** The chrome: styles.css after the token reference and `:root`, without the wallet preview blocks (the wallets' values). */
function chrome(): string {
  const withoutRoot = css.replace(/^[\s\S]*?^:root \{[\s\S]*?^\}/m, '');
  return withoutRoot.replace(/\/\* wallet-preview:start[\s\S]*?\/\* wallet-preview:end \*\//g, '');
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

  it('wraps every wallet preview block', () => {
    expect(css.match(/wallet-preview:start/g)?.length).toBe(css.match(/wallet-preview:end/g)?.length);
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
