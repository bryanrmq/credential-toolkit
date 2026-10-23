import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './ui/styles.css';
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
