// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { addConcepts, parseConcept } from '../../core/import/i14y';
import { type AttributeNode, emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { validate } from '../../core/validate';
import { useStore } from '../../state/store';
import concepts from '../../test/fixtures/i14y-concepts.json';
import { goToIssue } from '../issues';
import { Inspector } from './Inspector';
import { editingFirst } from './translationRows';

const LANGUAGES = ['de-CH', 'fr-CH', 'en-GB'];

/** De, fr and en; a `name` attribute labelled in German only, and the credential named in German. */
function loadProject() {
  const project = emptyProject(LANGUAGES);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }));
  useStore.getState().load(project);
}

const project = () => useStore.getState().project!;
const nameNode = () => project().root.children[0];
const selectName = () => useStore.getState().select({ kind: 'node', id: nameNode().id });

/** The language rows of the field labelled `label`, as [code, value, editing] per row. */
function rows(label: string) {
  const field = screen.getByText(label, { selector: 'label' }).closest('.field')!;
  return [...field.querySelectorAll<HTMLElement>('.lang-row')].map((row) => [
    row.querySelector('.lang-row__code')!.textContent,
    row.querySelector('input')!.value,
    row.hasAttribute('data-editing'),
  ]);
}

beforeEach(() => {
  localStorage.clear();
  loadProject();
});

describe('editingFirst', () => {
  it('puts the editing language first and keeps the others in project order', () => {
    expect(editingFirst(LANGUAGES, 'en-GB')).toEqual(['en-GB', 'de-CH', 'fr-CH']);
    expect(editingFirst(LANGUAGES, 'de-CH')).toEqual(LANGUAGES);
  });
});

describe('Language rows in the form', () => {
  it('lists every language, the editing one first and marked, then the rest in project order', () => {
    selectName();
    render(<Inspector />);
    expect(rows('Label')).toEqual([
      ['de-CH', 'Name', true],
      ['fr-CH', '', false],
      ['en-GB', '', false],
    ]);
    // The field's own label names the editing language's input, so issue and change jumps land on it.
    expect(screen.getByLabelText('Label')).toHaveAttribute('id', `field-${nameNode().id}-label`);
  });

  it('reorders the rows when the editing language changes', () => {
    selectName();
    render(<Inspector />);
    act(() => useStore.getState().setEditLang('en-GB'));
    expect(rows('Label').map(([code, , editing]) => [code, editing])).toEqual([
      ['en-GB', true],
      ['de-CH', false],
      ['fr-CH', false],
    ]);
    expect(screen.getByLabelText('Label')).toHaveValue('');
    expect(screen.getByLabelText('Label (de-CH)')).toHaveValue('Name');
  });

  it('edits a language other than the editing one, and only that language, in one undo step', async () => {
    const user = userEvent.setup();
    selectName();
    render(<Inspector />);
    await user.type(screen.getByLabelText('Label (fr-CH)'), 'Nom');
    expect(nameNode().labels).toEqual({ 'de-CH': 'Name', 'fr-CH': 'Nom' });
    expect(useStore.getState().editLang).toBe('de-CH');
    act(() => useStore.getState().undo());
    expect(nameNode().labels).toEqual({ 'de-CH': 'Name' });
  });

  it('highlights empty languages', async () => {
    const user = userEvent.setup();
    selectName();
    render(<Inspector />);
    expect(screen.getByLabelText('Label')).not.toHaveAttribute('data-empty');
    const french = screen.getByLabelText('Label (fr-CH)');
    expect(french).toHaveAttribute('data-empty', 'true');
    await user.type(french, 'Nom');
    expect(french).not.toHaveAttribute('data-empty');
  });

  it('shows the credential name, description and primary field in every language', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    expect(rows('Name')).toEqual([
      ['de-CH', 'Hundebewilligung', true],
      ['fr-CH', '', false],
      ['en-GB', '', false],
    ]);
    expect(rows('Description').map(([code, value]) => [code, value])).toEqual([
      ['de-CH', 'Für Hundehalter'],
      ['fr-CH', ''],
      ['en-GB', ''],
    ]);
    await user.type(screen.getByLabelText('Name (en-GB)'), 'Dog permit');
    await user.type(screen.getByLabelText('Description (fr-CH)'), 'Pour les détenteurs');
    expect(project().meta['en-GB'].name).toBe('Dog permit');
    expect(project().meta['fr-CH'].description).toBe('Pour les détenteurs');
    expect(project().meta['de-CH']).toEqual({ name: 'Hundebewilligung', description: 'Für Hundehalter' });
  });

  it('inserts an attribute with {{ in the primary field of another language', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    expect(rows('Primary field').map(([code]) => code)).toEqual(LANGUAGES);
    const french = screen.getByLabelText('Primary field (fr-CH)');
    await user.type(french, 'Titulaire {{{{');
    await user.click(screen.getByRole('option', { name: 'name' }));
    expect(project().branding['fr-CH']?.light.primaryField).toBe('Titulaire {{name}}');
    expect(project().branding['de-CH']?.light.primaryField).toBeUndefined();
  });

  it('lists the dark primary field only for the languages with a dark branding', () => {
    useStore.getState().update((draft) => {
      draft.branding['de-CH'] = { light: {}, dark: { primaryField: 'Dunkel' } };
      draft.branding['en-GB'] = { light: {}, dark: {} };
    });
    useStore.getState().setBrandingTheme('dark');
    render(<Inspector />);
    expect(rows('Primary field').map(([code, value]) => [code, value])).toEqual([
      ['de-CH', 'Dunkel'],
      ['en-GB', ''],
    ]);
  });

  it('heads a group with its headline in every language', () => {
    const group = newGroupLink('pets', { source: ['pets'], array: true, labels: { 'fr-CH': 'Animaux' } });
    useStore.getState().update((draft) => void draft.root.children.push(group));
    useStore.getState().select({ kind: 'node', id: group.id });
    render(<Inspector />);
    expect(rows('Headline')).toEqual([
      ['de-CH', '', true],
      ['fr-CH', 'Animaux', false],
      ['en-GB', '', false],
    ]);
  });

  it('jumps from an issue in one language to the label in that language', async () => {
    selectName();
    render(<Inspector />);
    const issue = validate(project()).find((found) => found.code === 'label-missing' && 'lang' in found.target && found.target.lang === 'fr-CH')!;
    act(() => goToIssue(issue));
    expect(useStore.getState().editLang).toBe('fr-CH');
    await waitFor(() => expect(screen.getByLabelText('Label')).toHaveFocus());
    expect(rows('Label')[0]).toEqual(['fr-CH', '', true]);
  });
});

describe('Language rows for value lists and I14Y', () => {
  beforeEach(() => {
    const linked = emptyProject(['de-CH', 'fr-CH']);
    const [node] = addConcepts(linked, linked.root.id, [parseConcept(concepts.sex)]).nodes;
    useStore.getState().load(linked);
    useStore.getState().select({ kind: 'node', id: node.id });
  });
  const sex = () => project().root.children[0] as AttributeNode;

  it('lists each value label in every language and edits one language', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    const female = screen.getByLabelText('2 (de-CH)').closest('.lang-rows') as HTMLElement;
    expect(within(female).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)).toEqual(['Weiblich', 'Féminin']);
    await user.clear(screen.getByLabelText('2 (fr-CH)'));
    await user.type(screen.getByLabelText('2 (fr-CH)'), 'Femme');
    expect(sex().entries?.labels['fr-CH']['2']).toBe('Femme');
    expect(sex().entries?.labels['de-CH']['2']).toBe('Weiblich');
  });

  it('resets one language of a label to I14Y', async () => {
    const user = userEvent.setup();
    useStore.getState().update((draft) => {
      draft.root.children[0].labels['de-CH'] = 'Gender';
      delete draft.root.children[0].labels['fr-CH'];
    });
    render(<Inspector />);
    expect(screen.getByLabelText('Label (fr-CH)')).toHaveAttribute('data-empty', 'true');
    await user.click(screen.getByRole('button', { name: 'Use I14Y text: Sexe' }));
    expect(sex().labels).toEqual({ 'de-CH': 'Gender', 'fr-CH': 'Sexe' });
    await user.click(screen.getByRole('button', { name: 'Reset to I14Y: Geschlecht' }));
    expect(sex().labels).toEqual({ 'de-CH': 'Geschlecht', 'fr-CH': 'Sexe' });
  });

  it('resets one language of a value label to I14Y', async () => {
    const user = userEvent.setup();
    useStore.getState().update((draft) => {
      const node = draft.root.children[0] as AttributeNode;
      node.entries!.labels['fr-CH']['1'] = 'Homme';
    });
    render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Reset to I14Y: Masculin' }));
    expect(sex().entries?.labels['fr-CH']['1']).toBe('Masculin');
    expect(sex().entries?.labels['de-CH']['1']).toBe('Männlich');
  });
});

describe('Language rows in a one-language project', () => {
  beforeEach(() => {
    const single = emptyProject(['de-CH']);
    single.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }));
    useStore.getState().load(single);
  });

  it('keeps a single input per text, with no language code or highlight', () => {
    render(<Inspector />);
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('data-empty');
    expect(screen.getByLabelText('Description')).not.toHaveAttribute('data-empty');
    expect(document.querySelector('.lang-rows, .lang-row__code')).toBeNull();
  });

  it('keeps a single label input for an attribute', () => {
    selectName();
    render(<Inspector />);
    expect(screen.getByLabelText('Label')).toHaveValue('Name');
    expect(screen.queryByLabelText(/^Label \(/)).not.toBeInTheDocument();
    expect(document.querySelector('.lang-row__code')).toBeNull();
  });
});
