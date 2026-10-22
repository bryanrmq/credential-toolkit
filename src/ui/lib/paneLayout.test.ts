// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ISSUES_HEIGHT,
  DEFAULT_PANE_WIDTHS,
  ISSUES_HEIGHT_KEY,
  PANE_LAYOUT_KEY,
  clampIssuesHeight,
  clampPaneWidth,
  loadIssuesHeight,
  loadPaneWidths,
  saveIssuesHeight,
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
