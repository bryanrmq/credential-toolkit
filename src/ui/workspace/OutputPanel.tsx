import { CaretDownIcon, CaretRightIcon, CheckIcon, CopyIcon, DownloadSimpleIcon, GearSixIcon, SidebarSimpleIcon } from '@phosphor-icons/react';
import { type CSSProperties, Fragment, useRef, useState } from 'react';
import type { ProjectChange } from '../../core/compare';
import { BUNDLE_FILE_NAME, buildVctSnippet } from '../../core/export/outputs';
import { type OutputHalf, useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Button, InlineIssueFixes, Tabs } from '../components/controls';
import { PaneResizer } from '../components/PaneResizer';
import { useFieldIssues, useIssues } from '../issues';
import { useBaseline } from '../lib/baseline';
import { useChanges } from '../lib/changes';
import { copyText, downloadText } from '../lib/download';
import { DEFAULT_PREVIEW_HEIGHT, PREVIEW_HEIGHT_LIMITS, clampPreviewHeight, loadPreviewHeight, savePreviewHeight } from '../lib/paneLayout';
import { ChangesView } from './ChangesView';
import { OutputPreview } from './OutputPreview';
import { PreviewControls } from './PreviewControls';
import { SampleControl } from './SampleControl';

const PREVIEW_BODY_ID = 'output-preview-body';
const BUNDLE_BODY_ID = 'output-bundle-body';
const SETTINGS_ID = 'output-bundle-settings';

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

/** The chevron that collapses a half to its header and expands it again. */
function CollapseButton({ half, controls, collapseLabel, expandLabel }: { half: OutputHalf; controls: string; collapseLabel: string; expandLabel: string }) {
  const open = useStore((state) => state.outputHalves[half]);
  const setHalfOpen = useStore((state) => state.setOutputHalfOpen);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="output-half__toggle"
      aria-label={open ? collapseLabel : expandLabel}
      title={open ? collapseLabel : expandLabel}
      aria-expanded={open}
      aria-controls={controls}
      onClick={() => setHalfOpen(half, !open)}
    >
      {open ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
    </Button>
  );
}

/**
 * The Output pane: the wallet preview on top and the bundle below. On a wide window a divider between them sets the
 * preview's height, remembered like the pane widths; each half collapses to its header and the other takes the room.
 * `stacked` (a narrow window) puts both halves in one scrolling column with no divider.
 * `onHide`, given on a wide window only, adds a button to the preview's header that hides the pane.
 * `onJump` runs after a click in the Changes tab took the user to a field.
 */
export function OutputPanel({
  exportState,
  onHide,
  onJump,
  stacked = false,
}: {
  exportState: ExportState;
  onHide?: () => void;
  onJump?: (change: ProjectChange) => void;
  stacked?: boolean;
}) {
  const halves = useStore((state) => state.outputHalves);
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(loadPreviewHeight);
  const heightRef = useRef(height);
  const resize = (value: number) => {
    heightRef.current = clampPreviewHeight(value, rootRef.current?.clientHeight);
    setHeight(heightRef.current);
  };
  const commit = () => savePreviewHeight(heightRef.current);
  const split = !stacked && halves.preview && halves.bundle;

  return (
    <div
      ref={rootRef}
      className={split ? 'output output--split' : stacked ? 'output output--stacked' : 'output'}
      style={split ? ({ '--preview-height': `${height}px` } as CSSProperties) : undefined}
    >
      <PreviewHalf onHide={onHide} />
      {split && (
        <PaneResizer
          label={t.output.resizePreview}
          value={height}
          min={PREVIEW_HEIGHT_LIMITS[0]}
          max={PREVIEW_HEIGHT_LIMITS[1]}
          direction={1}
          orientation="horizontal"
          onResize={resize}
          onCommit={commit}
          onReset={() => {
            resize(DEFAULT_PREVIEW_HEIGHT);
            commit();
          }}
        />
      )}
      <BundleHalf exportState={exportState} onJump={onJump} />
    </div>
  );
}

function PreviewHalf({ onHide }: { onHide?: () => void }) {
  const open = useStore((state) => state.outputHalves.preview);

  return (
    <div className={open ? 'output-half output-half--preview' : 'output-half output-half--preview output-half--collapsed'}>
      <div className="output-half__header">
        <span className="pane__title">{t.output.preview}</span>
        <span className="output-half__actions">
          {onHide && (
            <Button size="icon" variant="ghost" aria-label={t.workspace.hideOutput} title={t.workspace.hideOutputTitle} onClick={onHide}>
              <SidebarSimpleIcon mirrored />
            </Button>
          )}
          <CollapseButton half="preview" controls={PREVIEW_BODY_ID} collapseLabel={t.output.collapsePreview} expandLabel={t.output.expandPreview} />
        </span>
        {open && <PreviewControls className="output-half__controls" />}
      </div>
      {open && (
        <div className="output-half__body" id={PREVIEW_BODY_ID}>
          <OutputPreview />
        </div>
      )}
    </div>
  );
}

function BundleHalf({ exportState, onJump }: { exportState: ExportState; onJump?: (change: ProjectChange) => void }) {
  const project = useStore((state) => state.project)!;
  const open = useStore((state) => state.outputHalves.bundle);
  const settingsOpen = useStore((state) => state.outputSettingsOpen);
  const tab = useStore((state) => state.outputTab);
  const { setOutputTab, setOutputHalfOpen, setOutputSettingsOpen } = useStore.getState();
  const ready = exportState.status === 'ready' ? exportState : null;
  const snippet = ready ? JSON.stringify(buildVctSnippet(project, ready.outputs), null, 2) : '';
  const baseline = useBaseline();
  const changes = useChanges(project, baseline);
  const changeCount = changes.status === 'ready' ? changes.changes.length : 0;
  // A tab or the gear also expands a collapsed half, since what they pick shows in its body.
  const show = (change: () => void) => {
    change();
    setOutputHalfOpen('bundle', true);
  };

  return (
    <div className={open ? 'output-half output-half--bundle' : 'output-half output-half--bundle output-half--collapsed'}>
      <div className="output-half__header output-half__header--tabs">
        <Tabs
          label={t.output.title}
          value={tab}
          onChange={(value) => show(() => setOutputTab(value))}
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
        <span className="output-half__actions">
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
          <Button
            size="icon"
            variant="ghost"
            className={settingsOpen && open ? 'output-half__settings is-active' : 'output-half__settings'}
            aria-label={t.output.settings}
            title={t.output.settings}
            aria-expanded={settingsOpen && open}
            aria-controls={SETTINGS_ID}
            onClick={() => (settingsOpen && open ? setOutputSettingsOpen(false) : show(() => setOutputSettingsOpen(true)))}
          >
            <GearSixIcon />
          </Button>
          <CollapseButton half="bundle" controls={BUNDLE_BODY_ID} collapseLabel={t.output.collapseBundle} expandLabel={t.output.expandBundle} />
        </span>
      </div>
      {open && (
        <div className="output-half__body" id={BUNDLE_BODY_ID}>
          {settingsOpen && <BundleSettings />}
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
      )}
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

/** Where the bundle will be hosted and the sample credential, behind the gear in the Bundle half's header. */
function BundleSettings() {
  const hosting = useStore((state) => state.project!.hosting);
  const update = useStore((state) => state.update);
  const hostingIssues = useFieldIssues('field-hosting-url');

  return (
    <div className="output-settings" id={SETTINGS_ID} role="region" aria-label={t.output.settings}>
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
