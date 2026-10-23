import { describe, expect, it } from 'vitest';
import { IOS_DETAILS_TEXT, IOS_STATUS_STYLE, iosAppLanguage, iosStatusText } from './detailsChrome';
import { iosLanguageCodes } from './details';

describe('iOS details texts', () => {
  it('picks the first device language the app is translated into, else English', () => {
    expect(iosAppLanguage(iosLanguageCodes(['fr-CH']))).toBe('fr');
    expect(iosAppLanguage(iosLanguageCodes(['ja-JP', 'rm-CH']))).toBe('rm');
    expect(iosAppLanguage(iosLanguageCodes(['ja-JP']))).toBe('en');
  });

  it('writes the status, with the day for a credential that is not yet valid', () => {
    const de = IOS_DETAILS_TEXT.de;
    expect(iosStatusText('invalid', de, new Date(), 'de-CH')).toBe('Abgelaufen');
    expect(iosStatusText('suspended', IOS_DETAILS_TEXT.en, new Date(), 'en')).toBe('Currently blocked');
    // Only translated into English, so every language shows it; the date follows the device locale.
    expect(iosStatusText('notYetValid', de, new Date(2026, 9, 24), 'de-CH')).toBe('Valid on 24.10.2026');
    expect(iosStatusText('notYetValid', IOS_DETAILS_TEXT.en, new Date(2026, 9, 24), 'en-US')).toBe('Valid on 10/24/2026');
  });

  it('colours valid green, invalid states red and the rest blue', () => {
    expect(IOS_STATUS_STYLE).toEqual({ valid: 'success', invalid: 'error', revoked: 'error', suspended: 'error', notYetValid: 'info', unknown: 'info' });
  });
});
