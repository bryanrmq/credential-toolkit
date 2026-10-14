import { t } from '../strings';

/** The ring mark (same as the favicon) and the app name; `compact` hides the name on narrower screens. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="wordmark">
      <svg className="wordmark__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <circle cx="16" cy="16" r="7" fill="none" stroke="#ffffff" strokeWidth="3" />
      </svg>
      <span className={compact ? 'wordmark__text wordmark__text--compact' : 'wordmark__text'}>{t.appName}</span>
    </span>
  );
}
