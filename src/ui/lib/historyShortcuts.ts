import { useEffect } from 'react';
import { endTyping, useStore } from '../../state/store';
import { usesCommandKey } from './platform';

/** The history action `event` asks for: ⌘Z / Ctrl+Z undoes, with Shift it redoes. */
export function historyAction(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return null;
  return event.shiftKey ? 'redo' : 'undo';
}

/** How copy shows the undo key: ⌘Z on Apple platforms, Ctrl+Z elsewhere. */
export function undoShortcutLabel(apple = usesCommandKey()): string {
  return apple ? '⌘Z' : 'Ctrl+Z';
}

/**
 * Undo and redo of project edits from anywhere in the workspace, text fields included: their inputs are
 * controlled, so the browser's own text undo is unreliable there. While a dialog or the tour is open the
 * keys do nothing here and keep the browser's behaviour. Leaving a field ends its typing step.
 */
export function useHistoryShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = historyAction(event);
      if (!action || useStore.getState().tourOpen || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      useStore.getState()[action]();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusout', endTyping);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusout', endTyping);
    };
  }, []);
}
