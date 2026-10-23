import { DeviceMobileIcon } from '@phosphor-icons/react';
import { CARD_PROFILES, previewViewOf, shownVariant } from '../../core/card/profiles';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { CardPreview } from './CardPreview';

/**
 * The body of the Output pane's Preview half: the view picked in the half's header for the platform picked there,
 * each drawn with its own notes underneath. Card and Home draw the card or the home row; Details shows an empty
 * state until the details screens are drawn.
 */
export function OutputPreview() {
  const platform = useStore((state) => state.cardPlatform);
  const variant = useStore((state) => state.cardVariant);
  const view = previewViewOf(shownVariant(CARD_PROFILES[platform], variant));

  return (
    <div className="output-preview" data-view={view} data-platform={platform}>
      {view === 'details' ? (
        <p className="empty-state">
          <DeviceMobileIcon size={20} />
          <br />
          {t.output.previewEmpty(t.output.views[view], t.cardPreview.platforms[platform])}
        </p>
      ) : (
        <CardPreview />
      )}
    </div>
  );
}
