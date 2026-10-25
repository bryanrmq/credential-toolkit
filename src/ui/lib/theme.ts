import { create } from 'zustand';

/** The same key the inline script in index.html reads before first paint; keep the two in step. */
export const THEME_KEY = 'credential-toolkit:theme';

/** System follows the OS (`prefers-color-scheme`); Light and Dark override it. */
export type Theme = 'system' | 'light' | 'dark';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

/** The theme this browser chose. System when none was chosen or storage is unreadable. */
export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Sets `data-theme` on `<html>`, which the dark tokens in styles/tokens.css key on. System removes it. */
export function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export const useTheme = create<{ theme: Theme }>(() => ({ theme: loadTheme() }));

/** Applies `theme` at once and keeps it for the next visit. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  useTheme.setState({ theme });
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage may be unavailable or full; the theme then holds until the page closes.
  }
}
