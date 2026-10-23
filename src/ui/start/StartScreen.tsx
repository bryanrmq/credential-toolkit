import { ArrowRightIcon, BracketsCurlyIcon, FilePlusIcon, IdentificationCardIcon, ShieldCheckIcon, StackIcon } from '@phosphor-icons/react';
import { type ReactNode, Suspense, lazy, useRef, useState } from 'react';
import { draftDisplayName, openDraft, selectResumeDraft, useDrafts } from '../../state/persistence';
import { t } from '../../strings';
import { useReveal } from '../lib/reveal';
import { Wordmark } from '../Wordmark';
import { CredentialSketch } from './CredentialSketch';
import { ImportDialog, type ImportKind } from './ImportDialog';

const Examples = lazy(() => import('./Examples').then((module) => ({ default: module.Examples })));

const ENTRIES: Array<{ kind: ImportKind; icon: ReactNode; tone: string; wide?: boolean }> = [
  { kind: 'sample', icon: <BracketsCurlyIcon size={18} />, tone: 'var(--blue-bg)', wide: true },
  { kind: 'bundle', icon: <StackIcon size={18} />, tone: 'var(--green-bg)' },
  { kind: 'metadata', icon: <IdentificationCardIcon size={18} />, tone: 'var(--yellow-bg)' },
  { kind: 'blank', icon: <FilePlusIcon size={18} />, tone: 'var(--surface-muted)', wide: true },
];

export function StartScreen() {
  const [dialog, setDialog] = useState<ImportKind | null>(null);
  const draft = useDrafts(selectResumeDraft);
  const innerRef = useRef<HTMLDivElement>(null);
  useReveal(innerRef);

  return (
    <main className="start">
      <div className="start__inner" ref={innerRef}>
        <Wordmark />
        <section className="start__hero">
          <div>
            <h1 className="start__title reveal">{t.start.title}</h1>
            <p className="start__intro reveal" style={{ ['--index' as string]: 1 }}>
              {t.start.intro}
            </p>
            <p className="start__privacy reveal" style={{ ['--index' as string]: 2 }}>
              <ShieldCheckIcon /> {t.start.privacy}
            </p>
          </div>
          <div className="reveal" style={{ ['--index' as string]: 2 }}>
            <CredentialSketch />
          </div>
        </section>
        <div className="bento">
          {draft && (
            <button type="button" className="bento__card bento__card--resume reveal" onClick={() => void openDraft(draft.id)}>
              <div className="grow">
                <div className="bento__title">{t.start.resumeTitle}</div>
                <p className="bento__body">{t.start.resumeBody(draftDisplayName(draft))}</p>
              </div>
              <span className="btn btn--primary">
                {t.start.resumeAction} <ArrowRightIcon />
              </span>
            </button>
          )}
          {ENTRIES.map((entry, index) => (
            <button
              key={entry.kind}
              type="button"
              className={`bento__card reveal${entry.wide ? ' bento__card--wide' : ''}`}
              style={{ ['--index' as string]: index + 3 }}
              onClick={() => setDialog(entry.kind)}
            >
              <span className="bento__icon" style={{ background: entry.tone }}>
                {entry.icon}
              </span>
              <span className="bento__title">{t.start.entries[entry.kind].title}</span>
              <span className="bento__body">{t.start.entries[entry.kind].body}</span>
            </button>
          ))}
        </div>
        <Suspense fallback={null}>
          <Examples />
        </Suspense>
        <footer className="start__footer">
          {t.start.footer}{' '}
          <a href="https://swiyu-admin-ch.github.io/specifications/oca-v1-0/" target="_blank" rel="noreferrer">
            swiyu OCA 1.0
          </a>
        </footer>
      </div>
      {dialog && <ImportDialog kind={dialog} onClose={() => setDialog(null)} />}
    </main>
  );
}
