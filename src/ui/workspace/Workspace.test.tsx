// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject, newAttribute } from '../../core/model';
import { useStore } from '../../state/store';
import { Workspace } from './Workspace';

function loadProject() {
  const project = emptyProject(['de-CH', 'en-GB']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.root.children.push(
    newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }),
    newAttribute('broken', { source: [] }),
  );
  useStore.getState().load(project);
}

beforeEach(() => {
  localStorage.clear();
  loadProject();
});

describe('Workspace', () => {
  it('blocks the download while there are errors and links issues to fields', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    expect(screen.getByText('1 error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download bundle' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /"broken" has no source path/ }));
    expect(screen.getByLabelText('Key')).toHaveValue('broken');
    await user.type(screen.getByLabelText('Source path'), 'broken');
    expect(screen.queryByText('1 error')).not.toBeInTheDocument();
  });

  it('edits the credential name in the current language', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(screen.getByRole('group', { name: 'Editing language' })).getByRole('button', { name: 'en-GB' }));
    await user.type(screen.getByLabelText('Name'), 'Dog permit');
    expect(useStore.getState().project?.meta['en-GB'].name).toBe('Dog permit');
    expect(useStore.getState().project?.meta['de-CH'].name).toBe('Hundebewilligung');
  });

  it('fills labels in the translations table', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Translations' }));
    await user.type(screen.getByLabelText('name Label (en-GB)'), 'Name');
    const name = useStore.getState().project?.root.children[0];
    expect(name?.labels).toEqual({ 'de-CH': 'Name', 'en-GB': 'Name' });
  });

  it('adds a language from the languages dialog', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Languages' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /French/ }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(useStore.getState().project?.languages).toEqual(['de-CH', 'en-GB', 'fr-CH']);
    expect(within(screen.getByRole('group', { name: 'Editing language' })).getByRole('button', { name: 'fr-CH' })).toBeInTheDocument();
  });

  it('says so when the draft could not be saved', () => {
    useStore.getState().setDraftSaveFailed(true);
    render(<Workspace />);
    expect(screen.getByText(/too large to save/)).toHaveAttribute('role', 'status');
    useStore.getState().setDraftSaveFailed(false);
  });

  it('attaches a sample credential and checks source paths against it', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Attach sample' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Paste JSON/));
    await user.paste('{"given_name": "Seraina"}');
    await user.click(within(dialog).getByRole('button', { name: 'Attach' }));

    expect(useStore.getState().project?.sample).toEqual({ given_name: 'Seraina' });
    expect(screen.getByText('The source path of "name" does not exist in the sample credential.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove sample' }));
    expect(useStore.getState().project?.sample).toBeUndefined();
  });

  it('refuses a sample that is not a claims object', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Attach sample' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Paste JSON/));
    await user.paste('[1, 2]');
    await user.click(within(dialog).getByRole('button', { name: 'Attach' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The sample credential must be a JSON object of claims.');
    expect(useStore.getState().project?.sample).toBeUndefined();
  });
});
