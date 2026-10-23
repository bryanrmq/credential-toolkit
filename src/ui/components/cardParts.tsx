import { isDrawableLogo } from '../../core/card/branding';
import { FALLBACK_PATTERN_TILE, type FallbackPattern, fallbackPatternImage } from '../../core/card/fallbackPattern';
import { type Gradient, gradientLayer } from '../../core/card/gradients';
import type { Ink } from '../../core/card/profiles';
import type { SummarySegment } from '../../core/card/summary';

/** Both wallets draw the logo as a black or white silhouette of its alpha channel. */
const INK_FILTER = { black: 'brightness(0)', white: 'brightness(0) invert(1)' } as const;

/** The wallet's shading layers over a card of `width` × `height` px; the parent must be positioned. */
export function GradientLayers({ gradients, width, height }: { gradients: Gradient[]; width: number; height: number }) {
  return (
    <>
      {gradients.map((gradient, index) => {
        const layer = gradientLayer(gradient, width, height);
        return (
          <span
            key={index}
            className="card-gradient"
            aria-hidden="true"
            style={{ backgroundImage: layer.image, opacity: layer.opacity, filter: layer.blur ? `blur(${layer.blur}px)` : undefined }}
          />
        );
      })}
    </>
  );
}

/**
 * Android's fallback pattern, tiled from the centre of the card as `BackgroundCanvas` does; it goes before the
 * gradient layers, which the wallet draws over it. The parent must be positioned.
 */
export function FallbackPatternLayer({ pattern }: { pattern: FallbackPattern }) {
  const style = { backgroundImage: fallbackPatternImage(pattern), backgroundSize: `${FALLBACK_PATTERN_TILE}px` };
  return <span className="card-pattern" aria-hidden="true" data-pattern={pattern} style={style} />;
}

/** The logo box, with the logo tinted black or white when it is a PNG or JPEG data URL. */
export function CardLogo({ logo, ink, className }: { logo?: string; ink: Ink; className: string }) {
  return <span className={className}>{isDrawableLogo(logo) && <img src={logo} alt="" style={{ filter: INK_FILTER[ink] }} />}</span>;
}

/** Summary text, with attributes that have no sample value shown as ‹label›. */
export function SummaryText({ segments }: { segments: SummarySegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <span key={index} className="card-placeholder">
            ‹{segment.label}›
          </span>
        ),
      )}
    </>
  );
}
