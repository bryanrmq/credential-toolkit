import { CheckIcon, CopyIcon, DownloadSimpleIcon, SidebarSimpleIcon } from '@phosphor-icons/react';
import { Fragment, useState } from 'react';
import type { ProjectChange } from '../../core/compare';
import { BUNDLE_FILE_NAME, buildVctSnippet } from '../../core/export/outputs';
import { useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Button, InlineIssueFixes, Tabs } from '../components/controls';
import { useFieldIssues, useIssues } from '../issues';
import { useBaseline } from '../lib/baseline';
import { useChanges } from '../lib/changes';
import { copyText, downloadText } from '../lib/download';
import { ChangesView } from './ChangesView';
import { SampleControl } from './SampleControl';

function CopyButton({ text, label, iconOnly = false }: { text: string; label: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (iconOnly) {
    return (
      <Button
        size="icon"
        variant="ghost"
        aria-label={copied ? t.output.copied : label}
        title={copied ? t.output.copied : label}
        onClick={async () => {
          if (await copyText(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    );
  }
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

/**
 * The Output pane: the bundle, its VCT snippet and what changed since the published bundle, under one set of tabs.
 * Under Bundle, where the bundle will be hosted and the sample credential sit above the JSON.
 * `onHide`, given on a wide window only, adds a button to the header that hides the pane.
 * `onJump` runs after a click in the Changes tab took the user to a field.
 */
export function OutputPanel({ exportState, onHide, onJump }: { exportState: ExportState; onHide?: () => void; onJump?: (change: ProjectChange) => void }) {
  const project = useStore((state) => state.project)!;
  const tab = useStore((state) => state.outputTab);
  const setOutputTab = useStore((state) => state.setOutputTab);
  const ready = exportState.status === 'ready' ? exportState : null;
  const snippet = ready ? JSON.stringify(buildVctSnippet(project, ready.outputs), null, 2) : '';
  const baseline = useBaseline();
  const changes = useChanges(project, baseline);
  const changeCount = changes.status === 'ready' ? changes.changes.length : 0;

  return (
    <div className="output">
      <div className="output__header">
        <Tabs
          label={t.output.title}
          value={tab}
          onChange={setOutputTab}
          options={[
            { value: 'bundle', label: t.output.bundle },
            { value: 'vct', label: t.output.vct },
            {
              value: 'changes',
              label: (
                <>
                  {t.changes.tab}
                  {changeCount > 0 && (
                    <>
                      {' '}
                      <span className="tabs__count">{changeCount}</span>
                    </>
                  )}
                </>
              ),
            },
          ]}
        />
        <span className="output__actions">
          {ready && <span className="field__hint">{t.output.size((ready.outputs.json.length / 1024).toFixed(1))}</span>}
          {ready && tab !== 'changes' && (
            <CopyButton
              // One per tab, so a "Copied" from the other tab does not carry over.
              key={tab}
              text={tab === 'bundle' ? ready.outputs.json : snippet}
              label={tab === 'bundle' ? t.output.copyJson : t.output.copySnippet}
              iconOnly
            />
          )}
          {onHide && (
            <Button size="icon" variant="ghost" aria-label={t.workspace.hideOutput} title={t.workspace.hideOutputTitle} onClick={onHide}>
              <SidebarSimpleIcon mirrored />
            </Button>
          )}
        </span>
      </div>
      <div className="output__body">
        {tab === 'bundle' && <BundleSettings />}
        <div className="output-bundle">
          {tab === 'changes' ? (
            <ChangesView
              baseline={baseline}
              state={changes}
              current={ready?.outputs.integrity ?? null}
              copy={ready && <CopyButton text={ready.outputs.integrity} label={t.output.copyIntegrity} iconOnly />}
              onJump={onJump}
            />
          ) : (
            <BundleOutput exportState={exportState} tab={tab} snippet={snippet} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The Bundle and VCT tabs: the JSON, its `#integrity` and, under Bundle, the download. */
function BundleOutput({ exportState, tab, snippet }: { exportState: ExportState; tab: 'bundle' | 'vct'; snippet: string }) {
  const errors = useIssues().filter((issue) => issue.severity === 'error');
  const ready = exportState.status === 'ready' ? exportState : null;
  return (
    <>
      {exportState.status === 'working' && <p className="field__hint">{t.output.working}</p>}
      {exportState.status === 'failed' && <p className="error-text">{t.output.failed(exportState.error)}</p>}
      {ready && (
        <>
          {tab === 'vct' && <p className="note">{t.output.vctHint}</p>}
          <pre className="code-block">{tab === 'bundle' ? ready.outputs.json : snippet}</pre>
          <div className="integrity">
            <span className="field__label">{t.output.integrity}</span>
            <div className="integrity__value">
              <code>{ready.outputs.integrity}</code>
              <CopyButton text={ready.outputs.integrity} label={t.output.copyIntegrity} iconOnly />
            </div>
          </div>
          {tab === 'bundle' && (
            <div className="row row--wrap">
              <Button
                variant="primary"
                size="small"
                disabled={errors.length > 0}
                title={errors.length ? t.workspace.downloadBlocked(errors.length) : undefined}
                onClick={() => downloadText(BUNDLE_FILE_NAME, ready.outputs.json)}
              >
                <DownloadSimpleIcon /> {BUNDLE_FILE_NAME}
              </Button>
              <CopyButton text={ready.outputs.dataUrl} label={t.output.copyDataUrl} />
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Where the bundle will be hosted and the sample credential, above the JSON under the Bundle tab. */
function BundleSettings() {
  const hosting = useStore((state) => state.project!.hosting);
  const update = useStore((state) => state.update);
  const hostingIssues = useFieldIssues('field-hosting-url');

  return (
    <div className="output-settings">
      <fieldset className="output-settings__hosting">
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
                <Fragment key={issue.code}>
                  <span className="field__issue field__issue--warning" style={{ marginTop: 6 }}>
                    {issue.message}
                  </span>
                  <InlineIssueFixes issue={issue} />
                </Fragment>
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
      <SampleControl />
    </div>
  );
}
