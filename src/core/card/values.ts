/**
 * Claim values as the wallet's credential details screen shows them: dates, numbers, images and long text. Pure data:
 * the iOS and Android previews only draw the result.
 *
 * Ported from swiyu-admin-ch/eidch-ios-wallet v1.19.0 (commit 42e746c): `OcaClaimGenerator.swift`,
 * `OverlayAttributeDateParser.swift`, `JsonPrimitive.swift`, `CredentialClaim.swift` (`localizedValue`),
 * `CredentialClaimViewModel.swift`, `ImageValidator.swift`, BITCore's `DateFormat.swift`, `ValueType.swift` and
 * `URL+Extensions.swift`, and BITOca's `StandardOverlay.swift`. Wallet quirks are copied rather than fixed. The expected
 * strings in the tests come from running that Swift code with Foundation on macOS.
 *
 * The browser's `Intl` stands in for Foundation's formatters, so a browser with older locale data can differ slightly.
 * Number separators are pinned for the wallet's own locales, where Foundation and `Intl` disagree (`fr-CH`).
 *
 * Android (`platform: 'android'`) follows swiyu-admin-ch/eidch-android-wallet v1.19.0 (commit c29a6f3); see
 * `formatAndroidValue` for where it differs. Android's ICU and the browser's `Intl` share CLDR, so nothing is pinned.
 *
 * Both are the wallets' latest tags (iOS v1.19.0 has no GitHub release yet; v1.18.0 is the latest one). Every rule was
 * re-checked against them, file by file, in #113 (2026-10-23).
 */

import type { ClaimFormat, DetailsClaim, DetailsValue } from './details.ts';
import type { PrimitiveType } from '../model.ts';
import type { CardPlatform } from './profiles.ts';

export interface ValueOptions {
  /** iOS: the device's first preferred language (see `walletLocale`). Android: the app locale (`androidAppLocale`). */
  locale: string;
  /** The device's IANA time zone. Defaults to the browser's. */
  timeZone?: string;
  /** Defaults to iOS. */
  platform?: CardPlatform;
}

export type ImageType = 'image/png' | 'image/jpeg';

/**
 * What the row shows: text; an image, which iOS draws under the label fitted into 120×120 points and left-aligned
 * (Android: at most 160 dp tall); an image the wallet rejects, which makes it refuse the whole credential; or, without
 * a sample, the attribute's type. Only Android rejects other image types (`unsupportedFormat`).
 */
export type FormattedValue =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mediaType: ImageType; base64: string; src: string }
  | { kind: 'invalidImage'; mediaType: string; reason: 'invalidData' | 'mismatchingFormat' | 'unsupportedFormat' }
  | { kind: 'placeholder'; type: PrimitiveType };

/** The largest box iOS fits a claim image into, in points (`ClaimCell.Defaults`). */
export const IOS_CLAIM_IMAGE_SIZE = 120;

/** Longer values are cut and end with `…`, "size of A4 document" (`CredentialClaim.localizedValue`). */
export const MAX_VALUE_LENGTH = 1800;

/** The tallest Android draws a claim image, in dp (`Sizes.claimImageMaxHeight`). */
export const ANDROID_CLAIM_IMAGE_MAX_HEIGHT = 160;

/** What both wallets show for a value that is null (`localizedValue`; `CredentialElements.kt`). */
export const NULL_VALUE = '–';

/** The locale iOS formats values with: the first device language as is, else English (`CredentialClaim.currentLocale`). */
export function walletLocale(deviceLanguages: readonly string[]): string {
  return deviceLanguages[0] ?? 'en';
}

/** A details row's value, formatted. */
export function formatClaim(claim: DetailsClaim, options: ValueOptions): FormattedValue {
  return formatClaimValue(claim.value, claim.format, options);
}

/** A value as the wallet shows it. Without `format` (no OCA attribute for the row), the value is plain text. */
export function formatClaimValue(value: DetailsValue, format: ClaimFormat | undefined, options: ValueOptions): FormattedValue {
  if (options.platform === 'android') return formatAndroidValue(value, format, options);
  switch (value.kind) {
    case 'placeholder':
      return { kind: 'placeholder', type: value.type };
    case 'entry':
      return { kind: 'text', text: truncate(value.label) };
    case 'null':
      return { kind: 'text', text: NULL_VALUE };
    case 'raw':
      break;
  }
  let text = walletText(value.value);
  let image: ImageType | undefined;
  let date: ParsedDate | undefined;
  const dataUrl = isStandard(format?.standard, DATA_URL_STANDARD) ? parseDataUrl(text) : undefined;
  // `OcaClaimGenerator.generate`: an image data URL wins, then the date parser.
  if (dataUrl && isImageType(dataUrl.mediaType)) {
    text = dataUrl.data;
    image = dataUrl.mediaType;
  } else if (format?.type === 'DateTime') {
    date = EPOCH_STANDARDS.some((standard) => isStandard(format.standard, standard)) ? parseEpoch(text) : parseIsoDate(text);
  }
  image ??= binaryImageType(format);
  if (image) return imageValue(text, image);
  if (date) return { kind: 'text', text: truncate(formatDate(date, options)) };
  if (format?.type === 'Numeric') return { kind: 'text', text: truncate(formatNumber(text, options.locale)) };
  return { kind: 'text', text: truncate(text) };
}

/**
 * The text iOS matches entry codes against (`OcaClaimGenerator.generate` L28-36): a DateTime value that parses is
 * replaced by its ISO 8601 form (`2024-01-05T00:00:00Z`) first, unless the attribute is a data URL.
 */
export function iosEntryText(text: string, format: ClaimFormat | undefined): string {
  if (format?.type !== 'DateTime' || isStandard(format.standard, DATA_URL_STANDARD)) return text;
  const date = EPOCH_STANDARDS.some((standard) => isStandard(format.standard, standard)) ? parseEpoch(text) : parseIsoDate(text);
  // `ISO8601DateFormatter`: whole seconds, `Z` for GMT.
  return date ? date.date.toISOString().replace(/\.\d{3}Z$/, 'Z') : text;
}

/**
 * The value as the wallet's string (`JsonPrimitive.stringValue`). JSON numbers reach the wallet as NSNumber and are
 * cast to `Int` first, so booleans become `1` and `0` and `3.0` becomes `3`. Other numbers use Swift's `Double`
 * description, which writes `1e-05` where JavaScript writes `0.00001`.
 */
export function walletText(value: string | number | boolean): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Number.isInteger(value) && value >= -INT64_LIMIT && value < INT64_LIMIT) return String(value);
  return swiftDouble(value);
}

const INT64_LIMIT = 2 ** 63;

/** Swift's `Double.description`: the shortest digits, in exponent form below 1e-4 and above `Int` range. */
function swiftDouble(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const [mantissa, exponent] = value.toExponential().split('e');
  const power = Number(exponent);
  if (power >= -4 && Math.abs(value) < INT64_LIMIT) return String(value);
  return `${mantissa}e${power < 0 ? '-' : '+'}${String(Math.abs(power)).padStart(2, '0')}`;
}

/** Cuts text longer than `MAX_VALUE_LENGTH` characters (grapheme clusters, as Swift counts them). */
function truncate(text: string): string {
  if (text.length <= MAX_VALUE_LENGTH) return text;
  const graphemes = Array.from(new Intl.Segmenter().segment(text), (part) => part.segment);
  return graphemes.length > MAX_VALUE_LENGTH ? `${graphemes.slice(0, MAX_VALUE_LENGTH).join('')}…` : text;
}

// Standards (`Standard.init(from:)` matches them as prefixes).

const DATA_URL_STANDARD = 'urn:ietf:rfc:2397';
const EPOCH_STANDARDS = ['urn:iso:std:iso-iec:9945', 'urn:iso:std:iso-iec-ieee:9945'];

function isStandard(standard: string | undefined, prefix: string): boolean {
  return standard?.startsWith(prefix) ?? false;
}

// Images.

const IMAGE_SIGNATURES: Record<ImageType, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

function isImageType(mediaType: string | undefined): mediaType is ImageType {
  return mediaType === 'image/png' || mediaType === 'image/jpeg';
}

/** `data:[type/subtype][;base64],data`, without parameters (`URL.parsedDataURL`). The data is kept as written. */
function parseDataUrl(text: string): { mediaType?: string; data: string } | undefined {
  const match = /^data:([\w-]+\/[\w+.-]+)?(;base64)?,(.*)$/s.exec(text);
  return match ? { mediaType: match[1], data: match[3] } : undefined;
}

/** A `Binary` attribute is an image when its encoding is base64 and its format a PNG or JPEG type (`ValueType.init`). */
function binaryImageType(format: ClaimFormat | undefined): ImageType | undefined {
  if (format?.type !== 'Binary' || format.characterEncoding?.toLowerCase() !== 'base64') return undefined;
  return isImageType(format.format) ? format.format : undefined;
}

/** `ImageValidator.validate`: strict base64 (no whitespace, padded), at least 12 bytes, starting with the type's signature. */
function imageValue(base64: string, mediaType: ImageType): FormattedValue {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    return { kind: 'invalidImage', mediaType, reason: 'invalidData' };
  }
  const bytes = (base64.length / 4) * 3 - (base64.match(/=+$/)?.[0].length ?? 0);
  const head = atob(base64.slice(0, 16));
  const signature = IMAGE_SIGNATURES[mediaType];
  if (bytes < 12 || !signature.every((byte, index) => head.charCodeAt(index) === byte)) {
    return { kind: 'invalidImage', mediaType, reason: 'mismatchingFormat' };
  }
  return { kind: 'image', mediaType, base64, src: `data:${mediaType};base64,${base64}` };
}

// Dates.

/** The wallet's date patterns, tried in this order (`DateFormat.allCases`). */
const DATE_PATTERNS = [
  "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
  "yyyy-MM-dd'T'HH:mm:ssZ",
  "yyyy-MM-dd'T'HH:mmZ",
  "yyyy-MM-dd'T'HH:mm:ss.SSS",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  'yyyy-MM-ddZ',
  'yyyy-MM-dd',
  'HH:mm:ss.SSSZ',
  'HH:mm:ssZ',
  'HH:mmZ',
  'HH:mm:ss.SSS',
  'HH:mm:ss',
  'HH:mm',
  'yyyy-MM',
  'yyyy',
] as const;

export type DatePattern = (typeof DATE_PATTERNS)[number];

interface ParsedDate {
  /** Whole seconds: the wallet stores the date as an ISO 8601 string without fractions. */
  date: Date;
  pattern: DatePattern;
}

/** Offsets as ICU's `Z` reads them: `Z`, `UTC`, `GMT`, `+1`, `+01`, `+0100`, `+01:00`, `GMT+01:00`, with seconds too. */
const ZONE = String.raw`\s*(?<zone>[Zz]|(?:GMT|UTC)?(?:[+-]\d{1,2}(?::\d{2}(?::\d{2})?|\d{2}(?:\d{2})?)?)|GMT|UTC)`;

const PATTERN_TOKENS: Record<string, string> = {
  yyyy: String.raw`(?<year>\d{1,6})`,
  MM: String.raw`(?<month>\d+)`,
  dd: String.raw`(?<day>\d+)`,
  HH: String.raw`(?<hour>\d+)`,
  mm: String.raw`(?<minute>\d+)`,
  ss: String.raw`(?<second>\d+)`,
  SSS: String.raw`\d+`,
  Z: ZONE,
  // ICU's lenient parsing skips spaces before a number.
  "'T'": String.raw`T\s*`,
  // Between date fields: the `-` itself, then spaces; or a run of `-`, `,`, `.`, `/` and spaces that starts with
  // another of them (`2024/01/05`, `2024.01.05`, `2024 01 05`). A second `-` would be the number's minus sign.
  '-': String.raw`(?:-\s*|[,./\s][-,./\s]*)`,
  // Between time fields, the same with `:` (`10:30`, `10.30`, `10-30`, `10 : 30`); `,` and `/` are not skipped here.
  ':': String.raw`(?::\s*|[-.\s][-.:\s]*)`,
  '.': String.raw`\.`,
};

/**
 * The patterns as regular expressions, with the leniency ICU's parser shows (run with Foundation on macOS 27): fields
 * of any length (`2024-1-5`), other separators between fields, and whitespace around the value and before the zone.
 */
const DATE_PARSERS = DATE_PATTERNS.map((pattern) => ({
  pattern,
  regex: new RegExp(
    String.raw`^\s*${pattern
      .split(/(yyyy|MM|dd|HH|mm|ss|SSS|Z|'T'|-|:|\.)/)
      .filter(Boolean)
      .map((token) => PATTERN_TOKENS[token])
      .join('')}\s*$`,
  ),
}));

/**
 * `OverlayAttributeDateParser.parseISO8601`: the first pattern that matches, read in GMT. ICU checks each field's range
 * but rolls a day past the month's end over (`2024-02-30` is 1 March) and accepts hour 24 (the next day). A time
 * without a date falls on 1 January 2000.
 */
function parseIsoDate(text: string): ParsedDate | undefined {
  for (const { pattern, regex } of DATE_PARSERS) {
    const fields = regex.exec(text)?.groups;
    if (!fields) continue;
    const field = (name: string, fallback: number) => (fields[name] === undefined ? fallback : Number(fields[name]));
    const hasDate = fields.year !== undefined;
    const year = field('year', 2000);
    const month = field('month', 1);
    const day = field('day', 1);
    const hour = field('hour', 0);
    const minute = field('minute', 0);
    const second = field('second', 0);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 24 || minute > 59 || second > 59) continue;
    const offset = fields.zone === undefined ? 0 : zoneOffset(fields.zone);
    if (offset === undefined) continue;
    const local = new Date(0);
    local.setUTCFullYear(hasDate ? year : 2000, month - 1, day);
    local.setUTCHours(hour, minute, second, 0);
    const date = new Date(local.getTime() - Math.trunc(offset * 60) * 1000);
    if (Number.isNaN(date.getTime())) return undefined;
    return { date, pattern };
  }
  return undefined;
}

/** The zone's offset from GMT in minutes. */
function zoneOffset(zone: string): number | undefined {
  const match = /^(?:GMT|UTC)?([+-])(\d{1,2})(?::?(\d{2}))?(?::?(\d{2}))?$/.exec(zone);
  if (!match) return /^(?:[Zz]|GMT|UTC)$/.test(zone) ? 0 : undefined;
  const [, sign, hours, minutes = '0', seconds = '0'] = match;
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes) + Number(seconds) / 60);
}

/** `parseUnixEpoch`: seconds since 1970 as Swift's `TimeInterval(String)` reads them, shown as a full date and time. */
function parseEpoch(text: string): ParsedDate | undefined {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return undefined;
  const date = new Date(Math.floor(Number(text)) * 1000);
  return Number.isNaN(date.getTime()) ? undefined : { date, pattern: "yyyy-MM-dd'T'HH:mm:ssZ" };
}

/**
 * `CredentialClaim.dateTimeFormatted`: short date, short time or medium time when the source has seconds. The device's
 * time zone only when the source has a zone, otherwise GMT. Year-month is `MMMM yyyy`, a year `yyyy`.
 */
function formatDate({ date, pattern }: ParsedDate, options: ValueOptions): string {
  const locale = supportedLocale(options.locale);
  if (pattern === 'yyyy') return eraYear(date);
  if (pattern === 'yyyy-MM') {
    // The month name in its formatting context, as `MMMM` gives it (Romansh: "da december").
    const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).formatToParts(date);
    return `${parts.find((part) => part.type === 'month')?.value ?? ''} ${eraYear(date)}`;
  }
  const hasSeconds = pattern.includes('ss');
  return new Intl.DateTimeFormat(locale, {
    dateStyle: pattern.includes('yyyy-MM-dd') ? 'short' : undefined,
    timeStyle: hasSeconds ? 'medium' : pattern.includes('HH:mm') ? 'short' : undefined,
    timeZone: pattern.includes('Z') ? supportedTimeZone(options.timeZone) : 'UTC',
  }).format(date);
}

/** `yyyy`: the year of the era, at least four digits. */
function eraYear(date: Date): string {
  const year = date.getUTCFullYear();
  return String(year > 0 ? year : 1 - year).padStart(4, '0');
}

function supportedLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? 'en';
  } catch {
    return 'en';
  }
}

function supportedTimeZone(timeZone: string | undefined): string {
  if (timeZone === undefined) return new Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

// Numbers.

/**
 * Foundation's separators for the wallet's own locales (`UserLocale.LocaleIdentifier`), from `NumberFormatter` on
 * macOS 27. Browsers give `fr-CH` a decimal comma; Foundation gives it a point.
 */
const WALLET_NUMBER_SYMBOLS: Record<string, { decimal: string; group: string }> = {
  'de-CH': { decimal: '.', group: "'" },
  'fr-CH': { decimal: '.', group: "'" },
  'it-CH': { decimal: '.', group: "'" },
  en: { decimal: '.', group: ',' },
  rm: { decimal: ',', group: ' ' },
};

/** Up to 14 fraction digits, "maximum Double precision". Foundation rounds half to even. */
const MAX_FRACTION_DIGITS = 14;

/**
 * `CredentialClaim.numericFormatted`. The text is read with the locale's decimal separator and no grouping (the wallet
 * reads it with the device locale, which the display locale stands in for), so `1.5` stays as written in Romansh. A
 * text with an `e` is shown in scientific notation, keeping its integer digits and the case of its `e`. Anything that
 * does not read as a number is shown as written.
 */
function formatNumber(text: string, localeTag: string): string {
  const locale = supportedLocale(localeTag);
  const symbols = numberSymbols(locale);
  const decimal = escapeRegExp(symbols.decimal);
  // `NumberFormatter` skips spaces and tabs around the number, not line breaks.
  const number = text.replace(/^[ \t]+|[ \t]+$/g, '');
  if (!new RegExp(String.raw`^-?(?:\d+(?:${decimal}\d*)?|${decimal}\d+)(?:[eE][+-]?\d+)?$`).test(number)) return text;
  const value = Number(number.replace(symbols.decimal, '.'));
  if (!Number.isFinite(value)) return text;
  if (!/e/i.test(number)) return decimalText(String(value), locale, symbols, true);
  const integerDigits = /^[+-]?(\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.exec(number)?.[1]?.length ?? 0;
  return scientificText(value, Math.max(1, integerDigits), number.includes('E') ? 'E' : 'e', locale, symbols);
}

function numberSymbols(locale: string): { decimal: string; group: string } {
  const pinned = WALLET_NUMBER_SYMBOLS[locale];
  if (pinned) return pinned;
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  return {
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
  };
}

/** Formats the shortest decimal digits of a double, as ICU does, with the locale's separators. */
function decimalText(digits: string, locale: string, symbols: { decimal: string; group: string }, grouping: boolean): string {
  const parts = new Intl.NumberFormat(locale, {
    maximumFractionDigits: MAX_FRACTION_DIGITS,
    roundingMode: 'halfEven',
    // `auto` keeps the locale's minimum grouping digits: `1234.5` in it-CH.
    useGrouping: grouping ? 'auto' : false,
  }).formatToParts(digits as `${number}`);
  return parts.map((part) => (part.type === 'decimal' ? symbols.decimal : part.type === 'group' ? symbols.group : part.value)).join('');
}

/**
 * `NumberFormatter.scientific` with `minimumIntegerDigits`: the mantissa keeps that many integer digits, rounded to 14
 * fraction digits, and the exponent has no `+` (`12.5e3`, `1e20`, `1.5e-5`).
 */
function scientificText(value: number, integerDigits: number, symbol: string, locale: string, symbols: { decimal: string; group: string }): string {
  if (value === 0) return `0${symbol}0`;
  const [mantissa, power] = Math.abs(value).toExponential().split('e');
  let digits = mantissa.replace('.', '');
  let exponent = Number(power) - (integerDigits - 1);
  const kept = integerDigits + MAX_FRACTION_DIGITS;
  if (digits.length > kept) {
    digits = roundHalfEven(digits, kept);
    if (digits.length > kept) exponent += 1;
  }
  digits = digits.padEnd(integerDigits, '0');
  const fraction = digits.slice(integerDigits).replace(/0+$/, '');
  const text = `${value < 0 ? '-' : ''}${digits.slice(0, integerDigits)}${fraction ? `.${fraction}` : ''}`;
  return `${decimalText(text, locale, symbols, false)}${symbol}${exponent}`;
}

/** The first `count` digits of `digits`, rounded half to even. A carry can add a digit (`999` → `1000`). */
function roundHalfEven(digits: string, count: number): string {
  const kept = digits.slice(0, count);
  const rest = digits.slice(count);
  const half = rest[0] > '5' || (rest[0] === '5' && (/[1-9]/.test(rest.slice(1)) || Number(kept.at(-1)) % 2 === 1));
  if (!half) return kept;
  return (BigInt(kept) + 1n).toString().padStart(count, '0');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Android.

/**
 * A value as the Android wallet shows it: `GenerateOcaClaimDisplaysImpl` (value type, images, dates), then
 * `MapToCredentialClaimDataImpl` (formatting), under `app/src/main/java/ch/admin/foitt/wallet/platform/`. Where it
 * differs from iOS:
 * - JSON booleans show `true` and `false`; numbers show as written in the JSON (here: as JavaScript writes them).
 * - Numbers keep the digits they are written with: as many fraction digits and leading zeros, no rounding, and an
 *   exponent copied as written (`1.50` stays `1.50`, `1.5e3` stays `1.5e3`).
 * - Dates use the locale's best pattern for a fixed skeleton: a four-digit year, two-digit day and month, 24-hour
 *   time, seconds and milliseconds when the source has them (`31.12.2024, 14:30`). Epoch seconds must be a whole
 *   number and show no seconds. Parsing is strict ISO, except that a day past the month's end becomes its last day.
 * - Entry labels replace codes for text, booleans and numbers only, and are not cut. Dates and numbers are not cut.
 * - Text over 1800 UTF-16 units is cut (Swift counts characters).
 * - Any `image/…` data URL or Binary format is an image; types other than PNG and JPEG make the wallet refuse the
 *   credential. Images are checked by their base64 prefix only.
 * - A JSON `null` shows `–`.
 */
function formatAndroidValue(value: DetailsValue, format: ClaimFormat | undefined, options: ValueOptions): FormattedValue {
  switch (value.kind) {
    case 'placeholder':
      return { kind: 'placeholder', type: value.type };
    case 'null': {
      // `ValidateImageImpl.kt` L21-27 checks a Binary image's type before it looks at the value.
      const mediaType = androidBinaryImageType(format);
      if (mediaType && !isImageType(mediaType)) return { kind: 'invalidImage', mediaType, reason: 'unsupportedFormat' };
      return { kind: 'text', text: NULL_VALUE };
    }
    case 'entry':
    case 'raw':
      break;
  }
  const raw = value.kind === 'entry' ? value.code : String(value.value);
  let text = raw;
  let mediaType: string | undefined;
  let date: AndroidDate | undefined;
  if (isStandard(format?.standard, DATA_URL_STANDARD)) {
    const match = /^data:(image\/[^;]{1,121});base64,/.exec(raw);
    if (match) {
      text = raw.slice(raw.indexOf(';base64,') + ';base64,'.length);
      mediaType = match[1];
    }
  } else if (format?.type === 'DateTime') {
    date = EPOCH_STANDARDS.some((standard) => isStandard(format.standard, standard)) ? parseAndroidEpoch(raw) : parseAndroidIso(raw);
  }
  mediaType ??= androidBinaryImageType(format);
  if (mediaType) return androidImage(text, mediaType);
  if (format?.type === 'DateTime') return { kind: 'text', text: date ? formatAndroidDate(date, options) : raw };
  if (value.kind === 'entry') return { kind: 'text', text: value.label };
  if (format?.type === 'Numeric') return { kind: 'text', text: formatAndroidNumber(raw, options.locale) };
  return { kind: 'text', text: raw.length > MAX_VALUE_LENGTH ? `${raw.slice(0, MAX_VALUE_LENGTH)}…` : raw };
}

/** `getValueTypeForBinary`: base64 with a format starting `image/`. */
function androidBinaryImageType(format: ClaimFormat | undefined): string | undefined {
  if (format?.type !== 'Binary' || format.characterEncoding?.toLowerCase() !== 'base64') return undefined;
  return format.format?.startsWith('image/') ? format.format : undefined;
}

/** `ImageType`'s magic numbers, base64-encoded. */
const ANDROID_IMAGE_PREFIXES: Record<ImageType, string> = { 'image/png': 'iVBORw0KGgo', 'image/jpeg': '/9j/' };

/**
 * `ValidateImageImpl`: only PNG and JPEG, starting with their magic number. The details screen then decodes the data
 * with Java's basic base64 decoder, which fails on anything else.
 */
function androidImage(data: string, mediaType: string): FormattedValue {
  if (!isImageType(mediaType)) return { kind: 'invalidImage', mediaType, reason: 'unsupportedFormat' };
  const afterComma = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  if (!afterComma.startsWith(ANDROID_IMAGE_PREFIXES[mediaType])) return { kind: 'invalidImage', mediaType, reason: 'mismatchingFormat' };
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/.test(data)) {
    return { kind: 'invalidImage', mediaType, reason: 'invalidData' };
  }
  const padded = data.padEnd(Math.ceil(data.length / 4) * 4, '=');
  return { kind: 'image', mediaType, base64: data, src: `data:${mediaType};base64,${padded}` };
}

/** `DateTimePattern`: which fields the formatted value has, and whether the source had a zone. */
type AndroidDatePattern = 'dateTime' | 'date' | 'time' | 'yearMonth' | 'year';

interface AndroidDate {
  date: Date;
  pattern: AndroidDatePattern;
  seconds: boolean;
  fraction: boolean;
  zone: boolean;
}

const HM = String.raw`(?<hour>\d{2}):(?<minute>\d{2})`;
const HMS = String.raw`${HM}:(?<second>\d{2})`;
const HMSF = String.raw`${HMS}\.(?<fraction>\d{1,9})`;
const ISO_DATE = String.raw`(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})`;
/** `parseLenient().appendOffsetId()`: hours, then optional minutes and seconds, with colons. */
const LENIENT_OFFSET = String.raw`(?<zone>Z|[+-]\d{2}(?::\d{2}(?::\d{2})?)?)`;
/** `ISO_OFFSET_DATE`'s strict offset. */
const STRICT_OFFSET = String.raw`(?<zone>Z|[+-]\d{2}:\d{2}(?::\d{2})?)`;

/** `parseIso8601`'s parsers in the order it tries them. All but `HH:mmZ` ignore case. */
const ANDROID_DATE_PARSERS: { regex: RegExp; pattern: AndroidDatePattern }[] = [
  { regex: /^(?<year>-?\d{1,9})$/, pattern: 'year' },
  { regex: /^(?<year>-?\d{1,9})-(?<month>\d+)$/, pattern: 'yearMonth' },
  { regex: new RegExp(`^${HM}${LENIENT_OFFSET}$`), pattern: 'time' },
  { regex: new RegExp(`^${HMS}${LENIENT_OFFSET}$`, 'i'), pattern: 'time' },
  { regex: new RegExp(`^${HMSF}${LENIENT_OFFSET}$`, 'i'), pattern: 'time' },
  { regex: new RegExp(`^${HMSF}$`, 'i'), pattern: 'time' },
  { regex: new RegExp(`^${HMS}$`, 'i'), pattern: 'time' },
  { regex: new RegExp(`^${HM}$`, 'i'), pattern: 'time' },
  { regex: new RegExp(`^${ISO_DATE}T${HM}${LENIENT_OFFSET}$`, 'i'), pattern: 'dateTime' },
  { regex: new RegExp(`^${ISO_DATE}T${HMS}${LENIENT_OFFSET}$`, 'i'), pattern: 'dateTime' },
  { regex: new RegExp(`^${ISO_DATE}T${HMSF}${LENIENT_OFFSET}$`, 'i'), pattern: 'dateTime' },
  { regex: new RegExp(`^${ISO_DATE}T${HM}$`, 'i'), pattern: 'dateTime' },
  { regex: new RegExp(`^${ISO_DATE}T${HMS}$`, 'i'), pattern: 'dateTime' },
  { regex: new RegExp(`^${ISO_DATE}T${HMSF}$`, 'i'), pattern: 'dateTime' },
  { regex: new RegExp(`^${ISO_DATE}${STRICT_OFFSET}$`, 'i'), pattern: 'date' },
  { regex: new RegExp(`^${ISO_DATE}$`, 'i'), pattern: 'date' },
];

/**
 * `DateTimeHelper.parseIso8601`. Fields are checked against their ranges, and a day past the month's end becomes the
 * month's last day (`ResolverStyle.SMART`). A time without a date falls on 1 January of year 0.
 */
function parseAndroidIso(text: string): AndroidDate | undefined {
  for (const { regex, pattern } of ANDROID_DATE_PARSERS) {
    const fields = regex.exec(text)?.groups;
    if (!fields) continue;
    const field = (name: string, fallback: number) => (fields[name] === undefined ? fallback : Number(fields[name]));
    const year = field('year', 0);
    const month = field('month', 1);
    const hour = field('hour', 0);
    const minute = field('minute', 0);
    const second = field('second', 0);
    let day = field('day', 1);
    // `ResolverStyle.SMART` reads `24:00` (and only that) as midnight at the end of the day.
    const endOfDay = hour === 24 && minute === 0 && second === 0 && !/[1-9]/.test(fields.fraction ?? '');
    if (month < 1 || month > 12 || day < 1 || day > 31 || (hour > 23 && !endOfDay) || minute > 59 || second > 59) continue;
    day = Math.min(day, new Date(Date.UTC(2000, month, 0)).getUTCDate() - (month === 2 && !isLeapYear(year) ? 1 : 0));
    const offset = fields.zone === undefined ? 0 : (zoneOffset(fields.zone.toUpperCase()) ?? 0);
    const local = new Date(0);
    local.setUTCFullYear(year, month - 1, day);
    local.setUTCHours(hour, minute, second, Number((fields.fraction ?? '0').padEnd(3, '0').slice(0, 3)));
    const date = new Date(local.getTime() - Math.trunc(offset * 60) * 1000);
    if (Number.isNaN(date.getTime())) return undefined;
    return { date, pattern, seconds: fields.second !== undefined, fraction: fields.fraction !== undefined, zone: fields.zone !== undefined };
  }
  return undefined;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** `parseUnixTime`: whole seconds only (`String.toLong`), shown with date, hours and minutes in the device's zone. */
function parseAndroidEpoch(text: string): AndroidDate | undefined {
  if (!/^[+-]?\d{1,19}$/.test(text)) return undefined;
  const date = new Date(Number(text) * 1000);
  if (Number.isNaN(date.getTime())) return undefined;
  return { date, pattern: 'dateTime', seconds: false, fraction: false, zone: true };
}

/**
 * `localizeDateTime`: `DateFormat.getBestDateTimePattern` for `yyyy-MM-dd, HH:mm[:ss[.SSS]]`, `yyyy-MM-dd`,
 * `HH:mm[:ss[.SSS]]`, `yyyy-MMMM` or `yyyy`. The device's zone when the source had one, otherwise UTC.
 */
function formatAndroidDate({ date, pattern, seconds, fraction, zone }: AndroidDate, options: ValueOptions): string {
  const locale = supportedLocale(options.locale);
  if (pattern === 'year') return eraYear(date);
  const timeZone = zone ? supportedTimeZone(options.timeZone) : 'UTC';
  if (pattern === 'yearMonth') return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone }).format(date);
  const hasDate = pattern !== 'time';
  const hasTime = pattern !== 'date';
  return new Intl.DateTimeFormat(locale, {
    ...(hasDate ? { year: 'numeric', month: '2-digit', day: '2-digit' } : {}),
    ...(hasTime
      ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(seconds ? { second: '2-digit' } : {}), ...(fraction ? { fractionalSecondDigits: 3 } : {}) }
      : {}),
    timeZone,
  } as Intl.DateTimeFormatOptions).format(date);
}

/**
 * `localizeNumber`: `-?digits(.digits)?([eE][+-]?digits)?`, else as written. The number is grouped, keeps exactly its
 * integer and fraction digit counts, gets its sign in front and its exponent copied after.
 */
function formatAndroidNumber(text: string, localeTag: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?([eE][+-]?\d+)?$/.exec(text);
  if (!match) return text;
  const [, sign, integer, fraction = '', exponent = ''] = match;
  const digits = String(Number(fraction ? `${integer}.${fraction}` : integer));
  const formatted = new Intl.NumberFormat(supportedLocale(localeTag), {
    useGrouping: true,
    minimumIntegerDigits: Math.min(integer.length, 21),
    minimumFractionDigits: Math.min(fraction.length, 100),
    maximumFractionDigits: Math.min(fraction.length, 100),
    roundingMode: 'halfEven',
  }).format(digits as `${number}`);
  return `${sign}${formatted}${exponent}`;
}
