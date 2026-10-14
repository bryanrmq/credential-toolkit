// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Manage languages' }));
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

  it('lists an issue once with a chip per language', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const row = screen.getByRole('button', { name: '"broken" has no label.' }).closest('li')!;
    expect(within(row).getAllByRole('button').map((button) => button.textContent)).toEqual(['"broken" has no label.', 'de-CH', 'en-GB']);

    await user.click(within(row).getByRole('button', { name: 'en-GB' }));
    expect(useStore.getState().editLang).toBe('en-GB');
    expect(useStore.getState().selection).toMatchObject({ kind: 'node' });
  });

  it('starts over from the menu after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'New project' }));
    expect(useStore.getState().project).not.toBeNull();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'New project' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(useStore.getState().project).toBeNull();
    confirm.mockRestore();
  });

  it('closes the menu with Escape', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('fills an empty structure from a sample', async () => {
    const project = emptyProject(['de-CH']);
    project.meta['de-CH'] = { name: 'Hundebewilligung', description: '' };
    useStore.getState().load(project);
    const user = userEvent.setup();
    render(<Workspace />);
    expect(screen.getByText('No attributes yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fill from a sample' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Paste JSON/));
    await user.paste('{"iss": "did:example", "given_name": "Seraina", "address": {"city": "Bern"}}');
    await user.click(within(dialog).getByRole('button', { name: 'Fill' }));

    const state = useStore.getState();
    expect(state.project?.root.children.map((child) => child.key)).toEqual(['given_name', 'address']);
    expect(state.project?.sample).toEqual({ iss: 'did:example', given_name: 'Seraina', address: { city: 'Bern' } });
    expect(state.project?.meta['de-CH'].name).toBe('Hundebewilligung');
    expect(screen.getByText('Skipped technical claims: iss.')).toBeInTheDocument();
  });

  it('adds the first attribute from the empty state', async () => {
    useStore.getState().load(emptyProject(['de-CH']));
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Add attribute' }));
    expect(useStore.getState().project?.root.children.map((child) => child.key)).toEqual(['attribute']);
  });

  it('shows the selected item in every language next to the form', async () => {
    const user = userEvent.setup();
    const nameNode = useStore.getState().project!.root.children[0];
    useStore.getState().select({ kind: 'node', id: nameNode.id });
    render(<Workspace />);
    const aside = screen.getByRole('complementary', { name: 'Translations' });
    expect(within(aside).getByLabelText('Label (de-CH)')).toHaveValue('Name');
    const english = within(aside).getByLabelText('Label (en-GB)');
    expect(english).toHaveAttribute('data-empty', 'true');

    await user.type(english, 'Name');
    expect(useStore.getState().project?.root.children[0].labels).toEqual({ 'de-CH': 'Name', 'en-GB': 'Name' });

    await user.click(within(aside).getAllByRole('button', { name: 'en-GB' })[0]);
    expect(useStore.getState().editLang).toBe('en-GB');
  });

  it('shows the credential texts in every language when the credential is selected', () => {
    render(<Workspace />);
    const aside = screen.getByRole('complementary', { name: 'Translations' });
    expect(within(aside).getByLabelText('Credential name (de-CH)')).toHaveValue('Hundebewilligung');
    expect(within(aside).getByLabelText('Credential name (en-GB)')).toHaveValue('');
    expect(within(aside).getByLabelText('Primary field (en-GB)')).toHaveValue('');
  });

  it('hides the translations column for a single-language project', () => {
    useStore.getState().load(emptyProject(['de-CH']));
    render(<Workspace />);
    expect(screen.queryByRole('complementary', { name: 'Translations' })).not.toBeInTheDocument();
  });

  it('heads the inspector with the label, the technical key and the editing language', () => {
    const nameNode = useStore.getState().project!.root.children[0];
    useStore.getState().select({ kind: 'node', id: nameNode.id });
    render(<Workspace />);
    const header = screen.getByRole('heading', { level: 1, name: 'Name' }).closest('header')!;
    expect(within(header).getByText('name', { selector: 'code' })).toBeInTheDocument();
    expect(within(header).getByText('de-CH')).toBeInTheDocument();
  });
});
