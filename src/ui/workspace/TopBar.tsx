import { DownloadSimpleIcon, MagnifyingGlassIcon, SidebarSimpleIcon } from '@phosphor-icons/react';
import type { Ref } from 'react';
import { BUNDLE_FILE_NAME } from '../../core/export/outputs';
import { canFillFromI14y } from '../../core/import/i14y';
import { hasUnreviewed } from '../../core/review';
import { useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Badge, Button, Menu, type MenuItem, Segmented } from '../components/controls';
import { groupIssues, useIssues } from '../issues';
import { setDownloadedBaseline } from '../lib/baseline';
import { type CommandId, ariaKeyShortcuts, commandLabel, runCommand, shortcutLabel } from '../lib/commands';
import { downloadText } from '../lib/download';
import { useWideWindow } from '../lib/wideWindow';
import { Wordmark } from '../Wordmark';

/** A menu item that runs command `id`, with its keys. */
function commandItem(id: CommandId): MenuItem {
  return { label: commandLabel(id), shortcut: shortcutLabel(id), ariaKeyShortcuts: ariaKeyShortcuts(id), onSelect: () => runCommand(id) };
}

/**
 * One row at every width: names on the left, actions on the right. Below 960 px the language
 * switcher becomes a dropdown and the view toggle moves into the menu (see `.wide-only` /
 * `.narrow-only` in styles.css). The error and warning counts are one button that shows the issues.
 * Below 1000 px, where Output is one of the pane tabs, the Output toggle is left out, and the search
 * button (the command palette) shows only its icon.
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
            aria-keyshortcuts="Meta+Alt+B Control+Alt+B"
            title={outputOpen ? t.workspace.hideOutputTitle : t.workspace.showOutputTitle}
            data-output-toggle=""
            onClick={() => setOutputOpen(!outputOpen)}
          >
            <SidebarSimpleIcon mirrored />
          </Button>
        )}
        {/* For touch and narrow windows too, where the tree commands are otherwise keyboard or right-click only. */}
        <Button
          variant="ghost"
          size={wide ? 'small' : 'icon'}
          className="topbar__palette"
          aria-label={t.palette.title}
          aria-keyshortcuts={ariaKeyShortcuts('workspace.palette')}
          title={t.palette.title}
          onClick={() => runCommand('workspace.palette')}
        >
          <MagnifyingGlassIcon size={16} />
          {wide && <kbd aria-hidden="true">{shortcutLabel('workspace.palette')}</kbd>}
        </Button>
        <Button
          variant="primary"
          disabled={!canDownload}
          title={errors > 0 ? t.workspace.downloadBlocked(errors) : undefined}
          onClick={() => {
            if (exportState.status !== 'ready') return;
            downloadText(BUNDLE_FILE_NAME, exportState.outputs.json);
            // What was downloaded is what gets published: the Changes tab compares with it from now on.
            setDownloadedBaseline(exportState.outputs);
          }}
        >
          <DownloadSimpleIcon /> <span className="label-phone-hidden">{t.workspace.download}</span>
        </Button>
        <Menu
          label={t.workspace.moreActions}
          items={[
            { label: t.workspace.manageLanguages, onSelect: () => setLanguagesOpen(true) },
            // Only when a linked attribute lacks a text its I14Y concept may have.
            ...(canFillFromI14y(project) ? [commandItem('workspace.fillFromI14y')] : []),
            // Only while some suggested text waits for review.
            ...(hasUnreviewed(project) ? [commandItem('workspace.confirmSuggestions')] : []),
            { label: t.workspace.editorView, className: 'narrow-only', onSelect: () => setView('editor') },
            { label: t.workspace.translationsView, className: 'narrow-only', onSelect: () => setView('translations') },
            { label: t.tour.start, onSelect: () => setTourOpen(true) },
            { ...commandItem('workspace.saveProjectFile'), separatorBefore: true },
            commandItem('workspace.openProjectFile'),
            {
              label: t.workspace.newProject,
              onSelect: close,
            },
          ]}
        />
      </div>
    </header>
  );
}
