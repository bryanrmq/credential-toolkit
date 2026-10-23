import { WarningIcon } from '@phosphor-icons/react';
import { BUNDLE_FILE_NAME } from '../../core/export/outputs';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { groupIssues, useIssues } from '../issues';
import { downloadText } from '../lib/download';

/**
 * Autosave could not write the open draft because the browser is out of space. A warning, not an error:
 * the project is still open and the stored drafts are untouched. It goes away on the next successful save.
 * Until project files exist, "Save project file" downloads the bundle.
 */
export function OutOfSpaceBanner({ exportState }: { exportState: ExportState }) {
  const errors = groupIssues(useIssues()).filter((group) => group.severity === 'error').length;
  return (
    <div className="space-banner" role="status">
      <WarningIcon size={16} />
      <p className="space-banner__text">{t.drafts.outOfSpace}</p>
      <Button
        size="small"
        disabled={errors > 0 || exportState.status !== 'ready'}
        title={errors > 0 ? t.workspace.downloadBlocked(errors) : undefined}
        onClick={() => exportState.status === 'ready' && downloadText(BUNDLE_FILE_NAME, exportState.outputs.json)}
      >
        {t.drafts.saveProjectFile}
      </Button>
    </div>
  );
}
