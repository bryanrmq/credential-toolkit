// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from '../core/model';
import { DRAFT_KEY, loadDraft, rawDraft, saveDraft, startAutosave } from './persistence';
import { useStore } from './store';

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('drafts', () => {
  it('saves and loads a project', () => {
    const project = emptyProject(['de-CH']);
    project.meta['de-CH'].name = 'Ausweis';
    expect(saveDraft(project)).toBe(true);
    expect(loadDraft()).toEqual(project);
    expect(rawDraft()).toBe(JSON.stringify(project));
  });

  it('ignores stored data that is not a project', () => {
    localStorage.setItem(DRAFT_KEY, '{"version":2}');
    expect(loadDraft()).toBeNull();
    localStorage.setItem(DRAFT_KEY, 'not json');
    expect(loadDraft()).toBeNull();
  });

  it('removes the draft when saving null', () => {
    saveDraft(emptyProject(['de-CH']));
    saveDraft(null);
    expect(rawDraft()).toBeNull();
  });

  it('autosaves after changes settle', () => {
    vi.useFakeTimers();
    const stop = startAutosave(useStore.subscribe);
    useStore.getState().load(emptyProject(['en-GB']));
    useStore.getState().update((draft) => void (draft.meta['en-GB'].name = 'Card'));
    expect(loadDraft()).toBeNull();
    vi.advanceTimersByTime(500);
    expect(loadDraft()?.meta['en-GB'].name).toBe('Card');
    stop();
    useStore.getState().close();
  });
});

describe('autosave failures', () => {
  it('reports when the browser refuses to store the draft', () => {
    vi.useFakeTimers();
    const results: boolean[] = [];
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const stop = startAutosave(useStore.subscribe, (ok) => results.push(ok));
    useStore.getState().load(emptyProject(['en-GB']));
    vi.advanceTimersByTime(500);
    expect(results).toEqual([false]);
    setItem.mockRestore();
    stop();
    useStore.getState().close();
  });
});
