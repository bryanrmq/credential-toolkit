export type ResizablePane = 'structure' | 'output';
export type PaneWidths = Record<ResizablePane, number>;

export const PANE_LAYOUT_KEY = 'oca-generator:pane-widths';
export const DEFAULT_PANE_WIDTHS: PaneWidths = { structure: 300, output: 420 };
export const PANE_LIMITS: Record<ResizablePane, [min: number, max: number]> = { structure: [220, 520], output: [300, 720] };
/** Room the Edit pane always keeps, and the width of the two resize handles together. */
const EDIT_PANE_MIN = 420;
const HANDLES_WIDTH = 10;

/**
 * Clamps a pane width to its limits and, when the window width is known, to the room left once
 * the other side pane and the Edit pane's minimum are taken (never below the pane's own minimum).
 */
export function clampPaneWidth(pane: ResizablePane, width: number, room?: { container: number; other: number }): number {
  const [min, max] = PANE_LIMITS[pane];
  const roomMax = room && room.container > 0 ? room.container - room.other - EDIT_PANE_MIN - HANDLES_WIDTH : max;
  return Math.round(Math.max(min, Math.min(width, max, roomMax)));
}

export function loadPaneWidths(): PaneWidths {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PANE_LAYOUT_KEY) ?? 'null');
    if (typeof stored !== 'object' || stored === null) return { ...DEFAULT_PANE_WIDTHS };
    const { structure, output } = stored as Record<string, unknown>;
    if (typeof structure !== 'number' || typeof output !== 'number') return { ...DEFAULT_PANE_WIDTHS };
    return { structure: clampPaneWidth('structure', structure), output: clampPaneWidth('output', output) };
  } catch {
    return { ...DEFAULT_PANE_WIDTHS };
  }
}

export function savePaneWidths(widths: PaneWidths): void {
  try {
    localStorage.setItem(PANE_LAYOUT_KEY, JSON.stringify(widths));
  } catch {
    // Storage may be unavailable or full; the layout then lasts until the page is closed.
  }
}
