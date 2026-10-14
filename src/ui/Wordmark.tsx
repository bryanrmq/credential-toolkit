import { t } from '../strings';

export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark__mark" aria-hidden="true">
        OCA
      </span>
      {t.appName}
    </span>
  );
}
