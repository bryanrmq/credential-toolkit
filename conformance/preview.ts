/**
 * What our preview (`src/core/card`) shows for a sample, written in the same shape as the wallet results so
 * `compare.ts` can set them side by side: the card per language and theme, and the details screen per language.
 */
import { selectBranding } from '../src/core/card/branding.ts';
import { cardLanguage } from '../src/core/card/cardLanguage.ts';
import { type ClaimFormat, type DetailsClaim, type DetailsGroup, type DetailsRow, credentialDetails } from '../src/core/card/details.ts';
import { CARD_PROFILES, type CardPlatform } from '../src/core/card/profiles.ts';
import { formatClaim } from '../src/core/card/values.ts';
import type { ClaimsPath, LangTag, Project } from '../src/core/model.ts';
import { parseExpression, resolveEditorPath } from '../src/core/templates.ts';

export type Theme = 'light' | 'dark';

/** The card for one language and theme. Absent fields are null. */
export interface CardDisplay {
  lang: LangTag;
  /** The language whose card the wallet shows for `lang` (`cardLanguage`); the fields come from it. */
  shownLang: LangTag;
  theme: Theme;
  name: string | null;
  description: string | null;
  /** The summary template, with each `{{…}}` as the claims path the wallets turn it into when they read the bundle. */
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
  card: Record<CardPlatform, CardDisplay[]>;
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

const TEMPLATE = /\{\{(.*?)\}\}/g;
const INDEX = /^\[(\d+|null)\]/;

/**
 * `text` with each `{{…}}` written as the claims path of its attribute, as both wallets rewrite the bundle's templates
 * (Android `TransformOcaOverlaysImpl`, iOS `OverlayTemplateResolver`): `{{["address","city"]}}`. An index suffix goes
 * into the path by the platform's rule (`CardProfile.indexPath`); a `.join()` suffix stays.
 */
function walletTemplate(text: string, project: Project, platform: CardPlatform): string {
  return text.replace(TEMPLATE, (whole, raw: string) => {
    const expression = parseExpression(raw);
    const target = resolveEditorPath(project.root, project.root, expression);
    if (!target || target.node.kind !== 'attribute') return whole;
    const index = INDEX.exec(expression.suffix);
    const path = index ? CARD_PROFILES[platform].indexPath(target.node.source, index[1] === 'null' ? null : Number(index[1])) : target.node.source;
    return path ? `{{${JSON.stringify(path)}${expression.suffix.slice(index?.[0].length ?? 0)}}}` : whole;
  });
}

/** The preview's card and details for `project`, which has a sample. */
export function previewDisplay(project: Project): PreviewDisplay {
  const card = (platform: CardPlatform): CardDisplay[] =>
    project.languages.flatMap((lang) => {
      const shownLang = cardLanguage(project, lang, platform);
      return (['light', 'dark'] as const).map((theme) => {
        const { branding } = selectBranding(project, shownLang, theme);
        return {
          lang,
          shownLang,
          theme,
          name: orNull(project.meta[shownLang]?.name),
          description: orNull(project.meta[shownLang]?.description),
          primaryField: branding.primaryField ? walletTemplate(branding.primaryField, project, platform) : null,
          logo: orNull(branding.logo),
          backgroundColor: orNull(branding.primaryBackgroundColor),
        };
      });
    });
  const details = (platform: CardPlatform) =>
    Object.fromEntries(
      project.languages.map((lang) => [
        lang,
        credentialDetails(project, { platform, languages: [lang] }).sections.map((group) => section(group, lang, platform)),
      ]),
    );
  return { card: { android: card('android'), ios: card('ios') }, details: { android: details('android'), ios: details('ios') } };
}
