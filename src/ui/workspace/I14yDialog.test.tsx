// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from '../../core/model';
import { useStore } from '../../state/store';
import concepts from '../../test/fixtures/i14y-concepts.json';
import search from '../../test/fixtures/i14y-search-geschlecht.json';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

/** Answers like the I14Y API: the search fixture for any search, the sex concept for its id. */
function stubI14y() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/search?')) return Response.json(search);
    if (url.includes(`/concepts/${concepts.sex.data.id}`)) return Response.json(concepts.sex);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  useStore.getState().load(emptyProject(['de-CH', 'rm-CH']));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('I14yDialog', () => {
  it('adds a picked concept as an attribute and reports the missing language', async () => {
    const fetchMock = stubI14y();
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Add attributes from I14Y' }));
    const dialog = screen.getByRole('dialog', { name: 'Add attributes from I14Y' });
    await user.type(within(dialog).getByLabelText('Search I14Y'), 'Geschlecht');

    await user.click(await within(dialog).findByRole('checkbox', { name: 'Geschlecht (sex)' }));
    expect(within(dialog).queryByRole('checkbox', { name: /DV_SEXE/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add 1 attribute' }));

    await screen.findByText('sex: I14Y has no text in rm-CH. Fill it in the Translations view.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const [attribute] = useStore.getState().project!.root.children;
    expect(attribute).toMatchObject({ key: 'sex', labels: { 'de-CH': 'Geschlecht' } });
    expect(useStore.getState().selection).toEqual({ kind: 'node', id: attribute.id });
    const searchUrl = fetchMock.mock.calls.map(([url]) => url).find((url) => url.includes('/search?'));
    expect(searchUrl).toContain('query=Geschlecht');
    expect(searchUrl).toContain('language=de');
  });

  it('hides the previous results as soon as the search changes', async () => {
    stubI14y();
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Add attributes from I14Y' }));
    const search = screen.getByLabelText('Search I14Y');
    await user.type(search, 'Geschlecht');
    await screen.findByRole('checkbox', { name: 'Geschlecht (sex)' });

    await user.type(search, 'x');
    expect(screen.queryByRole('checkbox', { name: 'Geschlecht (sex)' })).not.toBeInTheDocument();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('says so when I14Y cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Add attributes from I14Y' }));
    await user.type(screen.getByLabelText('Search I14Y'), 'Geschlecht');
    expect(await screen.findByText('I14Y could not be reached. Check your connection and try again.')).toBeInTheDocument();
    expect(useStore.getState().project!.root.children).toEqual([]);
  });
});
