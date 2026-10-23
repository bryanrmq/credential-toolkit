import { WarningIcon } from '@phosphor-icons/react';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { saveProjectFile } from '../lib/projectFile';

/**
 * Autosave could not write the open draft because the browser is out of space. A warning, not an error:
 * the project is still open and the stored drafts are untouched. It goes away on the next successful save.
 * "Save project file" keeps the whole project outside the browser, errors and all.
 */
export function OutOfSpaceBanner() {
  return (
    <div className="space-banner" role="status">
      <WarningIcon size={16} />
      <p className="space-banner__text">{t.drafts.outOfSpace}</p>
      <Button size="small" onClick={saveProjectFile}>
        {t.projectFile.save}
      </Button>
    </div>
  );
}
