/**
 * Step 1 of the conformance run: exports every sample with `exportProject`, the path the app and `ctk build` take,
 * and writes what the issuer would serve for it into `<out>/<sample>/`:
 *
 * - `oca-bundle.json`: the bundle bytes, served at the hosting URL or embedded as a data URL;
 * - `vct.json` and `issuer_metadata.json` as generated, and `*.served.json` with `${external-url}` filled in;
 * - `credential.json`: the claims the wallets and the preview display;
 * - `preview.json`: what our preview shows (`preview.ts`);
 * - `manifest.json`: the URLs, the `#integrity` values and the identifiers the wallet harnesses need;
 * - `project.credential-project.json`: the project, to open in the app.
 *
 * `<out>/samples.json` lists the samples. Usage: `node conformance/generate.ts [out]` (default `conformance/out`).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { EXTERNAL_URL_PLACEHOLDER, ISSUER_METADATA_FORMAT, servedTypeMetadataText, servedTypeMetadataUri } from '../src/core/export/issuerMetadata.ts';
import { exportProject } from '../src/core/export/project.ts';
import { issuerIdentifiers, issuerUrl } from '../src/core/issuer.ts';
import { ensureIssuer } from '../src/core/model.ts';
import { serializeProjectFile } from '../src/core/projectFile.ts';
import { synthesiseClaims } from './claims.ts';
import { previewDisplay } from './preview.ts';
import { SAMPLES } from './samples.ts';

/** The Issuer URL (the generic issuer's `EXTERNAL_URL`) for samples that set none. */
export const CONFORMANCE_ISSUER_URL = 'https://issuer.conformance.example';

export interface Manifest {
  id: string;
  source: string;
  languages: string[];
  /** Whether the claims are the project's sample or made up by `claims.ts`. */
  claims: 'sample' | 'synthesised';
  issuerUrl: string;
  /** `credential_configurations_supported` key and its `format`. */
  configurationId: string;
  format: string;
  /** Where the issuer serves `vct.served.json`. */
  vctUrl: string;
  /** `rendering.oca.uri`: the hosting URL, or the data URL. */
  ocaUri: string;
  /** The hosting URL the bundle file is served at; null when it is embedded. */
  bundleUrl: string | null;
  integrity: { bundle: string; vctMetadataUri: string };
}

async function generate(out: string): Promise<void> {
  await rm(out, { recursive: true, force: true });
  const index: { id: string; source: string }[] = [];
  const failures: string[] = [];
  for (const sample of SAMPLES) {
    const project = await sample.load();
    const synthesised = project.sample === undefined;
    if (synthesised) project.sample = synthesiseClaims(project);
    const issuer = ensureIssuer(project);
    issuer.url = issuerUrl(project) ?? CONFORMANCE_ISSUER_URL;
    if (project.hosting.mode === 'url' && project.hosting.url.trim() === '') {
      project.hosting = { mode: 'url', url: `${issuer.url}/oca/${sample.id}/oca-bundle.json` };
    }

    const result = await exportProject(project);
    if (!result.ok) {
      const errors = result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
      failures.push(`${sample.id}: the export failed: ${errors.join('; ')}`);
      continue;
    }
    const url = issuer.url;
    const vctIntegrity = result.issuerMetadata.metadata.credential_configurations_supported[issuerIdentifiers(project).configurationId]?.['vct_metadata_uri#integrity'];
    const manifest: Manifest = {
      id: sample.id,
      source: sample.source,
      languages: project.languages,
      claims: synthesised ? 'synthesised' : 'sample',
      issuerUrl: url,
      configurationId: issuerIdentifiers(project).configurationId,
      format: ISSUER_METADATA_FORMAT,
      vctUrl: servedTypeMetadataUri(project),
      ocaUri: result.outputs.uri,
      bundleUrl: project.hosting.mode === 'url' ? project.hosting.url : null,
      integrity: { bundle: result.outputs.integrity, vctMetadataUri: String(vctIntegrity) },
    };
    const dir = `${out}/${sample.id}`;
    await mkdir(dir, { recursive: true });
    const files: Record<string, string> = {
      'oca-bundle.json': result.outputs.json,
      'vct.json': result.vct.text,
      'vct.served.json': servedTypeMetadataText(result.vct.text, url),
      'issuer_metadata.json': result.issuerMetadata.json,
      'issuer_metadata.served.json': result.issuerMetadata.json.replaceAll(EXTERNAL_URL_PLACEHOLDER, url),
      'credential.json': JSON.stringify(project.sample, null, 2),
      'preview.json': JSON.stringify(previewDisplay(project), null, 2),
      'manifest.json': JSON.stringify(manifest, null, 2),
      'project.credential-project.json': serializeProjectFile(project),
    };
    for (const [name, text] of Object.entries(files)) await writeFile(`${dir}/${name}`, text);
    index.push({ id: sample.id, source: sample.source });
  }
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/samples.json`, JSON.stringify(index, null, 2));
  for (const failure of failures) console.error(failure);
  console.log(`Generated ${index.length} of ${SAMPLES.length} samples in ${out}.`);
  if (failures.length) process.exitCode = 1;
}

await generate(process.argv[2] ?? new URL('out', import.meta.url).pathname);
