import { sriSha256, toBase64, utf8 } from '../cesr';
import type { Hosting, Project } from '../model';
import { type BundleJson, serializeBundle } from './bundle';

export const BUNDLE_FILE_NAME = 'oca-bundle.json';
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

export async function buildOutputs(project: Project, bundle: BundleJson): Promise<ExportOutputs> {
  const json = serializeBundle(bundle);
  const dataUrl = bundleDataUrl(json);
  const uri = project.hosting.mode === 'dataUrl' ? dataUrl : project.hosting.url;
  return { json, dataUrl, uri, integrity: await bundleIntegrity(json, project.hosting) };
}

export interface VctDisplayEntry {
  lang: string;
  locale: string;
  name: string;
  description?: string;
  rendering: { oca: { uri: string; 'uri#integrity': string } };
}

/** The `display` array for the SD-JWT VC Type Metadata. Both `lang` (wallets) and `locale` (draft 15) are set. */
export function buildVctSnippet(project: Project, outputs: ExportOutputs): { display: VctDisplayEntry[] } {
  return {
    display: project.languages.map((lang) => {
      const meta = project.meta[lang] ?? { name: '', description: '' };
      const entry: VctDisplayEntry = {
        lang,
        locale: lang,
        name: meta.name,
        rendering: { oca: { uri: outputs.uri, 'uri#integrity': outputs.integrity } },
      };
      if (meta.description) entry.description = meta.description;
      return entry;
    }),
  };
}
