import { CaretRightIcon } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import { type HomeRowLayout, type Ink, type Rgba, formatRgba } from '../../core/card/profiles';
import type { SummarySegment } from '../../core/card/summary';
import { CardLogo, GradientLayers, SummaryText } from './cardParts';

export interface CredentialHomeRowProps {
  /** Accessible name, e.g. "iOS home row". */
  label: string;
  layout: HomeRowLayout;
  theme: 'light' | 'dark';
  background: Rgba;
  ink: Ink;
  /** Null draws no name line. */
  name: string | null;
  summary: SummarySegment[];
  logo?: string;
  /** CSS zoom factor that fits the reference width into the available space. */
  scale?: number;
}

/** One wallet's home list row: a logo-only card thumbnail, then the name and summary in the list colours. */
export function CredentialHomeRow({ label, layout, theme, background, ink, name, summary, logo, scale = 1 }: CredentialHomeRowProps) {
  const colours = layout.colours[theme];
  const { thumbnail } = layout;
  const style = {
    '--row-width': `${layout.referenceWidth}px`,
    '--row-gap': `${layout.gap}px`,
    '--row-padding': `${layout.padding.vertical}px ${layout.padding.horizontal}px`,
    '--row-radius': `${layout.radius}px`,
    '--row-line-height': layout.lineHeight === 'normal' ? 'normal' : `${layout.lineHeight}px`,
    '--thumbnail-logo-width': `${thumbnail.logo.width}px`,
    '--thumbnail-logo-height': `${thumbnail.logo.height}px`,
    background: colours.row,
    zoom: scale,
  } as CSSProperties;

  return (
    <figure className="home-row" style={style} aria-label={label} data-ink={ink}>
      <span
        className="home-row__thumbnail"
        style={{ width: `${thumbnail.width}px`, height: `${thumbnail.height}px`, borderRadius: `${thumbnail.radius}px`, background: formatRgba(background) }}
      >
        <GradientLayers gradients={thumbnail.gradients} width={thumbnail.width} height={thumbnail.height} />
        <CardLogo logo={logo} ink={ink} className="home-row__logo" />
      </span>
      <div className="home-row__text">
        {name !== null && (
          <p className="home-row__name" style={{ color: colours.name, fontSize: `${layout.nameSize}px` }}>
            {name}
          </p>
        )}
        {summary.length > 0 && (
          <p className="home-row__summary" style={{ color: colours.summary, fontSize: `${layout.summarySize}px` }}>
            <SummaryText segments={summary} />
          </p>
        )}
      </div>
      {layout.chevron && <CaretRightIcon className="home-row__chevron" aria-hidden="true" style={{ color: colours.summary }} />}
    </figure>
  );
}
