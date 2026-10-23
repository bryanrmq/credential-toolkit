import { isIssuerLogo, issuerIdentifiers, issuerOf } from '../issuer.ts';
import { type ClaimsPath, type LangTag, type Project, walkNodes } from '../model.ts';

/*
 * `issuer_metadata.json`: the OpenID4VCI Credential Issuer Metadata for the swiyu generic issuer
 * (swiyu-issuer 5.0.1, commit 05485df636). The infrastructure fields keep the generic issuer's own template
 * placeholders, which `OpenIdIssuerConfiguration.replaceExternalUri` fills when the service loads the file, so
 * the file works as-is in the service; the credential's configuration entry is real.
 *
 * Left out on purpose, because the service writes them itself:
 * - `profile_version`: `JweService.issuerMetadataWithEncryptionOptions` sets it to
 *   `SwissProfileVersions.ISSUANCE_PROFILE_VERSION` (`swiss-profile-issuance:1.0.0`) on every request.
 * - `credential_request_encryption` and `credential_response_encryption`: the Swiss issuance profile requires
 *   them in the served metadata, but the same `JweService` method replaces both objects on every request, the
 *   request one with the service's current, rotating encryption keys (`EncryptionKeyService.getActivePublicKeys`)
 *   and both with `encryption_required` from `application.encryption-enforce`. `IssuerMetadata` notes they
 *   "will be dynamically set during runtime"; `MetadataService` serves only that injected copy. Whatever a
 *   file put there would be overwritten, and a JWKS written by hand would be stale after the next key rotation.
 *   https://github.com/swiyu-admin-ch/swiyu-issuer/blob/05485df636/issuer-service/src/main/java/ch/admin/bj/swiyu/issuer/service/enc/JweService.java#L44-L61
 *   https://github.com/swiyu-admin-ch/swiyu-issuer/blob/05485df636/issuer-service/src/main/java/ch/admin/bj/swiyu/issuer/domain/openid/metadata/IssuerMetadata.java#L78-L88
 *   https://github.com/swiyu-admin-ch/swiyu-issuer/blob/05485df636/issuer-service/src/main/java/ch/admin/bj/swiyu/issuer/service/MetadataService.java#L65-L70
 * - `mandatory` on claims: the Swiss issuance profile does not support it.
 */

export const ISSUER_METADATA_FILE_NAME = 'issuer_metadata.json';

/** The generic issuer placeholder for the URL the service is reachable at (`application.template-replacement.external-url`). */
export const EXTERNAL_URL_PLACEHOLDER = '${external-url}';

/**
 * What `vct_metadata_uri#integrity` holds until the tool computes the real value. The generic issuer leaves a
 * `${…}` it has no replacement for as it is, so the file still loads.
 */
export const VCT_INTEGRITY_PLACEHOLDER = '${vct-metadata-uri-integrity}';

/** The only credential format the generic issuer accepts (`CredentialConfiguration.format`), and the Swiss profile's. */
export const ISSUER_METADATA_FORMAT = 'dc+sd-jwt';

/** The batch size of the generic issuer's example; `BatchCredentialIssuance` requires at least 10. */
const BATCH_SIZE = 10;

/** The only signing algorithm of the Swiss profile, for the credential and the holder's proof. */
const SIGNING_ALGORITHMS = ['ES256'];

export interface MetadataLogo {
  uri: string;
}

export interface IssuerDisplayEntry {
  /** Left out when the issuer has no name in this language: the wallets then show "Unknown issuer", not a blank row. */
  name?: string;
  locale: LangTag;
  logo?: MetadataLogo;
}

export interface CredentialDisplayEntry {
  name: string;
  locale: LangTag;
  description?: string;
  background_color?: string;
  logo?: MetadataLogo;
}

export interface ClaimDescription {
  path: ClaimsPath;
  display?: { locale: LangTag; name: string }[];
}

export interface CredentialConfigurationJson {
  format: typeof ISSUER_METADATA_FORMAT;
  vct: string;
  vct_metadata_uri: string;
  'vct_metadata_uri#integrity': string;
  credential_signing_alg_values_supported: string[];
  cryptographic_binding_methods_supported: string[];
  proof_types_supported: { jwt: { proof_signing_alg_values_supported: string[] } };
  credential_metadata: { display: CredentialDisplayEntry[]; claims: ClaimDescription[] };
}

export interface IssuerMetadataJson {
  credential_issuer: string;
  credential_endpoint: string;
  nonce_endpoint: string;
  deferred_credential_endpoint: string;
  batch_credential_issuance: { batch_size: number };
  display: IssuerDisplayEntry[];
  credential_configurations_supported: Record<string, CredentialConfigurationJson>;
}

/** A placeholder left in a generated file: what to look for, and who or what replaces it. */
export interface MetadataPlaceholder {
  /** The text in the file, e.g. `${external-url}`. */
  text: string;
  /** One line on what it stands for and what fills it. */
  explanation: string;
  /** Whether it stands for an integrity value, which the tool can compute once the real URL is known. */
  integrity: boolean;
}

export interface BuiltIssuerMetadata {
  metadata: IssuerMetadataJson;
  /** The file text: `metadata` as 2-space JSON. */
  json: string;
  /** The placeholders in `json`, in the order they first appear. */
  placeholders: MetadataPlaceholder[];
}

const EXTERNAL_URL: MetadataPlaceholder = {
  text: EXTERNAL_URL_PLACEHOLDER,
  explanation: 'The URL the generic issuer is reachable at; the service fills it in from EXTERNAL_URL when it loads the file.',
  integrity: false,
};

const VCT_INTEGRITY: MetadataPlaceholder = {
  text: VCT_INTEGRITY_PLACEHOLDER,
  explanation: 'The SRI hash of vct.json as the generic issuer serves it; replace it once the issuer URL is known.',
  integrity: true,
};

/** The data URL when it is a logo the issuer and the wallets accept (PNG or JPEG), else nothing. */
function logo(uri: string | undefined): { logo?: MetadataLogo } {
  return uri && isIssuerLogo(uri) ? { logo: { uri } } : {};
}

/** One claim description per attribute with a source path, in tree order, labelled in every language that has a label. */
function claimDescriptions(project: Project): ClaimDescription[] {
  const claims: ClaimDescription[] = [];
  for (const { node } of walkNodes(project.root)) {
    if (node.kind !== 'attribute' || node.source.length === 0) continue;
    const display = project.languages.filter((lang) => node.labels[lang]).map((lang) => ({ locale: lang, name: node.labels[lang] }));
    claims.push({ path: [...node.source], ...(display.length ? { display } : {}) });
  }
  return claims;
}

/** The text of `issuer_metadata.json` for `metadata`: 2-space JSON, like the bundle. */
export function serializeIssuerMetadata(metadata: IssuerMetadataJson): string {
  return JSON.stringify(metadata, null, 2);
}

/**
 * The Credential Issuer Metadata for `project`, its file text and the placeholders left in it. The issuer
 * `display` (name per language, one logo) is always there: the wallets take the issuer's name and logo from it
 * even when they show the OCA bundle. A language without an issuer name gets an entry without `name`: iOS v1.19.0
 * (`CredentialDetailView.issuerSection`) and Android v1.19.0 (`CredentialElements.IssuerInfo`) show "Unknown
 * issuer" for a missing name but a blank row for `""`, and swiyu-issuer does not validate the display entries. `credential_metadata.display` is only the wallets' fallback when there is
 * no OCA to show. Keys always come in the same order, so the same project gives the same bytes.
 */
export function buildIssuerMetadata(project: Project): BuiltIssuerMetadata {
  const issuer = issuerOf(project);
  const { configurationId, typeKey } = issuerIdentifiers(project);
  const vct = `${EXTERNAL_URL_PLACEHOLDER}/oid4vci/vct/${typeKey}`;

  const configuration: CredentialConfigurationJson = {
    format: ISSUER_METADATA_FORMAT,
    vct,
    vct_metadata_uri: vct,
    'vct_metadata_uri#integrity': VCT_INTEGRITY_PLACEHOLDER,
    credential_signing_alg_values_supported: [...SIGNING_ALGORITHMS],
    cryptographic_binding_methods_supported: ['jwk'],
    proof_types_supported: { jwt: { proof_signing_alg_values_supported: [...SIGNING_ALGORITHMS] } },
    credential_metadata: {
      display: project.languages.map((lang) => {
        const meta = project.meta[lang] ?? { name: '', description: '' };
        const branding = project.branding[lang]?.light ?? {};
        const entry: CredentialDisplayEntry = { name: meta.name, locale: lang };
        if (meta.description) entry.description = meta.description;
        if (branding.primaryBackgroundColor) entry.background_color = branding.primaryBackgroundColor;
        return { ...entry, ...logo(branding.logo) };
      }),
      claims: claimDescriptions(project),
    },
  };

  const metadata: IssuerMetadataJson = {
    credential_issuer: EXTERNAL_URL_PLACEHOLDER,
    credential_endpoint: `${EXTERNAL_URL_PLACEHOLDER}/oid4vci/api/credential`,
    nonce_endpoint: `${EXTERNAL_URL_PLACEHOLDER}/oid4vci/api/nonce`,
    deferred_credential_endpoint: `${EXTERNAL_URL_PLACEHOLDER}/oid4vci/api/deferred_credential`,
    batch_credential_issuance: { batch_size: BATCH_SIZE },
    display: project.languages.map((lang) => ({ ...(issuer.name[lang] ? { name: issuer.name[lang] } : {}), locale: lang, ...logo(issuer.logo) })),
    credential_configurations_supported: { [configurationId]: configuration },
  };

  return { metadata, json: serializeIssuerMetadata(metadata), placeholders: [EXTERNAL_URL, VCT_INTEGRITY] };
}
