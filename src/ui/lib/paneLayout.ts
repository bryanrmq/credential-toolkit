/** The pane a narrow window shows (below 1000 px only one fits). */
export type WorkspacePane = 'structure' | 'inspector' | 'output';
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

export const ISSUES_HEIGHT_KEY = 'oca-generator:issues-height';
export const DEFAULT_ISSUES_HEIGHT = 200;
export const ISSUES_HEIGHT_LIMITS: [min: number, max: number] = [96, 640];
/** Height the panes above the Issues panel always keep. */
const PANES_MIN_HEIGHT = 160;

/**
 * Clamps the height of the Issues panel's list to its limits and, when the room is known (the panes' height plus
 * the list's own), to what is left once the panes keep their minimum (never below the list's own minimum).
 */
export function clampIssuesHeight(height: number, room?: number): number {
  const [min, max] = ISSUES_HEIGHT_LIMITS;
  const roomMax = room && room > 0 ? room - PANES_MIN_HEIGHT : max;
  return Math.round(Math.max(min, Math.min(height, max, roomMax)));
}

export function loadIssuesHeight(): number {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(ISSUES_HEIGHT_KEY) ?? 'null');
    return typeof stored === 'number' ? clampIssuesHeight(stored) : DEFAULT_ISSUES_HEIGHT;
  } catch {
    return DEFAULT_ISSUES_HEIGHT;
  }
}

export function saveIssuesHeight(height: number): void {
  try {
    localStorage.setItem(ISSUES_HEIGHT_KEY, JSON.stringify(height));
  } catch {
    // Storage may be unavailable or full; the height then lasts until the page is closed.
  }
}
