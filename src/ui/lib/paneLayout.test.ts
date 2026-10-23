// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ISSUES_HEIGHT,
  DEFAULT_PANE_WIDTHS,
  EDIT_PREVIEW_OPEN_KEY,
  ISSUES_HEIGHT_KEY,
  ISSUES_OPEN_KEY,
  OUTPUT_OPEN_KEY,
  PANE_LAYOUT_KEY,
  clampIssuesHeight,
  clampPaneWidth,
  loadEditPreviewOpen,
  loadIssuesHeight,
  loadIssuesOpen,
  loadOutputOpen,
  loadPaneWidths,
  saveEditPreviewOpen,
  saveIssuesHeight,
  saveIssuesOpen,
  saveOutputOpen,
  savePaneWidths,
} from './paneLayout';

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

describe('issues panel height', () => {
  it('falls back to the default when nothing usable is stored', () => {
    expect(loadIssuesHeight()).toBe(DEFAULT_ISSUES_HEIGHT);
    localStorage.setItem(ISSUES_HEIGHT_KEY, 'not json');
    expect(loadIssuesHeight()).toBe(DEFAULT_ISSUES_HEIGHT);
    localStorage.setItem(ISSUES_HEIGHT_KEY, '"tall"');
    expect(loadIssuesHeight()).toBe(DEFAULT_ISSUES_HEIGHT);
  });

  it('saves and restores the height, clamped to the limits', () => {
    saveIssuesHeight(320);
    expect(loadIssuesHeight()).toBe(320);
    localStorage.setItem(ISSUES_HEIGHT_KEY, '5000');
    expect(loadIssuesHeight()).toBe(640);
  });

  it('clamps the height to its limits and to the room the panes leave', () => {
    expect(clampIssuesHeight(10)).toBe(96);
    expect(clampIssuesHeight(900)).toBe(640);
    // 500 px between the panes and the list, the panes keep 160 px: the list can take at most 340 px.
    expect(clampIssuesHeight(600, 500)).toBe(340);
    expect(clampIssuesHeight(600, 200)).toBe(96);
  });
});

describe('issues panel open state', () => {
  it('is open unless it was saved as collapsed', () => {
    expect(loadIssuesOpen()).toBe(true);
    localStorage.setItem(ISSUES_OPEN_KEY, 'not json');
    expect(loadIssuesOpen()).toBe(true);
    localStorage.setItem(ISSUES_OPEN_KEY, '"no"');
    expect(loadIssuesOpen()).toBe(true);
  });

  it('saves and restores the state', () => {
    saveIssuesOpen(false);
    expect(localStorage.getItem(ISSUES_OPEN_KEY)).toBe('false');
    expect(loadIssuesOpen()).toBe(false);
    saveIssuesOpen(true);
    expect(loadIssuesOpen()).toBe(true);
  });
});

describe('output pane shown state', () => {
  it('is shown unless it was saved as hidden', () => {
    expect(loadOutputOpen()).toBe(true);
    localStorage.setItem(OUTPUT_OPEN_KEY, 'not json');
    expect(loadOutputOpen()).toBe(true);
    localStorage.setItem(OUTPUT_OPEN_KEY, '0');
    expect(loadOutputOpen()).toBe(true);
  });

  it('saves and restores the state', () => {
    saveOutputOpen(false);
    expect(localStorage.getItem(OUTPUT_OPEN_KEY)).toBe('false');
    expect(loadOutputOpen()).toBe(false);
    saveOutputOpen(true);
    expect(loadOutputOpen()).toBe(true);
  });
});

describe('edit preview open state', () => {
  it('is open unless it was saved as collapsed', () => {
    expect(loadEditPreviewOpen()).toBe(true);
    localStorage.setItem(EDIT_PREVIEW_OPEN_KEY, 'not json');
    expect(loadEditPreviewOpen()).toBe(true);
    localStorage.setItem(EDIT_PREVIEW_OPEN_KEY, '0');
    expect(loadEditPreviewOpen()).toBe(true);
  });

  it('saves and restores the state', () => {
    saveEditPreviewOpen(false);
    expect(localStorage.getItem(EDIT_PREVIEW_OPEN_KEY)).toBe('false');
    expect(loadEditPreviewOpen()).toBe(false);
    saveEditPreviewOpen(true);
    expect(loadEditPreviewOpen()).toBe(true);
  });
});

describe('broken storage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('falls back to the defaults and saves nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveIssuesHeight(400)).not.toThrow();
    expect(() => saveEditPreviewOpen(false)).not.toThrow();
    expect(loadIssuesHeight()).toBe(DEFAULT_ISSUES_HEIGHT);
    expect(loadEditPreviewOpen()).toBe(true);
  });
});
