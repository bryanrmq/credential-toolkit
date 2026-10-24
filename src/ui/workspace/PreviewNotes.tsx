import { InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { SampleDialog } from './SampleControl';

/** A note under a wallet preview; `act` marks one the issuer must act on, the only kind drawn in yellow. */
export interface PreviewNote {
  text: string;
  act?: boolean;
  /** Offers to attach (or replace) the sample credential after the text. */
  sample?: boolean;
}

/** The notes under a wallet preview, as one list with an icon each; nothing when there are none. */
export function PreviewNotes({ notes }: { notes: Array<PreviewNote | false | undefined> }) {
  const shown = notes.filter((note): note is PreviewNote => !!note);
  if (shown.length === 0) return null;
  return (
    <ul className="preview-notes">
      {shown.map((note) => (
        <li key={note.text} className={note.act ? 'preview-notes__item preview-notes__item--act' : 'preview-notes__item'}>
          {note.act ? <WarningIcon size={14} aria-hidden="true" /> : <InfoIcon size={14} aria-hidden="true" />}
          <span className="preview-notes__text">
            {note.text}
            {note.sample && <AttachSampleButton />}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Attaches the sample credential from under the preview, as the Output pane's Bundle tab does. */
function AttachSampleButton() {
  const hasSample = useStore((state) => state.project?.sample !== undefined);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" variant="ghost" className="preview-notes__action" onClick={() => setOpen(true)}>
        {hasSample ? t.sample.replace : t.sample.attach}
      </Button>
      {open && (
        <SampleDialog
          title={t.sample.dialogTitle}
          intro={t.sample.dialogIntro}
          submitLabel={t.sample.submit}
          onSample={(sample) => useStore.getState().update((draft) => void (draft.sample = sample))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
