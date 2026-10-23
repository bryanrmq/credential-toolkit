// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type BaselineSource, makeBaseline } from '../../core/baseline';
import { buildBundle, serializeBundle } from '../../core/export/bundle';
import { buildOutputs } from '../../core/export/outputs';
import { type AttributeNode, type Project, emptyProject, newAttribute } from '../../core/model';
import { addLanguage } from '../../core/operations';
import { useStore } from '../../state/store';
import { fullDateTime } from '../lib/relativeTime';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

const SET_AT = Date.UTC(2026, 9, 12, 12, 5);
const WARNING = '#integrity changed. Publish the new bundle, then update the VCT metadata with the new value.';

function published(): Project {
  const project = emptyProject(['de-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.root.children.push(
    newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }),
    newAttribute('old', { source: ['old'], labels: { 'de-CH': 'Alt' } }),
  );
  project.hosting = { mode: 'dataUrl' };
  return project;
}

/** `before` with a type, a label and the credential name changed, `old` removed, `age` and French added. */
function edited(before: Project): Project {
  const after = structuredClone(before);
  const name = after.root.children[0] as AttributeNode;
  name.type = 'Numeric';
  name.labels['de-CH'] = 'Vorname';
  after.root.children.splice(1, 1);
  after.root.children.push(newAttribute('age', { source: ['age'], labels: { 'de-CH': 'Alter' } }));
  after.meta['de-CH'].name = 'Hundeausweis';
  addLanguage(after, 'fr-CH');
  after.meta['fr-CH'] = { name: 'Permis', description: '' };
  return after;
}

const bundleOf = async (project: Project) => serializeBundle((await buildBundle(project)).bundle);

/** Opens `after` with `before`'s bundle as its baseline, or with none. */
async function open(before: Project | null, after: Project, source: BaselineSource = 'download') {
  const baseline = before ? await makeBaseline(await bundleOf(before), after.hosting, source, SET_AT) : undefined;
  useStore.getState().load(after, undefined, { baseline });
  return baseline;
}

const output = () => within(screen.getByRole('region', { name: 'Output' }));
const changesTab = () => output().getByRole('tab', { name: /^Changes/ });
const row = (section: string, subject: string) =>
  within(output().getByRole('region', { name: section }))
    .getByText(subject, { selector: '.changes__subject' })
    .closest('li')!;

async function showChanges() {
  const user = userEvent.setup();
  render(<Workspace />);
  await user.click(changesTab());
  return user;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  useStore.setState({ outputTab: 'bundle' });
});

describe('Changes tab', () => {
  it('sits after Bundle and VCT', async () => {
    await open(null, published());
    render(<Workspace />);
    const tabs = within(output().getByRole('tablist', { name: 'Output' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Bundle', 'VCT snippet', 'Changes']);
  });

  it('asks for the published bundle when there is none', async () => {
    await open(null, published());
    const user = await showChanges();
    expect(changesTab()).toHaveAccessibleName('Changes');
    expect(output().getByText('Load the published bundle to see what changed before you publish.')).toBeInTheDocument();
    await user.click(output().getByRole('button', { name: 'Load published bundle' }));
    expect(screen.getByRole('menuitem', { name: 'From a file' })).toBeInTheDocument();
    expect(output().queryByText(/Compared with/)).not.toBeInTheDocument();
  });

  it('says there are no changes when the project matches the published bundle', async () => {
    const project = published();
    await open(project, project);
    await showChanges();
    expect(await output().findByText('No changes since the published bundle.')).toBeInTheDocument();
    expect(changesTab()).toHaveAccessibleName('Changes');
    expect(output().queryByText(WARNING)).not.toBeInTheDocument();
    expect(output().getByText(`Compared with the bundle downloaded on ${fullDateTime(SET_AT)}`)).toBeInTheDocument();
  });

  it('shows the count, the warning, both #integrity values and the grouped rows', async () => {
    const before = published();
    const after = edited(before);
    const baseline = await open(before, after);
    const current = (await buildOutputs(after, (await buildBundle(after)).bundle)).integrity;
    await showChanges();

    expect(await output().findByText(WARNING)).toBeInTheDocument();
    expect(changesTab()).toHaveAccessibleName('Changes 6');
    expect(within(changesTab()).getByText('6')).toHaveClass('tabs__count');

    const publishedRow = output().getByText('published').closest('div')!;
    expect(within(publishedRow).getByText(baseline!.integrity)).toBeInTheDocument();
    const currentRow = output().getByText('current').closest('div')!;
    expect(within(currentRow).getByText(current)).toBeInTheDocument();
    expect(within(currentRow).getByRole('button', { name: 'Copy integrity' })).toBeInTheDocument();
    expect(baseline!.integrity).not.toBe(current);

    const headings = output()
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Attributes', 'Labels', 'Branding', 'Languages']);
    expect(row('Attributes', 'name')).toHaveTextContent('changednametype Text to Numeric');
    expect(within(row('Attributes', 'old')).getByText('removed')).toHaveClass('change-tag--removed');
    expect(within(row('Attributes', 'age')).getByText('added')).toHaveClass('change-tag--added');
    expect(row('Labels', 'name')).toHaveTextContent('de-CH');
    expect(row('Branding', 'Name')).toHaveTextContent('de-CH');
    expect(within(row('Languages', 'French (fr-CH)')).getByText('added')).toBeInTheDocument();
    expect(output().getByText(`Compared with the bundle downloaded on ${fullDateTime(SET_AT)}`)).toBeInTheDocument();
  });

  it('jumps to the field of a row, but not for removed items', async () => {
    const before = published();
    const after = edited(before);
    await open(before, after);
    const user = await showChanges();
    await output().findByText(WARNING);
    const [name, age] = after.root.children;

    await user.click(within(row('Attributes', 'age')).getByRole('button', { name: 'age' }));
    expect(useStore.getState().selection).toMatchObject({ kind: 'node', id: age.id });

    await user.click(row('Labels', 'name'));
    expect(useStore.getState().selection).toMatchObject({ kind: 'node', id: name.id });
    expect(useStore.getState().editLang).toBe('de-CH');

    await user.click(row('Branding', 'Name'));
    expect(useStore.getState().selection).toEqual({ kind: 'credential' });

    const removed = row('Attributes', 'old');
    expect(within(removed).queryByRole('button')).not.toBeInTheDocument();
    await user.click(removed);
    expect(useStore.getState().selection).toEqual({ kind: 'credential' });

    await user.click(row('Languages', 'French (fr-CH)'));
    expect(useStore.getState().languagesOpen).toBe(true);
  });

  it('names where the baseline came from', async () => {
    const project = published();
    await open(project, project, 'import');
    await showChanges();
    expect(await output().findByText(`Compared with the bundle imported on ${fullDateTime(SET_AT)}`)).toBeInTheDocument();
    act(() => useStore.getState().setBaseline({ ...useStore.getState().baseline!, source: 'url' }));
    expect(await output().findByText(/^Compared with the bundle loaded on/)).toBeInTheDocument();
    expect(output().getAllByRole('button', { name: 'Load published bundle' })).toHaveLength(1);
  });

  it('updates the count and the list as the project is edited', async () => {
    const project = published();
    await open(project, project);
    render(<Workspace />);
    await waitFor(() => expect(changesTab()).toHaveAccessibleName('Changes'));

    act(() => useStore.getState().update((draft) => void draft.root.children.push(newAttribute('age', { source: ['age'] }))));
    await waitFor(() => expect(changesTab()).toHaveAccessibleName('Changes 1'));
    await userEvent.setup().click(changesTab());
    expect(row('Attributes', 'age')).toHaveTextContent('added');
    expect(output().getByText(WARNING)).toBeInTheDocument();

    act(() => useStore.getState().update((draft) => void draft.root.children.pop()));
    expect(await output().findByText('No changes since the published bundle.')).toBeInTheDocument();
    expect(changesTab()).toHaveAccessibleName('Changes');
  });
});
