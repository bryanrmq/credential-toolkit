import { useStore } from '../../state/store';
import { usesCommandKey } from './platform';

/** The tree actions the keyboard reaches; ⌘ is Ctrl on Windows and Linux. */
export type TreeShortcut = 'add' | 'delete' | 'edit' | 'rename' | 'duplicate' | 'group' | 'ungroup' | 'moveUp' | 'moveDown' | 'filter';

/** ⌘C, ⌘X and ⌘V: they run from the browser's copy, cut and paste events, not from `treeShortcut`. */
export type ClipboardShortcut = 'copy' | 'cut' | 'paste';

/** The tree action `event` asks for: N, ⌫ / Delete, ⏎, F2, ⌘D, ⌘G, ⇧⌘G, ⌘F, ⌥↑ and ⌥↓. */
export function treeShortcut(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'isComposing'>): TreeShortcut | null {
  if (event.isComposing) return null;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod) {
    if (event.altKey) return null;
    if (key === 'g') return event.shiftKey ? 'ungroup' : 'group';
    if (event.shiftKey) return null;
    return key === 'd' ? 'duplicate' : key === 'f' ? 'filter' : null;
  }
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

const APPLE_KEYS: Record<TreeShortcut | ClipboardShortcut, string> = {
  add: 'N',
  delete: '⌫',
  edit: '⏎',
  rename: 'F2',
  duplicate: '⌘D',
  group: '⌘G',
  ungroup: '⇧⌘G',
  moveUp: '⌥↑',
  moveDown: '⌥↓',
  copy: '⌘C',
  cut: '⌘X',
  paste: '⌘V',
  filter: '⌘F',
};
const OTHER_KEYS: Record<TreeShortcut | ClipboardShortcut, string> = {
  add: 'N',
  delete: 'Del',
  edit: 'Enter',
  rename: 'F2',
  duplicate: 'Ctrl+D',
  group: 'Ctrl+G',
  ungroup: 'Ctrl+Shift+G',
  moveUp: 'Alt+↑',
  moveDown: 'Alt+↓',
  copy: 'Ctrl+C',
  cut: 'Ctrl+X',
  paste: 'Ctrl+V',
  filter: 'Ctrl+F',
};

/** How menus show the key of `shortcut`: ⌘G on Apple platforms, Ctrl+G elsewhere. */
export function treeShortcutLabel(shortcut: TreeShortcut | ClipboardShortcut, apple = usesCommandKey()): string {
  return (apple ? APPLE_KEYS : OTHER_KEYS)[shortcut];
}

/** Whether the tree's shortcuts and right-click menus may run at all: on wide windows, with no tour or dialog open. */
export function treeActionsAvailable(wide: boolean): boolean {
  return wide && !useStore.getState().tourOpen && !document.querySelector('[role="dialog"][aria-modal="true"]');
}

/**
 * Whether the tree shortcuts may run for a key pressed on `target`: only on a tree row (never while
 * typing in a field), and only while `treeActionsAvailable`.
 */
export function treeShortcutsActive(target: EventTarget, wide: boolean): boolean {
  if (!treeActionsAvailable(wide)) return false;
  return target instanceof HTMLElement && target.getAttribute('role') === 'treeitem';
}
