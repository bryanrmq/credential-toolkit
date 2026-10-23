import type { CSSProperties, ReactNode } from 'react';
import { type CardLayout, type Ink, type Rgba, formatRgba } from '../../core/card/profiles';
import type { SummarySegment } from '../../core/card/summary';
import { CardLogo, FallbackPatternLayer, GradientLayers, SummaryText } from './cardParts';

const INK_COLOUR = { black: '#000000', white: '#FFFFFF' } as const;

export interface CredentialCardProps {
  /** Accessible name, e.g. "iOS card". */
  label: string;
  layout: CardLayout;
  background: Rgba;
  /** The background is the wallet's default colour, so a layout with a fallback pattern draws it. */
  defaultBackground?: boolean;
  ink: Ink;
  /** Null draws no name line. */
  name: string | null;
  summary: SummarySegment[];
  logo?: string;
  /** CSS zoom factor that fits the reference width into the available space. */
  scale?: number;
  /** Badges along the bottom edge, as the large iOS card on the details screen draws its status. */
  badges?: ReactNode;
}

/** One wallet's credential card: colour, fallback pattern and gradients, black or white content, logo silhouette, name and summary. */
export function CredentialCard({ label, layout, background, defaultBackground = false, ink, name, summary, logo, scale = 1, badges }: CredentialCardProps) {
  const { padding } = layout;
  const style = {
    '--card-width': `${layout.referenceWidth}px`,
    '--card-ratio': String(layout.aspectRatio),
    '--card-radius': `${layout.radius}px`,
    '--card-padding': `${padding.top}px ${padding.end}px ${padding.bottom}px ${padding.start}px`,
    '--card-padding-bottom': `${padding.bottom}px`,
    '--card-padding-start': `${padding.start}px`,
    '--card-logo-width': `${layout.logo.width}px`,
    '--card-logo-height': `${layout.logo.height}px`,
    '--card-logo-gap': `${layout.logoGap}px`,
    '--card-text-gap': `${layout.textGap}px`,
    '--card-name-weight': String(layout.nameWeight),
    '--card-line-height': layout.lineHeight === 'normal' ? 'normal' : `${layout.lineHeight}px`,
    background: formatRgba(background),
    color: INK_COLOUR[ink],
    zoom: scale,
  } as CSSProperties;

  const logoBox = <CardLogo logo={logo} ink={ink} className="credential-card__logo" />;
  const text = (
    <div className="credential-card__text">
      {name !== null && <p className="credential-card__name">{name}</p>}
      {summary.length > 0 && (
        <p className="credential-card__summary">
          <SummaryText segments={summary} />
        </p>
      )}
    </div>
  );

  return (
    <figure className={`credential-card credential-card--text-${layout.textPosition}`} style={style} aria-label={label} data-ink={ink}>
      {defaultBackground && layout.fallbackPattern && <FallbackPatternLayer pattern={layout.fallbackPattern} />}
      <GradientLayers gradients={layout.gradients} width={layout.referenceWidth} height={layout.referenceWidth / layout.aspectRatio} />
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
      {badges && <div className="credential-card__badges">{badges}</div>}
    </figure>
  );
}
