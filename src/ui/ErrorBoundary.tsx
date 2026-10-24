import { Component, type ErrorInfo, type ReactNode } from 'react';
import { deleteDraft, rawDraft, useDrafts } from '../state/persistence';
import { t } from '../strings';
import { Button } from './components/controls';
import { downloadText } from './lib/download';

interface State {
  error: Error | null;
}

/** Last line of defence: the draft can always be downloaded, so a crash never loses work. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash">
        <h1 className="dialog__title">{t.crash.title}</h1>
        <p className="dialog__intro">{t.crash.body}</p>
        <pre className="code-block crash__message">
          {this.state.error.message}
        </pre>
        <div className="row crash__actions">
          <Button variant="primary" onClick={() => downloadText('credential-toolkit-draft.json', rawDraft() ?? '{}')}>
            {t.crash.download}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const { rememberedId } = useDrafts.getState();
              void (rememberedId ? deleteDraft(rememberedId) : Promise.resolve()).finally(() => window.location.reload());
            }}
          >
            {t.crash.reset}
          </Button>
        </div>
      </main>
    );
  }
}
