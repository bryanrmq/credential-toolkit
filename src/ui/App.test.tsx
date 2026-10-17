// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from '../core/model';
import { loadDraft, saveDraft } from '../state/persistence';
import { useStore } from '../state/store';
import { App } from './App';
import { TOUR_SEEN_KEY, loadTourSeen } from './lib/tour';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  useStore.getState().close();
});

describe('App', () => {
  it('starts a blank project and adds an attribute', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    const dialog = screen.getByRole('dialog', { name: 'Start blank' });
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));

    expect(screen.getByRole('heading', { name: 'Untitled credential' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Attribute/ }));
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
    expect(screen.getByText('given_name')).toBeInTheDocument();
    expect(screen.getByText('birth_date')).toBeInTheDocument();
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

  it('asks before a new project replaces the saved draft', async () => {
    const draft = emptyProject(['de-CH']);
    draft.meta['de-CH'].name = 'Hundebewilligung';
    saveDraft(draft);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open in editor' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(useStore.getState().project).toBeNull();
    expect(loadDraft()?.meta['de-CH'].name).toBe('Hundebewilligung');

    confirm.mockReturnValue(true);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open in editor' }));
    expect(screen.getByRole('heading', { name: 'Untitled credential' })).toBeInTheDocument();
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
