// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Group, type Node, emptyGroup, emptyProject, findNode, newAttribute, newGroupLink, walkNodes } from '../../core/model';
import type { CardPlatform } from '../../core/card/profiles';
import { useStore } from '../../state/store';
import { EDIT_PREVIEW_OPEN_KEY } from '../lib/paneLayout';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Inspector } from './Inspector';
import { Workspace } from './Workspace';

const DE = 'de-CH';
const group = (...children: Node[]): Group => ({ ...emptyGroup(), children });

/** A dog licence with a name, an owner group holding an address group, and a sample claim no attribute maps to. */
function load(platform: CardPlatform) {
  const project = emptyProject([DE, 'en-GB']);
  project.meta[DE] = { name: 'Hundebewilligung', description: '' };
  project.root.children.push(
    newAttribute('name', { source: ['name'], labels: { [DE]: 'Name' } }),
    newGroupLink('owner', {
      source: ['owner'],
      labels: { [DE]: 'Halter' },
      group: group(
        newAttribute('given_name', { source: ['owner', 'given_name'], labels: { [DE]: 'Vorname' } }),
        newGroupLink('address', {
          source: ['owner', 'address'],
          labels: { [DE]: 'Adresse' },
          group: group(newAttribute('city', { source: ['owner', 'address', 'city'], labels: { [DE]: 'Ort' } })),
        }),
      ),
    }),
  );
  project.sample = { name: 'Rex', owner: { given_name: 'Anna', address: { city: 'Bern' } }, extra: 'x' };
  useStore.getState().load(project);
  useStore.setState({ cardPlatform: platform, cardVariant: 'details', editLang: DE, brandingTheme: 'light' });
}

/** The id of the node with `key`, anywhere in the tree. */
const idOf = (key: string) => [...walkNodes(useStore.getState().project!.root)].find(({ node }) => node.key === key)!.node.id;
const selectedKey = () => {
  const { project, selection } = useStore.getState();
  return selection.kind === 'node' ? findNode(project!.root, selection.id)?.node.key : 'Credential';
};
const select = (key: string) => act(() => useStore.getState().select({ kind: 'node', id: idOf(key) }));
/** The wallet preview in the Edit pane. */
const preview = () => within(screen.getByRole('region', { name: 'Preview' }));
const tree = () => screen.getByRole('tree', { name: 'Structure' });
const treeRow = (key: string) =>
  within(tree())
    .getAllByRole('treeitem')
    .find((item) => item.querySelector('.tree__key')?.textContent === key)!;
const linked = () => [...document.querySelectorAll('.edit-preview [data-linked]')];
/** Gives every element `width` px, as a wide or narrow Edit pane would (jsdom lays nothing out). */
const paneWidth = (width: number) => vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
/** `matchMedia` answering `matches` for the queries `matching` picks. */
const stubMedia = (matching: (query: string) => boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matching(query), media: query, addEventListener: () => {}, removeEventListener: () => {} }));

const scrollIntoView = vi.fn();
/** The elements scrolled into view in the Edit pane's preview, with the options given. */
const scrolled = () =>
  scrollIntoView.mock.contexts
    .map((element, index) => ({ element: element as Element, options: scrollIntoView.mock.calls[index][0] }))
    .filter(({ element }) => element.closest('.edit-preview'));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, 'true');
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrollIntoView, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe.each(['ios', 'android'] as const)('Details preview linked to the editor (%s)', (platform) => {
  beforeEach(() => load(platform));

  it('outlines and scrolls to the row of the attribute selected in the tree, leaving focus in the tree', async () => {
    paneWidth(900);
    const user = userEvent.setup();
    render(<Workspace />);
    expect(linked()).toEqual([]);

    await user.click(treeRow('city'));
    const row = preview().getByRole('button', { name: 'Ort, Bern' });
    expect(linked()).toEqual([row]);
    expect(scrolled()).toEqual([{ element: row, options: { block: 'nearest', behavior: 'smooth' } }]);
    expect(document.activeElement).toBe(treeRow('city'));
  });

  it('moves the outline with the selection, to a whole group, and clears it for the credential', () => {
    render(<Inspector />);
    select('name');
    expect(linked()).toEqual([preview().getByRole('button', { name: 'Name, Rex' })]);

    select('address');
    const [block] = linked();
    expect(linked()).toHaveLength(1);
    expect(within(block as HTMLElement).getByRole('heading', { name: 'Adresse' })).toBeInTheDocument();
    expect(within(block as HTMLElement).getByRole('button', { name: 'Ort, Bern' })).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByRole('button', { name: 'Vorname, Anna' })).not.toBeInTheDocument();

    act(() => useStore.getState().select({ kind: 'credential' }));
    expect(linked()).toEqual([]);
  });

  it('selects the attribute of a clicked row in the tree and opens it in the Edit pane', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(preview().getByRole('button', { name: 'Ort, Bern' }));
    expect(selectedKey()).toBe('city');
    expect(treeRow('city')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Ort' })).toBeInTheDocument();
    expect(linked()).toEqual([preview().getByRole('button', { name: 'Ort, Bern' })]);
  });

  it('selects a row with Enter or Space, and a group from its title', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    act(() => preview().getByRole('button', { name: 'Name, Rex' }).focus());
    await user.keyboard('{Enter}');
    expect(selectedKey()).toBe('name');

    act(() => preview().getByRole('button', { name: 'Vorname, Anna' }).focus());
    await user.keyboard(' ');
    expect(selectedKey()).toBe('given_name');

    await user.click(preview().getByRole('button', { name: 'Adresse' }));
    expect(selectedKey()).toBe('address');
    await user.click(preview().getByRole('button', { name: 'Halter' }));
    expect(selectedKey()).toBe('owner');
  });

  it('leaves the rows of unmatched sample claims inert', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    const raw = preview().getByRole('group', { name: '["extra"], x' });
    expect(raw).not.toHaveAttribute('tabindex');
    expect(preview().queryByRole('button', { name: '["extra"], x' })).not.toBeInTheDocument();
    await user.click(raw);
    expect(selectedKey()).toBe('Credential');
  });

  it('shows a row the tree filter hides by clearing the filter', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    act(() => useStore.getState().setTreeFilter('given'));
    await user.click(preview().getByRole('button', { name: 'Name, Rex' }));
    expect(useStore.getState().treeFilter).toBe('');
    expect(treeRow('name')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Details preview scrolling', () => {
  beforeEach(() => load('ios'));

  it('jumps without animation when reduced motion is asked for', () => {
    stubMedia((query) => query.includes('prefers-reduced-motion'));
    paneWidth(900);
    render(<Inspector />);
    select('name');
    expect(scrolled()).toEqual([{ element: preview().getByRole('button', { name: 'Name, Rex' }), options: { block: 'nearest', behavior: 'auto' } }]);
  });

  it('outlines without scrolling below the form, where the form would scroll away', () => {
    render(<Inspector />);
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveAttribute('data-placement', 'below');
    select('name');
    expect(linked()).toHaveLength(1);
    expect(scrolled()).toEqual([]);
  });

  it('does nothing while the preview is collapsed below the form or shows another view', async () => {
    localStorage.setItem(EDIT_PREVIEW_OPEN_KEY, 'false');
    render(<Inspector />);
    select('name');
    expect(preview().queryByRole('button', { name: 'Name, Rex' })).not.toBeInTheDocument();
    expect(linked()).toEqual([]);

    const user = userEvent.setup();
    await user.click(preview().getByRole('button', { name: 'Expand preview' }));
    act(() => useStore.setState({ cardVariant: 'detail' }));
    select('city');
    expect(linked()).toEqual([]);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('Details preview on a narrow window', () => {
  it('switches to the Edit pane after a row in the Output pane is picked', async () => {
    load('ios');
    stubMedia(() => true);
    const user = userEvent.setup();
    render(<Workspace />);
    const tabs = within(screen.getByRole('tablist', { name: 'Panes' }));
    await user.click(tabs.getByRole('tab', { name: 'Output' }));
    await user.click(within(screen.getByRole('region', { name: 'Output' })).getByRole('button', { name: 'Name, Rex' }));
    expect(selectedKey()).toBe('name');
    expect(tabs.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');
  });
});
