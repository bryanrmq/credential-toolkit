import { create } from 'zustand';

export const IDENTIFIERS_OPEN_KEY = 'oca-generator:issuer-identifiers-open';

/** Whether the Issuer section's "Identifiers" disclosure was left open; collapsed unless the user opened it. */
export function loadIdentifiersOpen(): boolean {
  try {
    return localStorage.getItem(IDENTIFIERS_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * The open state of the "Identifiers" disclosure, shared so an issue jump can open it before focusing one of
 * its inputs. Read once per page load; `setIdentifiersOpen` remembers each change.
 */
export const useIdentifiersOpen = create<{ open: boolean }>(() => ({ open: loadIdentifiersOpen() }));

export function setIdentifiersOpen(open: boolean): void {
  useIdentifiersOpen.setState({ open });
  try {
    localStorage.setItem(IDENTIFIERS_OPEN_KEY, String(open));
  } catch {
    // Storage may be unavailable or full; the disclosure then keeps its state until the page is closed.
  }
}
