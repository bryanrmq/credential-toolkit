import { useStore } from '../../state/store';

/** The tree actions the keyboard reaches; ⌘ is Ctrl on Windows and Linux. */
export type TreeShortcut = 'add' | 'delete' | 'edit' | 'group' | 'ungroup' | 'moveUp' | 'moveDown';

/** The tree action `event` asks for: N, ⌫ / Delete, ⏎, ⌘G, ⇧⌘G, ⌥↑ and ⌥↓. */
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
  return null;
}

const APPLE_KEYS: Record<TreeShortcut, string> = {
  add: 'N',
  delete: '⌫',
  edit: '⏎',
  group: '⌘G',
  ungroup: '⇧⌘G',
  moveUp: '⌥↑',
  moveDown: '⌥↓',
};
const OTHER_KEYS: Record<TreeShortcut, string> = {
  add: 'N',
  delete: 'Del',
  edit: 'Enter',
  group: 'Ctrl+G',
  ungroup: 'Ctrl+Shift+G',
  moveUp: 'Alt+↑',
  moveDown: 'Alt+↓',
};

/** Whether the browser runs on a Mac, iPhone or iPad, where ⌘ and ⌥ are the modifier keys. */
export function isApplePlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/** How menus show the key of `shortcut`: ⌘G on Apple platforms, Ctrl+G elsewhere. */
export function treeShortcutLabel(shortcut: TreeShortcut, apple = isApplePlatform()): string {
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
