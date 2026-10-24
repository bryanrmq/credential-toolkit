import { CARD_PROFILES, type PreviewView, previewViewOf, shownVariant } from '../../core/card/profiles';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Segmented } from '../components/controls';

const PREVIEW_VIEWS: PreviewView[] = ['card', 'details', 'home'];
/** The cards of a wallet with a separate offer card, picked under the Card view. */
const CARD_VARIANTS = ['detail', 'offer'] as const;

/**
 * The wallet preview's pickers: the platform, the wallet theme, the view (Card, Details or Home) and, under Card for
 * a wallet with an offer card, the Detail or Offer card. They set the store's `cardPlatform`, `brandingTheme` and
 * `cardVariant`, so every preview follows them.
 */
export function PreviewControls({ className }: { className: string }) {
  const platform = useStore((state) => state.cardPlatform);
  const variant = useStore((state) => state.cardVariant);
  const { setCardPlatform, setCardVariant } = useStore.getState();
  const profile = CARD_PROFILES[platform];
  const shown = shownVariant(profile, variant);
  const view = previewViewOf(shown);
  // Card opens the detail card; picking it again keeps the card shown, offer included.
  const pickView = (option: PreviewView) => {
    if (option !== view) setCardVariant(option === 'card' ? 'detail' : option);
  };

  return (
    <span className={className}>
      <Segmented
        label={t.output.previewPlatform}
        value={platform}
        onChange={setCardPlatform}
        options={[
          { value: 'ios', label: t.cardPreview.platforms.ios },
          { value: 'android', label: t.cardPreview.platforms.android },
        ]}
      />
      <WalletThemeSwitch />
      <Segmented
        label={t.output.previewView}
        value={view}
        onChange={pickView}
        options={PREVIEW_VIEWS.map((option) => ({ value: option, label: t.output.views[option] }))}
      />
      {view === 'card' && profile.variants.includes('offer') && (
        <Segmented
          label={t.output.previewCard}
          value={shown}
          onChange={setCardVariant}
          options={CARD_VARIANTS.map((option) => ({ value: option, label: t.cardPreview.variants[option] }))}
        />
      )}
    </span>
  );
}

/** Light or dark wallet: the branding the form edits and the theme every preview shows. */
export function WalletThemeSwitch() {
  const theme = useStore((state) => state.brandingTheme);
  return (
    <Segmented
      label={t.inspector.walletTheme}
      value={theme}
      onChange={useStore.getState().setBrandingTheme}
      options={[
        { value: 'light', label: t.inspector.light },
        { value: 'dark', label: t.inspector.dark },
      ]}
    />
  );
}
