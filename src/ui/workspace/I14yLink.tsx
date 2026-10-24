import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { type I14yHit, compareWithI14y, i14yLanguage, textIn } from '../../core/import/i14y';
import type { I14yLink, LangTag } from '../../core/model';
import { t } from '../../strings';
import { Badge, Button } from '../components/controls';
import { conceptPageUrl, statusLabel } from '../lib/i14y';

/** The tag, lead, concept name (publisher in its tooltip), identifier and status shared by the linked and "looks like" lines. */
function I14yConceptLine({ lead, maybe, concept, lang }: { lead: string; maybe?: boolean; concept: I14yLink | I14yHit; lang: LangTag }) {
  const publisher = textIn(concept.publisher, lang);
  return (
    <>
      <span className={maybe ? 'tree__tag tree__tag--maybe' : 'tree__tag'}>{maybe ? t.i14yMatch.marker : t.i14yLink.tag}</span>
      <span className="i14y-link__lead">{lead}</span>
      <span className="i14y-link__name" title={publisher ? t.i14yLink.publishedBy(publisher) : undefined}>
        {textIn(concept.name, lang) || concept.identifier}
      </span>
      <code className="i14y-link__id">{concept.identifier}</code>
      {concept.registrationStatus && <Badge tone="gray">{statusLabel(concept.registrationStatus)}</Badge>}
    </>
  );
}

/** Under the attribute's key: the I14Y concept it is linked to, with Open in I14Y and Unlink. */
export function I14yLinkLine({ link, lang, onUnlink }: { link: I14yLink; lang: LangTag; onUnlink: () => void }) {
  return (
    <section className="i14y-link" aria-label={t.i14yLink.region}>
      <I14yConceptLine lead={t.i14yLink.linkedTo} concept={link} lang={lang} />
      <span className="i14y-link__actions">
        <a className="i14y-link__open" href={conceptPageUrl(link.conceptId, i14yLanguage(lang))} target="_blank" rel="noreferrer">
          {t.i14yLink.open} <ArrowSquareOutIcon />
        </a>
        <button type="button" className="i14y-link__unlink" title={t.i14yLink.unlinkTitle} onClick={onUnlink}>
          {t.i14yLink.unlink}
        </button>
      </span>
    </section>
  );
}

/** Whether a text differs from I14Y's, so a marker should offer I14Y's text. */
function differs(current: string, i14yText: string | undefined): i14yText is string {
  const status = compareWithI14y(current, i14yText);
  return status === 'edited' || status === 'empty';
}

/** For the label field's hint: how the label differs from I14Y, with a button to take I14Y's text. Null when it does not differ. */
export function I14yLabelHint({ current, i14yText, onReset }: { current: string; i14yText: string | undefined; onReset: (text: string) => void }) {
  if (!differs(current, i14yText)) return null;
  const status = compareWithI14y(current, i14yText);
  return (
    <span className="i14y-hint">
      {status === 'edited' ? t.i14yLink.edited(i14yText) : t.i14yLink.empty(i14yText)}{' '}
      <button type="button" className="text-button" onClick={() => onReset(i14yText)}>
        {status === 'edited' ? t.i14yLink.reset : t.i14yLink.use}
      </button>
    </span>
  );
}

/** A small button beside a text that differs from I14Y's (edited or left empty); nothing otherwise. */
export function I14yReset({ current, i14yText, onReset }: { current: string; i14yText: string | undefined; onReset: (text: string) => void }) {
  if (!differs(current, i14yText)) return null;
  const label = compareWithI14y(current, i14yText) === 'edited' ? t.i14yLink.resetTo(i14yText) : t.i14yLink.useText(i14yText);
  return (
    <Button size="icon" variant="ghost" className="i14y-reset" aria-label={label} title={label} onClick={() => onReset(i14yText)}>
      <ArrowCounterClockwiseIcon />
    </Button>
  );
}

/** For an unlinked attribute: one dashed "Looks like" line per I14Y concept it looks like, each with a Link button. */
export function I14yMatchLine({ hits, lang, onLink }: { hits: I14yHit[]; lang: LangTag; onLink: (hit: I14yHit) => void }) {
  return (
    <section className="i14y-matches" aria-label={t.i14yMatch.region}>
      {hits.map((hit) => (
        <p key={hit.id} className="i14y-link i14y-link--match">
          <I14yConceptLine lead={t.i14yMatch.looksLike} maybe concept={hit} lang={lang} />
          <span className="i14y-link__actions">
            <Button size="small" variant="secondary" aria-label={t.i14yMatch.linkTo(hit.identifier)} title={t.i14yMatch.linkHint} onClick={() => onLink(hit)}>
              {t.i14yMatch.link}
            </Button>
          </span>
        </p>
      ))}
    </section>
  );
}
