import type { IssuerSettings, Project } from './model.ts';

/*
 * The issuer settings (`project.issuer`): who issues the credential and the identifiers of the swiyu generic
 * issuer's files. The editor's Issuer section, the generated `vct.json` and `issuer_metadata.json` and the
 * preview's "Issued by" row read them through these functions, so they agree on the defaults.
 */

/** What a Configuration id and a Type key must match: they go into JSON keys and URL paths of the generic issuer. */
export const IDENTIFIER_PATTERN = /^[a-z0-9_-]+$/;

/** The base of the default identifiers when the credential has no name in its first language. */
export const FALLBACK_IDENTIFIER_BASE = 'credential';

const MAX_BASE_LENGTH = 64;

/** Letters NFKD does not split into a base letter and an accent. */
const LIGATURES: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', þ: 'th' };

/** The identifiers under which the generic issuer serves the credential. */
export interface IssuerIdentifiers {
  /** Key under `credential_configurations_supported`, e.g. `lernfahrausweis_sd_jwt`. */
  configurationId: string;
  /** The `<type key>` in `${external-url}/oid4vci/vct/<type key>`, e.g. `lernfahrausweis-v01`. */
  typeKey: string;
}

/** `name` in lower-case ASCII letters and digits, the runs of anything else turned into `separator`; empty when nothing is left. */
function slug(name: string, separator: '_' | '-'): string {
  const ascii = name
    .toLowerCase()
    .replace(/[ßæœøłđþ]/g, (letter) => LIGATURES[letter])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  const words = ascii.split(/[^a-z0-9]+/).filter(Boolean);
  let base = '';
  for (const word of words) {
    const next = base ? `${base}${separator}${word}` : word;
    if (next.length > MAX_BASE_LENGTH) break;
    base = next;
  }
  return base || words[0]?.slice(0, MAX_BASE_LENGTH) || '';
}

/**
 * The default identifiers for a credential name: its slug plus `_sd_jwt` for the Configuration id, plus `-v01`
 * for the Type key ("Lernfahrausweis" gives `lernfahrausweis_sd_jwt` and `lernfahrausweis-v01`). Accents are
 * dropped and anything but letters and digits becomes `_` or `-`, so both always match `IDENTIFIER_PATTERN`;
 * a name with nothing left uses `credential`.
 */
export function defaultIdentifiers(credentialName: string): IssuerIdentifiers {
  return {
    configurationId: `${slug(credentialName, '_') || FALLBACK_IDENTIFIER_BASE}_sd_jwt`,
    typeKey: `${slug(credentialName, '-') || FALLBACK_IDENTIFIER_BASE}-v01`,
  };
}

/** The identifiers the project uses: the ones the user set, else the defaults from the credential name in the first language. */
export function issuerIdentifiers(project: Project): IssuerIdentifiers {
  const defaults = defaultIdentifiers(project.meta[project.languages[0]]?.name ?? '');
  const configurationId = project.issuer?.configurationId?.trim();
  const typeKey = project.issuer?.typeKey?.trim();
  return { configurationId: configurationId || defaults.configurationId, typeKey: typeKey || defaults.typeKey };
}

/** The project's issuer settings with a name (maybe empty) for every project language; projects saved before they existed get empty ones. */
export function issuerOf(project: Project): IssuerSettings {
  const stored = project.issuer;
  const name = Object.fromEntries(project.languages.map((lang) => [lang, stored?.name?.[lang] ?? '']));
  return { ...stored, name };
}

const ISSUER_LOGO = /^data:image\/(?:png|jpeg);base64,/;

/** Whether `uri` can be the issuer logo: a PNG or JPEG base64 data URL, the only issuer logos the wallets draw. */
export function isIssuerLogo(uri: string): boolean {
  return ISSUER_LOGO.test(uri);
}

/** Whether `value` can be the Issuer URL: an absolute https URL without a generic issuer placeholder such as `${external-url}`. */
export function isIssuerUrl(value: string): boolean {
  if (value.includes('${')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * The Issuer URL when it is set and valid (`isIssuerUrl`), trimmed but otherwise as typed: it stands for the generic
 * issuer's `EXTERNAL_URL`, which the service writes in literally, so `https://x.ch/` and `https://x.ch` differ.
 */
export function issuerUrl(project: Project): string | undefined {
  const url = project.issuer?.url?.trim();
  return url && isIssuerUrl(url) ? url : undefined;
}
