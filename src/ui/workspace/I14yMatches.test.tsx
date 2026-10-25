// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConcept } from '../../core/import/i14y';
import { type AttributeNode, emptyProject, newAttribute } from '../../core/model';
import { oneNode } from '../../state/selection';
import { useStore } from '../../state/store';
import catalogue from '../../test/fixtures/i14y-catalogue.json';
import concepts from '../../test/fixtures/i14y-concepts.json';
import simpleBundle from '../../test/fixtures/oca-bundle-simple-sample.json';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { ImportDialog } from '../start/ImportDialog';
import { I14yMatchLine } from './I14yLink';
import { Workspace } from './Workspace';

/** Answers like the I14Y API: the catalogue for the concept list, and the sex and date-of-birth concepts. */
function stubI14y() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/concepts?')) return Response.json(catalogue);
      for (const concept of [concepts.sex, concepts.dateOfBirth]) {
        if (url.includes(`/concepts/${concept.data.id}`)) return Response.json(concept);
      }
      return new Response(null, { status: 404 });
    }),
  );
}

function projectWith(...attributes: AttributeNode[]) {
  const project = emptyProject(['de-CH', 'fr-CH']);
  project.root.children.push(...attributes);
  return project;
}

const attributes = () => useStore.getState().project!.root.children as AttributeNode[];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  stubI14y();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('I14Y matches in the attribute panel', () => {
  it('links an attribute that looks like a concept without changing its texts', async () => {
    const dob = newAttribute('date_of_birth', { labels: { 'de-CH': 'Geb. Datum' } });
    useStore.getState().load(projectWith(dob));
    useStore.getState().select({ kind: 'node', id: dob.id });
    const user = userEvent.setup();
    render(<Workspace />);

    const match = await screen.findByRole('region', { name: 'Possible I14Y match' });
    expect(match).toHaveTextContent(/^I14Y\?Looks likeGeburtsdatumdateOfBirth/);
    expect(match.querySelectorAll('.i14y-link--match')).toHaveLength(1);
    await user.click(within(match).getByRole('button', { name: 'Link to dateOfBirth' }));

    expect(await screen.findByRole('region', { name: 'I14Y concept' })).toBeInTheDocument();
    expect(attributes()[0]).toMatchObject({ key: 'date_of_birth', labels: { 'de-CH': 'Geb. Datum' }, i14y: { identifier: 'dateOfBirth' } });
    expect(screen.getByText('Edited. I14Y says "Geburtsdatum".')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Possible I14Y match' })).not.toBeInTheDocument();
  });

  it('gives each candidate its own dashed line with a Link button', async () => {
    const hits = [parseConcept(concepts.sex), parseConcept(concepts.dateOfBirth)];
    const onLink = vi.fn();
    const user = userEvent.setup();
    render(<I14yMatchLine hits={hits} lang="de-CH" onLink={onLink} />);

    const lines = screen.getByRole('region', { name: 'Possible I14Y match' }).querySelectorAll('.i14y-link--match');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent(/^I14Y\?Looks likeGeschlechtsex.*Link$/);
    expect(lines[1]).toHaveTextContent(/^I14Y\?Looks likeGeburtsdatumdateOfBirth.*Link$/);
    expect(within(lines[0] as HTMLElement).getByText('Geschlecht')).toHaveAttribute('title', 'Published by Bundesamt für Statistik (BFS)');
    await user.click(screen.getByRole('button', { name: 'Link to dateOfBirth' }));
    expect(onLink).toHaveBeenCalledWith(hits[1]);
  });
});

describe('I14Y matches in the structure', () => {
  it('marks unlinked attributes that look like a concept', async () => {
    useStore.getState().load(projectWith(newAttribute('date_of_birth'), newAttribute('permit_number')));
    render(<Workspace />);
    const structure = screen.getByRole('region', { name: 'Structure' });
    const marker = await within(structure).findByTitle('Looks like the I14Y concept Geburtsdatum (dateOfBirth). Open it to link.');
    expect(marker).toHaveTextContent('I14Y?');
    expect(within(structure).getAllByText('I14Y?')).toHaveLength(1);
  });
});

describe('I14Y matches after opening a bundle', () => {
  function openBundle() {
    const project = projectWith(
      newAttribute('date_of_birth'),
      newAttribute('gender', { labels: { 'fr-CH': 'Sexe' } }),
      newAttribute('permit_number', { labels: { 'de-CH': 'Bewilligungsnummer' } }),
    );
    useStore.getState().load(project, [], { reviewI14y: true });
  }

  /** The workspace notice, once its one line has loaded the matches. */
  const notice = () => screen.findByRole('region', { name: 'Import report' });
  /** Opens the notice's details and returns its I14Y part. */
  async function review(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(await notice()).getByRole('button', { name: 'Show details' }));
    return screen.getByRole('region', { name: 'I14Y matches' });
  }

  it('links every clear match at once', async () => {
    openBundle();
    const user = userEvent.setup();
    render(<Workspace />);
    await vi.waitFor(async () => expect(await notice()).toHaveTextContent('2 attributes look like I14Y concepts.'));
    const banner = await review(user);
    await user.click(within(banner).getByRole('button', { name: 'Link 2' }));

    await vi.waitFor(() => expect(attributes().map((node) => node.i14y?.identifier)).toEqual(['dateOfBirth', 'sex', undefined]));
    expect(attributes()[1].labels).toEqual({ 'fr-CH': 'Sexe' });
    expect(screen.queryByRole('region', { name: 'I14Y matches' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Import report' })).not.toBeInTheDocument();
  });

  it('opens the first match for review', async () => {
    openBundle();
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(await review(user)).getByRole('button', { name: 'Review' }));
    expect(useStore.getState().selection).toEqual(oneNode(attributes()[0].id));
  });

  it('steps through the matches with Back and Next', async () => {
    openBundle();
    const user = userEvent.setup();
    render(<Workspace />);
    const banner = await review(user);
    const selected = () => useStore.getState().selection;
    const node = (index: number) => oneNode(attributes()[index].id);

    await user.click(within(banner).getByRole('button', { name: 'Review' }));
    expect(selected()).toEqual(node(0));
    expect(banner).toHaveTextContent('1 of 2');
    await user.click(within(banner).getByRole('button', { name: 'Next' }));
    expect(selected()).toEqual(node(1));
    expect(banner).toHaveTextContent('2 of 2');
    await user.click(within(banner).getByRole('button', { name: 'Next' }));
    expect(selected()).toEqual(node(0));
    await user.click(within(banner).getByRole('button', { name: 'Back' }));
    expect(selected()).toEqual(node(1));
  });

  it('lists the matches and opens the one clicked', async () => {
    openBundle();
    const user = userEvent.setup();
    render(<Workspace />);
    const banner = await review(user);
    await user.click(within(banner).getByRole('button', { name: 'Show which' }));
    const list = within(banner).getByRole('list', { name: 'Attributes that look like I14Y concepts' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Geburtsdatum'),
      expect.stringContaining('Geschlecht'),
    ]);
    await user.click(within(list).getByRole('button', { name: 'gender' }));
    expect(useStore.getState().selection).toEqual(oneNode(attributes()[1].id));
  });

  it('shares one notice line with the import report, the details behind Show details', async () => {
    const project = projectWith(newAttribute('date_of_birth'), newAttribute('gender', { labels: { 'fr-CH': 'Sexe' } }));
    useStore.getState().load(project, [{ level: 'info', message: 'Read 2 attributes.' }, { level: 'warning', message: 'No issuer.' }], { reviewI14y: true });
    const user = userEvent.setup();
    render(<Workspace />);
    await vi.waitFor(async () => expect(await notice()).toHaveTextContent('Import report: 2 notes · 2 attributes look like I14Y concepts.'));
    expect(screen.getAllByRole('region', { name: /Import report|I14Y matches/ })).toHaveLength(1);
    expect(screen.queryByText('No issuer.')).not.toBeInTheDocument();

    const banner = await review(user);
    expect(screen.getByText('No issuer.')).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Review' })).toBeInTheDocument();
    await user.click(within(await notice()).getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByRole('region', { name: 'I14Y matches' })).not.toBeInTheDocument();
  });

  it('dismisses the notes and the matches together', async () => {
    useStore.getState().load(projectWith(newAttribute('date_of_birth')), [{ level: 'info', message: 'Read 1 attribute.' }], { reviewI14y: true });
    const user = userEvent.setup();
    render(<Workspace />);
    await vi.waitFor(async () => expect(await notice()).toHaveTextContent('1 attribute looks like I14Y concepts.'));
    await user.click(within(await notice()).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Import report' })).not.toBeInTheDocument();
    expect(useStore.getState()).toMatchObject({ report: null, i14yReview: false });
  });

  it('leaves the matches out on the Metadata page', async () => {
    useStore.getState().load(projectWith(newAttribute('date_of_birth')), [{ level: 'info', message: 'Read 1 attribute.' }], { reviewI14y: true });
    render(<Workspace />);
    await vi.waitFor(async () => expect(await notice()).toHaveTextContent('I14Y'));
    act(() => useStore.getState().setArea('metadata'));
    // One note and nothing else: the line shows the note itself.
    expect(await notice()).toHaveTextContent('Read 1 attribute.');
    expect(await notice()).not.toHaveTextContent('I14Y');
    expect(within(await notice()).queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument();
  });

  it('shows no notice on the Metadata page when only matches are left', async () => {
    openBundle();
    render(<Workspace />);
    await notice();
    act(() => useStore.getState().setArea('metadata'));
    expect(screen.queryByRole('region', { name: 'Import report' })).not.toBeInTheDocument();
    expect(useStore.getState().i14yReview).toBe(true);
  });

  it('stays hidden when the project was not opened from a bundle', async () => {
    useStore.getState().load(projectWith(newAttribute('date_of_birth')));
    render(<Workspace />);
    await screen.findByRole('region', { name: 'Structure' });
    expect(screen.queryByRole('region', { name: 'I14Y matches' })).not.toBeInTheDocument();
  });

  it('is asked for when a bundle is opened from the start screen', async () => {
    useStore.getState().close();
    const user = userEvent.setup();
    render(<ImportDialog kind="bundle" onClose={() => {}} />);
    await user.click(screen.getByLabelText(/Paste JSON/));
    await user.paste(JSON.stringify(simpleBundle));
    await user.click(screen.getByRole('button', { name: 'Open in editor' }));
    await vi.waitFor(() => expect(useStore.getState().project).not.toBeNull());
    expect(useStore.getState().i14yReview).toBe(true);
  });
});
