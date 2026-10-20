import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { pendingLinks, textIn } from '../../core/import/i14y';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { linkToI14y, useI14yCatalogue } from '../lib/i14y';

/**
 * After a bundle is opened: how many attributes look like I14Y concepts. Review steps through them
 * with Back and Next, Show which lists them, and Link links those with one clear match. Nothing is
 * linked until the issuer confirms.
 */
export function I14yMatchBanner({ onReview }: { onReview: () => void }) {
  const project = useStore((state) => state.project)!;
  const review = useStore((state) => state.i14yReview);
  const editLang = useStore((state) => state.editLang);
  const selection = useStore((state) => state.selection);
  const { select, dismissI14yReview } = useStore.getState();
  const { catalogue } = useI14yCatalogue(review);
  const [stepping, setStepping] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // The position last opened; after that attribute is linked it drops out and this is where the next one now sits.
  const [last, setLast] = useState(0);
  if (!review || !catalogue) return null;

  const pending = pendingLinks(project, catalogue);
  if (pending.length === 0) return null;
  const clear = pending.filter((match) => match.clear);
  const ambiguous = pending.length - clear.length;
  const current = selection.kind === 'node' ? pending.findIndex((match) => match.nodeId === selection.id) : -1;

  const open = (index: number) => {
    const wrapped = (index + pending.length) % pending.length;
    setLast(wrapped);
    setStepping(true);
    select({ kind: 'node', id: pending[wrapped].nodeId });
    onReview();
  };
  const conceptName = (index: number) => textIn(pending[index].hits[0].name, editLang) || pending[index].hits[0].identifier;

  return (
    <section className="report i14y-review" aria-label={t.i14yMatch.bannerRegion}>
      <div className="row row--between row--wrap">
        {stepping && current >= 0 ? (
          <p className="report__text">
            <strong>{t.i14yMatch.position(current + 1, pending.length)}</strong> · <code>{pending[current].path}</code> → {conceptName(current)}
          </p>
        ) : (
          <p className="report__text">
            {t.i14yMatch.bannerBody(pending.length)} {ambiguous > 0 && t.i14yMatch.ambiguous(ambiguous)} {t.i14yMatch.linkHint}
          </p>
        )}
        <div className="row row--wrap">
          {stepping ? (
            <>
              <Button size="small" onClick={() => open(current >= 0 ? current - 1 : last - 1)}>
                <CaretLeftIcon /> {t.i14yMatch.back}
              </Button>
              <Button size="small" onClick={() => open(current >= 0 ? current + 1 : last)}>
                {t.i14yMatch.next} <CaretRightIcon />
              </Button>
            </>
          ) : (
            <Button size="small" onClick={() => open(0)}>
              {t.i14yMatch.review}
            </Button>
          )}
          <Button size="small" variant="ghost" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>
            {listOpen ? t.i14yMatch.hideList : t.i14yMatch.showWhich}
          </Button>
          {clear.length > 0 && (
            <Button size="small" variant="primary" onClick={() => void linkToI14y(clear.map((match) => ({ nodeId: match.nodeId, conceptId: match.clear!.id })))}>
              {t.i14yMatch.linkAll(clear.length)}
            </Button>
          )}
          <Button size="small" variant="ghost" onClick={dismissI14yReview}>
            {t.i14yMatch.dismiss}
          </Button>
        </div>
      </div>
      {listOpen && (
        <ul className="i14y-review__list" aria-label={t.i14yMatch.listLabel}>
          {pending.map((match, index) => (
            <li key={match.nodeId} aria-current={index === current}>
              <button type="button" className="text-button" onClick={() => open(index)}>
                <code>{match.path}</code>
              </button>
              <span aria-hidden="true">→</span>
              <span>
                {conceptName(index)} <code className="tag-mono">{match.hits[0].identifier}</code>
              </span>
              {match.hits.length > 1 && <span className="field__hint">{t.i14yMatch.orMore(match.hits.length - 1)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
