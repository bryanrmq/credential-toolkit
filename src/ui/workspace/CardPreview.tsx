import { selectBranding } from '../../core/card/branding';
import { type CardDifference, cardDifferences, otherPlatform } from '../../core/card/differences';
import { CARD_PROFILES, type CardPlatform, shownVariant } from '../../core/card/profiles';
import { cardSummary, summaryText } from '../../core/card/summary';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { CredentialCard } from '../components/CredentialCard';
import { CredentialHomeRow } from '../components/CredentialHomeRow';
import { useFitScale } from '../components/useFitScale';

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

/**
 * The credential card or home row as the iOS or Android wallet would roughly draw it, for the editing language and
 * theme, with the notes on it underneath. The platform and variant are picked in the Output preview's header.
 */
export function CardPreview() {
  const project = useStore((state) => state.project)!;
  const lang = useStore((state) => state.editLang);
  const theme = useStore((state) => state.brandingTheme);
  const platform = useStore((state) => state.cardPlatform);
  const variant = useStore((state) => state.cardVariant);

  const profile = CARD_PROFILES[platform];
  const shown = shownVariant(profile, variant);
  const layout = shown === 'offer' && profile.layout.offer ? profile.layout.offer : profile.layout.detail;
  const { ref, scale } = useFitScale(shown === 'home' ? profile.home.referenceWidth : layout.referenceWidth);
  const { branding, lightShownForDark } = selectBranding(project, lang, theme);
  const name = project.meta[lang]?.name ?? '';
  const other = otherPlatform(platform);
  const summary = cardSummary(project, lang, branding, platform);
  const summaries = { [platform]: summaryText(summary), [other]: summaryText(cardSummary(project, lang, branding, other)) } as Record<CardPlatform, string>;
  const background = profile.parseBackground(branding.primaryBackgroundColor) ?? profile.fallbackBackground;
  const ink = profile.textInk(background);
  const differences = cardDifferences(platform, { variant: shown, name, background: branding.primaryBackgroundColor, summaries });
  // A wallet that shows its detail card on the offer screen calls it just "card".
  const drawn = shown === 'home' ? 'home' : shown === 'offer' ? 'offer' : profile.variants.includes('offer') ? 'detail' : 'card';
  const label = `${t.cardPreview.platforms[platform]} ${t.cardPreview.drawn[drawn]}`;

  return (
    <div className="card-preview">
      <div
        ref={ref}
        className={`card-preview__stage card-preview__stage--${theme}`}
        style={shown === 'home' ? { background: profile.home.colours[theme].page } : undefined}
      >
        {shown === 'home' ? (
          <CredentialHomeRow
            label={label}
            layout={profile.home}
            theme={theme}
            background={background}
            ink={ink}
            name={name || profile.home.missingName}
            summary={summary}
            logo={branding.logo}
            scale={scale}
          />
        ) : (
          <CredentialCard
            label={label}
            layout={layout}
            background={background}
            ink={ink}
            name={name || profile.missingName}
            summary={summary}
            logo={branding.logo}
            scale={scale}
          />
        )}
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
