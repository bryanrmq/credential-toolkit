/**
 * What the credential details screens draw around the claims: the status badge on the card, the "Sensitive" pill
 * and the "Issued by" section, in the wallets' own words. Pure data: the preview only draws it.
 *
 * iOS: swiyu-admin-ch/eidch-ios-wallet v1.19.0 (commit 42e746c): `CredentialStatus+Presentation.swift`,
 * `CredentialDetailView.swift`, `CredentialClaimViewModel.swift` and BITL10n's `Localizable.strings`.
 * Android: swiyu-admin-ch/eidch-android-wallet v1.19.0 (commit c29a6f3): `CredentialStatusBadge.kt`,
 * `CredentialElements.kt`, `Badges.kt` and `app/src/main/res/values/strings.xml` with its translations.
 */

import { ANDROID_APP_LANGUAGES, IOS_DEFAULT_LANGUAGE } from './details';

/** The status the card's badge shows. The preview cannot know it, so the user picks one; Valid by default. */
export type CredentialStatus = 'valid' | 'invalid' | 'revoked' | 'suspended' | 'notYetValid' | 'unknown';

export const CREDENTIAL_STATUSES: readonly CredentialStatus[] = ['valid', 'invalid', 'revoked', 'suspended', 'notYetValid', 'unknown'];

/** The colour set of a badge (`BadgeStyle`). */
export type BadgeStyle = 'success' | 'info' | 'error' | 'sensitive';

/** `CredentialStatus.statusBadgeStyle`. */
export const IOS_STATUS_STYLE: Record<CredentialStatus, BadgeStyle> = {
  valid: 'success',
  invalid: 'error',
  revoked: 'error',
  suspended: 'error',
  notYetValid: 'info',
  unknown: 'info',
};

/** The languages the iOS app is translated into. */
export type IosAppLanguage = 'de' | 'fr' | 'it' | 'en' | 'rm';

export interface IosDetailsText {
  status: Record<Exclude<CredentialStatus, 'notYetValid'>, string>;
  /** "Valid on" a date. */
  notYetValid: (date: string) => string;
  sensitive: string;
  /** What VoiceOver adds to a sensitive row. */
  sensitiveAlt: string;
  /** What VoiceOver reads for an empty value. */
  empty: string;
  issuedBy: string;
  unknownIssuer: string;
  issuanceType: string;
  /** The issuance type of a credential issued on its own, not in a batch. */
  standard: string;
}

const EN: IosDetailsText = {
  status: { valid: 'Valid', invalid: 'Expired', revoked: 'Revoked', suspended: 'Currently blocked', unknown: 'Unknown' },
  notYetValid: (date) => `Valid on ${date}`,
  sensitive: 'Sensitive',
  sensitiveAlt: 'Sensitive information',
  empty: 'Empty',
  issuedBy: 'Issued by',
  unknownIssuer: 'Unknown issuer',
  issuanceType: 'Issuance type',
  standard: 'Standard',
};

/** The wallet's texts. `notYetValid` and `sensitiveAlt` are only in English, so the wallet shows those everywhere. */
export const IOS_DETAILS_TEXT: Record<IosAppLanguage, IosDetailsText> = {
  en: EN,
  de: {
    ...EN,
    status: { valid: 'Gültig', invalid: 'Abgelaufen', revoked: 'Widerrufen', suspended: 'Aktuell gesperrt', unknown: 'Unbekannt' },
    sensitive: 'Sensibel',
    empty: 'Leer',
    issuedBy: 'Ausgestellt von',
    unknownIssuer: 'Unbekannter Aussteller',
    issuanceType: 'Ausstellungsart',
  },
  fr: {
    ...EN,
    status: { valid: 'Valable', invalid: 'Expiré', revoked: 'Révoqué', suspended: 'Bloqué temporairement', unknown: 'Inconnu' },
    sensitive: 'sensible',
    empty: 'Vide',
    issuedBy: 'Délivré par',
    unknownIssuer: 'Émetteur inconnu',
    issuanceType: 'Type d’émission',
  },
  it: {
    ...EN,
    status: { valid: 'Valida', invalid: 'Scaduto', revoked: 'Annullato', suspended: 'Temporaneamente bloccato', unknown: 'Sconosciuto' },
    sensitive: 'sensibile',
    empty: 'Vuoto',
    issuedBy: 'Rilasciato da',
    unknownIssuer: 'Emittente sconosciuto',
    issuanceType: 'Tipo di emissione',
  },
  rm: {
    ...EN,
    status: { valid: 'Valaivel', invalid: 'Spirà', revoked: 'Revocà', suspended: 'Actualmain bloccà', unknown: 'Nunenconuschent' },
    sensitive: 'sensibel',
    empty: 'Vid',
    issuedBy: 'Emess da',
    unknownIssuer: 'Emittent nunenconuschent',
    issuanceType: 'Tip da l’emissiun',
  },
};

/** The app's language: the first preferred language it is translated into, else English. */
export function iosAppLanguage(codes: readonly string[]): IosAppLanguage {
  return (codes.find((code): code is IosAppLanguage => Object.hasOwn(IOS_DETAILS_TEXT, code)) ?? IOS_DEFAULT_LANGUAGE) as IosAppLanguage;
}

/**
 * The badge text (`CredentialStatus.statusText`). Not yet valid shows the day the credential becomes valid, from the
 * `dd.MM.yyyy` template localized for the device locale (`DateFormatter.shortDateFormatter`).
 */
export function iosStatusText(status: CredentialStatus, text: IosDetailsText, validFrom: Date, locale: string): string {
  if (status !== 'notYetValid') return text.status[status];
  return text.notYetValid(new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(validFrom));
}

/** How the Android badge is drawn (`CredentialStatusBadge`): outlined in the card's text colour, or light red. */
export type AndroidBadgeStyle = 'outline' | 'error';

export const ANDROID_STATUS_STYLE: Record<CredentialStatus, AndroidBadgeStyle> = {
  valid: 'outline',
  invalid: 'error',
  revoked: 'error',
  suspended: 'error',
  notYetValid: 'error',
  unknown: 'outline',
};

export interface AndroidDetailsText {
  status: Record<Exclude<CredentialStatus, 'notYetValid'>, string>;
  /** "valid from" a date; unlike iOS, translated. */
  notYetValid: (date: string) => string;
  sensitive: string;
  /** What TalkBack reads for the pill. */
  sensitiveAlt: string;
  issuedBy: string;
  unknownIssuer: string;
  issuanceType: string;
  standard: string;
}

const ANDROID_EN: AndroidDetailsText = {
  status: { valid: 'Valid', invalid: 'Expired', revoked: 'Revoked', suspended: 'Currently blocked', unknown: 'Unknown' },
  notYetValid: (date) => `valid from ${date}`,
  sensitive: 'Sensitive',
  sensitiveAlt: 'Sensitive Information',
  issuedBy: 'Issued by',
  unknownIssuer: 'Unknown issuer',
  issuanceType: 'Issuance type',
  standard: 'Standard',
};

/** The Android wallet's texts (`tk_credential_status_…`, `tk_global_sensitive_data…`, `tk_displaydelete_displaycredential1_title5`). */
export const ANDROID_DETAILS_TEXT: Record<IosAppLanguage, AndroidDetailsText> = {
  en: ANDROID_EN,
  de: {
    status: { valid: 'Gültig', invalid: 'Abgelaufen', revoked: 'Widerrufen', suspended: 'Aktuell gesperrt', unknown: 'Unbekannt' },
    notYetValid: (date) => `gültig ab ${date}`,
    sensitive: 'Sensibel',
    sensitiveAlt: 'Sensible Information',
    issuedBy: 'Ausgestellt von',
    unknownIssuer: 'Unbekannter Aussteller',
    issuanceType: 'Ausstellungsart',
    standard: 'Standard',
  },
  fr: {
    status: { valid: 'Valable', invalid: 'Expiré', revoked: 'Révoqué', suspended: 'Bloqué temporairement', unknown: 'Inconnu' },
    notYetValid: (date) => `valable dès le ${date}`,
    sensitive: 'sensible',
    sensitiveAlt: 'Informations sensibles',
    issuedBy: 'Délivré par',
    unknownIssuer: 'Émetteur inconnu',
    issuanceType: 'Type d’émission',
    standard: 'Standard',
  },
  it: {
    status: { valid: 'Valida', invalid: 'Scaduto', revoked: 'Annullato', suspended: 'Temporaneamente bloccato', unknown: 'Sconosciuto' },
    notYetValid: (date) => `valido dal ${date}`,
    sensitive: 'sensibile',
    sensitiveAlt: 'Informazioni sensibili',
    issuedBy: 'Rilasciato da',
    unknownIssuer: 'Emittente sconosciuto',
    issuanceType: 'Tipo di emissione',
    standard: 'Standard',
  },
  rm: {
    status: { valid: 'Valaivel', invalid: 'Spirà', revoked: 'Revocà', suspended: 'Actualmain bloccà', unknown: 'Nunenconuschent' },
    notYetValid: (date) => `valaivel dals ${date}`,
    sensitive: 'sensibel',
    sensitiveAlt: 'Infurmaziuns sensiblas',
    issuedBy: 'Emess da',
    unknownIssuer: 'Emittent nunenconuschent',
    issuanceType: 'Tip da l’emissiun',
    standard: 'Standard',
  },
};

/** The Android app's language: the language of its locale (see `androidAppLocale`), which is always one of its own. */
export function androidAppLanguage(appLocale: string): IosAppLanguage {
  const language = appLocale.split(/[-_]/)[0].toLowerCase();
  return (ANDROID_APP_LANGUAGES.includes(language) ? language : 'en') as IosAppLanguage;
}

/**
 * The badge text (`CredentialDisplayStatus.getText`). Not yet valid shows the day, from the locale's best pattern for
 * `dd.MM.yyyy`, upper-cased (`Instant.asDayMonthYear`). A credential valid later today would show the time instead.
 */
export function androidStatusText(status: CredentialStatus, text: AndroidDetailsText, validFrom: Date, locale: string): string {
  if (status !== 'notYetValid') return text.status[status];
  const date = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(validFrom);
  return text.notYetValid(date.toLocaleUpperCase(locale));
}
