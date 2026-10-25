import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDrafts } from '../../state/persistence';
import { isOutputShown, useStore } from '../../state/store';
import { useExport } from '../../state/useExport';
import { t } from '../../strings';
import { Tabs } from '../components/controls';
import { FixToast } from '../components/FixToast';
import { PaneResizer } from '../components/PaneResizer';
import { IssuesContext, projectIssues } from '../issues';
import { focusTreeSelection, useCommandHost, useCommandShortcuts } from '../lib/commands';
import {
  DEFAULT_PANE_WIDTHS,
  PANE_LIMITS,
  type ResizablePane,
  type WorkspacePane,
  clampPaneWidth,
  loadOutputOpen,
  loadPaneWidths,
  outputFits,
  saveOutputOpen,
  savePaneWidths,
} from '../lib/paneLayout';
import { filterHides } from '../lib/palette';
import { loadTourSeen } from '../lib/tour';
import { useWideWindow } from '../lib/wideWindow';
import { CommandPalette } from './CommandPalette';
import { Inspector } from './Inspector';
import { IssuesPanel } from './IssuesPanel';
import { LanguagesDialog } from './LanguagesDialog';
import { OutOfSpaceBanner } from './OutOfSpaceBanner';
import { OutputPanel } from './OutputPanel';
import { ReportBanner } from './ReportBanner';
import { StructurePane } from './StructurePane';
import { type ShowIssues, TopBar } from './TopBar';
import { Tour } from './Tour';
import { TranslationNotice } from './TranslationNotice';
import { MetadataView } from './MetadataView';
import { TranslationsView } from './TranslationsView';

export function Workspace() {
  const project = useStore((state) => state.project);
  const view = useStore((state) => state.view);
  const area = useStore((state) => state.area);
  const languagesOpen = useStore((state) => state.languagesOpen);
  const tourOpen = useStore((state) => state.tourOpen);
  const saveFailed = useStore((state) => state.draftSaveFailed);
  const issues = useMemo(() => (project ? projectIssues(project) : []), [project]);
  const exportState = useExport(project);
  const [pane, setPane] = useState<WorkspacePane>('inspector');
  const panesRef = useRef<HTMLDivElement>(null);
  const [panesWidth, setPanesWidth] = useState(0);
  // Measured on mount, before the first paint, and again whenever the panes are resized.
  const observePanes = useCallback((element: HTMLDivElement | null) => {
    panesRef.current = element;
    if (!element) return;
    setPanesWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setPanesWidth(element.clientWidth));
    observer.observe(element);
    return () => {
      observer.disconnect();
      panesRef.current = null;
    };
  }, []);
  const [widths, setWidths] = useState(loadPaneWidths);
  const widthsRef = useRef(widths);
  const wide = useWideWindow();
  // The store holds whether Output shows, so that going to a hosting issue or the tour can show it again.
  const outputOpen = useStore(isOutputShown);
  useLayoutEffect(() => {
    // Not `setOutputOpen`: a remembered choice is not a request to squeeze the pane into a window too small for it.
    useStore.setState({ outputOpen: loadOutputOpen(), outputSqueezed: false });
    return useStore.subscribe((state, previous) => {
      if (state.outputOpen !== previous.outputOpen) saveOutputOpen(state.outputOpen);
    });
  }, []);
  // Where Output at the user's widths would leave Edit under its minimum, Output steps aside until it is asked for.
  const cramped = wide && !outputFits(panesWidth, widths);
  useLayoutEffect(() => useStore.getState().setOutputCramped(cramped), [cramped]);
  // A narrow window shows one pane at a time, Output among the tabs, so there it is never hidden.
  const outputShown = outputOpen || !wide;
  const topBarRef = useRef<HTMLElement>(null);
  const hideOutput = () => {
    useStore.getState().setOutputOpen(false);
    // The button that was pressed is gone: focus goes to the top-bar toggle, which shows the pane again.
    topBarRef.current?.querySelector<HTMLElement>('[data-output-toggle]')?.focus();
  };
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandHost('workspace', {
    toggleOutput: () => {
      const state = useStore.getState();
      const open = isOutputShown(state);
      // Focus only moves when it was in the pane being hidden.
      if (open && document.activeElement?.closest('.pane--output')) hideOutput();
      else state.setOutputOpen(!open);
    },
    openPalette: () => setPaletteOpen(true),
  });
  // An attribute chosen in the palette: selected (which expands the groups around it) and shown in the tree, with focus on its row.
  const reveal = (id: string) => {
    const { project: current, treeFilter, editLang, setTreeFilter, setView, select } = useStore.getState();
    if (current && filterHides(current, treeFilter, editLang, id)) setTreeFilter('');
    setView('editor');
    select({ kind: 'node', id });
    if (!wide) setPane('structure');
    requestAnimationFrame(focusTreeSelection);
  };
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
  // A project opens with the Issues panel expanded only when it has an error; warnings alone leave it collapsed to its
  // header. After that the user's toggle wins, until another project is opened.
  const draftId = useStore((state) => state.draftId);
  const hasError = issues.some((issue) => issue.severity === 'error');
  const [issuesOpen, setIssuesOpen] = useState(hasError);
  const [issuesDraft, setIssuesDraft] = useState(draftId);
  if (issuesDraft !== draftId) {
    setIssuesDraft(draftId);
    setIssuesOpen(hasError);
  }
  // The tour's Issues step shows the list even when the panel is collapsed.
  const [tourIssues, setTourIssues] = useState(false);
  const [issuesFocus, setIssuesFocus] = useState({ count: 0, firstError: false });
  // The top-bar counts and the blocked Download: a wide window expands the panel, a narrow one switches to the Issues
  // pane, which only the OCA's editor has.
  const showIssues: ShowIssues = ({ firstError = false } = {}) => {
    if (wide) {
      setIssuesOpen(true);
    } else {
      useStore.getState().setArea('oca');
      useStore.getState().setView('editor');
      setPane('issues');
    }
    setIssuesFocus(({ count }) => ({ count: count + 1, firstError }));
  };
  const issuesPane = !wide && area === 'oca' && view === 'editor' && pane === 'issues';
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
          <p className="note workspace__note" role="status">
            {t.workspace.storageUnavailable}
          </p>
        )}
        {canSave && saveFailed && <OutOfSpaceBanner />}
        <ReportBanner onReview={() => setPane('inspector')} />
        {area === 'metadata' ? (
          <MetadataView exportState={exportState} />
        ) : view === 'translations' ? (
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
              ref={observePanes}
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
            open={issuesOpen || tourIssues}
            onOpenChange={setIssuesOpen}
            docked={wide}
            focusRequest={issuesFocus.count}
            focusFirstError={issuesFocus.firstError}
            // On narrow windows only one pane shows: switch to the one that holds the field.
            onJump={(issue) => issue.target.kind !== 'languages' && setPane(issue.target.kind === 'hosting' ? 'output' : 'inspector')}
          />
        )}
        {languagesOpen && <LanguagesDialog />}
        {tourOpen && <Tour pane={pane} onPane={setPane} onIssues={setTourIssues} />}
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onReveal={reveal} />}
        <TranslationNotice />
        <FixToast />
      </div>
    </IssuesContext.Provider>
  );
}
