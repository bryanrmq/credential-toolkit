import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/*
 * What makes a dialog modal: focus moves in when it opens and stays in, Escape closes it, the page
 * behind it is `inert`, and focus goes back to the control that opened it.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');
const FIELD = 'input, select, textarea';

/** The elements Tab reaches inside `root`, in order. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.closest('[hidden], [inert]'));
}

/** Where focus goes when the dialog opens: the `data-autofocus` element, else the first field, else the first control, else the dialog. */
function initialFocus(dialog: HTMLElement): HTMLElement {
  const marked = dialog.querySelector<HTMLElement>('[data-autofocus]');
  if (marked) return marked;
  const reachable = focusables(dialog);
  return reachable.find((element) => element.matches(FIELD)) ?? reachable[0] ?? dialog;
}

/** Sets `inert` on everything outside `element`, up to the body; returns what it set, to undo it. */
function inertOutside(element: HTMLElement): HTMLElement[] {
  const set: HTMLElement[] = [];
  for (let node: HTMLElement = element; node.parentElement && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.hasAttribute('inert')) continue;
      sibling.setAttribute('inert', '');
      set.push(sibling);
    }
  }
  return set;
}

/** The open modals, the newest last: only the newest answers Tab and Escape. */
const stack: HTMLElement[] = [];

/**
 * Makes `dialogRef` (with `tabIndex={-1}`) a modal while it is mounted. `outsideRef` is the layer that
 * stays clickable (the backdrop); without it the dialog itself. Escape calls `onClose`, unless something
 * inside (a menu) already took the key.
 */
export function useModal(dialogRef: RefObject<HTMLElement | null>, onClose: () => void, outsideRef?: RefObject<HTMLElement | null>) {
  // Where focus was when the dialog opened: it goes back there when the dialog closes.
  const [opener] = useState(() => document.activeElement);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const inerted = inertOutside(outsideRef?.current ?? dialog);
    stack.push(dialog);
    if (!dialog.contains(document.activeElement)) initialFocus(dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== dialog || event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      } else if (event.key === 'Tab') {
        const reachable = focusables(dialog);
        const first = reachable[0];
        const last = reachable[reachable.length - 1];
        const active = document.activeElement;
        const inside = active instanceof HTMLElement && active !== dialog && dialog.contains(active);
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (event.shiftKey && (!inside || active === first)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (!inside || active === last)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      stack.splice(stack.indexOf(dialog), 1);
      for (const element of inerted) element.removeAttribute('inert');
      // Unless something else took focus on the way out (or the opener went with the dialog, like the start screen).
      const active = document.activeElement;
      const lost = !active || active === document.body || dialog.contains(active);
      if (lost && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [dialogRef, outsideRef, opener]);
}
