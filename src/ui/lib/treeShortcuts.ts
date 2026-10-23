import { useStore } from '../../state/store';

/*
 * When the workspace's shortcuts may run. The keys themselves are in the command list (`commands.ts`).
 */

/** Whether the tour or a dialog is open: no shortcut runs then, and the keys keep the browser's behaviour. */
export function overlayOpen(): boolean {
  return useStore.getState().tourOpen || !!document.querySelector('[role="dialog"][aria-modal="true"]');
}

/** Whether the tree's shortcuts and right-click menus may run at all: on wide windows, with no tour or dialog open. */
export function treeActionsAvailable(wide: boolean): boolean {
  return wide && !overlayOpen();
}

/**
 * Whether the tree shortcuts may run for a key pressed on `target`: only on a tree row (never while
 * typing in a field), and only while `treeActionsAvailable`.
 */
export function treeShortcutsActive(target: EventTarget, wide: boolean): boolean {
  if (!treeActionsAvailable(wide)) return false;
  return target instanceof HTMLElement && target.getAttribute('role') === 'treeitem';
}
