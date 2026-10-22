import { useStore } from '../../state/store';

/** The tree actions the keyboard reaches; ⌘ is Ctrl on Windows and Linux. */
export type TreeShortcut = 'add' | 'delete' | 'edit' | 'rename' | 'group' | 'ungroup' | 'moveUp' | 'moveDown';

/** The tree action `event` asks for: N, ⌫ / Delete, ⏎, F2, ⌘G, ⇧⌘G, ⌥↑ and ⌥↓. */
export function treeShortcut(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'isComposing'>): TreeShortcut | null {
  if (event.isComposing) return null;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod) return !event.altKey && key === 'g' ? (event.shiftKey ? 'ungroup' : 'group') : null;
  if (event.altKey) {
    if (event.shiftKey) return null;
    return event.key === 'ArrowUp' ? 'moveUp' : event.key === 'ArrowDown' ? 'moveDown' : null;
  }
  if (event.shiftKey) return null;
  if (key === 'n') return 'add';
  if (event.key === 'Backspace' || event.key === 'Delete') return 'delete';
  if (event.key === 'Enter') return 'edit';
  if (event.key === 'F2') return 'rename';
  return null;
}

/**
 * Whether the tree shortcuts may run for a key pressed on `target`: only on a tree row (never while
 * typing in a field), only on wide windows, and never while the tour or a dialog is open.
 */
export function treeShortcutsActive(target: EventTarget, wide: boolean): boolean {
  if (!wide || useStore.getState().tourOpen || document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
  return target instanceof HTMLElement && target.getAttribute('role') === 'treeitem';
}
