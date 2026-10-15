import type { CSSProperties } from 'react';
import type { CardLayout, Ink, Rgba } from '../../core/card/profiles';
import type { SummarySegment } from '../../core/card/summary';

const INK_COLOUR = { black: '#000000', white: '#FFFFFF' } as const;
/** Both wallets draw the logo as a black or white silhouette of its alpha channel. */
const INK_FILTER = { black: 'brightness(0)', white: 'brightness(0) invert(1)' } as const;
/** The only logos both wallets can decode and Android accepts. */
const DRAWABLE_LOGO = /^data:image\/(?:png|jpeg);base64,/;

export interface CredentialCardProps {
  /** Accessible name, e.g. "iOS detail card". */
  label: string;
  layout: CardLayout;
  background: Rgba;
  ink: Ink;
  /** Null draws no name line. */
  name: string | null;
  summary: SummarySegment[];
  logo?: string;
  /** CSS zoom factor that fits the reference width into the available space. */
  scale?: number;
}

/** One wallet's credential card: colour, black or white content, logo silhouette, name and summary. */
export function CredentialCard({ label, layout, background, ink, name, summary, logo, scale = 1 }: CredentialCardProps) {
  const { padding } = layout;
  const style = {
    '--card-width': `${layout.referenceWidth}px`,
    '--card-ratio': String(layout.aspectRatio),
    '--card-radius': `${layout.radius}px`,
    '--card-padding': `${padding.top}px ${padding.end}px ${padding.bottom}px ${padding.start}px`,
    '--card-logo-width': `${layout.logo.width}px`,
    '--card-logo-height': `${layout.logo.height}px`,
    '--card-logo-gap': `${layout.logoGap}px`,
    '--card-text-gap': `${layout.textGap}px`,
    '--card-name-weight': String(layout.nameWeight),
    '--card-line-height': layout.lineHeight === 'normal' ? 'normal' : `${layout.lineHeight}px`,
    background: `rgba(${background.r}, ${background.g}, ${background.b}, ${background.a})`,
    color: INK_COLOUR[ink],
    zoom: scale,
  } as CSSProperties;

  const logoBox = (
    <span className="credential-card__logo">
      {logo && DRAWABLE_LOGO.test(logo) && <img src={logo} alt="" style={{ filter: INK_FILTER[ink] }} />}
    </span>
  );
  const text = (
    <div className="credential-card__text">
      {name !== null && <p className="credential-card__name">{name}</p>}
      {summary.length > 0 && (
        <p className="credential-card__summary">
          {summary.map((segment, index) =>
            segment.kind === 'text' ? (
              segment.text
            ) : (
              <span key={index} className="credential-card__placeholder">
                ‹{segment.label}›
              </span>
            ),
          )}
        </p>
      )}
    </div>
  );

  return (
    <figure className={`credential-card credential-card--text-${layout.textPosition}`} style={style} aria-label={label} data-ink={ink}>
      {layout.textPosition === 'top' ? (
        <>
          {text}
          {logoBox}
        </>
      ) : (
        <>
          {logoBox}
          {text}
        </>
      )}
    </figure>
  );
}
