import { t } from '../strings';
import { Badge } from './components/controls';
import { useLatestRelease } from './lib/latestRelease';

/**
 * The ring mark (same as the favicon), the app name, a Beta flag and the latest release, linked to
 * its notes. `compact`, for the top bar, lets the bar hide all but the mark when it runs short of room;
 * its menu then lists the release and the Beta flag instead.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  const release = useLatestRelease();
  return (
    <span className="wordmark">
      <svg className="wordmark__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <circle cx="16" cy="16" r="7" fill="none" stroke="#ffffff" strokeWidth="3" />
      </svg>
      <span className={compact ? 'wordmark__text wordmark__text--compact' : 'wordmark__text'}>{t.appName}</span>
      {compact ? (
        <span className="wordmark__beta--compact">
          <Badge tone="blue">{t.beta}</Badge>
        </span>
      ) : (
        <Badge tone="blue">{t.beta}</Badge>
      )}
      {release && (
        <a
          className={compact ? 'wordmark__version wordmark__version--compact' : 'wordmark__version'}
          href={release.url}
          target="_blank"
          rel="noreferrer"
          title={t.versionTitle}
        >
          {release.tag}
        </a>
      )}
    </span>
  );
}
