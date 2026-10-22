import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject, newAttribute } from '../core/model';
import { insertNode, removeLanguage, removeNode, renameLanguage } from '../core/operations';
import type { Fix } from '../core/validate/fixes';
import { HISTORY_LIMIT, TYPING_PAUSE_MS, endTyping, useStore } from './store';

const setName = (name: string): Fix => ({ label: `Name ${name}`, apply: (draft) => void (draft.meta['de-CH'].name = name) });
const failing: Fix = { label: 'Broken', apply: async () => Promise.reject(new Error('decode failed')) };
const name = () => useStore.getState().project?.meta['de-CH'].name;

beforeEach(() => useStore.getState().load(emptyProject(['de-CH', 'en-GB'])));

describe('applyFixes', () => {
  it('applies the fixes as one undo step', async () => {
    const before = useStore.getState().project;
    await useStore.getState().applyFixes([[setName('A')], [setName('B')]]);
    expect(name()).toBe('B');
    expect(useStore.getState().past).toHaveLength(1);
    expect(useStore.getState().fixNotice).toEqual({ kind: 'fixed', fixed: 2, total: 2 });
    expect(useStore.getState().fixing).toBe(false);

    useStore.getState().undo();
    expect(useStore.getState().project).toBe(before);
    expect(useStore.getState().past).toHaveLength(0);
    expect(useStore.getState().fixNotice).toBeNull();
  });

  it('hides the notice at the next edit, which goes on top of the fix in the history', async () => {
    await useStore.getState().applyFixes([[setName('A')]]);
    useStore.getState().update((draft) => void (draft.meta['de-CH'].description = 'Typed'));
    expect(useStore.getState().fixNotice).toBeNull();
    expect(useStore.getState().past).toHaveLength(2);
  });

  it('keeps the fix undoable when the notice is dismissed', async () => {
    await useStore.getState().applyFixes([[setName('A')]]);
    useStore.getState().dismissFixNotice();
    expect(name()).toBe('A');
    useStore.getState().undo();
    expect(name()).toBe('');
  });

  it('counts a group as failed when one of its fixes throws', async () => {
    await useStore.getState().applyFixes([[setName('A')], [failing]]);
    expect(name()).toBe('A');
    expect(useStore.getState().fixNotice).toEqual({ kind: 'fixed', fixed: 1, total: 2 });
  });

  it('keeps the project when every fix fails', async () => {
    const before = useStore.getState().project;
    await useStore.getState().applyFixes([[failing]]);
    expect(useStore.getState().project).toBe(before);
    expect(useStore.getState().past).toHaveLength(0);
    expect(useStore.getState().fixNotice).toEqual({ kind: 'failed', label: 'Broken' });
  });

  it('discards the result when the project changed while a fix ran, and ignores a second call meanwhile', async () => {
    let finish!: () => void;
    const slow: Fix = {
      label: 'Slow',
      apply: (draft) =>
        new Promise<void>((resolve) => {
          finish = () => {
            draft.meta['de-CH'].name = 'Slow';
            resolve();
          };
        }),
    };
    const running = useStore.getState().applyFixes([[slow]]);
    expect(useStore.getState().fixing).toBe(true);
    await useStore.getState().applyFixes([[setName('Twice')]]);
    useStore.getState().update((draft) => void (draft.meta['de-CH'].name = 'Typed'));
    finish();
    await running;
    expect(name()).toBe('Typed');
    expect(useStore.getState().fixNotice).toEqual({ kind: 'stale' });
    expect(useStore.getState().past).toHaveLength(1);
    expect(useStore.getState().fixing).toBe(false);
  });

  it('keeps editing a language that a fix renames, and follows it on undo and redo', async () => {
    useStore.getState().load(emptyProject(['de-CH', 'en']));
    useStore.getState().setEditLang('en');
    await useStore.getState().applyFixes([[{ label: 'Rename', apply: (draft) => renameLanguage(draft, 'en', 'en-GB') }]]);
    expect(useStore.getState().editLang).toBe('en-GB');
    useStore.getState().undo();
    expect(useStore.getState().editLang).toBe('en');
    useStore.getState().redo();
    expect(useStore.getState().editLang).toBe('en-GB');
  });

  it('falls back to the first language when a fix removes the one being edited', async () => {
    useStore.getState().setEditLang('en-GB');
    await useStore.getState().applyFixes([[{ label: 'Drop', apply: (draft) => removeLanguage(draft, 'en-GB') }]]);
    expect(useStore.getState().editLang).toBe('de-CH');
  });
});

describe('history', () => {
  const setDescription = (text: string, field?: string) => useStore.getState().update((draft) => void (draft.meta['de-CH'].description = text), { field });
  const description = () => useStore.getState().project?.meta['de-CH'].description;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('undoes and redoes edits in order', () => {
    const start = useStore.getState().project;
    setDescription('A');
    const afterA = useStore.getState().project;
    setDescription('B');

    useStore.getState().undo();
    expect(useStore.getState().project).toBe(afterA);
    useStore.getState().undo();
    expect(useStore.getState().project).toBe(start);
    useStore.getState().undo();
    expect(useStore.getState().project).toBe(start);

    useStore.getState().redo();
    expect(description()).toBe('A');
    useStore.getState().redo();
    expect(description()).toBe('B');
    expect(useStore.getState().future).toHaveLength(0);
    useStore.getState().redo();
    expect(description()).toBe('B');
  });

  it('merges typing in one field into one step', () => {
    for (const text of ['D', 'Do', 'Dog']) {
      setDescription(text, 'description');
      vi.advanceTimersByTime(TYPING_PAUSE_MS / 2);
    }
    expect(useStore.getState().past).toHaveLength(1);
    useStore.getState().undo();
    expect(description()).toBe('');
    useStore.getState().redo();
    expect(description()).toBe('Dog');
  });

  it('starts a new step after a pause, in another field, or once the field is left', () => {
    setDescription('D', 'description');
    vi.advanceTimersByTime(TYPING_PAUSE_MS);
    setDescription('Do', 'description');
    expect(useStore.getState().past).toHaveLength(2);

    useStore.getState().update((draft) => void (draft.meta['de-CH'].name = 'N'), { field: 'name' });
    expect(useStore.getState().past).toHaveLength(3);

    setDescription('Dog', 'description');
    endTyping();
    setDescription('Dogs', 'description');
    expect(useStore.getState().past).toHaveLength(5);
  });

  it('keeps edits without a field as separate steps', () => {
    setDescription('A');
    setDescription('B');
    expect(useStore.getState().past).toHaveLength(2);
  });

  it(`keeps only the last ${HISTORY_LIMIT} steps`, () => {
    for (let index = 1; index <= HISTORY_LIMIT + 5; index++) setDescription(String(index));
    expect(useStore.getState().past).toHaveLength(HISTORY_LIMIT);
    while (useStore.getState().past.length) useStore.getState().undo();
    expect(description()).toBe('5');
  });

  it('clears the redo steps at a new edit', () => {
    setDescription('A');
    setDescription('B');
    useStore.getState().undo();
    expect(useStore.getState().future).toHaveLength(1);
    setDescription('C');
    expect(useStore.getState().future).toHaveLength(0);
    useStore.getState().redo();
    expect(description()).toBe('C');
  });

  it('clears the history when a project is loaded or closed', () => {
    setDescription('A');
    setDescription('B');
    useStore.getState().undo();
    useStore.getState().load(emptyProject(['de-CH']));
    expect(useStore.getState().past).toEqual([]);
    expect(useStore.getState().future).toEqual([]);

    setDescription('A');
    useStore.getState().close();
    expect(useStore.getState().past).toEqual([]);
  });

  it('starts a new step after a load, even in the same field', () => {
    setDescription('A', 'description');
    useStore.getState().load(emptyProject(['de-CH']));
    setDescription('B', 'description');
    expect(useStore.getState().past).toHaveLength(1);
  });

  it('restores the selection from before the edit', () => {
    const attribute = newAttribute('age');
    useStore.getState().update((draft) => insertNode(draft, draft.root.id, attribute));
    useStore.getState().select({ kind: 'node', id: attribute.id });
    setDescription('A');
    useStore.getState().select({ kind: 'credential' });

    useStore.getState().undo();
    expect(useStore.getState().selection).toEqual({ kind: 'node', id: attribute.id });
    useStore.getState().redo();
    expect(useStore.getState().selection).toEqual({ kind: 'credential' });
  });

  it('selects the credential when the restored selection names a node that does not exist', () => {
    const attribute = newAttribute('age');
    useStore.getState().update((draft) => insertNode(draft, draft.root.id, attribute));
    useStore.getState().select({ kind: 'node', id: attribute.id });
    // The node goes while still selected, so the next step records a selection of a missing node.
    useStore.getState().update((draft) => void removeNode(draft, attribute.id));
    setDescription('A');

    useStore.getState().undo();
    expect(useStore.getState().selection).toEqual({ kind: 'credential' });
  });

  it('brings a deleted node back on undo, selected as it was', () => {
    const attribute = newAttribute('age');
    useStore.getState().update((draft) => insertNode(draft, draft.root.id, attribute));
    useStore.getState().select({ kind: 'node', id: attribute.id });
    useStore.getState().update((draft) => void removeNode(draft, attribute.id));
    useStore.getState().select({ kind: 'credential' });

    useStore.getState().undo();
    expect(useStore.getState().project?.root.children.map((node) => node.id)).toEqual([attribute.id]);
    expect(useStore.getState().selection).toEqual({ kind: 'node', id: attribute.id });
  });

  it('follows the edit language through undo and redo of a removal', () => {
    useStore.getState().setEditLang('en-GB');
    useStore.getState().update((draft) => removeLanguage(draft, 'en-GB'));
    expect(useStore.getState().editLang).toBe('de-CH');
    useStore.getState().undo();
    expect(useStore.getState().project?.languages).toEqual(['de-CH', 'en-GB']);
    expect(useStore.getState().editLang).toBe('de-CH');
    useStore.getState().setEditLang('en-GB');
    useStore.getState().redo();
    expect(useStore.getState().editLang).toBe('de-CH');
  });
});
