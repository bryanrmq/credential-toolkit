import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from '../../state/store';
import { usesCommandKey } from './platform';
import { isWideWindow } from './wideWindow';

/**
 * Whether `event` is ⌥⌘B / Ctrl+Alt+B, which shows or hides the Output pane (as it toggles VS Code's
 * secondary side bar). Matched by the physical key, since ⌥ changes `key` on a Mac; AltGr, which
 * types characters on many layouts, is left alone.
 */
export function isOutputToggle(event: KeyboardEvent): boolean {
  return (
    !event.isComposing &&
    (event.metaKey || event.ctrlKey) &&
    event.altKey &&
    !event.shiftKey &&
    event.code === 'KeyB' &&
    !event.getModifierState?.('AltGraph')
  );
}

/** How copy shows the Output key: ⌥⌘B on Apple platforms, Ctrl+Alt+B elsewhere. */
export function outputShortcutLabel(apple = usesCommandKey()): string {
  return apple ? '⌥⌘B' : 'Ctrl+Alt+B';
}

/**
 * Calls `toggle` on ⌥⌘B / Ctrl+Alt+B from anywhere in the workspace. It does nothing on a narrow window,
 * where Output is one of the pane tabs, or while a dialog or the tour is open.
 */
export function useOutputShortcut(toggle: () => void): void {
  const toggleRef = useRef(toggle);
  useLayoutEffect(() => {
    toggleRef.current = toggle;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isOutputToggle(event) || !isWideWindow()) return;
      if (useStore.getState().tourOpen || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      toggleRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
