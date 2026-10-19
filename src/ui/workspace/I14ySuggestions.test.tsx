// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttributeNode, emptyProject, newAttribute } from '../../core/model';
import { useStore } from '../../state/store';
import catalogue from '../../test/fixtures/i14y-catalogue.json';
import concepts from '../../test/fixtures/i14y-concepts.json';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

/** Answers like the I14Y API: the catalogue fixture for the concept list, the sex concept for its id. */
function stubI14y() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/concepts?')) return Response.json(catalogue);
    if (url.includes(`/concepts/${concepts.sex.data.id}`)) return Response.json(concepts.sex);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function editAttribute(init: Partial<AttributeNode> = {}) {
  const project = emptyProject(['de-CH', 'fr-CH']);
  const attribute = newAttribute('attribute', { source: ['attribute'], ...init });
  project.root.children.push(attribute);
  useStore.getState().load(project);
  useStore.getState().select({ kind: 'node', id: attribute.id });
  return attribute.id;
}

const attribute = (id: string) => useStore.getState().project!.root.children.find((node) => node.id === id) as AttributeNode;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('I14Y suggestions', () => {
  it('fills the attribute from a concept picked while typing the label', async () => {
    stubI14y();
    const id = editAttribute({ labels: { 'fr-CH': 'Genre' } });
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(screen.getByLabelText('Label'), 'Gesch');
    await user.click(await screen.findByRole('option', { name: /Geschlecht/ }));

    await vi.waitFor(() => expect(attribute(id).key).toBe('sex'));
    expect(attribute(id)).toMatchObject({ source: ['sex'], labels: { 'de-CH': 'Geschlecht', 'fr-CH': 'Genre' } });
    expect(attribute(id).entries?.codes).toEqual(['1', '2', '3']);
  });

  it('takes a suggestion from the key field with the keyboard', async () => {
    stubI14y();
    const id = editAttribute({ key: 'gender', source: ['gender'] });
    const user = userEvent.setup();
    render(<Workspace />);
    const key = screen.getByLabelText('Key');
    await user.clear(key);
    await user.type(key, 'sex');
    await screen.findByRole('option', { name: /Geschlecht/ });
    await user.keyboard('{ArrowDown}{Enter}');

    await vi.waitFor(() => expect(attribute(id).labels['de-CH']).toBe('Geschlecht'));
    expect(attribute(id)).toMatchObject({ key: 'sex', source: ['gender'] });
  });

  it('commits the typed key on Enter when no suggestion is highlighted', async () => {
    const fetchMock = stubI14y();
    const id = editAttribute();
    const user = userEvent.setup();
    render(<Workspace />);
    const key = screen.getByLabelText('Key');
    await user.clear(key);
    await user.type(key, 'gesch');
    await screen.findByRole('option', { name: /Geschlecht/ });
    await user.keyboard('{Enter}');

    expect(attribute(id).key).toBe('gesch');
    expect(fetchMock.mock.calls.some(([url]) => url.includes(concepts.sex.data.id))).toBe(false);
  });

  it('never sends what is typed to I14Y', async () => {
    const fetchMock = stubI14y();
    editAttribute();
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(screen.getByLabelText('Label'), 'Geschlecht');
    await screen.findByRole('option', { name: /Geschlecht/ });

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url.includes('Gesch'))).toEqual([]);
    expect(urls.filter((url) => url.includes('/concepts?')).length).toBeLessThanOrEqual(1);
  });
});
