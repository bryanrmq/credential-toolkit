import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { parseClipboard, pasteNodes, serializeNodes } from '../../core/clipboard';
import { type Selection, selectedIds } from '../../state/selection';
import { useStore } from '../../state/store';
import { filteredIds } from '../../state/treeView';
import { copyText } from './download';
import { type NodePlace, deleteNodes, newNodePlace } from './treeActions';
import { treeShortcutsActive } from './treeShortcuts';

/*
 * Copy, cut and paste of tree nodes through the system clipboard, as JSON text (`core/clipboard`), so
 * nodes travel between tabs and projects. ⌘C, ⌘X and ⌘V arrive as the browser's copy, cut and paste
 * events, which carry the clipboard without a permission prompt. The right-click menu has no such event
 * to read from, so its Paste offers the nodes this tab last copied, cut or pasted.
 */

/** The clipboard text this tab last wrote or pasted nodes from; null once something else is copied here. */
let lastNodes: string | null = null;

/** Forgets the nodes the menu's Paste would offer. */
export function forgetCopiedNodes(): void {
  lastNodes = null;
}

/** Whether the selection holds nodes to copy or cut. */
export function canCopySelection(selection: Selection = useStore.getState().selection): boolean {
  return selection.kind === 'node';
}

/**
 * Hands the clipboard text of the selected nodes to `write` and, for a cut, deletes them (one undo step;
 * the row after them is selected). Returns false, doing nothing, when no node is selected.
 */
function takeSelection(write: (text: string) => void, cut: boolean): boolean {
  const { project, selection } = useStore.getState();
  const text = project && selection.kind === 'node' ? serializeNodes(project, selectedIds(selection)) : undefined;
  if (!text) return false;
  write(text);
  lastNodes = text;
  if (cut) deleteNodes(selectedIds(selection));
  return true;
}

/** Copies the selected nodes to the clipboard (the menu's Copy). */
export function copySelection(): void {
  takeSelection((text) => void copyText(text), false);
}

/** Cuts the selected nodes to the clipboard (the menu's Cut). */
export function cutSelection(): void {
  takeSelection((text) => void copyText(text), true);
}

/**
 * Pastes the nodes in clipboard `text` at `place` (by default where N adds a node), as one undo step,
 * and selects the copies. A tree filter stays on while it shows every copy, and is cleared otherwise.
 * Returns false, changing nothing, for text that is not nodes from this app.
 */
export function pasteText(text: string, place?: NodePlace): boolean {
  const { project, selection, update, select, treeFilter, editLang, setTreeFilter } = useStore.getState();
  const nodes = project ? parseClipboard(text) : null;
  if (!project || !nodes) return false;
  const { groupId, index } = place ?? newNodePlace(project, selection);
  let ids: string[] = [];
  update((draft) => void (ids = pasteNodes(draft, nodes, groupId, index)));
  if (!ids.length) return false;
  lastNodes = text;
  const shown = filteredIds(useStore.getState().project!, treeFilter, editLang);
  if (shown && ids.some((id) => !shown.has(id))) setTreeFilter('');
  select({ kind: 'node', id: ids[0], ids });
  return true;
}

/** Whether the menu's Paste has nodes to paste. */
export function canPasteCopied(): boolean {
  return lastNodes !== null;
}

/** Pastes the nodes this tab last copied (the menu's Paste). */
export function pasteCopied(place?: NodePlace): void {
  if (lastNodes) pasteText(lastNodes, place);
}

/**
 * ⌘C, ⌘X and ⌘V (Ctrl on Windows and Linux) on the tree in `tree`: they act while one of its rows has
 * focus and `treeShortcutsActive` allows, never while typing in a field. `done` runs after a cut or paste.
 */
export function useTreeClipboard(tree: RefObject<HTMLElement | null>, wide: boolean, done: () => void): void {
  const doneRef = useRef(done);
  useLayoutEffect(() => {
    doneRef.current = done;
  });
  useEffect(() => {
    const active = () => {
      const focused = document.activeElement;
      return !!focused && !!tree.current?.contains(focused) && treeShortcutsActive(focused, wide);
    };
    // Cancelling the before- events tells the browser the page handles the command, with no text selected.
    const enable = (event: Event) => {
      if (active()) event.preventDefault();
    };
    const onCopy = (event: ClipboardEvent) => {
      if (!active()) {
        forgetCopiedNodes();
        return;
      }
      const data = event.clipboardData;
      const cut = event.type === 'cut';
      if (data && takeSelection((text) => data.setData('text/plain', text), cut)) {
        event.preventDefault();
        if (cut) doneRef.current();
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!active()) return;
      const text = event.clipboardData?.getData('text/plain');
      if (text && pasteText(text)) {
        event.preventDefault();
        doneRef.current();
      }
    };
    const listeners = [
      ['beforecopy', enable],
      ['beforecut', enable],
      ['beforepaste', enable],
      ['copy', onCopy],
      ['cut', onCopy],
      ['paste', onPaste],
    ] as [string, EventListener][];
    for (const [type, listener] of listeners) document.addEventListener(type, listener);
    return () => {
      for (const [type, listener] of listeners) document.removeEventListener(type, listener);
    };
  }, [tree, wide]);
}
