import { FileArrowUpIcon } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { importBundle } from '../../core/import/bundle';
import { importIssuerMetadata, listCredentialConfigurations } from '../../core/import/issuerMetadata';
import { ImportError, type ImportResult, parseJsonText } from '../../core/import/report';
import { importSample, parseSampleText } from '../../core/import/sample';
import { DEFAULT_LANGUAGES } from '../../core/langs';
import { type LangTag, emptyProject } from '../../core/model';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button, Dialog } from '../components/controls';
import { LanguagePicker } from '../components/media';

export type ImportKind = 'sample' | 'bundle' | 'metadata' | 'blank';

const INITIAL_LANGUAGES: LangTag[] = DEFAULT_LANGUAGES.filter((lang) => lang !== 'rm-CH');

function configurationsOf(text: string) {
  try {
    return listCredentialConfigurations(JSON.parse(text));
  } catch {
    return [];
  }
}

export function ImportDialog({ kind, onClose }: { kind: ImportKind; onClose: () => void }) {
  const load = useStore((state) => state.load);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [languages, setLanguages] = useState<LangTag[]>(INITIAL_LANGUAGES);
  const [configuration, setConfiguration] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const entry = t.start.entries[kind];
  const needsText = kind !== 'blank';
  const needsLanguages = kind === 'sample' || kind === 'blank';
  const configurations = useMemo(() => (kind === 'metadata' ? configurationsOf(text) : []), [kind, text]);

  const submit = async () => {
    setError(null);
    if (needsText && text.trim() === '') return setError(t.importDialog.empty);
    if (needsLanguages && languages.length === 0) return setError(t.importDialog.noLanguage);
    setBusy(true);
    try {
      let result: ImportResult;
      if (kind === 'blank') result = { project: emptyProject(languages), report: [] };
      else if (kind === 'sample') result = importSample(parseSampleText(text), languages);
      else if (kind === 'bundle') result = await importBundle(parseJsonText(text));
      else result = importIssuerMetadata(parseJsonText(text), configuration || configurations[0]?.id || '');
      load(result.project, result.report);
    } catch (caught) {
      setError(caught instanceof ImportError ? caught.message : `Unexpected error: ${String(caught)}`);
      setBusy(false);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (file) setText(await file.text());
  };

  return (
    <Dialog title={entry.title} intro={entry.body} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {needsText && (
          <div className="field">
            <div className="row row--between">
              <label className="field__label" htmlFor="import-text">
                {t.importDialog.paste}
              </label>
              <Button size="small" variant="ghost" onClick={() => fileRef.current?.click()}>
                <FileArrowUpIcon /> {t.importDialog.chooseFile}
              </Button>
            </div>
            <textarea
              id="import-text"
              className="textarea"
              value={text}
              spellCheck={false}
              onChange={(event) => setText(event.target.value)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void readFile(event.dataTransfer.files[0]);
              }}
            />
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => void readFile(event.target.files?.[0])} />
          </div>
        )}
        {kind === 'metadata' && configurations.length > 1 && (
          <div className="field">
            <label className="field__label" htmlFor="import-configuration">
              {t.importDialog.configuration}
            </label>
            <select
              id="import-configuration"
              className="select"
              value={configuration || configurations[0].id}
              onChange={(event) => setConfiguration(event.target.value)}
            >
              {configurations.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.id})
                </option>
              ))}
            </select>
          </div>
        )}
        {needsLanguages && (
          <div className="field">
            <span className="field__label">{t.importDialog.languages}</span>
            <LanguagePicker value={languages} onChange={setLanguages} />
            <p className="field__hint">{t.importDialog.languagesHint}</p>
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__actions">
          <Button variant="ghost" onClick={onClose}>
            {t.importDialog.cancel}
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {t.importDialog.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
