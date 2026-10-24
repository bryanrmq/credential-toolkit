import type { Project } from '../model.ts';
import { type Issue, hasErrors, validate } from '../validate/index.ts';
import { type BundleJson, buildBundle } from './bundle.ts';
import { type BuiltIssuerMetadata, buildIssuerMetadata, vctMetadataIntegrity } from './issuerMetadata.ts';
import { type ExportOutputs, buildOutputs } from './outputs.ts';
import { type BuiltTypeMetadata, buildTypeMetadata } from './typeMetadata.ts';

/** What `exportProject` gives: the issues, and the outputs only when no issue is an error. */
export type ProjectExport =
  | { ok: true; issues: Issue[]; bundle: BundleJson; outputs: ExportOutputs; vct: BuiltTypeMetadata; issuerMetadata: BuiltIssuerMetadata }
  | { ok: false; issues: Issue[] };

/**
 * Everything the Output pane offers for `project`, in one call: validates it and, when no issue is an error,
 * builds the bundle, its text, `uri` and `#integrity`, the Type Metadata (`vct.json`) and the Issuer Metadata
 * (`issuer_metadata.json`), with `vct_metadata_uri#integrity` computed when the Issuer URL is set. Warnings don't
 * stop it. `filePlaceholders(result)` lists what is left to fill in.
 */
export async function exportProject(project: Project): Promise<ProjectExport> {
  const issues = validate(project);
  if (hasErrors(issues)) return { ok: false, issues };
  const { bundle } = await buildBundle(project);
  const outputs = await buildOutputs(project, bundle);
  const vct = buildTypeMetadata(project, outputs);
  const issuerMetadata = buildIssuerMetadata(project, await vctMetadataIntegrity(project, vct.text));
  return { ok: true, issues, bundle, outputs, vct, issuerMetadata };
}
