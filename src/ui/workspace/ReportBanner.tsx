import { InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';

export function ReportBanner() {
  const report = useStore((state) => state.report);
  const dismiss = useStore((state) => state.dismissReport);
  if (!report) return null;
  return (
    <section className="report" aria-label={t.workspace.reportTitle}>
      <div className="row row--between">
        <strong>{t.workspace.reportTitle}</strong>
        <Button size="small" variant="ghost" onClick={dismiss}>
          {t.workspace.dismiss}
        </Button>
      </div>
      <ul>
        {report.map((note, index) => (
          <li key={index}>
            {note.level === 'warning' ? (
              <WarningIcon className="issue-icon--warning" />
            ) : (
              <InfoIcon style={{ color: 'var(--blue-text)', flex: 'none', marginTop: 3 }} />
            )}
            <span>{note.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
