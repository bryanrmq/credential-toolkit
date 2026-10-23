import { CARD_PROFILES, previewViewOf, shownVariant } from '../../core/card/profiles';
import { useStore } from '../../state/store';
import { CardPreview } from './CardPreview';
import { DetailsPreview } from './DetailsPreview';

/**
 * The body of the Output pane's Preview half: the view picked in the half's header for the platform picked there,
 * each drawn with its own notes underneath. Card and Home draw the card or the home row; Details draws the wallet's
 * credential details screen.
 */
export function OutputPreview() {
  const platform = useStore((state) => state.cardPlatform);
  const variant = useStore((state) => state.cardVariant);
  const view = previewViewOf(shownVariant(CARD_PROFILES[platform], variant));

  return (
    <div className="output-preview" data-view={view} data-platform={platform}>
      {view === 'details' ? <DetailsPreview /> : <CardPreview />}
    </div>
  );
}
