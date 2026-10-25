import { type Baseline, parseBaseline } from '../../core/baseline';
import { BUNDLE_FILE_NAME, type ExportOutputs } from '../../core/export/outputs';
import type { Project } from '../../core/model';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { downloadText } from './download';

/*
 * The open draft's published baseline (`core/baseline.ts`), for the Changes tab:
 * - `useBaseline()`: the baseline, or null when there is none.
 * - `loadBaselineFromUrl()`, `chooseBaselineFile()` (and `loadBaselineFromFile(file)`): "Load published bundle",
 *   which `LoadBaselineButton` offers. They replace the baseline only, never the project; on failure the error
 *   toast says why and the baseline stays as it was.
 * - `setDownloadedBaseline(outputs)`: the top bar's Download (`downloadBundle`) makes the downloaded bundle the baseline.
 * A draft made with "From a bundle" gets that bundle as its baseline (`ImportDialog`).
 */

/** The open draft's published baseline, or null. */
export function useBaseline(): Baseline | null {
  return useStore((state) => state.baseline);
}

/** The hosting URL to load the baseline from: set only for URL hosting with a URL. */
export function hostingUrlOf(project: Project | null): string | null {
  if (project?.hosting.mode !== 'url') return null;
  const url = project.hosting.url.trim();
  return url === '' ? null : url;
}

/** Makes `outputs`, just downloaded, the open draft's baseline. */
export function setDownloadedBaseline(outputs: ExportOutputs): void {
  useStore.getState().setBaseline({ json: outputs.json, integrity: outputs.integrity, source: 'download', setAt: Date.now() });
}

/** Downloads the bundle of `outputs` and makes it the baseline: what was downloaded is what gets published. */
export function downloadBundle(outputs: ExportOutputs): void {
  downloadText(BUNDLE_FILE_NAME, outputs.json);
  setDownloadedBaseline(outputs);
}

/**
 * Makes bundle text `text` draft `draftId`'s baseline when it is a bundle; else shows the invalid-bundle error.
 * Does nothing when another draft was opened, or none, while the bundle loaded.
 */
async function setBaselineFrom(draftId: string | null, text: string, source: 'url' | 'file'): Promise<boolean> {
  const { project } = useStore.getState();
  if (!project || useStore.getState().draftId !== draftId) return false;
  const baseline = await parseBaseline(text, project.hosting, source);
  if (useStore.getState().draftId !== draftId) return false;
  if (!baseline) {
    useStore.getState().showError(t.baseline.invalid);
    return false;
  }
  useStore.getState().setBaseline(baseline);
  return true;
}

/**
 * Fetches the bundle at the project's hosting URL and makes it the baseline. A request the host blocks
 * (cross-origin), a network failure or an answer other than 200 shows the "load it as a file" error.
 */
export async function loadBaselineFromUrl(): Promise<boolean> {
  const { project, draftId } = useStore.getState();
  const url = hostingUrlOf(project);
  if (!url) return false;
  let text: string;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    text = await response.text();
  } catch {
    useStore.getState().showError(t.baseline.blocked);
    return false;
  }
  return setBaselineFrom(draftId, text, 'url');
}

/** Reads bundle file `file` and makes it the baseline. */
export async function loadBaselineFromFile(file: Blob): Promise<boolean> {
  const { draftId } = useStore.getState();
  let text: string;
  try {
    text = await file.text();
  } catch {
    text = '';
  }
  return setBaselineFrom(draftId, text, 'file');
}

/** Asks for a bundle file with the browser's file picker, as the bundle import does, then loads it as the baseline. */
export function chooseBaselineFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void loadBaselineFromFile(file);
  });
  input.click();
}
