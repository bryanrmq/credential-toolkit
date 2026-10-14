import { t } from '../strings';
import { APP_VERSION } from '../version';
import { Badge } from './components/controls';

/**
 * The ring mark (same as the favicon), the app name, a Beta flag and the version. `compact` hides
 * the name and version on narrower screens; the Beta flag always stays.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="wordmark">
      <svg className="wordmark__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <circle cx="16" cy="16" r="7" fill="none" stroke="#ffffff" strokeWidth="3" />
      </svg>
      <span className={compact ? 'wordmark__text wordmark__text--compact' : 'wordmark__text'}>{t.appName}</span>
      <Badge tone="blue">{t.beta}</Badge>
      <span className={compact ? 'wordmark__version wordmark__version--compact' : 'wordmark__version'} title={t.versionTitle}>
        {t.version(APP_VERSION)}
      </span>
    </span>
  );
}
