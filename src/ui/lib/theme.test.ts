// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../../index.html?raw';
import { THEME_KEY, loadTheme, setTheme, useTheme } from './theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme', () => {
  it('is System until one is chosen', () => {
    expect(loadTheme()).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('sets data-theme and keeps a chosen Light or Dark', () => {
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(useTheme.getState().theme).toBe('dark');
    expect(loadTheme()).toBe('dark');
    setTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(loadTheme()).toBe('light');
  });

  it('forgets the choice and follows the OS again on System', () => {
    setTheme('dark');
    setTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(useTheme.getState().theme).toBe('system');
  });

  it('ignores an unknown stored value, unreadable storage and a failed save', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(loadTheme()).toBe('system');
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadTheme()).toBe('system');
    expect(() => setTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    get.mockRestore();
    set.mockRestore();
  });

  it('is applied by index.html before first paint, from the same key', () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
    expect(html.indexOf(script)).toBeLessThan(html.indexOf('/src/main.tsx'));
    expect(script).toContain(`'${THEME_KEY}'`);
    for (const stored of ['dark', 'light', 'sepia']) {
      localStorage.setItem(THEME_KEY, stored);
      delete document.documentElement.dataset.theme;
      new Function(script)();
      expect(document.documentElement.dataset.theme).toBe(stored === 'sepia' ? undefined : stored);
    }
  });
});
