// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { linkConcept, parseConcept } from '../../core/import/i14y';
import { type AttributeNode, emptyProject, newAttribute } from '../../core/model';
import { insertNode } from '../../core/operations';
import { reviewMarks } from '../../core/review';
import { useStore } from '../../state/store';
import concepts from '../../test/fixtures/i14y-concepts.json';
import { availableCommands, runCommand } from '../lib/commands';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

const FILL = 'Fill missing languages from I14Y';
const dateOfBirth = parseConcept(concepts.dateOfBirth);
const sex = parseConcept(concepts.sex);

/**
 * De and fr: `dob` linked to dateOfBirth with only its German label written, `name` unlinked. With `withoutTexts`,
 * the links carry no texts, as in a project file written elsewhere, so their concepts must be fetched.
 */
function loadProject({ filled = false, withoutTexts = false } = {}) {
  const project = emptyProject(['de-CH', 'fr-CH']);
  const dob = newAttribute('dob', { source: ['dob'], labels: { 'de-CH': 'Geb. Datum', ...(filled && { 'fr-CH': 'Né le' }) } });
  const gender = newAttribute('gender', {
    source: ['gender'],
    labels: { 'de-CH': 'Geschlecht', 'fr-CH': 'Genre' },
    entries: { codes: ['1'], labels: { 'de-CH': { '1': 'Mann' }, 'fr-CH': filled ? { '1': 'Homme' } : {} } },
  });
  const name = newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } });
  for (const node of [dob, gender, name]) insertNode(project, project.root.id, node);
  linkConcept(project, dob.id, dateOfBirth);
  linkConcept(project, gender.id, sex);
  if (withoutTexts) for (const node of [dob, gender]) node.i14y = { ...node.i14y!, name: {}, values: {} };
  project.hosting = { mode: 'dataUrl' };
  useStore.getState().load(project);
}

/** Answers like the I14Y API: the concepts in `known`, 404 for any other. */
function stubI14y(known = [concepts.dateOfBirth, concepts.sex]) {
  const fetchMock = vi.fn(async (url: string) => {
    const concept = known.find((body) => url.includes(`/concepts/${body.data.id}`));
    return concept ? Response.json(concept) : new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The I14Y concepts `fetchMock` was asked for; the latest-release lookup is left out. */
const conceptCalls = (fetchMock: ReturnType<typeof stubI14y>) => fetchMock.mock.calls.filter(([url]) => url.includes('/concepts/'));
const project = () => useStore.getState().project!;
const node = (key: string) => project().root.children.find((child) => child.key === key) as AttributeNode;
const marked = () => reviewMarks(project()).map((mark) => `${mark.place.kind} ${mark.lang} ${mark.text}`);
const toast = () => document.querySelector('.toast');

async function openMoreActions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More actions' }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
});

describe('Fill missing languages from I14Y', () => {
  it('fills the empty texts of linked attributes from More actions, marked for review, as one undo step', async () => {
    loadProject();
    const fetchMock = stubI14y();
    const user = userEvent.setup();
    render(<Workspace />);
    const steps = useStore.getState().past.length;
    await openMoreActions(user);
    await user.click(screen.getByRole('menuitem', { name: FILL }));

    await waitFor(() => expect(toast()).toHaveTextContent('Filled 2 texts from I14Y, marked for review.'));
    expect(toast()).not.toHaveClass('toast--error');
    // The links carry the texts: nothing is fetched.
    expect(conceptCalls(fetchMock)).toHaveLength(0);
    expect(node('dob').labels).toEqual({ 'de-CH': 'Geb. Datum', 'fr-CH': 'Date de naissance' });
    expect(node('gender').labels).toEqual({ 'de-CH': 'Geschlecht', 'fr-CH': 'Genre' });
    expect(node('gender').entries?.labels['fr-CH']).toEqual({ '1': 'Masculin' });
    expect(node('name').labels).toEqual({ 'de-CH': 'Name' });
    expect(marked()).toEqual(['label fr-CH Date de naissance', 'entry fr-CH Masculin']);
    expect(useStore.getState().past).toHaveLength(steps + 1);

    // Nothing is left to fill, so the action is gone.
    await openMoreActions(user);
    expect(screen.queryByRole('menuitem', { name: FILL })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
  });

  it("takes the whole fill back with the toast's Undo", async () => {
    loadProject();
    const user = userEvent.setup();
    render(<Workspace />);
    const before = project();
    await openMoreActions(user);
    await user.click(screen.getByRole('menuitem', { name: FILL }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(project()).toBe(before);
    expect(marked()).toEqual([]);
    expect(toast()).toBeNull();
  });

  it('is in the command list, and runs from it', async () => {
    loadProject();
    render(<Workspace />);
    expect(availableCommands().map((entry) => entry.id)).toContain('workspace.fillFromI14y');
    act(() => runCommand('workspace.fillFromI14y'));
    await waitFor(() => expect(marked()).toHaveLength(2));
    expect(availableCommands().map((entry) => entry.id)).not.toContain('workspace.fillFromI14y');
  });

  it('is not offered when nothing can be filled, and never overwrites', async () => {
    loadProject({ filled: true });
    const user = userEvent.setup();
    render(<Workspace />);
    expect(availableCommands().map((entry) => entry.id)).not.toContain('workspace.fillFromI14y');
    await openMoreActions(user);
    expect(screen.queryByRole('menuitem', { name: FILL })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    // Run anyway: no change, no undo step.
    const before = project();
    await act(async () => runCommand('workspace.fillFromI14y'));
    expect(project()).toBe(before);
    expect(node('dob').labels['fr-CH']).toBe('Né le');
    expect(node('gender').entries?.labels['fr-CH']).toEqual({ '1': 'Homme' });
  });

  it('fetches concepts whose link carries no texts, and names the ones that failed to load', async () => {
    loadProject({ withoutTexts: true });
    const fetchMock = stubI14y([concepts.dateOfBirth]);
    const user = userEvent.setup();
    render(<Workspace />);
    const steps = useStore.getState().past.length;
    await openMoreActions(user);
    await user.click(screen.getByRole('menuitem', { name: FILL }));

    await waitFor(() => expect(toast()).toHaveTextContent('Filled 1 text from I14Y, marked for review. Could not load from I14Y: sex.'));
    expect(conceptCalls(fetchMock)).toHaveLength(2);
    expect(node('dob').labels['fr-CH']).toBe('Date de naissance');
    expect(node('dob').i14y?.name.fr).toBe('Date de naissance');
    expect(node('gender').entries?.labels['fr-CH']).toEqual({});
    expect(marked()).toEqual(['label fr-CH Date de naissance']);
    expect(useStore.getState().past).toHaveLength(steps + 1);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('says so, and changes nothing, when no concept loads', async () => {
    loadProject({ withoutTexts: true });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    render(<Workspace />);
    const before = project();
    await act(async () => runCommand('workspace.fillFromI14y'));
    await waitFor(() => expect(toast()).toHaveTextContent('Nothing filled. Could not load from I14Y: dateOfBirth, sex.'));
    expect(toast()).toHaveClass('toast--error');
    expect(project()).toBe(before);
  });
});
