import { useEffect, useState } from 'react';
import { type FixNotice, useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from './controls';

/** How long the toast stays when nobody points at it or focuses it. */
export const TOAST_DURATION_MS = 6000;

function noticeText(notice: FixNotice): string {
  if (notice.kind === 'fixed') return t.fixes.fixed(notice.fixed, notice.total);
  if (notice.kind === 'failed') return t.fixes.failed(notice.label);
  if ('message' in notice) return notice.message;
  return t.fixes.stale;
}

/**
 * Reports the last fix and offers to undo it until it goes away or the project is edited; also shows other
 * actions' errors, and other actions with their own Undo (`showUndoable`).
 */
export function FixToast() {
  const notice = useStore((state) => state.fixNotice);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {notice && <Toast notice={notice} />}
    </div>
  );
}

function Toast({ notice }: { notice: FixNotice }) {
  // Any edit hides the toast, so while it shows, the last undo step is the fix.
  const canUndo = useStore((state) => state.past.length > 0);
  const undo = useStore((state) => state.undo);
  const dismiss = useStore((state) => state.dismissFixNotice);
  const [held, setHeld] = useState(false);

  // `notice` is a dependency so a new fix restarts the timer. Progress stays until the action reports.
  useEffect(() => {
    if (held || notice.kind === 'progress') return;
    const timer = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice, held, dismiss]);

  return (
    <div
      className={notice.kind === 'error' || notice.kind === 'failed' || notice.kind === 'stale' ? 'toast toast--error' : 'toast'}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false);
      }}
    >
      <span>{noticeText(notice)}</span>
      {notice.kind === 'fixed' && canUndo && (
        <Button size="small" variant="ghost" onClick={undo}>
          {t.fixes.undo}
        </Button>
      )}
      {notice.kind === 'undoable' && (
        <Button
          size="small"
          variant="ghost"
          onClick={() => {
            dismiss();
            notice.undo();
          }}
        >
          {t.fixes.undo}
        </Button>
      )}
    </div>
  );
}
