import { useEffect, useRef, useState } from 'react';
import { selectBranding } from '../../core/card/branding';
import { type CardDifference, cardDifferences, otherPlatform } from '../../core/card/differences';
import { CARD_PROFILES, type CardPlatform } from '../../core/card/profiles';
import { cardSummary, summaryText } from '../../core/card/summary';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { CredentialCard } from '../components/CredentialCard';
import { Tabs } from '../components/controls';

function describeDifference(difference: CardDifference, platform: CardPlatform): string {
  const name = t.cardPreview.platforms[platform];
  switch (difference.kind) {
    case 'ink':
      return t.cardPreview.ink(name, difference.ink);
    case 'background':
      return t.cardPreview.background(name, difference.fallback);
    case 'accepted':
      return t.cardPreview.accepted(name, difference.translucent);
    case 'name':
      return difference.text === null ? t.cardPreview.nameHidden(name) : t.cardPreview.nameShown(name, difference.text);
    case 'summary':
      return t.cardPreview.summary(name, difference.text);
  }
}

/** Scale that fits `width` px into the observed element, never above 1. Stays 1 without ResizeObserver (tests). */
function useFitScale(width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, scale: available === null ? 1 : Math.min(1, available / width) };
}

/** The credential card as the iOS or Android wallet would roughly draw it, for the editing language and theme. */
export function CardPreview() {
  const project = useStore((state) => state.project)!;
  const lang = useStore((state) => state.editLang);
  const theme = useStore((state) => state.brandingTheme);
  const platform = useStore((state) => state.cardPlatform);
  const variant = useStore((state) => state.cardVariant);
  const { setCardPlatform, setCardVariant } = useStore.getState();

  const profile = CARD_PROFILES[platform];
  const layout = profile.layout[variant];
  const { ref, scale } = useFitScale(layout.referenceWidth);
  const { branding, lightShownForDark } = selectBranding(project, lang, theme);
  const name = project.meta[lang]?.name ?? '';
  const other = otherPlatform(platform);
  const summary = cardSummary(project, lang, branding, platform);
  const summaries = { [platform]: summaryText(summary), [other]: summaryText(cardSummary(project, lang, branding, other)) } as Record<CardPlatform, string>;
  const background = profile.parseBackground(branding.primaryBackgroundColor) ?? profile.fallbackBackground;
  const differences = cardDifferences(platform, { name, background: branding.primaryBackgroundColor, summaries });

  return (
    <div className="card-preview">
      <div className="card-preview__header">
        <span className="section__title">{t.cardPreview.title}</span>
        <div className="row row--wrap">
          <Tabs
            label={t.cardPreview.platform}
            value={platform}
            onChange={setCardPlatform}
            options={[
              { value: 'ios', label: t.cardPreview.platforms.ios },
              { value: 'android', label: t.cardPreview.platforms.android },
            ]}
          />
          <Tabs
            label={t.cardPreview.card}
            value={variant}
            onChange={setCardVariant}
            options={[
              { value: 'detail', label: t.cardPreview.variants.detail },
              { value: 'offer', label: t.cardPreview.variants.offer },
            ]}
          />
        </div>
      </div>
      <div ref={ref} className={`card-preview__stage card-preview__stage--${theme}`}>
        <CredentialCard
          label={t.cardPreview.cardLabel(t.cardPreview.platforms[platform], t.cardPreview.variants[variant])}
          layout={layout}
          background={background}
          ink={profile.textInk(background)}
          name={name || profile.missingName}
          summary={summary}
          logo={branding.logo}
          scale={scale}
        />
      </div>
      {lightShownForDark && <p className="note">{t.cardPreview.lightForDark}</p>}
      {summary.some((segment) => segment.kind === 'placeholder') && <p className="note">{t.cardPreview.noSample}</p>}
      {differences.length > 0 && (
        <ul className="card-preview__differences">
          {differences.map((difference) => (
            <li key={difference.kind}>{describeDifference(difference, other)}</li>
          ))}
        </ul>
      )}
      <p className="field__hint">{t.cardPreview.caption}</p>
    </div>
  );
}
