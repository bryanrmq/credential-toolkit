// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PANE_WIDTHS, PANE_LAYOUT_KEY, clampPaneWidth, loadPaneWidths, savePaneWidths } from './paneLayout';

beforeEach(() => localStorage.clear());

describe('pane widths', () => {
  it('falls back to the defaults when nothing usable is stored', () => {
    expect(loadPaneWidths()).toEqual(DEFAULT_PANE_WIDTHS);
    localStorage.setItem(PANE_LAYOUT_KEY, 'not json');
    expect(loadPaneWidths()).toEqual(DEFAULT_PANE_WIDTHS);
    localStorage.setItem(PANE_LAYOUT_KEY, '{"structure":"wide"}');
    expect(loadPaneWidths()).toEqual(DEFAULT_PANE_WIDTHS);
  });

  it('saves and restores widths, clamped to the limits', () => {
    savePaneWidths({ structure: 360, output: 500 });
    expect(loadPaneWidths()).toEqual({ structure: 360, output: 500 });
    localStorage.setItem(PANE_LAYOUT_KEY, '{"structure":5000,"output":10}');
    expect(loadPaneWidths()).toEqual({ structure: 520, output: 300 });
  });

  it('clamps one pane to its limits and to the room the window leaves', () => {
    expect(clampPaneWidth('structure', 100)).toBe(220);
    expect(clampPaneWidth('output', 900)).toBe(720);
    // 1200 px window, output 420 px, edit pane needs 420 px: structure can take at most 360 px.
    expect(clampPaneWidth('structure', 500, { container: 1200, other: 420 })).toBe(350);
  });
});
