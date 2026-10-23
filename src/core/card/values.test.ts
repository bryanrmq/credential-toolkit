import { describe, expect, it } from 'vitest';
import { type PrimitiveType, emptyProject, newAttribute } from '../model';
import { type ClaimFormat, type DetailsClaim, type DetailsValue, credentialDetails } from './details';
import { type FormattedValue, type ValueOptions, MAX_VALUE_LENGTH, formatClaim, formatClaimValue, walletLocale, walletText } from './values';

// Every expected string below was produced by the wallet's own Swift code (v1.19.0) run with Foundation on macOS.

const ZURICH: ValueOptions = { locale: 'de-CH', timeZone: 'Europe/Zurich' };

const raw = (value: string | number | boolean): DetailsValue => ({ kind: 'raw', value });

function show(value: string | number | boolean, format?: ClaimFormat, options: ValueOptions = ZURICH): FormattedValue {
  return formatClaimValue(raw(value), format, options);
}

function text(value: string | number | boolean, format?: ClaimFormat, options: ValueOptions = ZURICH): string {
  const result = show(value, format, options);
  if (result.kind !== 'text') throw new Error(`expected text, got ${result.kind}`);
  return result.text;
}

const typed = (type: PrimitiveType, extra: Omit<ClaimFormat, 'type'> = {}): ClaimFormat => ({ type, ...extra });
const NUMERIC = typed('Numeric');
const DATE = typed('DateTime');
const EPOCH = typed('DateTime', { standard: 'urn:iso:std:iso-iec:9945' });
const DATA_URL = typed('Text', { standard: 'urn:ietf:rfc:2397' });
const PNG_BINARY = typed('Binary', { format: 'image/png', characterEncoding: 'base64' });

// 12 bytes each: the PNG signature plus the IHDR length, and a JFIF header.
const PNG = 'iVBORw0KGgoAAAAN';
const JPEG = '/9j/4AAQSkZJRgAB';

describe('walletText', () => {
  it('turns booleans into 1 and 0 and whole numbers into integers, as JsonPrimitive casts to Int first', () => {
    expect([true, false, 3, 3.0, -0].map(walletText)).toEqual(['1', '0', '3', '3', '0']);
  });

  it("writes other numbers as Swift's Double description", () => {
    expect([3.5, 0.1, 0.0001, 0.00009999, 1e-5, -2.5e-7, 123.456e-10].map(walletText)).toEqual([
      '3.5',
      '0.1',
      '0.0001',
      '9.999e-05',
      '1e-05',
      '-2.5e-07',
      '1.23456e-08',
    ]);
  });

  it('keeps integers in Int range as digits and writes larger ones in exponent form', () => {
    expect([1e16, 9.2e18, 9.3e18, 1e20, 1.5e300].map(walletText)).toEqual([
      '10000000000000000',
      '9200000000000000000',
      '9.3e+18',
      '1e+20',
      '1.5e+300',
    ]);
  });
});

describe('text and booleans', () => {
  it('shows text as is', () => {
    expect(text('Muster', typed('Text'))).toBe('Muster');
    expect(text('', typed('Text'))).toBe('');
  });

  it('shows a number or boolean in a Text attribute as the wallet string', () => {
    expect(text(1e-5, typed('Text'))).toBe('1e-05');
    expect(text(true, typed('Text'))).toBe('1');
  });

  it('shows booleans as the raw wallet string: 1 and 0 for JSON booleans', () => {
    expect(text(true, typed('Boolean'))).toBe('1');
    expect(text(false, typed('Boolean'))).toBe('0');
    expect(text('true', typed('Boolean'))).toBe('true');
  });

  it('shows a value without an attribute (array elements, unmapped claims) as plain text', () => {
    expect(text(1234567.5)).toBe('1234567.5');
    expect(text('2024-12-31')).toBe('2024-12-31');
    expect(text(false)).toBe('0');
  });
});

describe('numbers', () => {
  it('uses the decimal style with grouping and up to 14 fraction digits', () => {
    expect(text(1234567.891, NUMERIC)).toBe("1'234'567.891");
    expect(text(42, NUMERIC)).toBe('42');
    expect(text(-42, NUMERIC)).toBe('-42');
    expect(text('0.123456789012345678', NUMERIC)).toBe('0.12345678901235');
    expect(text('12345678901234.56789', NUMERIC)).toBe("12'345'678'901'234.568");
  });

  it('rounds half to even, as NumberFormatter does', () => {
    expect(text('0.000000000000025', NUMERIC)).toBe('0.00000000000002');
    expect(text('0.000000000000035', NUMERIC)).toBe('0.00000000000004');
    expect(text('0.000000000000045', NUMERIC)).toBe('0.00000000000004');
  });

  it('formats the double, not the digits as written', () => {
    expect(text('12345678901234567890', NUMERIC)).toBe("12'345'678'901'234'567'000");
    expect(text('007', NUMERIC)).toBe('7');
    expect(text('1.', NUMERIC)).toBe('1');
    expect(text('.5', NUMERIC)).toBe('0.5');
  });

  it('keeps e-notation scientific, with the integer digits and the case of the e as written', () => {
    expect(text(1e-5, NUMERIC)).toBe('1e-5');
    expect(text('1.5E-05', NUMERIC)).toBe('1.5E-5');
    expect(text(1e20, NUMERIC)).toBe('1e20');
    expect(text('1.23456e+20', NUMERIC)).toBe('1.23456e20');
    expect(text('12.5e3', NUMERIC)).toBe('12.5e3');
    expect(text('1234.5e3', NUMERIC)).toBe('1234.5e3');
    expect(text('100e3', NUMERIC)).toBe('100e3');
    expect(text('0.5e3', NUMERIC)).toBe('5e2');
    expect(text('.5e3', NUMERIC)).toBe('5e2');
    expect(text('0e5', NUMERIC)).toBe('0e0');
    expect(text('12345.6789e-2', NUMERIC)).toBe('12345.6789e-2');
  });

  it('rounds the scientific mantissa to 14 fraction digits, carrying into the exponent', () => {
    expect(text('1.123456789012345678e5', NUMERIC)).toBe('1.12345678901235e5');
    expect(text('1.23456789012345678e-300', NUMERIC)).toBe('1.23456789012346e-300');
    expect(text('9.99999999999999999e5', NUMERIC)).toBe('1e6');
    expect(text('1.000000000000005e0', NUMERIC)).toBe('1e0');
  });

  it('shows text that does not read as a number as written', () => {
    for (const value of ['abc', '1,5', '1 000', '+5', '1e400', 'NaN', '0x1A']) expect(text(value, NUMERIC)).toBe(value);
  });

  it("uses Foundation's separators for the wallet locales, including the point in fr-CH", () => {
    expect(text('1234567.891', NUMERIC, { locale: 'en' })).toBe('1,234,567.891');
    expect(text('1234567.891', NUMERIC, { locale: 'fr-CH' })).toBe("1'234'567.891");
    expect(text('1234.5', NUMERIC, { locale: 'it-CH' })).toBe('1234.5');
    expect(text('1234567,891', NUMERIC, { locale: 'rm' })).toBe('1 234 567,891');
  });

  it('reads the text with the locale decimal separator, so a point stays as written in Romansh', () => {
    expect(text('1234567.891', NUMERIC, { locale: 'rm' })).toBe('1234567.891');
    expect(text('1.5e-05', NUMERIC, { locale: 'rm' })).toBe('1.5e-05');
    expect(text('1e-05', NUMERIC, { locale: 'rm' })).toBe('1e-5');
    expect(text('1,5e-05', NUMERIC, { locale: 'rm' })).toBe('1,5e-5');
  });
});

describe('dates', () => {
  it('parses every wallet pattern, in GMT unless the value has a zone', () => {
    const cases: [string, string][] = [
      ['2024-12-31T23:30:15.123Z', '01.01.25, 00:30:15'],
      ['2024-12-31T23:30:15.123+01:00', '31.12.24, 23:30:15'],
      ['2024-06-30T23:30:15+0200', '30.06.24, 23:30:15'],
      ['2024-12-31T23:30Z', '01.01.25, 00:30'],
      ['2024-12-31T23:30:15.123', '31.12.24, 23:30:15'],
      ['2024-12-31T23:30:15', '31.12.24, 23:30:15'],
      ['2024-12-31T23:30', '31.12.24, 23:30'],
      ['2024-12-31Z', '31.12.24'],
      ['2024-12-31+05:00', '30.12.24'],
      ['2024-12-31', '31.12.24'],
      ['23:30:15.123Z', '00:30:15'],
      ['23:30:15Z', '00:30:15'],
      ['23:30Z', '00:30'],
      ['23:30:15.123', '23:30:15'],
      ['23:30:15', '23:30:15'],
      ['23:30', '23:30'],
      ['2024-12', 'Dezember 2024'],
      ['2024', '2024'],
    ];
    expect(cases.map(([value]) => [value, text(value, DATE)])).toEqual(cases);
  });

  it('reads the zone forms ICU accepts', () => {
    expect(text('2024-12-31T23:30:15-08:00', DATE)).toBe('01.01.25, 08:30:15');
    expect(text('2024-12-31T23:30:15+01', DATE)).toBe('31.12.24, 23:30:15');
    expect(text('2024-12-31T23:30:15.123+1', DATE)).toBe('31.12.24, 23:30:15');
    expect(text('2024-12-31T23:30:15GMT+01:00', DATE)).toBe('31.12.24, 23:30:15');
    expect(text('2024-12-31T23:30:15 +01:00', DATE)).toBe('31.12.24, 23:30:15');
    expect(text('2024-12-31T23:30:15UTC', DATE)).toBe('01.01.25, 00:30:15');
    expect(text('2024-12-31T23:30:15.123z', DATE)).toBe('01.01.25, 00:30:15');
  });

  it("copies ICU's leniency: short fields, day overflow, hour 24, surrounding spaces", () => {
    expect(text('2024-1-5', DATE)).toBe('05.01.24');
    expect(text('2024-12-31T1:2:3', DATE)).toBe('31.12.24, 01:02:03');
    expect(text('2024-02-30', DATE)).toBe('01.03.24');
    expect(text('2023-02-29', DATE)).toBe('01.03.23');
    expect(text('24:00', DATE)).toBe('00:00');
    expect(text('2024-12-31T24:00', DATE)).toBe('01.01.25, 00:00');
    expect(text(' 2024-12-31 ', DATE)).toBe('31.12.24');
    expect(text('2024-12-31T23:30:15.123456Z', DATE)).toBe('01.01.25, 00:30:15');
  });

  it('shows a value that does not parse as written', () => {
    for (const value of ['31.12.2024', '2024-13-01', '2024-12-32', '2024-12-00', '25:00', '23:60', '2024-12-31t23:30', '2024-12-31x', '2024-W01', '']) {
      expect(text(value, DATE)).toBe(value);
    }
  });

  it("uses the device's time zone only when the value has a zone", () => {
    const newYork = { ...ZURICH, timeZone: 'America/New_York' };
    expect(text('2024-06-30T23:30:15Z', DATE)).toBe('01.07.24, 01:30:15');
    expect(text('2024-06-30T23:30:15Z', DATE, newYork)).toBe('30.06.24, 19:30:15');
    expect(text('2024-06-30T23:30:15', DATE)).toBe('30.06.24, 23:30:15');
    expect(text('2024-06-30T23:30:15', DATE, newYork)).toBe('30.06.24, 23:30:15');
  });

  it('puts a time without a date on 1 January 2000, so winter offsets apply', () => {
    expect(text('23:30Z', DATE)).toBe('00:30');
    expect(text('23:30+05:30', DATE)).toBe('19:00');
  });

  it('uses the short date style of the locale', () => {
    expect(text('2024-12-31', DATE)).toBe('31.12.24');
    expect(text('2024-12-31', DATE, { locale: 'fr-CH' })).toBe('31.12.24');
    expect(text('2024-12-31', DATE, { locale: 'it-CH' })).toBe('31.12.24');
    expect(text('2024-12-31', DATE, { locale: 'rm' })).toBe('31-12-24');
    expect(text('2024-12-31', DATE, { locale: 'en' })).toBe('12/31/24');
    expect(text('2024-12-31T23:30:15Z', DATE, { locale: 'fr-CH', timeZone: 'Europe/Zurich' })).toBe('01.01.25 00:30:15');
    // Foundation writes a narrow no-break space before AM; some browsers write a plain space.
    expect(text('2024-12-31T23:30:15Z', DATE, { locale: 'en', timeZone: 'Europe/Zurich' })).toMatch(/^1\/1\/25, 12:30:15[  ]AM$/);
  });

  it('shows year-month as MMMM yyyy and a year as yyyy', () => {
    expect(text('2024-07', DATE)).toBe('Juli 2024');
    expect(text('2024-12', DATE, { locale: 'fr-CH' })).toBe('décembre 2024');
    expect(text('2024-03', DATE, { locale: 'it-CH' })).toBe('marzo 2024');
    expect(text('2024-12', DATE, { locale: 'rm' })).toBe('da december 2024');
    expect(text('2024', DATE)).toBe('2024');
    expect(text('99', DATE)).toBe('0099');
    expect(text('12345', DATE)).toBe('12345');
  });

  it('reads epoch seconds for the POSIX standard and shows a full date and time in the device zone', () => {
    expect(text(1735687815, EPOCH)).toBe('01.01.25, 00:30:15');
    expect(text('1735687815.9', EPOCH)).toBe('01.01.25, 00:30:15');
    expect(text(-1, EPOCH)).toBe('01.01.70, 00:59:59');
    expect(text(0, EPOCH)).toBe('01.01.70, 01:00:00');
    expect(text('1e9', EPOCH)).toBe('09.09.01, 03:46:40');
    expect(text('+5', EPOCH)).toBe('01.01.70, 01:00:05');
    expect(text(1735687815, EPOCH, { locale: 'de-CH', timeZone: 'America/New_York' })).toBe('31.12.24, 18:30:15');
    expect(text(1735687815, EPOCH, { locale: 'en', timeZone: 'Europe/Zurich' })).toMatch(/^1\/1\/25, 12:30:15[  ]AM$/);
    expect(text(1735687815, typed('DateTime', { standard: 'urn:iso:std:iso-iec-ieee:9945:2009' }))).toBe('01.01.25, 00:30:15');
  });

  it('shows epoch text that is not a number as written, and reads a number without the standard as ISO', () => {
    expect(text('abc', EPOCH)).toBe('abc');
    expect(text('1735687815 ', EPOCH)).toBe('1735687815 ');
    expect(text(1735687815, DATE)).toBe('1735687815');
  });
});

describe('images', () => {
  it('draws a PNG or JPEG data URL for the data URL standard', () => {
    expect(show(`data:image/png;base64,${PNG}`, DATA_URL)).toEqual({ kind: 'image', mediaType: 'image/png', base64: PNG, src: `data:image/png;base64,${PNG}` });
    expect(show(`data:image/jpeg;base64,${JPEG}`, DATA_URL)).toMatchObject({ kind: 'image', mediaType: 'image/jpeg', base64: JPEG });
  });

  it('shows any other data URL as text', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    expect(show(svg, DATA_URL)).toEqual({ kind: 'text', text: svg });
    expect(show(`data:image/png;charset=utf-8;base64,${PNG}`, DATA_URL).kind).toBe('text');
    expect(show(`data:image/jpg;base64,${JPEG}`, DATA_URL).kind).toBe('text');
  });

  it('draws base64 Binary with a PNG or JPEG format', () => {
    expect(show(PNG, PNG_BINARY)).toMatchObject({ kind: 'image', mediaType: 'image/png', base64: PNG });
    expect(show(JPEG, typed('Binary', { format: 'image/jpeg', characterEncoding: 'BASE64' }))).toMatchObject({ kind: 'image', mediaType: 'image/jpeg' });
  });

  it('shows other Binary as text', () => {
    expect(show(PNG, typed('Binary'))).toEqual({ kind: 'text', text: PNG });
    expect(show(PNG, typed('Binary', { format: 'image/png', characterEncoding: 'utf-8' }))).toEqual({ kind: 'text', text: PNG });
    expect(show(PNG, typed('Binary', { format: 'image/gif', characterEncoding: 'base64' }))).toEqual({ kind: 'text', text: PNG });
  });

  it('marks an image the wallet rejects, which makes it refuse the credential', () => {
    expect(show(JPEG, PNG_BINARY)).toEqual({ kind: 'invalidImage', mediaType: 'image/png', reason: 'mismatchingFormat' });
    expect(show(`data:image/jpeg;base64,${PNG}`, DATA_URL)).toEqual({ kind: 'invalidImage', mediaType: 'image/jpeg', reason: 'mismatchingFormat' });
    expect(show('iVBORw0KGgo=', PNG_BINARY)).toMatchObject({ reason: 'mismatchingFormat' });
    expect(show(`${PNG}\n`, PNG_BINARY)).toMatchObject({ reason: 'invalidData' });
    expect(show('iVBORw0KGgoAAAA', PNG_BINARY)).toMatchObject({ reason: 'invalidData' });
    // A Binary image whose value is a data URL that is not an image: the whole URL is checked as base64.
    expect(show('data:text/plain,hello', { ...PNG_BINARY, standard: 'urn:ietf:rfc:2397' })).toMatchObject({ reason: 'invalidData' });
  });
});

describe('long values, entries and placeholders', () => {
  it('cuts text over 1800 characters and ends it with …', () => {
    expect(text('a'.repeat(MAX_VALUE_LENGTH), typed('Text'))).toBe('a'.repeat(MAX_VALUE_LENGTH));
    expect(text('a'.repeat(MAX_VALUE_LENGTH + 1), typed('Text'))).toBe(`${'a'.repeat(MAX_VALUE_LENGTH)}…`);
    expect(text('a'.repeat(5000))).toBe(`${'a'.repeat(MAX_VALUE_LENGTH)}…`);
  });

  it('counts characters as Swift does, by grapheme cluster', () => {
    const thumb = '👍🏽';
    expect(text(thumb.repeat(MAX_VALUE_LENGTH))).toBe(thumb.repeat(MAX_VALUE_LENGTH));
    expect(text(thumb.repeat(MAX_VALUE_LENGTH + 1))).toBe(`${thumb.repeat(MAX_VALUE_LENGTH)}…`);
  });

  it('shows the entry label, cut like any text', () => {
    expect(formatClaimValue({ kind: 'entry', code: 'F', label: 'Weiblich' }, typed('Text'), ZURICH)).toEqual({ kind: 'text', text: 'Weiblich' });
    const long = 'b'.repeat(MAX_VALUE_LENGTH + 10);
    expect(formatClaimValue({ kind: 'entry', code: 'X', label: long }, typed('Text'), ZURICH)).toEqual({ kind: 'text', text: `${'b'.repeat(MAX_VALUE_LENGTH)}…` });
  });

  it('passes the no-sample placeholder through', () => {
    expect(formatClaimValue({ kind: 'placeholder', type: 'DateTime' }, DATE, ZURICH)).toEqual({ kind: 'placeholder', type: 'DateTime' });
  });

  it('formats with the first device language, else English', () => {
    expect(walletLocale(['fr-CH', 'de-CH'])).toBe('fr-CH');
    expect(walletLocale([])).toBe('en');
  });
});

describe('with the details model', () => {
  function project() {
    const p = emptyProject(['de']);
    const born = newAttribute('born', { type: 'DateTime', labels: { de: 'Geboren' } });
    const photo = newAttribute('photo', { type: 'Binary' });
    const scores = newAttribute('scores', { type: { array: 'Numeric' } });
    p.root.children.push(born, photo, scores);
    p.root.passthrough.push(
      { type: 'spec/overlays/format/1.0', capture_base: '', attribute_formats: { photo: 'image/png', born: 'YYYY-MM-DD' } },
      { type: 'spec/overlays/character_encoding/1.0', capture_base: '', default_character_encoding: 'utf-8', attribute_character_encoding: { photo: 'base64' } },
    );
    p.sample = { born: '1990-05-17', photo: PNG, scores: [1234.5, 1e-5, true] };
    return p;
  }

  const claims = (p = project()) =>
    credentialDetails(p, { languages: ['de'], platform: 'ios' }).sections.flatMap((section) =>
      section.rows.flatMap((row) => (row.kind === 'claim' ? [row] : row.rows.filter((child): child is DetailsClaim => child.kind === 'claim'))),
    );

  it('carries the Format and Character Encoding overlays into the row format', () => {
    const [born, photo] = claims();
    expect(born.format).toEqual({ type: 'DateTime', format: 'YYYY-MM-DD', characterEncoding: 'utf-8' });
    expect(photo.format).toEqual({ type: 'Binary', format: 'image/png', characterEncoding: 'base64' });
  });

  it('formats rows end to end; array elements have no attribute, so they stay plain', () => {
    expect(claims().map((claim) => formatClaim(claim, ZURICH))).toEqual([
      { kind: 'text', text: '17.05.90' },
      { kind: 'image', mediaType: 'image/png', base64: PNG, src: `data:image/png;base64,${PNG}` },
      { kind: 'text', text: '1234.5' },
      { kind: 'text', text: '1e-05' },
      { kind: 'text', text: '1' },
    ]);
  });
});
