// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttributeNode, emptyProject, newAttribute } from '../../core/model';
import { useStore } from '../../state/store';
import catalogue from '../../test/fixtures/i14y-catalogue.json';
import concepts from '../../test/fixtures/i14y-concepts.json';
import simpleBundle from '../../test/fixtures/oca-bundle-simple-sample.json';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { ImportDialog } from '../start/ImportDialog';
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
    expect(match).toHaveTextContent('Geburtsdatum');
    await user.click(within(match).getByRole('button', { name: 'Link to dateOfBirth' }));

    expect(await screen.findByRole('region', { name: 'I14Y concept' })).toBeInTheDocument();
    expect(attributes()[0]).toMatchObject({ key: 'date_of_birth', labels: { 'de-CH': 'Geb. Datum' }, i14y: { identifier: 'dateOfBirth' } });
    expect(screen.getByText('Edited. I14Y says "Geburtsdatum".')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Possible I14Y match' })).not.toBeInTheDocument();
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

  it('links every clear match at once', async () => {
    openBundle();
    const user = userEvent.setup();
    render(<Workspace />);
    const banner = await screen.findByRole('region', { name: 'I14Y matches' });
    expect(banner).toHaveTextContent('2 attributes look like I14Y concepts.');
    await user.click(within(banner).getByRole('button', { name: 'Link 2' }));

    await vi.waitFor(() => expect(attributes().map((node) => node.i14y?.identifier)).toEqual(['dateOfBirth', 'sex', undefined]));
    expect(attributes()[1].labels).toEqual({ 'fr-CH': 'Sexe' });
    expect(screen.queryByRole('region', { name: 'I14Y matches' })).not.toBeInTheDocument();
  });

  it('opens the first match for review', async () => {
    openBundle();
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(await screen.findByRole('region', { name: 'I14Y matches' })).getByRole('button', { name: 'Review' }));
    expect(useStore.getState().selection).toEqual({ kind: 'node', id: attributes()[0].id });
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
