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
 */

import type { ClaimFormat, DetailsClaim, DetailsValue } from './details';
import type { PrimitiveType } from '../model';

export interface ValueOptions {
  /** The display locale, the device's first preferred language (see `walletLocale`). */
  locale: string;
  /** The device's IANA time zone. Defaults to the browser's. */
  timeZone?: string;
}

export type ImageType = 'image/png' | 'image/jpeg';

/**
 * What the row shows: text; an image, which iOS draws under the label fitted into 120×120 points and left-aligned; an
 * image the wallet rejects, which makes it refuse the whole credential; or, without a sample, the attribute's type.
 */
export type FormattedValue =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mediaType: ImageType; base64: string; src: string }
  | { kind: 'invalidImage'; mediaType: ImageType; reason: 'invalidData' | 'mismatchingFormat' }
  | { kind: 'placeholder'; type: PrimitiveType };

/** The largest box iOS fits a claim image into, in points (`ClaimCell.Defaults`). */
export const IOS_CLAIM_IMAGE_SIZE = 120;

/** Longer values are cut and end with `…`, "size of A4 document" (`CredentialClaim.localizedValue`). */
export const MAX_VALUE_LENGTH = 1800;

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
  switch (value.kind) {
    case 'placeholder':
      return { kind: 'placeholder', type: value.type };
    case 'entry':
      return { kind: 'text', text: truncate(value.label) };
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
  "'T'": 'T',
  '-': '-',
  ':': ':',
  '.': String.raw`\.`,
};

/**
 * The patterns as regular expressions, with the leniency ICU's parser shows: fields of any length (`2024-1-5`), and
 * whitespace around the value and before the zone.
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
  if (!new RegExp(String.raw`^-?(?:\d+(?:${decimal}\d*)?|${decimal}\d+)(?:[eE][+-]?\d+)?$`).test(text)) return text;
  const value = Number(text.replace(symbols.decimal, '.'));
  if (!Number.isFinite(value)) return text;
  if (!/e/i.test(text)) return decimalText(String(value), locale, symbols, true);
  const integerDigits = /^[+-]?(\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.exec(text)?.[1]?.length ?? 0;
  return scientificText(value, Math.max(1, integerDigits), text.includes('E') ? 'E' : 'e', locale, symbols);
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
