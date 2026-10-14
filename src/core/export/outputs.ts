import { sriSha256, toBase64, utf8 } from '../cesr';
import type { Project } from '../model';
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

export async function buildOutputs(project: Project, bundle: BundleJson): Promise<ExportOutputs> {
  const json = serializeBundle(bundle);
  const bytes = utf8(json);
  const dataUrl = `data:application/json;base64,${toBase64(bytes)}`;
  if (project.hosting.mode === 'dataUrl') {
    return { json, dataUrl, uri: dataUrl, integrity: await sriSha256(utf8(dataUrl)) };
  }
  return { json, dataUrl, uri: project.hosting.url, integrity: await sriSha256(bytes) };
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
