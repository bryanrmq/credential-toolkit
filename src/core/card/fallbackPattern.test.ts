import { describe, expect, it } from 'vitest';
import { FALLBACK_PATTERN_TILE, fallbackPatternImage } from './fallbackPattern';

const svgOf = (image: string) => decodeURIComponent(image.slice('url("data:image/svg+xml,'.length, -'")'.length));

describe('fallbackPatternImage', () => {
  it('draws the drawable: black diagonal lines at alpha 0.1 on a 180 × 180 tile', () => {
    const svg = svgOf(fallbackPatternImage('large'));
    expect(FALLBACK_PATTERN_TILE).toBe(180);
    expect(svg).toContain('viewBox="0 0 180 180"');
    expect(svg).toContain('stroke="#000000" stroke-opacity="0.1"');
    expect(svg.match(/M/g)).toHaveLength(27);
    expect(svg).toContain('M-199.985,200 L200,-199.985');
    expect(svg).toContain('M160.295,200 L200,160.295');
  });

  it('strokes the large pattern 2 wide and the small one 1 wide', () => {
    expect(svgOf(fallbackPatternImage('large'))).toContain('stroke-width="2"');
    expect(svgOf(fallbackPatternImage('small'))).toContain('stroke-width="1"');
  });
});
