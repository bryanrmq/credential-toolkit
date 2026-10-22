import { DownloadSimpleIcon, SidebarSimpleIcon } from '@phosphor-icons/react';
import type { Ref } from 'react';
import { BUNDLE_FILE_NAME } from '../../core/export/outputs';
import { useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Badge, Button, Menu, Segmented } from '../components/controls';
import { groupIssues, useIssues } from '../issues';
import { downloadText } from '../lib/download';
import { useWideWindow } from '../lib/wideWindow';
import { Wordmark } from '../Wordmark';

/**
 * One row at every width: names on the left, actions on the right. Below 960 px the language
 * switcher becomes a dropdown and the view toggle moves into the menu (see `.wide-only` /
 * `.narrow-only` in styles.css). The error and warning counts are one button that shows the issues.
 * Below 1000 px, where Output is one of the pane tabs, the Output toggle is left out.
 */
export function TopBar({ exportState, onShowIssues, ref }: { exportState: ExportState; onShowIssues: () => void; ref?: Ref<HTMLElement> }) {
  const project = useStore((state) => state.project)!;
  const editLang = useStore((state) => state.editLang);
  const view = useStore((state) => state.view);
  const outputOpen = useStore((state) => state.outputOpen);
  const { setEditLang, setView, setLanguagesOpen, setTourOpen, setOutputOpen, close } = useStore.getState();
  const wide = useWideWindow();
  const groups = groupIssues(useIssues());
  const errors = groups.filter((group) => group.severity === 'error').length;
  const warnings = groups.length - errors;
  const name = project.meta[editLang]?.name || t.workspace.untitled;
  const canDownload = errors === 0 && exportState.status === 'ready';

  return (
    <header className="topbar" ref={ref}>
      <div className="topbar__lead">
        <Wordmark compact />
        <span className="topbar__divider" aria-hidden="true">
          /
        </span>
        <span className="topbar__name" title={name}>
          {name}
        </span>
      </div>
      <div className="topbar__actions" data-tour="topbar">
        <Segmented
          className="wide-only"
          label={t.workspace.editingLanguage}
          value={editLang}
          onChange={setEditLang}
          options={project.languages.map((lang) => ({ value: lang, label: lang }))}
        />
        <select
          className="select select--compact narrow-only"
          aria-label={t.workspace.editingLanguage}
          value={editLang}
          onChange={(event) => setEditLang(event.target.value)}
        >
          {project.languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <Segmented
          className="wide-only"
          label={t.workspace.view}
          value={view}
          onChange={setView}
          options={[
            { value: 'editor', label: t.workspace.editor },
            { value: 'translations', label: t.workspace.translations },
          ]}
        />
        {groups.length > 0 && (
          <Button
            variant="ghost"
            size="small"
            className="topbar__issues hide-phone"
            title={t.issues.show}
            aria-label={t.issues.showCounts([
              ...(errors > 0 ? [t.workspace.errorCount(errors)] : []),
              ...(warnings > 0 ? [t.workspace.warningCount(warnings)] : []),
            ])}
            onClick={onShowIssues}
          >
            {errors > 0 && <Badge tone="red">{t.workspace.errorCount(errors)}</Badge>}
            {warnings > 0 && <Badge tone="yellow">{t.workspace.warningCount(warnings)}</Badge>}
          </Button>
        )}
        {wide && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={outputOpen ? t.workspace.hideOutput : t.workspace.showOutput}
            aria-pressed={outputOpen}
            title={outputOpen ? t.workspace.hideOutput : t.workspace.showOutput}
            data-output-toggle=""
            onClick={() => setOutputOpen(!outputOpen)}
          >
            <SidebarSimpleIcon mirrored />
          </Button>
        )}
        <Button
          variant="primary"
          disabled={!canDownload}
          title={errors > 0 ? t.workspace.downloadBlocked(errors) : undefined}
          onClick={() => exportState.status === 'ready' && downloadText(BUNDLE_FILE_NAME, exportState.outputs.json)}
        >
          <DownloadSimpleIcon /> <span className="label-phone-hidden">{t.workspace.download}</span>
        </Button>
        <Menu
          label={t.workspace.moreActions}
          items={[
            { label: t.workspace.manageLanguages, onSelect: () => setLanguagesOpen(true) },
            { label: t.workspace.editorView, className: 'narrow-only', onSelect: () => setView('editor') },
            { label: t.workspace.translationsView, className: 'narrow-only', onSelect: () => setView('translations') },
            { label: t.tour.start, onSelect: () => setTourOpen(true) },
            {
              label: t.workspace.newProject,
              onSelect: () => {
                if (window.confirm(t.workspace.confirmNew)) close();
              },
            },
          ]}
        />
      </div>
    </header>
  );
}
