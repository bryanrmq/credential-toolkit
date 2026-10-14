import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { validate } from '../../core/validate';
import { storageAvailable } from '../../state/persistence';
import { useStore } from '../../state/store';
import { useExport } from '../../state/useExport';
import { t } from '../../strings';
import { Tabs } from '../components/controls';
import { PaneResizer } from '../components/PaneResizer';
import { IssuesContext } from '../issues';
import {
  DEFAULT_PANE_WIDTHS,
  PANE_LIMITS,
  type ResizablePane,
  clampPaneWidth,
  loadPaneWidths,
  savePaneWidths,
} from '../lib/paneLayout';
import { Inspector } from './Inspector';
import { LanguagesDialog } from './LanguagesDialog';
import { OutputPanel } from './OutputPanel';
import { ReportBanner } from './ReportBanner';
import { StructurePane } from './StructurePane';
import { TopBar } from './TopBar';
import { TranslationsView } from './TranslationsView';

type Pane = 'structure' | 'inspector' | 'output';

export function Workspace() {
  const project = useStore((state) => state.project);
  const view = useStore((state) => state.view);
  const languagesOpen = useStore((state) => state.languagesOpen);
  const saveFailed = useStore((state) => state.draftSaveFailed);
  const issues = useMemo(() => (project ? validate(project) : []), [project]);
  const exportState = useExport(project);
  const [pane, setPane] = useState<Pane>('inspector');
  const panesRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState(loadPaneWidths);
  const widthsRef = useRef(widths);
  const resize = (target: ResizablePane, value: number) => {
    const other = target === 'structure' ? widthsRef.current.output : widthsRef.current.structure;
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
  const [canSave] = useState(storageAvailable);
  if (!project) return null;

  return (
    <IssuesContext.Provider value={issues}>
      <div className="workspace">
        <TopBar exportState={exportState} />
        {(!canSave || saveFailed) && (
          <p className="note" role="status" style={{ margin: '12px 20px 0' }}>
            {canSave ? t.workspace.saveFailed : t.workspace.storageUnavailable}
          </p>
        )}
        <ReportBanner />
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
                ]}
              />
            </div>
            <div
              className="panes"
              data-pane={pane}
              ref={panesRef}
              style={{ '--structure-width': `${widths.structure}px`, '--output-width': `${widths.output}px` } as CSSProperties}
            >
              <section className="pane pane--structure" aria-label={t.structure.title}>
                <StructurePane onSelect={() => setPane('inspector')} />
              </section>
              {resizer('structure', t.workspace.resizeStructure, 1)}
              <section className="pane pane--inspector" aria-label={t.workspace.panes.inspector}>
                <Inspector />
              </section>
              {resizer('output', t.workspace.resizeOutput, -1)}
              <section className="pane pane--output" aria-label={t.output.title}>
                <OutputPanel exportState={exportState} />
              </section>
            </div>
          </>
        )}
        {languagesOpen && <LanguagesDialog />}
      </div>
    </IssuesContext.Provider>
  );
}
