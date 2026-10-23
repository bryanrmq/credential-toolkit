import { bundleIntegrity } from './export/outputs.ts';
import { importBundle } from './import/bundle.ts';
import { isPlainObject, parseJsonText } from './import/report.ts';
import type { Hosting } from './model.ts';

/**
 * A draft's published baseline: the bundle it was last published as, which the Changes tab compares the
 * current output with. It is kept with the draft and in project files, apart from the project itself: setting
 * it never changes the project.
 */

/** How the baseline was set: the draft was made from it, it was downloaded, or loaded from the hosting URL or a file. */
export type BaselineSource = 'import' | 'download' | 'url' | 'file';

export interface Baseline {
  /** The bundle JSON text, exactly as published (downloaded, fetched or read). */
  json: string;
  /** Its `#integrity`, computed like the current output's (`bundleIntegrity`) with the hosting of the time. */
  integrity: string;
  source: BaselineSource;
  /** When it was set, in milliseconds since the epoch. */
  setAt: number;
}

const SOURCES: readonly string[] = ['import', 'download', 'url', 'file'] satisfies BaselineSource[];

/** Whether `value` has the shape of a baseline, as a stored draft or a project file may hold one. */
export function isBaseline(value: unknown): value is Baseline {
  return (
    isPlainObject(value) &&
    typeof value.json === 'string' &&
    typeof value.integrity === 'string' &&
    typeof value.source === 'string' &&
    SOURCES.includes(value.source) &&
    typeof value.setAt === 'number'
  );
}

/** The baseline for bundle text `json` hosted with `hosting`. */
export async function makeBaseline(json: string, hosting: Hosting, source: BaselineSource, setAt = Date.now()): Promise<Baseline> {
  return { json, integrity: await bundleIntegrity(json, hosting), source, setAt };
}

/** The baseline for `text` when it is a bundle this app can import, else null. Never throws. */
export async function parseBaseline(text: string, hosting: Hosting, source: BaselineSource): Promise<Baseline | null> {
  try {
    await importBundle(parseJsonText(text));
  } catch {
    return null;
  }
  return makeBaseline(text, hosting, source);
}
