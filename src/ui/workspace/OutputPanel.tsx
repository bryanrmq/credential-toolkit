import { DownloadSimpleIcon, SidebarSimpleIcon } from '@phosphor-icons/react';
import { Fragment } from 'react';
import type { ProjectChange } from '../../core/compare';
import { BUNDLE_FILE_NAME } from '../../core/export/outputs';
import { useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Button, InlineIssueFixes, Tabs } from '../components/controls';
import { blocksBundle, useFieldIssues, useIssues } from '../issues';
import { useBaseline } from '../lib/baseline';
import { useChanges } from '../lib/changes';
import { downloadText } from '../lib/download';
import { ChangesView } from './ChangesView';
import { CopyButton } from './CopyButton';
import { SampleControl } from './SampleControl';

/**
 * The Output pane: the bundle and what changed since the published bundle, under one set of tabs. The Type Metadata
 * and the Issuer Metadata are on the Metadata page (`MetadataView`).
 * Under Bundle, where the bundle will be hosted and the sample credential sit above the JSON.
 * `onHide`, given on a wide window only, adds a button to the header that hides the pane.
 * `onJump` runs after a click in the Changes tab took the user to a field.
 */
export function OutputPanel({ exportState, onHide, onJump }: { exportState: ExportState; onHide?: () => void; onJump?: (change: ProjectChange) => void }) {
  const project = useStore((state) => state.project)!;
  const tab = useStore((state) => state.outputTab);
  const setOutputTab = useStore((state) => state.setOutputTab);
  const ready = exportState.status === 'ready' ? exportState : null;
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
          {ready && tab === 'bundle' && <CopyButton text={ready.outputs.json} label={t.output.copyJson} iconOnly />}
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
            <BundleOutput exportState={exportState} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The Bundle tab: the JSON, its `#integrity` and the download. */
function BundleOutput({ exportState }: { exportState: ExportState }) {
  const errors = useIssues().filter(blocksBundle);
  const ready = exportState.status === 'ready' ? exportState : null;
  return (
    <>
      {exportState.status === 'working' && <p className="field__hint">{t.output.working}</p>}
      {exportState.status === 'failed' && <p className="error-text">{t.output.failed(exportState.error)}</p>}
      {ready && (
        <>
          <pre className="code-block">{ready.outputs.json}</pre>
          <div className="integrity">
            <span className="field__label">{t.output.integrity}</span>
            <div className="integrity__value">
              <code>{ready.outputs.integrity}</code>
              <CopyButton text={ready.outputs.integrity} label={t.output.copyIntegrity} iconOnly />
            </div>
          </div>
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
        <legend className="field__label output-settings__legend">
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
            <span className="field__hint output-settings__hint">
              {t.output.hostedUrlHint}
            </span>
            {hosting.mode === 'url' && (
              <input
                id="field-hosting-url"
                className="input input--mono output-settings__detail"
                aria-label={t.output.hostedUrl}
                placeholder={t.output.urlPlaceholder}
                value={hosting.url}
                onChange={(event) => update((draft) => void (draft.hosting = { mode: 'url', url: event.target.value }))}
              />
            )}
            {hosting.mode === 'url' &&
              hostingIssues.map((issue) => (
                <Fragment key={issue.code}>
                  <span className="field__issue field__issue--warning output-settings__detail">
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
            <span className="field__hint output-settings__hint">
              {t.output.embeddedHint}
            </span>
          </span>
        </label>
      </fieldset>
      <SampleControl />
    </div>
  );
}
