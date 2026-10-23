import type { Project } from '../model.ts';
import { type Issue, hasErrors, validate } from '../validate/index.ts';
import { type BundleJson, buildBundle } from './bundle.ts';
import { type ExportOutputs, type VctDisplayEntry, buildOutputs, buildVctSnippet } from './outputs.ts';

/** What `exportProject` gives: the issues, and the outputs only when no issue is an error. */
export type ProjectExport =
  | { ok: true; issues: Issue[]; bundle: BundleJson; outputs: ExportOutputs; vct: { display: VctDisplayEntry[] } }
  | { ok: false; issues: Issue[] };

/**
 * Everything the Output pane offers for `project`, in one call: validates it and, when no issue is an error,
 * builds the bundle, its text, `uri` and `#integrity`, and the VCT `display` snippet. Warnings don't stop it.
 */
export async function exportProject(project: Project): Promise<ProjectExport> {
  const issues = validate(project);
  if (hasErrors(issues)) return { ok: false, issues };
  const { bundle } = await buildBundle(project);
  const outputs = await buildOutputs(project, bundle);
  return { ok: true, issues, bundle, outputs, vct: buildVctSnippet(project, outputs) };
}
