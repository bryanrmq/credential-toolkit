import { issuerIdentifiers } from '../issuer.ts';
import type { LangTag, Project } from '../model.ts';
import { EXTERNAL_URL_PLACEHOLDER } from './issuerMetadata.ts';
import { type ExportOutputs, PROFILE_VERSION } from './outputs.ts';

/*
 * The SD-JWT VC Type Metadata (`vct.json`) for the swiyu generic issuer, which serves it as is under
 * `${external-url}/oid4vci/vct/<type key>`. What goes in follows the released code, which wins over the docs:
 * - swiyu-issuer 5.0.1 (05485df636): `TypeMetadataDto` requires `profile_version` and `TypeMetadataDisplayDto`
 *   requires `lang` and `name`; `OpenIdIssuerConfiguration.loadMetadataFiles` checks the file against them, then
 *   serves its text with `${external-url}` filled in, not re-serialized. Keys the DTOs lack, such as
 *   `display[].description`, pass the check (Jackson 3 ignores unknown properties by default).
 * - iOS wallet v1.19.0 (42e746c), `TypeMetadata.swift`: `display[].lang` and `name` are required, `description` and
 *   `rendering.oca` optional; `FetchVcMetadataForVcSdJwtUseCase` takes the first display with `rendering.oca`.
 * - Android wallet v1.19.0 (c29a6f3), `TypeMetadata.kt`: the same required keys, and `getFirstRendering` also takes
 *   the first display with a rendering.
 * Neither wallet nor the issuer reads a display `locale`, so there is none. Claim metadata (`claims`) is not
 * supported by the Swiss profile, and the tool has no `extends` or JSON schema to give, so those are left out.
 */

/** Where the bundle is and its `#integrity`, as the wallets read them. */
export interface TypeMetadataOca {
  uri: string;
  'uri#integrity': string;
}

/** One `display` entry: one per project language, each with the OCA rendering. */
export interface TypeMetadataDisplay {
  lang: LangTag;
  name: string;
  description?: string;
  rendering: { oca: TypeMetadataOca };
}

export interface TypeMetadata {
  profile_version: string;
  vct: string;
  /** The credential name in the first project language, for developers reading the file. */
  name: string;
  description?: string;
  display: TypeMetadataDisplay[];
}

/** The Type Metadata object and the exact text of `vct.json`. */
export interface BuiltTypeMetadata {
  metadata: TypeMetadata;
  text: string;
}

/**
 * The project's `vct`, also its Type Metadata URL: `${external-url}/oid4vci/vct/<type key>`. The Issuer Metadata
 * (`buildIssuerMetadata`) has the same `vct`, which Android v1.19.0 `FetchTypeMetadataImpl` requires.
 */
export function typeMetadataUri(project: Project): string {
  return `${EXTERNAL_URL_PLACEHOLDER}/oid4vci/vct/${issuerIdentifiers(project).typeKey}`;
}

/** The Type Metadata for `project` and its `outputs`: a `display` entry per language, each pointing to the bundle. */
export function buildTypeMetadata(project: Project, outputs: ExportOutputs): BuiltTypeMetadata {
  const meta = (lang: LangTag) => project.meta[lang] ?? { name: '', description: '' };
  const oca: TypeMetadataOca = { uri: outputs.uri, 'uri#integrity': outputs.integrity };
  const first = meta(project.languages[0]);
  const metadata: TypeMetadata = {
    profile_version: PROFILE_VERSION,
    vct: typeMetadataUri(project),
    name: first.name,
    ...(first.description ? { description: first.description } : {}),
    display: project.languages.map((lang) => ({
      lang,
      name: meta(lang).name,
      ...(meta(lang).description ? { description: meta(lang).description } : {}),
      rendering: { oca: { ...oca } },
    })),
  };
  return { metadata, text: serializeTypeMetadata(metadata) };
}

/**
 * The text of `vct.json`: 2-space JSON with the keys in a fixed order, whatever order `metadata` has them in, so the
 * same project always gives the same bytes and the same hash.
 */
export function serializeTypeMetadata(metadata: TypeMetadata): string {
  const ordered: TypeMetadata = {
    profile_version: metadata.profile_version,
    vct: metadata.vct,
    name: metadata.name,
    description: metadata.description,
    display: metadata.display.map((entry) => ({
      lang: entry.lang,
      name: entry.name,
      description: entry.description,
      rendering: { oca: { uri: entry.rendering.oca.uri, 'uri#integrity': entry.rendering.oca['uri#integrity'] } },
    })),
  };
  // `undefined` values (an unset description) are left out by JSON.stringify.
  return JSON.stringify(ordered, null, 2);
}
