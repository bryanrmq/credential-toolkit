import { sriSha256, toBase64, utf8 } from '../cesr.ts';
import type { Hosting, Project } from '../model.ts';
import { type BundleJson, serializeBundle } from './bundle.ts';

export const BUNDLE_FILE_NAME = 'oca-bundle.json';
/** The file name of the Type Metadata (`buildTypeMetadata`). */
export const VCT_FILE_NAME = 'vct.json';
export const PROFILE_VERSION = 'swiss-profile-vc:1.0.0';

export interface ExportOutputs {
  json: string;
  dataUrl: string;
  /** Value for `rendering.oca.uri`: the hosting URL, or the data URL when embedding. */
  uri: string;
  integrity: string;
}

/** The data URL that embeds bundle text `json`. */
export function bundleDataUrl(json: string): string {
  return `data:application/json;base64,${toBase64(utf8(json))}`;
}

/**
 * The `#integrity` of bundle text `json` as hosted with `hosting`: the hash of the file bytes for a hosting URL,
 * of the whole data URL when embedding.
 */
export function bundleIntegrity(json: string, hosting: Hosting): Promise<string> {
  return sriSha256(utf8(hosting.mode === 'dataUrl' ? bundleDataUrl(json) : json));
}

/** The bundle text, its data URL, the `uri` for the VCT and its `#integrity`, for `project` and its built `bundle`. */
export async function buildOutputs(project: Project, bundle: BundleJson): Promise<ExportOutputs> {
  const json = serializeBundle(bundle);
  const dataUrl = bundleDataUrl(json);
  const uri = project.hosting.mode === 'dataUrl' ? dataUrl : project.hosting.url;
  return { json, dataUrl, uri, integrity: await bundleIntegrity(json, project.hosting) };
}
