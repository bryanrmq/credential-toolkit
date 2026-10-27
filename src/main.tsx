import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
// Cascade order: later files may override earlier ones, so keep this order (see src/ui/styles/README.md).
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/controls.css';
import './ui/styles/overlays.css';
import './ui/styles/start.css';
import './ui/styles/workspace.css';
import './ui/styles/tree.css';
import './ui/styles/inspector.css';
import './ui/styles/preview.css';
import './ui/styles/preview-ios.css';
import './ui/styles/preview-android.css';
import './ui/styles/output.css';
import './ui/styles/issues.css';
import './ui/styles/metadata.css';
import './ui/styles/translations.css';
import './ui/styles/i14y.css';
import { Analytics } from '@vercel/analytics/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initDrafts } from './state/persistence';
import { App } from './ui/App';

// The drafts list is read before the first render, so the start screen knows at once which draft to offer.
void initDrafts().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <Analytics />
    </StrictMode>,
  ),
);
