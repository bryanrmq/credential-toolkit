import { FileArrowUpIcon } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { ImportError, isPlainObject } from '../../core/import/report';
import { parseSampleText } from '../../core/import/sample';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button, Dialog } from '../components/controls';

/** Attach or remove the sample credential; it only feeds the "path not found in sample" check. */
export function SampleControl() {
  const hasSample = useStore((state) => state.project?.sample !== undefined);
  const update = useStore((state) => state.update);
  const [open, setOpen] = useState(false);

  return (
    <div className="sample-control">
      <p className="field__hint">{hasSample ? t.sample.attached : t.sample.none}</p>
      <div className="row">
        <Button size="small" onClick={() => setOpen(true)}>
          {hasSample ? t.sample.replace : t.sample.attach}
        </Button>
        {hasSample && (
          <Button size="small" variant="ghost" onClick={() => update((draft) => void delete draft.sample)}>
            {t.sample.remove}
          </Button>
        )}
      </div>
      {open && (
        <SampleDialog
          title={t.sample.dialogTitle}
          intro={t.sample.dialogIntro}
          submitLabel={t.sample.submit}
          onSample={(sample) => update((draft) => void (draft.sample = sample))}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** Asks for a sample credential (claims object). `onSample` may throw an ImportError to show it. */
export function SampleDialog({
  title,
  intro,
  submitLabel,
  onSample,
  onClose,
}: {
  title: string;
  intro: string;
  submitLabel: string;
  onSample: (sample: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      const sample = parseSampleText(text);
      if (!isPlainObject(sample)) throw new ImportError(t.sample.notObject);
      onSample(sample);
      onClose();
    } catch (caught) {
      setError(caught instanceof ImportError ? caught.message : String(caught));
    }
  };

  return (
    <Dialog title={title} intro={intro} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <div className="row row--between">
            <label className="field__label" htmlFor="sample-text">
              {t.importDialog.paste}
            </label>
            <Button size="small" variant="ghost" onClick={() => fileRef.current?.click()}>
              <FileArrowUpIcon /> {t.importDialog.chooseFile}
            </Button>
          </div>
          <textarea id="sample-text" className="textarea" value={text} spellCheck={false} onChange={(event) => setText(event.target.value)} />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__actions">
          <Button variant="ghost" onClick={onClose}>
            {t.importDialog.cancel}
          </Button>
          <Button variant="primary" type="submit">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
