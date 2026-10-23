import { BracketsCurlyIcon, FilePlusIcon, IdentificationCardIcon, ShieldCheckIcon, StackIcon } from '@phosphor-icons/react';
import { type ReactNode, Suspense, lazy, useRef, useState } from 'react';
import { t } from '../../strings';
import { FixToast } from '../components/FixToast';
import { useReveal } from '../lib/reveal';
import { Wordmark } from '../Wordmark';
import { CredentialSketch } from './CredentialSketch';
import { ImportDialog, type ImportKind } from './ImportDialog';
import { RecentProjects } from './RecentProjects';

const Examples = lazy(() => import('./Examples').then((module) => ({ default: module.Examples })));

const ENTRIES: Array<{ kind: ImportKind; icon: ReactNode; tone: string; wide?: boolean }> = [
  { kind: 'sample', icon: <BracketsCurlyIcon size={18} />, tone: 'var(--blue-bg)', wide: true },
  { kind: 'bundle', icon: <StackIcon size={18} />, tone: 'var(--green-bg)' },
  { kind: 'metadata', icon: <IdentificationCardIcon size={18} />, tone: 'var(--yellow-bg)' },
  { kind: 'blank', icon: <FilePlusIcon size={18} />, tone: 'var(--surface-muted)', wide: true },
];

export function StartScreen() {
  const [dialog, setDialog] = useState<ImportKind | null>(null);
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
        <RecentProjects />
        <section aria-labelledby="start-new-title">
          <h2 id="start-new-title" className="start__heading reveal" style={{ ['--index' as string]: 3 }}>
            {t.start.newTitle}
          </h2>
          <div className="bento">
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
        </section>
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
      {/* Reports a project file that could not be opened. */}
      <FixToast />
    </main>
  );
}
