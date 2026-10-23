// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type TextPlace, emptyProject, newAttribute } from '../../core/model';
import { reviewMarks, suggestText } from '../../core/review';
import { useStore } from '../../state/store';
import { availableCommands, runCommand } from '../lib/commands';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Inspector } from './Inspector';
import { Workspace } from './Workspace';

/**
 * De and fr; a clean project except for the suggested texts: `name`'s French label from I14Y, and the French
 * credential name translated by the browser.
 */
function loadProject({ suggested = true } = {}) {
  const project = emptyProject(['de-CH', 'fr-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.meta['fr-CH'] = { name: '', description: 'Pour les détenteurs' };
  const name = newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } });
  project.root.children.push(name);
  project.hosting = { mode: 'dataUrl' };
  if (suggested) {
    suggestText(project, { kind: 'label', nodeId: name.id }, 'fr-CH', 'Nom', 'i14y');
    suggestText(project, { kind: 'meta', field: 'name' }, 'fr-CH', 'Permis pour chiens', 'translation');
  }
  useStore.getState().load(project);
}

const project = () => useStore.getState().project!;
const nameNode = () => project().root.children[0];
const LABEL = (): TextPlace => ({ kind: 'label', nodeId: nameNode().id });
const marked = () => reviewMarks(project()).map((mark) => `${mark.place.kind} ${mark.lang} ${mark.source}`);
const languageRow = (input: HTMLElement) => input.closest<HTMLElement>('.lang-row')!;
const issuesPanel = () => screen.getByRole('region', { name: 'Issues' });
const reviewRows = () => within(issuesPanel()).queryAllByRole('button', { name: 'Suggested text needs review.' }).map((button) => button.closest('li')!);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  loadProject();
});

describe('a suggested text on its language row', () => {
  it('shows the dashed frame, who suggested it and Confirm; other rows show nothing', () => {
    useStore.getState().select({ kind: 'node', id: nameNode().id });
    render(<Inspector />);
    const french = languageRow(screen.getByLabelText('Label (fr-CH)'));
    expect(french).toHaveAttribute('data-review', 'i14y');
    expect(within(french).getByText('I14Y · review')).toHaveClass('review-tag');
    expect(within(french).getByRole('button', { name: 'Confirm the suggested Label (fr-CH)' })).toHaveTextContent('Confirm');
    const german = languageRow(screen.getByLabelText('Label'));
    expect(german).not.toHaveAttribute('data-review');
    expect(within(german).queryByRole('button', { name: /Confirm/ })).not.toBeInTheDocument();
  });

  it('tags a browser translation as such, on the credential fields too', () => {
    render(<Inspector />);
    const french = languageRow(screen.getByLabelText('Name (fr-CH)'));
    expect(french).toHaveAttribute('data-review', 'translation');
    expect(within(french).getByText('Translated · review')).toBeInTheDocument();
  });

  it('shows the marker with a single language too', () => {
    const single = emptyProject(['fr-CH']);
    single.meta['fr-CH'] = { name: '', description: '' };
    suggestText(single, { kind: 'meta', field: 'name' }, 'fr-CH', 'Permis', 'translation');
    useStore.getState().load(single);
    render(<Inspector />);
    expect(languageRow(screen.getByLabelText('Name'))).toHaveClass('lang-row--single');
    expect(screen.getByRole('button', { name: 'Confirm the suggested Name (fr-CH)' })).toBeInTheDocument();
  });

  it('is cleared by Confirm, which undo takes back', async () => {
    const user = userEvent.setup();
    useStore.getState().select({ kind: 'node', id: nameNode().id });
    render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Confirm the suggested Label (fr-CH)' }));
    expect(marked()).toEqual(['meta fr-CH translation']);
    expect(languageRow(screen.getByLabelText('Label (fr-CH)'))).not.toHaveAttribute('data-review');
    expect(screen.getByLabelText('Label (fr-CH)')).toHaveValue('Nom');

    act(() => useStore.getState().undo());
    expect(marked()).toEqual(['label fr-CH i14y', 'meta fr-CH translation']);
  });

  it('is cleared by editing the text, in the same undo step', async () => {
    const user = userEvent.setup();
    useStore.getState().select({ kind: 'node', id: nameNode().id });
    render(<Inspector />);
    const steps = useStore.getState().past.length;
    await user.type(screen.getByLabelText('Label (fr-CH)'), 's');
    expect(project().root.children[0].labels['fr-CH']).toBe('Noms');
    expect(marked()).toEqual(['meta fr-CH translation']);
    expect(screen.queryByRole('button', { name: 'Confirm the suggested Label (fr-CH)' })).not.toBeInTheDocument();

    act(() => useStore.getState().undo());
    expect(useStore.getState().past).toHaveLength(steps);
    expect(project().root.children[0].labels['fr-CH']).toBe('Nom');
    expect(marked()).toContain('label fr-CH i14y');
  });
});

describe('suggested texts in the Issues panel', () => {
  it('lists one warning per attribute or field, with its languages, location and Confirm; Fix all leaves them; download stays open', async () => {
    useStore.getState().project!.hosting = { mode: 'url', url: 'http://issuer.example.ch/oca-bundle.json' };
    render(<Workspace />);
    const rows = reviewRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.querySelector('.issues__location')!.textContent)).toEqual(['Credential', 'name']);
    expect(rows.map((row) => within(row).getAllByRole('button', { name: /-CH$/ }).map((chip) => chip.textContent))).toEqual([['fr-CH'], ['fr-CH']]);
    expect(within(rows[1]).getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    // The insecure URL is the only issue Fix all fixes.
    expect(within(issuesPanel()).getByRole('button', { name: 'Fix all (1)' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download bundle' })).toBeEnabled());
  });

  it('confirms the texts of one warning with its Confirm', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(reviewRows()[1]).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(marked()).toEqual(['meta fr-CH translation']));
    expect(reviewRows()).toHaveLength(1);
  });

  it('does not confirm anything with Fix all', async () => {
    const user = userEvent.setup();
    useStore.getState().project!.hosting = { mode: 'url', url: 'http://issuer.example.ch/oca-bundle.json' };
    render(<Workspace />);
    await user.click(within(issuesPanel()).getByRole('button', { name: 'Fix all (1)' }));
    await waitFor(() => expect(project().hosting).toEqual({ mode: 'url', url: 'https://issuer.example.ch/oca-bundle.json' }));
    expect(marked()).toHaveLength(2);
    expect(reviewRows()).toHaveLength(2);
  });
});

describe('Confirm all suggested texts', () => {
  it('is in More actions while some text needs review, and confirms them all in one undo step', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const steps = useStore.getState().past.length;
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Confirm all suggested texts' }));
    expect(marked()).toEqual([]);
    expect(useStore.getState().past).toHaveLength(steps + 1);
    expect(reviewRows()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Confirm all suggested texts' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    act(() => useStore.getState().undo());
    expect(marked()).toHaveLength(2);
    expect(reviewMarks(project()).find((mark) => mark.place.kind === 'label')?.place).toEqual(LABEL());
  });

  it('is in the command list only when needed', () => {
    render(<Workspace />);
    expect(availableCommands().map((entry) => entry.id)).toContain('workspace.confirmSuggestions');
    act(() => runCommand('workspace.confirmSuggestions'));
    expect(marked()).toEqual([]);
    expect(availableCommands().map((entry) => entry.id)).not.toContain('workspace.confirmSuggestions');
    // Running it now does nothing, not even an undo step.
    const steps = useStore.getState().past.length;
    runCommand('workspace.confirmSuggestions');
    expect(useStore.getState().past).toHaveLength(steps);
  });

  it('is not offered in a project without suggested texts', async () => {
    loadProject({ suggested: false });
    const user = userEvent.setup();
    render(<Workspace />);
    expect(availableCommands().map((entry) => entry.id)).not.toContain('workspace.confirmSuggestions');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Confirm all suggested texts' })).not.toBeInTheDocument();
    expect(reviewRows()).toHaveLength(0);
  });
});
