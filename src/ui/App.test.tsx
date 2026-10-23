// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from '../core/model';
import bundle from '../test/fixtures/oca-bundle-simple-sample.json';
import { getDraft, initDrafts, restoreDraft, useDrafts } from '../state/persistence';
import { useStore } from '../state/store';
import { App } from './App';
import { TOUR_SEEN_KEY, loadTourSeen } from './lib/tour';

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  vi.stubGlobal('indexedDB', new IDBFactory());
  await initDrafts();
  useStore.getState().close();
});

/** Stores a draft named Hundebewilligung, as an earlier visit would have. */
async function storeDraft() {
  const draft = emptyProject(['de-CH']);
  draft.meta['de-CH'].name = 'Hundebewilligung';
  await restoreDraft({ id: 'saved', updatedAt: 1, project: draft });
}

describe('App', () => {
  it('starts a blank project and adds an attribute', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    const dialog = screen.getByRole('dialog', { name: 'Start blank' });
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));

    expect(screen.getByRole('heading', { name: 'Untitled credential' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('menuitem', { name: 'Attribute' }));
    expect(screen.getByLabelText('Key')).toHaveValue('attribute');
    expect(screen.getByLabelText('Source path')).toHaveValue('attribute');
  });

  it('opens a pasted sample and lists its attributes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start from a sample credential/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Paste JSON/));
    await user.paste('{"iss":"did:example","given_name":"Seraina","birth_date":"1988-04-05"}');
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));

    expect(screen.getByText('Import report')).toBeInTheDocument();
    const structure = screen.getByRole('region', { name: 'Structure' });
    expect(within(structure).getByText('given_name')).toBeInTheDocument();
    expect(within(structure).getByText('birth_date')).toBeInTheDocument();
  });

  it('opens a bundle as a draft whose published baseline is that bundle', async () => {
    const user = userEvent.setup();
    const text = JSON.stringify(bundle);
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Open an OCA bundle/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Paste JSON/));
    await user.paste(text);
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));

    await waitFor(() => expect(useStore.getState().project).not.toBeNull());
    const { baseline, draftId } = useStore.getState();
    expect(baseline).toMatchObject({ json: text, source: 'import', integrity: expect.stringMatching(/^sha256-/) });
    await waitFor(async () => expect((await getDraft(draftId!))?.baseline).toEqual(baseline));
  });

  it('shows the import error for invalid JSON', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Open an OCA bundle/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Paste JSON/));
    await user.paste('{"capture_bases": [}');
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Invalid JSON at line 1/);
  });

  it('continues the saved draft from the start screen', async () => {
    await storeDraft();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Continue your draft.*Hundebewilligung/ }));
    expect(await screen.findByRole('heading', { name: 'Hundebewilligung' })).toBeInTheDocument();
    expect(useStore.getState().draftId).toBe('saved');
  });

  it('keeps the open draft stored and offers it again after going back', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open in editor' }));
    const id = useStore.getState().draftId!;
    await waitFor(() => expect(useDrafts.getState().drafts.map((draft) => draft.id)).toEqual([id]));
    act(() => useStore.getState().close());
    expect(screen.getByRole('button', { name: /Continue your draft.*Untitled credential/ })).toBeInTheDocument();
  });

  it('keeps the open draft on New project, without asking, so it can be reopened', async () => {
    await storeDraft();
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Continue your draft/ }));
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'New project' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(useStore.getState().project).toBeNull();
    expect((await getDraft('saved'))?.project.meta['de-CH'].name).toBe('Hundebewilligung');

    await user.click(await screen.findByRole('button', { name: /Continue your draft.*Hundebewilligung/ }));
    expect(useStore.getState().draftId).toBe('saved');
    expect(screen.getByRole('heading', { name: 'Hundebewilligung' })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('asks before a new project replaces the saved draft', async () => {
    await storeDraft();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open in editor' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(useStore.getState().project).toBeNull();
    expect((await getDraft('saved'))?.project.meta['de-CH'].name).toBe('Hundebewilligung');

    confirm.mockReturnValue(true);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open in editor' }));
    expect(screen.getByRole('heading', { name: 'Untitled credential' })).toBeInTheDocument();
    await waitFor(async () => expect(await getDraft('saved')).toBeNull());
    confirm.mockRestore();
  });

  it('opens the learner-driver permit example in the editor', async () => {
    const user = userEvent.setup();
    render(<App />);
    const example = await screen.findByRole('button', { name: /Learner-driver permit/ });
    expect(example).toHaveTextContent('17 attributes');
    await user.click(example);

    expect(await screen.findByText('Import report')).toBeInTheDocument();
    expect(screen.getByText('licenceNumber')).toBeInTheDocument();
  });

  it('asks before the example replaces the saved draft', async () => {
    await storeDraft();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Learner-driver permit/ }));

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(useStore.getState().project).toBeNull();
    expect((await getDraft('saved'))?.project.meta['de-CH'].name).toBe('Hundebewilligung');
    confirm.mockRestore();
  });

  it('shows the workspace tour the first time a project opens, and not after it was skipped', async () => {
    localStorage.removeItem(TOUR_SEEN_KEY);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Start blank' })).getByRole('button', { name: 'Open in editor' }));
    const tour = screen.getByRole('dialog', { name: 'Workspace tour' });
    expect(within(tour).getByRole('heading', { name: 'Welcome to the workspace' })).toBeInTheDocument();

    await user.click(within(tour).getByRole('button', { name: 'Skip tour' }));
    expect(screen.queryByRole('dialog', { name: 'Workspace tour' })).not.toBeInTheDocument();
    expect(loadTourSeen()).toBe(true);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'New project' }));
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Start blank' })).getByRole('button', { name: 'Open in editor' }));
    expect(screen.queryByRole('dialog', { name: 'Workspace tour' })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
