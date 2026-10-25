import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { type PendingLink, textIn } from '../../core/import/i14y';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { linkToI14y } from '../lib/i14y';

/**
 * The I14Y part of the workspace notice's details. Review steps through the matches with Back and Next, Show which
 * lists them, and Link links those with one clear match. Nothing is linked until the issuer confirms.
 */
export function I14yMatchReview({ pending, onReview }: { pending: PendingLink[]; onReview: () => void }) {
  const editLang = useStore((state) => state.editLang);
  const selection = useStore((state) => state.selection);
  const { select } = useStore.getState();
  const [stepping, setStepping] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // The position last opened; after that attribute is linked it drops out and this is where the next one now sits.
  const [last, setLast] = useState(0);

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
    <section className="i14y-review" aria-label={t.i14yMatch.bannerRegion}>
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
            <Button size="small" onClick={() => void linkToI14y(clear.map((match) => ({ nodeId: match.nodeId, conceptId: match.clear!.id })))}>
              {t.i14yMatch.linkAll(clear.length)}
            </Button>
          )}
        </div>
      </div>
      {listOpen && (
        <ul className="i14y-review__list" aria-label={t.i14yMatch.listLabel}>
          {pending.map((match, index) => (
            <li key={match.nodeId} aria-current={index === current}>
              <Button variant="link" onClick={() => open(index)}>
                <code>{match.path}</code>
              </Button>
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
