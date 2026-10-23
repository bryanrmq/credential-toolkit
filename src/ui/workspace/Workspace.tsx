import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { validate } from '../../core/validate';
import { useDrafts } from '../../state/persistence';
import { useStore } from '../../state/store';
import { useExport } from '../../state/useExport';
import { t } from '../../strings';
import { Tabs } from '../components/controls';
import { FixToast } from '../components/FixToast';
import { PaneResizer } from '../components/PaneResizer';
import { IssuesContext } from '../issues';
import { useCommandHost, useCommandShortcuts } from '../lib/commands';
import {
  DEFAULT_PANE_WIDTHS,
  PANE_LIMITS,
  type ResizablePane,
  type WorkspacePane,
  clampPaneWidth,
  loadIssuesOpen,
  loadOutputHalves,
  loadOutputOpen,
  loadPaneWidths,
  saveIssuesOpen,
  saveOutputHalves,
  saveOutputOpen,
  savePaneWidths,
} from '../lib/paneLayout';
import { loadTourSeen } from '../lib/tour';
import { useWideWindow } from '../lib/wideWindow';
import { Inspector } from './Inspector';
import { IssuesPanel } from './IssuesPanel';
import { LanguagesDialog } from './LanguagesDialog';
import { OutOfSpaceBanner } from './OutOfSpaceBanner';
import { OutputPanel } from './OutputPanel';
import { I14yMatchBanner } from './I14yMatchBanner';
import { ReportBanner } from './ReportBanner';
import { StructurePane } from './StructurePane';
import { TopBar } from './TopBar';
import { Tour } from './Tour';
import { TranslationsView } from './TranslationsView';

export function Workspace() {
  const project = useStore((state) => state.project);
  const view = useStore((state) => state.view);
  const languagesOpen = useStore((state) => state.languagesOpen);
  const tourOpen = useStore((state) => state.tourOpen);
  const saveFailed = useStore((state) => state.draftSaveFailed);
  const issues = useMemo(() => (project ? validate(project) : []), [project]);
  const exportState = useExport(project);
  const [pane, setPane] = useState<WorkspacePane>('inspector');
  const panesRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState(loadPaneWidths);
  const widthsRef = useRef(widths);
  const wide = useWideWindow();
  // The store holds whether Output and its halves show, so that going to a hosting issue or the tour can show them again.
  const outputOpen = useStore((state) => state.outputOpen);
  useLayoutEffect(() => {
    useStore.getState().setOutputOpen(loadOutputOpen());
    useStore.getState().setOutputHalves(loadOutputHalves());
    return useStore.subscribe((state, previous) => {
      if (state.outputOpen !== previous.outputOpen) saveOutputOpen(state.outputOpen);
      if (state.outputHalves !== previous.outputHalves) saveOutputHalves(state.outputHalves);
    });
  }, []);
  // A narrow window shows one pane at a time, Output among the tabs, so there it is never hidden.
  const outputShown = outputOpen || !wide;
  const topBarRef = useRef<HTMLElement>(null);
  const hideOutput = () => {
    useStore.getState().setOutputOpen(false);
    // The button that was pressed is gone: focus goes to the top-bar toggle, which shows the pane again.
    topBarRef.current?.querySelector<HTMLElement>('[data-output-toggle]')?.focus();
  };
  useCommandHost('workspace', {
    toggleOutput: () => {
      const { outputOpen: open, setOutputOpen } = useStore.getState();
      // Focus only moves when it was in the pane being hidden.
      if (open && document.activeElement?.closest('.pane--output')) hideOutput();
      else setOutputOpen(!open);
    },
  });
  const resize = (target: ResizablePane, value: number) => {
    const other = target === 'structure' ? (outputShown ? widthsRef.current.output : 0) : widthsRef.current.structure;
    const next = { ...widthsRef.current, [target]: clampPaneWidth(target, value, { container: panesRef.current?.clientWidth ?? 0, other }) };
    widthsRef.current = next;
    setWidths(next);
  };
  const commit = () => savePaneWidths(widthsRef.current);
  const reset = (target: ResizablePane) => {
    resize(target, DEFAULT_PANE_WIDTHS[target]);
    commit();
  };
  const resizer = (target: ResizablePane, label: string, direction: 1 | -1) => (
    <PaneResizer
      label={label}
      value={widths[target]}
      min={PANE_LIMITS[target][0]}
      max={PANE_LIMITS[target][1]}
      direction={direction}
      onResize={(value) => resize(target, value)}
      onCommit={commit}
      onReset={() => reset(target)}
    />
  );
  const [issuesOpen, setIssuesOpen] = useState(loadIssuesOpen);
  const [issuesFocus, setIssuesFocus] = useState(0);
  const openIssues = (open: boolean) => {
    setIssuesOpen(open);
    saveIssuesOpen(open);
  };
  // The top-bar button: a wide window expands the panel, a narrow one switches to the Issues pane.
  const showIssues = () => {
    if (wide) {
      openIssues(true);
    } else {
      useStore.getState().setView('editor');
      setPane('issues');
    }
    setIssuesFocus((count) => count + 1);
  };
  const issuesPane = !wide && view === 'editor' && pane === 'issues';
  const canSave = useDrafts((state) => state.available);
  useCommandShortcuts();
  // The tour starts by itself until this browser has finished or skipped it once.
  useEffect(() => {
    if (!loadTourSeen()) useStore.getState().setTourOpen(true);
  }, []);
  if (!project) return null;

  return (
    <IssuesContext.Provider value={issues}>
      <div className="workspace">
        <TopBar ref={topBarRef} exportState={exportState} onShowIssues={showIssues} />
        {!canSave && (
          <p className="note" role="status" style={{ margin: '12px 20px 0' }}>
            {t.workspace.storageUnavailable}
          </p>
        )}
        {canSave && saveFailed && <OutOfSpaceBanner />}
        <ReportBanner />
        <I14yMatchBanner onReview={() => setPane('inspector')} />
        {view === 'translations' ? (
          <TranslationsView />
        ) : (
          <>
            <div className="pane-tabs">
              <Tabs
                label="Panes"
                value={pane}
                onChange={setPane}
                options={[
                  { value: 'structure', label: t.workspace.panes.structure },
                  { value: 'inspector', label: t.workspace.panes.inspector },
                  { value: 'output', label: t.workspace.panes.output },
                  ...(wide ? [] : [{ value: 'issues' as const, label: t.workspace.panes.issues }]),
                ]}
              />
            </div>
            <div
              className={outputShown ? 'panes' : 'panes panes--no-output'}
              data-pane={pane}
              ref={panesRef}
              style={{ '--structure-width': `${widths.structure}px`, '--output-width': `${widths.output}px` } as CSSProperties}
            >
              <section className="pane pane--structure" aria-label={t.structure.title} data-tour="structure">
                <StructurePane onSelect={() => setPane('inspector')} />
              </section>
              {resizer('structure', t.workspace.resizeStructure, 1)}
              <section className="pane pane--inspector" aria-label={t.workspace.panes.inspector} data-tour="edit">
                <Inspector />
              </section>
              {outputShown && (
                <>
                  {resizer('output', t.workspace.resizeOutput, -1)}
                  <section className="pane pane--output" aria-label={t.output.title} data-tour="output">
                    <OutputPanel
                      exportState={exportState}
                      onHide={wide ? hideOutput : undefined}
                      // On narrow windows only one pane shows: a change's field is in Edit (languages open a dialog).
                      onJump={(change) => change.section !== 'languages' && setPane('inspector')}
                      stacked={!wide}
                    />
                  </section>
                </>
              )}
            </div>
          </>
        )}
        {/* Docked under the panes or the Translations view; on a narrow window it is a pane of its own. */}
        {(wide || issuesPane) && (
          <IssuesPanel
            open={issuesOpen}
            onOpenChange={openIssues}
            docked={wide}
            focusRequest={issuesFocus}
            // On narrow windows only one pane shows: switch to the one that holds the field.
            onJump={(issue) => issue.target.kind !== 'languages' && setPane(issue.target.kind === 'hosting' ? 'output' : 'inspector')}
          />
        )}
        {languagesOpen && <LanguagesDialog />}
        {tourOpen && <Tour pane={pane} onPane={setPane} />}
        <FixToast />
      </div>
    </IssuesContext.Provider>
  );
}
