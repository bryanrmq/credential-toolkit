/**
 * What our preview (`src/core/card`) shows for a sample, written in the same shape as the wallet results so
 * `compare.ts` can set them side by side: the card per language and theme, and the details screen per language.
 */
import { selectBranding } from '../src/core/card/branding.ts';
import { type ClaimFormat, type DetailsClaim, type DetailsGroup, type DetailsRow, credentialDetails } from '../src/core/card/details.ts';
import type { CardPlatform } from '../src/core/card/profiles.ts';
import { formatClaim } from '../src/core/card/values.ts';
import type { ClaimsPath, Group, LangTag, Project } from '../src/core/model.ts';
import { toSpecTemplate } from '../src/core/templates.ts';

export type Theme = 'light' | 'dark';

/** The card for one language and theme. Absent fields are null. */
export interface CardDisplay {
  lang: LangTag;
  theme: Theme;
  name: string | null;
  description: string | null;
  /** The summary template, in bundle form (`{{…}}` paths to attributes, as the wallets read it). */
  primaryField: string | null;
  logo: string | null;
  backgroundColor: string | null;
}

export interface ClaimDisplay {
  kind: 'claim';
  path: ClaimsPath;
  label: string;
  /** The entry label, or the value as text; null for JSON null. */
  value: string | null;
  /** The entry code when the value is one. */
  entryCode: string | null;
  /** `image/png`, `image/jpeg`, `datetime`, `numeric`, `boolean` or `string`. */
  valueKind: string;
  /** The attribute's type and formatting overlays; null for rows without an attribute (list items, unmapped claims). */
  format: ClaimFormat | null;
}

export interface GroupDisplay {
  kind: 'group';
  path: ClaimsPath;
  /** The title as the wallet's display holds it; null for sections without one and the unmapped claims. */
  title: string | null;
  unmapped: boolean;
  rows: (ClaimDisplay | GroupDisplay)[];
}

export interface PreviewDisplay {
  card: CardDisplay[];
  /** Language → sections, for each platform. */
  details: Record<CardPlatform, Record<LangTag, GroupDisplay[]>>;
}

const orNull = (text: string | undefined) => (text ? text : null);

function valueKind(claim: DetailsClaim, locale: string, platform: CardPlatform): string {
  const formatted = formatClaim(claim, { locale, platform, timeZone: 'UTC' });
  if (formatted.kind === 'image' || formatted.kind === 'invalidImage') return formatted.mediaType;
  switch (claim.format?.type) {
    case 'DateTime':
      return 'datetime';
    case 'Numeric':
      return 'numeric';
    case 'Boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function claimValue(claim: DetailsClaim): string | null {
  switch (claim.value.kind) {
    case 'entry':
      return claim.value.label;
    case 'raw':
      return String(claim.value.value);
    case 'null':
    case 'placeholder':
      return null;
  }
}

function row(item: DetailsRow, locale: string, platform: CardPlatform): ClaimDisplay | GroupDisplay {
  if (item.kind === 'claim') {
    return {
      kind: 'claim',
      path: item.path,
      label: item.label,
      value: claimValue(item),
      entryCode: item.value.kind === 'entry' ? item.value.code : null,
      valueKind: valueKind(item, locale, platform),
      format: item.format ?? null,
    };
  }
  return section(item, locale, platform);
}

function section(group: DetailsGroup, locale: string, platform: CardPlatform): GroupDisplay {
  return {
    kind: 'group',
    path: group.path,
    title: group.title ?? null,
    unmapped: group.unmapped,
    rows: group.rows.map((item) => row(item, locale, platform)),
  };
}

/** The preview's card and details for `project`, which has a sample; `digests` maps group ids to capture base digests. */
export function previewDisplay(project: Project, digests: Map<string, string>): PreviewDisplay {
  const digestOf = (group: Group) => digests.get(group.id)!;
  const template = (text: string | undefined) => (text ? toSpecTemplate(text, project.root, project.root, digestOf) : null);
  const card: CardDisplay[] = [];
  for (const lang of project.languages) {
    for (const theme of ['light', 'dark'] as const) {
      const { branding } = selectBranding(project, lang, theme);
      card.push({
        lang,
        theme,
        name: orNull(project.meta[lang]?.name),
        description: orNull(project.meta[lang]?.description),
        primaryField: template(branding.primaryField),
        logo: orNull(branding.logo),
        backgroundColor: orNull(branding.primaryBackgroundColor),
      });
    }
  }
  const details = (platform: CardPlatform) =>
    Object.fromEntries(
      project.languages.map((lang) => [
        lang,
        credentialDetails(project, { platform, languages: [lang] }).sections.map((group) => section(group, lang, platform)),
      ]),
    );
  return { card, details: { android: details('android'), ios: details('ios') } };
}
