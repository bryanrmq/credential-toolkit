import { Component, type ErrorInfo, type ReactNode } from 'react';
import { rawDraft, saveDraft } from '../state/persistence';
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
        <pre className="code-block" style={{ maxHeight: 160 }}>
          {this.state.error.message}
        </pre>
        <div className="row" style={{ marginTop: 24 }}>
          <Button variant="primary" onClick={() => downloadText('oca-generator-draft.json', rawDraft() ?? '{}')}>
            {t.crash.download}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              saveDraft(null);
              window.location.reload();
            }}
          >
            {t.crash.reset}
          </Button>
        </div>
      </main>
    );
  }
}
