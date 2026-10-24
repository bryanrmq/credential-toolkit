import { BracketsCurlyIcon, FilePlusIcon, IdentificationCardIcon, ShieldCheckIcon, StackIcon } from '@phosphor-icons/react';
import { type ReactNode, Suspense, lazy, useState } from 'react';
import { t } from '../../strings';
import { FixToast } from '../components/FixToast';
import { Wordmark } from '../Wordmark';
import { CredentialSketch } from './CredentialSketch';
import { ImportDialog, type ImportKind } from './ImportDialog';
import { RecentProjects } from './RecentProjects';

const Examples = lazy(() => import('./Examples').then((module) => ({ default: module.Examples })));

const ENTRIES: Array<{ kind: ImportKind; icon: ReactNode; wide?: boolean }> = [
  { kind: 'sample', icon: <BracketsCurlyIcon size={18} />, wide: true },
  { kind: 'bundle', icon: <StackIcon size={18} /> },
  { kind: 'metadata', icon: <IdentificationCardIcon size={18} /> },
  { kind: 'blank', icon: <FilePlusIcon size={18} />, wide: true },
];

export function StartScreen() {
  const [dialog, setDialog] = useState<ImportKind | null>(null);

  return (
    <main className="start">
      <div className="start__inner">
        <header className="start__brand">
          <Wordmark />
          <p className="start__tagline">{t.start.tagline}</p>
        </header>
        <section className="start__hero">
          <div>
            <h1 className="start__title">{t.start.title}</h1>
            <p className="start__intro">{t.start.intro}</p>
            <p className="start__privacy">
              <ShieldCheckIcon /> {t.start.privacy}
            </p>
          </div>
          <div>
            <CredentialSketch />
          </div>
        </section>
        <RecentProjects />
        <section aria-labelledby="start-new-title">
          <h2 id="start-new-title" className="start__heading">
            {t.start.newTitle}
          </h2>
          <div className="bento">
            {ENTRIES.map((entry) => (
              <button
                key={entry.kind}
                type="button"
                className={`bento__card${entry.wide ? ' bento__card--wide' : ''}`}
                onClick={() => setDialog(entry.kind)}
              >
                <span className="bento__icon">
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
