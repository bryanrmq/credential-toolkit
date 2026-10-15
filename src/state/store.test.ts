import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject } from '../core/model';
import { removeLanguage, renameLanguage } from '../core/operations';
import type { Fix } from '../core/validate/fixes';
import { useStore } from './store';

const setName = (name: string): Fix => ({ label: `Name ${name}`, apply: (draft) => void (draft.meta['de-CH'].name = name) });
const failing: Fix = { label: 'Broken', apply: async () => Promise.reject(new Error('decode failed')) };
const name = () => useStore.getState().project?.meta['de-CH'].name;

beforeEach(() => useStore.getState().load(emptyProject(['de-CH', 'en-GB'])));

describe('applyFixes', () => {
  it('applies the fixes and offers to undo them', async () => {
    const before = useStore.getState().project;
    await useStore.getState().applyFixes([[setName('A')], [setName('B')]]);
    expect(name()).toBe('B');
    expect(useStore.getState().undo).toBe(before);
    expect(useStore.getState().fixNotice).toEqual({ kind: 'fixed', fixed: 2, total: 2 });
    expect(useStore.getState().fixing).toBe(false);

    useStore.getState().undoFix();
    expect(useStore.getState().project).toBe(before);
    expect(useStore.getState().undo).toBeNull();
    expect(useStore.getState().fixNotice).toBeNull();
  });

  it('forgets the undo snapshot at the next edit', async () => {
    await useStore.getState().applyFixes([[setName('A')]]);
    useStore.getState().update((draft) => void (draft.meta['de-CH'].description = 'Typed'));
    expect(useStore.getState().undo).toBeNull();
    expect(useStore.getState().fixNotice).toBeNull();
  });

  it('forgets the undo snapshot when the notice is dismissed', async () => {
    await useStore.getState().applyFixes([[setName('A')]]);
    useStore.getState().dismissFixNotice();
    expect(useStore.getState().undo).toBeNull();
    expect(name()).toBe('A');
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
    expect(useStore.getState().undo).toBeNull();
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
    expect(useStore.getState().undo).toBeNull();
    expect(useStore.getState().fixing).toBe(false);
  });

  it('keeps editing a language that a fix renames, and goes back on undo', async () => {
    useStore.getState().load(emptyProject(['de-CH', 'en']));
    useStore.getState().setEditLang('en');
    await useStore.getState().applyFixes([[{ label: 'Rename', apply: (draft) => renameLanguage(draft, 'en', 'en-GB') }]]);
    expect(useStore.getState().editLang).toBe('en-GB');
    useStore.getState().undoFix();
    expect(useStore.getState().editLang).toBe('en');
  });

  it('falls back to the first language when a fix removes the one being edited', async () => {
    useStore.getState().setEditLang('en-GB');
    await useStore.getState().applyFixes([[{ label: 'Drop', apply: (draft) => removeLanguage(draft, 'en-GB') }]]);
    expect(useStore.getState().editLang).toBe('de-CH');
  });
});
