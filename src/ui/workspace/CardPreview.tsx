import { selectBranding } from '../../core/card/branding';
import { cardLanguage } from '../../core/card/cardLanguage';
import { type CardDifference, cardDifferences, otherPlatform } from '../../core/card/differences';
import { CARD_PROFILES, type CardPlatform, isDefaultBackground, shownVariant } from '../../core/card/profiles';
import { cardSummary, summaryText } from '../../core/card/summary';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { CredentialCard } from '../components/CredentialCard';
import { CredentialHomeRow } from '../components/CredentialHomeRow';
import { useFitScale } from '../components/useFitScale';
import { PreviewNotes } from './PreviewNotes';

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
 * theme, with the notes on it underneath. The platform and variant are picked in the preview's header.
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
  // A language without a card of its own shows the one the wallet falls back to.
  const cardLang = cardLanguage(project, lang, platform);
  const { branding, lightShownForDark } = selectBranding(project, cardLang, theme);
  const name = project.meta[cardLang]?.name ?? '';
  const other = otherPlatform(platform);
  const otherLang = cardLanguage(project, lang, other);
  const summary = cardSummary(project, cardLang, branding, platform);
  const otherSummary = cardSummary(project, otherLang, selectBranding(project, otherLang, theme).branding, other);
  const summaries = { [platform]: summaryText(summary), [other]: summaryText(otherSummary) } as Record<CardPlatform, string>;
  const background = profile.parseBackground(branding.primaryBackgroundColor) ?? profile.fallbackBackground;
  const ink = profile.textInk(background);
  const defaultBackground = isDefaultBackground(profile, background);
  const differences = cardDifferences(platform, { variant: shown, name, background: branding.primaryBackgroundColor, summaries });
  // A wallet that shows its detail card on the offer screen calls it just "card".
  const drawn = shown === 'home' ? 'home' : shown === 'offer' ? 'offer' : profile.variants.includes('offer') ? 'detail' : 'card';
  const label = `${t.cardPreview.platforms[platform]} ${t.cardPreview.drawn[drawn]}`;
  const placeholders = summary.some((segment) => segment.kind === 'placeholder');

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
            defaultBackground={defaultBackground}
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
            defaultBackground={defaultBackground}
            ink={ink}
            name={name || profile.missingName}
            summary={summary}
            logo={branding.logo}
            scale={scale}
          />
        )}
      </div>
      <PreviewNotes
        notes={[
          cardLang !== lang && { text: t.cardPreview.otherLanguageCard(lang, cardLang) },
          lightShownForDark && { text: t.cardPreview.lightForDark },
          placeholders && { text: project.sample ? t.cardPreview.sampleGaps : t.cardPreview.noSample, sample: true },
        ]}
      />
      {differences.length > 0 && (
        <ul className="card-preview__differences">
          {differences.map((difference) => (
            <li key={difference.kind}>{describeDifference(difference, other)}</li>
          ))}
        </ul>
      )}
      <p className="preview-footnote">{t.cardPreview.caption}</p>
    </div>
  );
}
