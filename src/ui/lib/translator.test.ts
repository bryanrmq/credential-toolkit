import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasTranslator, translator, translatorLanguage } from './translator';

afterEach(() => vi.unstubAllGlobals());

describe('the Translator adapter', () => {
  it('finds no translator where the browser has no Translator API', () => {
    vi.stubGlobal('Translator', undefined);
    expect(hasTranslator()).toBe(false);
    expect(translator()).toBeUndefined();
    vi.stubGlobal('Translator', { availability: 'no' });
    expect(hasTranslator()).toBe(false);
  });

  it('asks for the languages without their region', async () => {
    const availability = vi.fn(async () => 'downloadable');
    vi.stubGlobal('Translator', { availability, create: vi.fn() });
    expect(hasTranslator()).toBe(true);
    expect(await translator()!.availability('de-CH', 'fr-CH')).toBe('downloadable');
    expect(availability).toHaveBeenCalledWith({ sourceLanguage: 'de', targetLanguage: 'fr' });
    expect(translatorLanguage('rm-CH')).toBe('rm');
  });

  it('takes an unknown answer or a language the browser rejects as unavailable', async () => {
    vi.stubGlobal('Translator', { availability: vi.fn(async () => 'maybe'), create: vi.fn() });
    expect(await translator()!.availability('de-CH', 'fr-CH')).toBe('unavailable');
    vi.stubGlobal('Translator', { availability: vi.fn().mockRejectedValue(new RangeError('bad tag')), create: vi.fn() });
    expect(await translator()!.availability('de-CH', 'xx')).toBe('unavailable');
  });

  it('creates a translator for the pair and reports the download progress', async () => {
    const destroy = vi.fn();
    const create = vi.fn(async ({ monitor }: { monitor: (target: EventTarget) => void }) => {
      const target = new EventTarget();
      monitor(target);
      target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 0.25 }));
      return { translate: async (text: string) => `fr:${text}`, destroy };
    });
    vi.stubGlobal('Translator', { availability: vi.fn(), create });
    const progress: number[] = [];
    const created = await translator()!.create('de-CH', 'fr-CH', (loaded) => progress.push(loaded));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'de', targetLanguage: 'fr' }));
    expect(progress).toEqual([0.25]);
    expect(await created.translate('Name')).toBe('fr:Name');
    created.destroy();
    expect(destroy).toHaveBeenCalled();
  });
});
