import { CheckCircleIcon, CopyIcon, DeviceMobileIcon, DownloadSimpleIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { BUNDLE_FILE_NAME, buildVctSnippet } from '../../core/export/outputs';
import { useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Badge, Button, Tabs } from '../components/controls';
import { goToIssue, useFieldIssues, useIssues } from '../issues';
import { copyText, downloadText } from '../lib/download';
import { SampleControl } from './SampleControl';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="small"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      <CopyIcon /> {copied ? t.output.copied : label}
    </Button>
  );
}

export function OutputPanel({ exportState }: { exportState: ExportState }) {
  const project = useStore((state) => state.project)!;
  const update = useStore((state) => state.update);
  const issues = useIssues();
  const errors = issues.filter((issue) => issue.severity === 'error');
  const tab = useStore((state) => state.outputTab);
  const setTab = useStore((state) => state.setOutputTab);
  const hostingIssues = useFieldIssues('field-hosting-url');
  const ready = exportState.status === 'ready' ? exportState : null;
  const hosting = project.hosting;

  return (
    <>
      <div className="pane__header">
        <span className="pane__title">{t.output.title}</span>
        {ready && <span className="field__hint">{t.output.size((ready.outputs.json.length / 1024).toFixed(1))}</span>}
      </div>
      <div className="pane__body">
        <SampleControl />
        <Tabs
          label={t.output.title}
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'issues',
              label: (
                <>
                  {t.output.issues} {issues.length > 0 && <Badge tone={errors.length ? 'red' : 'yellow'}>{issues.length}</Badge>}
                </>
              ),
            },
            { value: 'bundle', label: t.output.bundle },
            { value: 'vct', label: t.output.vct },
          ]}
        />

        {tab === 'issues' &&
          (issues.length === 0 ? (
            <p className="empty-state">
              <CheckCircleIcon size={20} style={{ color: 'var(--green-text)' }} />
              <br />
              {t.output.noIssues}
            </p>
          ) : (
            <ul className="issues">
              {[...errors, ...issues.filter((issue) => issue.severity === 'warning')].map((issue, index) => (
                <li key={index}>
                  <button type="button" onClick={() => goToIssue(issue)}>
                    {issue.severity === 'error' ? <WarningCircleIcon className="issue-icon--error" /> : <WarningIcon className="issue-icon--warning" />}
                    <span>{issue.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {tab !== 'issues' && (
          <div style={{ paddingTop: 16 }}>
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
              <legend className="field__label" style={{ marginBottom: 8 }}>
                {t.output.hosting}
              </legend>
              <label className="radio">
                <input
                  type="radio"
                  name="hosting"
                  checked={hosting.mode === 'url'}
                  onChange={() => update((draft) => void (draft.hosting = { mode: 'url', url: '' }))}
                />
                <span className="grow">
                  {t.output.hostedUrl}
                  <span className="field__hint" style={{ display: 'block' }}>
                    {t.output.hostedUrlHint}
                  </span>
                  {hosting.mode === 'url' && (
                    <input
                      id="field-hosting-url"
                      className="input input--mono"
                      aria-label={t.output.hostedUrl}
                      style={{ marginTop: 6 }}
                      placeholder={t.output.urlPlaceholder}
                      value={hosting.url}
                      onChange={(event) => update((draft) => void (draft.hosting = { mode: 'url', url: event.target.value }))}
                    />
                  )}
                  {hosting.mode === 'url' &&
                    hostingIssues.map((issue) => (
                      <span key={issue.code} className="field__issue field__issue--warning" style={{ marginTop: 6 }}>
                        {issue.message}
                      </span>
                    ))}
                </span>
              </label>
              <label className="radio">
                <input type="radio" name="hosting" checked={hosting.mode === 'dataUrl'} onChange={() => update((draft) => void (draft.hosting = { mode: 'dataUrl' }))} />
                <span>
                  {t.output.embedded}
                  <span className="field__hint" style={{ display: 'block' }}>
                    {t.output.embeddedHint}
                  </span>
                </span>
              </label>
            </fieldset>

            {exportState.status === 'working' && <p className="field__hint">{t.output.working}</p>}
            {exportState.status === 'failed' && <p className="error-text">{t.output.failed(exportState.error)}</p>}
            {ready && (
              <>
                <div className="output-meta">
                  <span>{t.output.integrity}</span>
                  <code style={{ wordBreak: 'break-all' }}>{ready.outputs.integrity}</code>
                </div>
                {tab === 'bundle' ? (
                  <>
                    <div className="row row--wrap" style={{ marginBottom: 12 }}>
                      <Button
                        variant="primary"
                        size="small"
                        disabled={errors.length > 0}
                        title={errors.length ? t.workspace.downloadBlocked(errors.length) : undefined}
                        onClick={() => downloadText(BUNDLE_FILE_NAME, ready.outputs.json)}
                      >
                        <DownloadSimpleIcon /> {BUNDLE_FILE_NAME}
                      </Button>
                      <CopyButton text={ready.outputs.json} label={t.output.copyJson} />
                      <CopyButton text={ready.outputs.dataUrl} label={t.output.copyDataUrl} />
                      <CopyButton text={ready.outputs.integrity} label={t.output.copyIntegrity} />
                    </div>
                    <pre className="code-block">{ready.outputs.json}</pre>
                  </>
                ) : (
                  <>
                    <p className="note">{t.output.vctHint}</p>
                    <div className="row" style={{ marginBottom: 12 }}>
                      <CopyButton text={JSON.stringify(buildVctSnippet(project, ready.outputs), null, 2)} label={t.output.copySnippet} />
                    </div>
                    <pre className="code-block">{JSON.stringify(buildVctSnippet(project, ready.outputs), null, 2)}</pre>
                  </>
                )}
              </>
            )}
            <div className="section" style={{ marginTop: 24 }}>
              <Button disabled title={t.output.previewSoon}>
                <DeviceMobileIcon /> {t.output.preview}
              </Button>
              <p className="field__hint" style={{ marginTop: 6 }}>
                {t.output.previewSoon}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
