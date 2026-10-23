import { DeviceMobileIcon } from '@phosphor-icons/react';
import { useStore } from '../../state/store';
import { t } from '../../strings';

/**
 * The body of the Output pane's Preview half: the wallet view picked in the half's header (`previewView`) for the
 * platform picked there (`cardPlatform`). The card, details and home views are drawn here once they move in;
 * until then each one shows an empty state.
 */
export function OutputPreview() {
  const platform = useStore((state) => state.cardPlatform);
  const view = useStore((state) => state.previewView);

  return (
    <div className="output-preview" data-view={view} data-platform={platform}>
      <p className="empty-state">
        <DeviceMobileIcon size={20} />
        <br />
        {t.output.previewEmpty(t.output.views[view], t.cardPreview.platforms[platform])}
        {view !== 'details' && (
          <span className="field__hint" style={{ display: 'block', marginTop: 4 }}>
            {t.output.previewInEdit}
          </span>
        )}
      </p>
    </div>
  );
}
