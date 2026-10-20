// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { addConcepts, parseConcept } from '../../core/import/i14y';
import { type AttributeNode, emptyProject } from '../../core/model';
import { useStore } from '../../state/store';
import concepts from '../../test/fixtures/i14y-concepts.json';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

const SEX_ID = concepts.sex.data.id;

function loadLinkedSex() {
  const project = emptyProject(['de-CH', 'fr-CH']);
  const [node] = addConcepts(project, project.root.id, [parseConcept(concepts.sex)]).nodes;
  useStore.getState().load(project);
  useStore.getState().select({ kind: 'node', id: node.id });
}

const sex = () => useStore.getState().project!.root.children[0] as AttributeNode;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  loadLinkedSex();
});

describe('I14Y link', () => {
  it('tags the attribute in the structure and names its concept in the panel', () => {
    render(<Workspace />);
    expect(within(screen.getByRole('region', { name: 'Structure' })).getByTitle('Linked to the I14Y concept sex')).toHaveTextContent('I14Y');
    const line = screen.getByRole('region', { name: 'I14Y concept' });
    expect(line).toHaveTextContent('From I14Y');
    expect(line).toHaveTextContent('Standard');
    expect(line).toHaveTextContent('Bundesamt für Statistik (BFS)');
    expect(within(line).getByRole('link', { name: /Open in I14Y/ })).toHaveAttribute(
      'href',
      `https://www.i14y.admin.ch/de/catalog/concepts/${SEX_ID}/description`,
    );
  });

  it('marks an edited label and resets it to I14Y', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const label = screen.getByLabelText('Label');
    await user.clear(label);
    await user.type(label, 'Gender');
    expect(screen.getByText('Edited. I14Y says "Geschlecht".')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset to I14Y' }));
    expect(sex().labels['de-CH']).toBe('Geschlecht');
    expect(screen.queryByText(/I14Y says/)).not.toBeInTheDocument();
  });

  it('resets an edited value label', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const value = screen.getByLabelText('2 (de-CH)');
    await user.clear(value);
    await user.type(value, 'Frau');
    await user.click(screen.getAllByRole('button', { name: 'Reset to I14Y: Weiblich' })[0]);
    expect(sex().entries?.labels['de-CH']['2']).toBe('Weiblich');
  });

  it('offers the I14Y text for an empty cell in the Translations view', async () => {
    useStore.getState().update((draft) => void delete draft.root.children[0].labels['fr-CH']);
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Translations' }));
    await user.click(screen.getByRole('button', { name: 'Use I14Y text: Sexe' }));
    expect(sex().labels['fr-CH']).toBe('Sexe');
  });

  it('unlinks the attribute and keeps its texts', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Unlink' }));
    expect(sex().i14y).toBeUndefined();
    expect(sex().labels['de-CH']).toBe('Geschlecht');
    expect(screen.queryByRole('region', { name: 'I14Y concept' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Linked to the I14Y concept sex')).not.toBeInTheDocument();
  });
});
