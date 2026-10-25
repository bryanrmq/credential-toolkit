import { useSyncExternalStore } from 'react';

/** The window width at which the workspace shows one pane at a time; keep in step with `src/ui/styles/`. */
export const NARROW_QUERY = '(max-width: 1000px)';

/** Whether the window shows the panes side by side. True where `matchMedia` is missing, as in tests. */
export function isWideWindow(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' || !window.matchMedia(NARROW_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** `isWideWindow()`, kept current as the window is resized. */
export function useWideWindow(): boolean {
  return useSyncExternalStore(subscribe, isWideWindow, () => true);
}
