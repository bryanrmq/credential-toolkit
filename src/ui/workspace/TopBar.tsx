import { DownloadSimpleIcon, GlobeIcon } from '@phosphor-icons/react';
import { BUNDLE_FILE_NAME } from '../../core/export/outputs';
import { useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Badge, Button, Segmented } from '../components/controls';
import { useIssues } from '../issues';
import { downloadText } from '../lib/download';
import { Wordmark } from '../Wordmark';

export function TopBar({ exportState }: { exportState: ExportState }) {
  const project = useStore((state) => state.project)!;
  const editLang = useStore((state) => state.editLang);
  const view = useStore((state) => state.view);
  const { setEditLang, setView, setLanguagesOpen, close } = useStore.getState();
  const issues = useIssues();
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const name = project.meta[editLang]?.name || t.workspace.untitled;
  const canDownload = errors === 0 && exportState.status === 'ready';

  return (
    <header className="topbar">
      <Wordmark />
      <span className="topbar__name" title={name}>
        {name}
      </span>
      <div className="topbar__spacer" />
      <Segmented label="Editing language" value={editLang} onChange={setEditLang} options={project.languages.map((lang) => ({ value: lang, label: lang }))} />
      <Button size="small" variant="ghost" onClick={() => setLanguagesOpen(true)}>
        <GlobeIcon /> {t.workspace.languages}
      </Button>
      <Segmented
        label="View"
        value={view}
        onChange={setView}
        options={[
          { value: 'editor', label: t.workspace.editor },
          { value: 'translations', label: t.workspace.translations },
        ]}
      />
      <div className="row">
        {errors > 0 && <Badge tone="red">{t.workspace.errorCount(errors)}</Badge>}
        {warnings > 0 && <Badge tone="yellow">{t.workspace.warningCount(warnings)}</Badge>}
      </div>
      <Button
        variant="primary"
        disabled={!canDownload}
        title={errors > 0 ? t.workspace.downloadBlocked(errors) : undefined}
        onClick={() => exportState.status === 'ready' && downloadText(BUNDLE_FILE_NAME, exportState.outputs.json)}
      >
        <DownloadSimpleIcon /> {t.workspace.download}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          if (window.confirm(t.workspace.confirmNew)) close();
        }}
      >
        {t.workspace.newProject}
      </Button>
    </header>
  );
}
