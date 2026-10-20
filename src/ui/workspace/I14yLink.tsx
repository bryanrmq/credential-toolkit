import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { compareWithI14y, i14yLanguage, textIn } from '../../core/import/i14y';
import type { I14yLink, LangTag } from '../../core/model';
import { t } from '../../strings';
import { Badge, Button } from '../components/controls';
import { conceptPageUrl, statusLabel, statusTone } from '../lib/i14y';

/** Under the attribute's title: which I14Y concept it was filled from, with a link to it and Unlink. */
export function I14yLinkLine({ link, lang, onUnlink }: { link: I14yLink; lang: LangTag; onUnlink: () => void }) {
  return (
    <section className="i14y-link" aria-label={t.i14yLink.region}>
      <p className="i14y-link__concept">
        <span className="i14y-link__from">{t.i14yLink.from}</span>
        <span className="i14y-link__name">{textIn(link.name, lang) || link.identifier}</span>
        <code className="tag-mono">{link.identifier}</code>
        {link.registrationStatus && <Badge tone={statusTone(link.registrationStatus)}>{statusLabel(link.registrationStatus)}</Badge>}
        <span className="i14y-link__publisher">{textIn(link.publisher, lang)}</span>
      </p>
      <div className="row">
        <a className="btn btn--ghost btn--small" href={conceptPageUrl(link.conceptId, i14yLanguage(lang))} target="_blank" rel="noreferrer">
          {t.i14yLink.open} <ArrowSquareOutIcon />
        </a>
        <Button size="small" variant="ghost" title={t.i14yLink.unlinkTitle} onClick={onUnlink}>
          {t.i14yLink.unlink}
        </Button>
      </div>
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
