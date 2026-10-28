import type { Branding, LangTag, Project } from '../model.ts';
import { pickLocale } from './details.ts';
import { detailsDevice } from './detailsDifferences.ts';
import type { CardPlatform } from './profiles.ts';

const filled = (text: string | undefined) => text !== undefined && text !== '';

function hasBranding(branding: Branding | undefined): boolean {
  return !!branding && [branding.logo, branding.primaryBackgroundColor, branding.primaryField, branding.secondaryField].some(filled);
}

/**
 * The languages the bundle has a card for: those with a Meta overlay (a name or a description) or a Branding overlay,
 * which the export writes only when they hold something. Each is one credential display in the wallets
 * (Android `GenerateOcaCredentialDataImpl`, iOS `CaptureBaseDisplayGenerator`), in project language order.
 */
export function cardLanguages(project: Project): LangTag[] {
  return project.languages.filter((lang) => {
    const meta = project.meta[lang];
    const pair = project.branding[lang];
    return filled(meta?.name) || filled(meta?.description) || hasBranding(pair?.light) || hasBranding(pair?.dark);
  });
}

/**
 * The language whose card, name and summary the wallet shows on a device set to `lang`: its own when the bundle has a
 * card for it, else the one the wallet falls back to. Android `GetLocalizedDisplayImpl`: the app locale, its language,
 * then `de`, `en`, then the first. iOS `Array.findDisplayWithFallback` (BITCore `DisplayLocalizable.swift`): the first
 * display whose locale starts with a preferred language code, then English, then the first display's language.
 * Without any card, `lang`.
 */
export function cardLanguage(project: Project, lang: LangTag, platform: CardPlatform): LangTag {
  return pickLocale(cardLanguages(project), platform, detailsDevice(platform, [lang]).languages) ?? lang;
}
