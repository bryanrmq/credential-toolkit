// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LangTag, type Project, emptyProject, newAttribute } from '../../core/model';
import { useStore } from '../../state/store';
import { EDIT_PREVIEW_OPEN_KEY } from '../lib/paneLayout';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Inspector } from './Inspector';
import { Workspace } from './Workspace';

function load(languages: LangTag[] = ['de-CH', 'en-GB'], configure?: (project: Project) => void) {
  const project = emptyProject(languages);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  if (languages.includes('en-GB')) project.meta['en-GB'] = { name: 'Dog permit', description: 'For dog owners' };
  project.branding['de-CH'] = { light: { primaryBackgroundColor: '#3B82F6' } };
  project.root.children.push(
    newAttribute('given_name', { source: ['given_name'], labels: { 'de-CH': 'Vorname' } }),
    newAttribute('family_name', { source: ['family_name'], labels: { 'de-CH': 'Nachname' } }),
  );
  configure?.(project);
  useStore.getState().load(project);
  useStore.setState({ cardPlatform: 'ios', cardVariant: 'detail' });
}

const idOf = (key: string) => useStore.getState().project!.root.children.find((node) => node.key === key)!.id;
/** The wallet preview in the Edit pane. */
const preview = () => within(screen.getByRole('region', { name: 'Preview' }));
const control = (group: 'Preview platform' | 'Preview view' | 'Preview card', name: string) =>
  within(preview().getByRole('group', { name: group })).getByRole('button', { name });
/** Gives every element `width` px, as a wide or narrow Edit pane would (jsdom lays nothing out). */
const paneWidth = (width: number) => vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);

beforeEach(() => {
  localStorage.clear();
  load();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Wallet preview in the Edit pane', () => {
  it('shows beside the form for the credential', () => {
    render(<Inspector />);
    expect(screen.getByLabelText('Name')).toHaveValue('Hundebewilligung');
    expect(preview().getByRole('figure', { name: 'iOS card' })).toHaveTextContent('Hundebewilligung');
  });

  it('shows for one node and for several nodes', () => {
    useStore.getState().select({ kind: 'node', id: idOf('given_name'), ids: [idOf('given_name')] });
    const { unmount } = render(<Inspector />);
    expect(screen.getByLabelText('Key')).toHaveValue('given_name');
    expect(preview().getByRole('figure', { name: 'iOS card' })).toHaveTextContent('Hundebewilligung');
    unmount();

    useStore.getState().select({ kind: 'node', id: idOf('given_name'), ids: [idOf('given_name'), idOf('family_name')] });
    render(<Inspector />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 items selected');
    expect(preview().getByRole('figure', { name: 'iOS card' })).toHaveTextContent('Hundebewilligung');
  });

  it('keeps showing while the selection changes', () => {
    render(<Inspector />);
    act(() => useStore.getState().select({ kind: 'node', id: idOf('family_name'), ids: [idOf('family_name')] }));
    expect(screen.getByLabelText('Key')).toHaveValue('family_name');
    expect(preview().getByRole('figure', { name: 'iOS card' })).toBeInTheDocument();
  });

  it('shows in a one-language project', () => {
    load(['de-CH']);
    render(<Inspector />);
    expect(preview().getByRole('figure', { name: 'iOS card' })).toHaveTextContent('Hundebewilligung');
    expect(preview().getByRole('group', { name: 'Preview platform' })).toBeInTheDocument();
  });

  it('redraws in the editing language picked in the top bar', async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    render(<Workspace />);
    const edit = within(screen.getByRole('region', { name: 'Edit' }));
    const card = () => within(edit.getByRole('region', { name: 'Preview' })).getByRole('figure', { name: 'iOS card' });
    expect(card()).toHaveTextContent('Hundebewilligung');

    await user.click(within(screen.getByRole('group', { name: 'Editing language' })).getByRole('button', { name: 'en-GB' }));
    expect(card()).toHaveTextContent('Dog permit');
    expect(card()).not.toHaveTextContent('Hundebewilligung');
  });

  it('switches platform, view and card with the pickers, as in the Output pane', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    expect(preview().queryByRole('group', { name: 'Preview card' })).not.toBeInTheDocument();

    await user.click(control('Preview platform', 'Android'));
    expect(preview().getByRole('figure', { name: 'Android detail card' })).toBeInTheDocument();
    await user.click(control('Preview card', 'Offer'));
    expect(preview().getByRole('figure', { name: 'Android offer card' })).toBeInTheDocument();
    expect(useStore.getState()).toMatchObject({ cardPlatform: 'android', cardVariant: 'offer' });

    await user.click(control('Preview view', 'Details'));
    expect(preview().getByRole('region', { name: 'Android details screen' })).toBeInTheDocument();
    expect(preview().queryByRole('group', { name: 'Preview card' })).not.toBeInTheDocument();
    expect(preview().getByLabelText('Card status')).toHaveValue('valid');

    await user.click(control('Preview platform', 'iOS'));
    expect(preview().getByRole('region', { name: 'iOS details screen' })).toBeInTheDocument();

    await user.click(control('Preview view', 'Home'));
    expect(preview().getByRole('figure', { name: 'iOS home row' })).toBeInTheDocument();

    await user.click(control('Preview view', 'Card'));
    expect(preview().getByRole('figure', { name: 'iOS card' })).toBeInTheDocument();
    expect(useStore.getState().cardVariant).toBe('detail');
  });

  it('follows the pickers of the Output pane, which share the same state', () => {
    render(<Inspector />);
    act(() => useStore.getState().setCardPlatform('android'));
    expect(preview().getByRole('figure', { name: 'Android detail card' })).toBeInTheDocument();
    act(() => useStore.getState().setCardVariant('details'));
    expect(preview().getByRole('region', { name: 'Android details screen' })).toBeInTheDocument();
  });

  it('keeps the details rows linked to their nodes', async () => {
    const user = userEvent.setup();
    load(['de-CH', 'en-GB'], (project) => {
      project.sample = { given_name: 'Rex' };
    });
    render(<Inspector />);
    await user.click(control('Preview view', 'Details'));
    const row = preview()
      .getAllByRole('group')
      .find((element) => element.classList.contains('ios-claim-row'));
    expect(row).toHaveAttribute('data-node-id', idOf('given_name'));
  });
});

describe('Wallet preview below the form (a narrow Edit pane)', () => {
  it('sits below the form and collapses to its header, remembered across a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Inspector />);
    const region = screen.getByRole('region', { name: 'Preview' });
    expect(region).toHaveAttribute('data-placement', 'below');
    expect(screen.getByLabelText('Name').compareDocumentPosition(region)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const toggle = preview().getByRole('button', { name: 'Collapse preview' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toContainElement(preview().getByRole('figure', { name: 'iOS card' }));

    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('Expand preview');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(preview().queryByRole('figure')).not.toBeInTheDocument();
    expect(preview().queryByRole('group', { name: 'Preview platform' })).not.toBeInTheDocument();
    expect(preview().getByText('Preview')).toBeInTheDocument();
    expect(localStorage.getItem(EDIT_PREVIEW_OPEN_KEY)).toBe('false');

    // A reload reads the stored state back.
    unmount();
    render(<Inspector />);
    expect(preview().getByRole('button', { name: 'Expand preview' })).toHaveAttribute('aria-expanded', 'false');
    expect(preview().queryByRole('figure')).not.toBeInTheDocument();

    await user.click(preview().getByRole('button', { name: 'Expand preview' }));
    expect(preview().getByRole('figure', { name: 'iOS card' })).toBeInTheDocument();
    expect(localStorage.getItem(EDIT_PREVIEW_OPEN_KEY)).toBe('true');
  });

  it('is open when nothing is stored or the stored value is not false', () => {
    localStorage.setItem(EDIT_PREVIEW_OPEN_KEY, 'not json');
    render(<Inspector />);
    expect(preview().getByRole('button', { name: 'Collapse preview' })).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem(EDIT_PREVIEW_OPEN_KEY)).toBe('not json');
  });
});

describe('Wallet preview beside the form (an Edit pane 840px wide or more)', () => {
  it('sits in a column of its own, always shown, with no collapse control', () => {
    paneWidth(840);
    localStorage.setItem(EDIT_PREVIEW_OPEN_KEY, 'false');
    render(<Inspector />);
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveAttribute('data-placement', 'beside');
    expect(preview().queryByRole('button', { name: /preview$/ })).not.toBeInTheDocument();
    expect(preview().getByRole('figure', { name: 'iOS card' })).toBeInTheDocument();
    expect(preview().getByRole('group', { name: 'Preview view' })).toBeInTheDocument();
  });

  it('moves below the form when the pane gets narrower, with the state stored there', () => {
    // Only the Edit pane's own observer is told; the previews' fit-scale observers keep their width.
    let resized = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        callback: () => void;
        constructor(callback: () => void) {
          this.callback = callback;
        }
        observe(element: Element) {
          if (element.classList.contains('inspector')) resized = this.callback;
        }
        disconnect() {}
      },
    );
    const width = paneWidth(1000);
    localStorage.setItem(EDIT_PREVIEW_OPEN_KEY, 'false');
    render(<Inspector />);
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveAttribute('data-placement', 'beside');

    width.mockReturnValue(839);
    act(() => resized());
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveAttribute('data-placement', 'below');
    expect(preview().getByRole('button', { name: 'Expand preview' })).toBeInTheDocument();
    expect(preview().queryByRole('figure')).not.toBeInTheDocument();

    width.mockReturnValue(900);
    act(() => resized());
    expect(preview().getByRole('figure', { name: 'iOS card' })).toBeInTheDocument();
  });
});
