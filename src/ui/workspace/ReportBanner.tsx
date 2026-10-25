import { InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { type PendingLink, pendingLinks } from '../../core/import/i14y';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { useI14yCatalogue } from '../lib/i14y';
import { I14yMatchReview } from './I14yMatchBanner';

/**
 * After a bundle is opened: the attributes that look like I14Y concepts and are not linked yet. Null while the
 * catalogue loads, when the project was not opened from a bundle or the review was dismissed, and when none is left.
 */
function useI14yMatches(): PendingLink[] | null {
  const project = useStore((state) => state.project)!;
  const review = useStore((state) => state.i14yReview);
  const { catalogue } = useI14yCatalogue(review);
  if (!review || !catalogue) return null;
  const pending = pendingLinks(project, catalogue);
  return pending.length > 0 ? pending : null;
}

/**
 * One notice line above the panes for the import report (or the notes of a later fill from I14Y or a sample) and,
 * after a bundle is opened, the attributes that look like I14Y concepts: "Import report: 3 notes · 3 attributes look
 * like I14Y concepts." Show details opens the notes and the I14Y review controls; a single note and nothing else is
 * shown on the line itself. Dismiss clears what the line shows.
 * The I14Y part applies to the OCA only, so the Metadata area leaves it out.
 */
export function ReportBanner({ onReview }: { onReview: () => void }) {
  const report = useStore((state) => state.report);
  const area = useStore((state) => state.area);
  const { dismissReport, dismissI14yReview } = useStore.getState();
  const found = useI14yMatches();
  const matches = area === 'oca' ? found : null;
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  if (!report && !matches) return null;

  const warns = report?.some((note) => note.level === 'warning') ?? false;
  const single = report?.length === 1 && !matches ? report[0].message : null;
  const summary =
    single ??
    [report && `${t.workspace.reportTitle}: ${t.workspace.notes(report.length)}`, matches && t.i14yMatch.bannerBody(matches.length)]
      .filter(Boolean)
      .join(' · ');
  const dismiss = () => {
    if (report) dismissReport();
    if (matches) dismissI14yReview();
  };

  return (
    <section className="report" aria-label={t.workspace.reportTitle}>
      <div className="report__line">
        {warns ? <WarningIcon className="issue-icon--warning" /> : <InfoIcon className="issue-icon--info" />}
        <p className="report__summary" title={summary}>
          {summary}
        </p>
        {!single && (
          <Button size="small" variant="ghost" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
            {open ? t.workspace.hideDetails : t.workspace.showDetails}
          </Button>
        )}
        <Button size="small" variant="ghost" onClick={dismiss}>
          {t.workspace.dismiss}
        </Button>
      </div>
      {open && !single && (
        <div className="report__details" id={detailsId}>
          {report && (
            <ul>
              {report.map((note, index) => (
                <li key={index}>
                  {note.level === 'warning' ? <WarningIcon className="issue-icon--warning" /> : <InfoIcon className="issue-icon--info" />}
                  <span>{note.message}</span>
                </li>
              ))}
            </ul>
          )}
          {matches && <I14yMatchReview pending={matches} onReview={onReview} />}
        </div>
      )}
    </section>
  );
}
