// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Baseline } from '../core/baseline';
import { type Project, emptyProject } from '../core/model';
import { reviewMarks, suggestText } from '../core/review';
import {
  DRAFT_KEY,
  OPEN_DRAFT_KEY,
  type DraftRecord,
  createDraft,
  deleteDraft,
  draftDisplayName,
  getDraft,
  initDrafts,
  openDraft,
  rawDraft,
  renameDraft,
  restoreDraft,
  saveOpenDraft,
  selectResumeDraft,
  startAutosave,
  useDrafts,
} from './persistence';
import { useStore } from './store';

function project(name: string, languages = ['de-CH']): Project {
  const result = emptyProject(languages);
  result.root.id = 'root';
  result.meta[languages[0]].name = name;
  return result;
}

const record = (id: string, updatedAt: number, name = id): DraftRecord => ({ id, updatedAt, project: project(name) });
const ids = () => useDrafts.getState().drafts.map((draft) => draft.id);
const rename = (name: string) => useStore.getState().update((draft) => void (draft.meta['de-CH'].name = name));

let stop: () => void = () => {};

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
  await initDrafts();
  useStore.getState().close();
  useStore.getState().setDraftSaveFailed(false);
});
afterEach(() => {
  stop();
  stop = () => {};
  useStore.getState().close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('stored drafts', () => {
  it('lists several drafts newest first, without their projects, and keeps them across reloads', async () => {
    await restoreDraft(record('a', 1));
    await restoreDraft(record('b', 3));
    await restoreDraft(record('c', 2));
    expect(ids()).toEqual(['b', 'c', 'a']);
    expect(useDrafts.getState().drafts[0]).toEqual({ id: 'b', updatedAt: 3, credentialName: 'b', languages: ['de-CH'] });

    await initDrafts();
    expect(ids()).toEqual(['b', 'c', 'a']);
    expect(useDrafts.getState().available).toBe(true);
    expect((await getDraft('c'))?.project).toEqual(project('c'));
    expect(await getDraft('missing')).toBeNull();
  });

  it('opens a stored draft in the workspace', async () => {
    await restoreDraft(record('a', 1, 'Ausweis'));
    expect(await openDraft('a')).toBe(true);
    expect(useStore.getState().draftId).toBe('a');
    expect(useStore.getState().project?.meta['de-CH'].name).toBe('Ausweis');
    expect(await openDraft('missing')).toBe(false);
  });

  it('renames a draft in place, and names it after the credential again when the name is cleared', async () => {
    await restoreDraft(record('a', 1, 'Ausweis'));
    await restoreDraft(record('b', 2, 'Permit'));
    expect(await renameDraft('a', '  Staff card ')).toBe(true);
    expect(ids()).toEqual(['b', 'a']);
    expect(draftDisplayName(useDrafts.getState().drafts[1])).toBe('Staff card');

    await initDrafts();
    expect((await getDraft('a'))?.customName).toBe('Staff card');
    await renameDraft('a', ' ');
    expect(await getDraft('a')).not.toHaveProperty('customName');
    expect(draftDisplayName(useDrafts.getState().drafts[1])).toBe('Ausweis');
    expect(await renameDraft('missing', 'x')).toBe(false);
  });

  it('deletes a draft and restores it in the same place', async () => {
    await restoreDraft(record('a', 1));
    await restoreDraft(record('b', 2));
    await restoreDraft(record('c', 3));
    const deleted = await deleteDraft('b');
    expect(deleted).toEqual(record('b', 2));
    expect(ids()).toEqual(['c', 'a']);
    await initDrafts();
    expect(ids()).toEqual(['c', 'a']);

    await restoreDraft(deleted!);
    expect(ids()).toEqual(['c', 'b', 'a']);
    await initDrafts();
    expect(ids()).toEqual(['c', 'b', 'a']);
  });
});

describe('display names', () => {
  it('uses the custom name, else the credential name in the first language, else "Untitled credential"', () => {
    expect(draftDisplayName({ customName: 'Mine', credentialName: 'Ausweis' })).toBe('Mine');
    expect(draftDisplayName({ credentialName: 'Ausweis' })).toBe('Ausweis');
    expect(draftDisplayName({ credentialName: '' })).toBe('Untitled credential');
  });

  it('follows the credential name in the first language until the draft is renamed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stop = startAutosave();
    const two = project('Ausweis', ['fr-CH', 'de-CH']);
    two.meta['de-CH'].name = 'Ausweis DE';
    const id = createDraft(two);
    await vi.waitFor(() => expect(useDrafts.getState().drafts[0]?.credentialName).toBe('Ausweis'));

    useStore.getState().update((draft) => void (draft.meta['fr-CH'].name = '  Carte '));
    vi.advanceTimersByTime(500);
    await vi.waitFor(() => expect(useDrafts.getState().drafts[0]?.credentialName).toBe('Carte'));

    await renameDraft(id, 'Staff card');
    useStore.getState().update((draft) => void (draft.meta['fr-CH'].name = 'Badge'));
    vi.advanceTimersByTime(500);
    await vi.waitFor(() => expect(useDrafts.getState().drafts[0]?.credentialName).toBe('Badge'));
    expect(draftDisplayName(useDrafts.getState().drafts[0])).toBe('Staff card');
  });
});

describe('autosave', () => {
  it('stores a new draft at once and its edits after they settle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(1000);
    stop = startAutosave();
    const id = createDraft(project('Card'));
    await vi.waitFor(() => expect(ids()).toEqual([id]));
    expect(useDrafts.getState().drafts[0].updatedAt).toBe(1000);

    vi.setSystemTime(2000);
    rename('Card 2');
    vi.advanceTimersByTime(499);
    expect((await getDraft(id))?.project.meta['de-CH'].name).toBe('Card');
    vi.advanceTimersByTime(1);
    await vi.waitFor(async () => expect((await getDraft(id))?.project.meta['de-CH'].name).toBe('Card 2'));
    expect((await getDraft(id))?.updatedAt).toBe(2500);
    expect(rawDraft()).toBe(JSON.stringify(useStore.getState().project));
  });

  it('keeps several drafts and the last edits of the one left behind', async () => {
    stop = startAutosave();
    const first = createDraft(project('First'));
    rename('First, edited');
    useStore.getState().close();
    const second = createDraft(project('Second'));
    await vi.waitFor(async () => expect((await getDraft(first))?.project.meta['de-CH'].name).toBe('First, edited'));
    await vi.waitFor(() => expect(ids()).toHaveLength(2));
    expect(ids()).toContain(second);
  });

  it('keeps the review marks of suggested texts across a reload', async () => {
    stop = startAutosave();
    const id = createDraft(project('Card'));
    useStore.getState().update((draft) => void suggestText(draft, { kind: 'meta', field: 'description' }, 'de-CH', 'Für Halter', 'i14y'));
    expect(await saveOpenDraft()).toBe(true);
    useStore.getState().close();

    await initDrafts();
    expect(await openDraft(id)).toBe(true);
    expect(reviewMarks(useStore.getState().project!)).toEqual([
      { place: { kind: 'meta', field: 'description' }, lang: 'de-CH', source: 'i14y', text: 'Für Halter' },
    ]);
  });

  it('saves the open draft on request', async () => {
    stop = startAutosave();
    const id = createDraft(project('Card'));
    rename('Now');
    expect(await saveOpenDraft()).toBe(true);
    expect((await getDraft(id))?.project.meta['de-CH'].name).toBe('Now');
  });

  it('remembers the open draft, so a reload offers it again', async () => {
    await restoreDraft(record('old', 1));
    await restoreDraft(record('new', 2));
    stop = startAutosave();
    await openDraft('old');
    useStore.getState().close();
    expect(localStorage.getItem(OPEN_DRAFT_KEY)).toBe('old');

    await initDrafts();
    expect(selectResumeDraft(useDrafts.getState())?.id).toBe('old');
    expect(rawDraft()).toBe(JSON.stringify(project('old')));

    await deleteDraft('old');
    expect(selectResumeDraft(useDrafts.getState())?.id).toBe('new');
    expect(localStorage.getItem(OPEN_DRAFT_KEY)).toBeNull();
    expect(rawDraft()).toBeNull();
  });

  it('does not bring back a deleted draft whose edits were waiting to be saved', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stop = startAutosave();
    const id = createDraft(project('Card'));
    await vi.waitFor(() => expect(ids()).toEqual([id]));
    rename('Edited');
    await deleteDraft(id);
    useStore.getState().close();
    vi.advanceTimersByTime(500);
    await initDrafts();
    expect(ids()).toEqual([]);
  });
});

describe('published baseline', () => {
  const baseline = (json: string): Baseline => ({ json, integrity: `sha256-${json}`, source: 'file', setAt: 7 });

  it('stores a new draft with its baseline and opens it again after a reload', async () => {
    stop = startAutosave();
    const id = createDraft(project('Card'), undefined, { baseline: baseline('first') });
    expect(useStore.getState().baseline).toEqual(baseline('first'));
    await vi.waitFor(async () => expect((await getDraft(id))?.baseline).toEqual(baseline('first')));

    useStore.getState().close();
    expect(useStore.getState().baseline).toBeNull();
    await initDrafts();
    expect(await openDraft(id)).toBe(true);
    expect(useStore.getState().baseline).toEqual(baseline('first'));
  });

  it('saves a new baseline at once, with the edits still waiting, and leaves the project alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stop = startAutosave();
    const id = createDraft(project('Card'));
    await vi.waitFor(() => expect(ids()).toEqual([id]));
    const before = useStore.getState().project;
    rename('Edited');
    const edited = useStore.getState().project;

    useStore.getState().setBaseline(baseline('second'));
    expect(useStore.getState().project).toBe(edited);
    expect(useStore.getState().past.at(-1)?.project).toBe(before);
    await vi.waitFor(async () => expect((await getDraft(id))?.baseline).toEqual(baseline('second')));
    expect((await getDraft(id))?.project.meta['de-CH'].name).toBe('Edited');

    // Later edits keep it.
    rename('Edited again');
    vi.advanceTimersByTime(500);
    await vi.waitFor(async () => expect((await getDraft(id))?.project.meta['de-CH'].name).toBe('Edited again'));
    expect((await getDraft(id))?.baseline).toEqual(baseline('second'));
  });

  it('keeps the baseline through renaming, and opens drafts stored without one', async () => {
    await restoreDraft({ ...record('a', 1), baseline: baseline('kept') });
    await restoreDraft(record('b', 2));
    await renameDraft('a', 'Staff card');
    expect((await getDraft('a'))?.baseline).toEqual(baseline('kept'));
    await openDraft('b');
    expect(useStore.getState().baseline).toBeNull();
  });

  it('ignores a stored baseline that is not one', async () => {
    await restoreDraft({ ...record('a', 1), baseline: { json: 1 } as unknown as Baseline });
    await openDraft('a');
    expect(useStore.getState().baseline).toBeNull();
  });

  it('only sets a baseline while a project is open', () => {
    useStore.getState().setBaseline(baseline('none'));
    expect(useStore.getState().baseline).toBeNull();
  });
});

describe('migration from the single draft', () => {
  it('moves the old draft into the database, offers it, and removes the old key', async () => {
    const old = project('Hundebewilligung');
    localStorage.setItem(DRAFT_KEY, JSON.stringify(old));
    await initDrafts();

    const resume = selectResumeDraft(useDrafts.getState());
    expect(resume?.credentialName).toBe('Hundebewilligung');
    expect((await getDraft(resume!.id))?.project).toEqual(old);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(rawDraft()).toBe(JSON.stringify(old));

    await initDrafts();
    expect(ids()).toEqual([resume!.id]);
  });

  it('keeps the old key when the new record cannot be written', async () => {
    const old = JSON.stringify(project('Hundebewilligung'));
    localStorage.setItem(DRAFT_KEY, old);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    await initDrafts();

    expect(localStorage.getItem(DRAFT_KEY)).toBe(old);
    expect(selectResumeDraft(useDrafts.getState())?.credentialName).toBe('Hundebewilligung');
    expect(useDrafts.getState().available).toBe(false);
  });

  it('ignores an old draft that is not a project', async () => {
    localStorage.setItem(DRAFT_KEY, '{"version":2}');
    await initDrafts();
    expect(ids()).toEqual([]);
    localStorage.setItem(DRAFT_KEY, 'not json');
    await initDrafts();
    expect(ids()).toEqual([]);
  });
});

describe('out of space', () => {
  it('keeps the stored drafts intact, reports the failure, and clears it on the next successful save', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await restoreDraft(record('other', 1, 'Other'));
    await restoreDraft(record('open', 2, 'Saved'));
    stop = startAutosave();
    await openDraft('open');

    // The summary write fails after the draft write in the same transaction, which must roll back too.
    const put = IDBObjectStore.prototype.put;
    const full = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'summaries') throw new DOMException('quota', 'QuotaExceededError');
      return put.apply(this, args);
    });
    rename('Not saved');
    vi.advanceTimersByTime(500);
    await vi.waitFor(() => expect(useStore.getState().draftSaveFailed).toBe(true));
    expect((await getDraft('open'))?.project).toEqual(project('Saved'));
    expect((await getDraft('other'))?.project).toEqual(project('Other'));
    expect(ids()).toEqual(['open', 'other']);

    full.mockRestore();
    rename('Saved again');
    vi.advanceTimersByTime(500);
    await vi.waitFor(() => expect(useStore.getState().draftSaveFailed).toBe(false));
    expect((await getDraft('open'))?.project.meta['de-CH'].name).toBe('Saved again');
  });
});

describe('without storage', () => {
  it('keeps drafts in memory for the session and never fails', async () => {
    const old = JSON.stringify(project('Hundebewilligung'));
    localStorage.setItem(DRAFT_KEY, old);
    vi.stubGlobal('indexedDB', undefined);
    await initDrafts();
    expect(useDrafts.getState().available).toBe(false);
    expect(selectResumeDraft(useDrafts.getState())?.credentialName).toBe('Hundebewilligung');
    expect(localStorage.getItem(DRAFT_KEY)).toBe(old);

    stop = startAutosave();
    const id = createDraft(project('Card'));
    await vi.waitFor(() => expect(ids()).toContain(id));
    expect(useStore.getState().draftSaveFailed).toBe(false);
    expect(rawDraft()).toBe(JSON.stringify(project('Card')));
  });

  it('works when local storage is blocked too', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await initDrafts();
    stop = startAutosave();
    const id = createDraft(project('Card'));
    await vi.waitFor(() => expect(ids()).toEqual([id]));
    expect(useDrafts.getState().rememberedId).toBe(id);
  });
});
