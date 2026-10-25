import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { downloadText } from '../lib/download';
import { CopyButton } from './CopyButton';

/** The size of `text` as a file: its UTF-8 bytes, in KB. */
function fileSize(text: string): string {
  return t.output.size((new TextEncoder().encode(text).length / 1024).toFixed(1));
}

/**
 * The header of a generated file, the same above each one (the OCA bundle, `vct.json`, `issuer_metadata.json`): its
 * name and size, then Copy and Download, both secondary (the top bar's Download is the workspace's only primary).
 * The download is blocked while `blocking` errors would go into the file.
 */
export function OutputFileHeader({ fileName, text, blocking }: { fileName: string; text: string; blocking: number }) {
  return (
    <div className="file-header">
      <span className="file-header__name">{fileName}</span>
      <span className="file-header__size">{fileSize(text)}</span>
      <span className="file-header__actions">
        <CopyButton text={text} label={t.output.file.copy} />
        <Button
          size="small"
          disabled={blocking > 0}
          title={blocking > 0 ? t.workspace.downloadBlocked(blocking) : undefined}
          aria-label={t.output.file.downloadFile(fileName)}
          onClick={() => downloadText(fileName, text)}
        >
          <DownloadSimpleIcon /> {t.output.file.download}
        </Button>
      </span>
    </div>
  );
}
