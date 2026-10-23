// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject, newAttribute } from '../../core/model';
import { useStore } from '../../state/store';
import { OUTPUT_HALVES_KEY, PREVIEW_HEIGHT_KEY } from '../lib/paneLayout';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

function loadProject(hosting: 'dataUrl' | 'emptyUrl' = 'dataUrl') {
  const project = emptyProject(['de-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }));
  project.hosting = hosting === 'dataUrl' ? { mode: 'dataUrl' } : { mode: 'url', url: '' };
  useStore.getState().load(project);
}

const output = () => within(screen.getByRole('region', { name: 'Output' }));
/** The JSON the Bundle half shows: the bundle or the VCT snippet. */
const shownJson = () => screen.getByRole('region', { name: 'Output' }).querySelector('pre')!;
const divider = () => screen.getByRole('separator', { name: 'Resize the preview' });
/** Waits for the bundle to be built, which happens shortly after the project changes. */
const built = () => screen.findByText('uri#integrity');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  useStore.setState({ outputTab: 'bundle', cardPlatform: 'ios', previewView: 'card' });
  loadProject();
});

describe('Output pane halves', () => {
  it('shows the Preview half above the Bundle half, split by a divider', () => {
    render(<Workspace />);
    const preview = output().getByText('Preview');
    const tabs = output().getByRole('tablist', { name: 'Output' });
    expect(preview.compareDocumentPosition(divider()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider().compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider()).toHaveAttribute('aria-orientation', 'horizontal');
    expect(divider()).toHaveAttribute('aria-valuenow', '320');
    expect(divider()).toHaveAttribute('aria-valuemin', '120');
    expect(divider()).toHaveAttribute('aria-valuemax', '800');
    // Until the wallet views move in, the preview holds an empty state.
    expect(output().getByText('No card preview for iOS here yet.')).toBeInTheDocument();
  });

  it('switches the preview platform and view from its header', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(output().getByRole('group', { name: 'Preview platform' })).getByRole('button', { name: 'Android' }));
    await user.click(within(output().getByRole('group', { name: 'Preview view' })).getByRole('button', { name: 'Details' }));
    expect(useStore.getState()).toMatchObject({ cardPlatform: 'android', previewView: 'details' });
    expect(within(output().getByRole('group', { name: 'Preview view' })).getByRole('button', { name: 'Details' })).toHaveAttribute('aria-pressed', 'true');
    expect(output().getByText('No details preview for Android here yet.')).toBeInTheDocument();
  });

  it('resizes the preview with the keyboard and remembers the height', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Workspace />);
    divider().focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(divider()).toHaveAttribute('aria-valuenow', '352');
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(divider()).toHaveAttribute('aria-valuenow', '288');
    await user.keyboard('{Home}');
    expect(divider()).toHaveAttribute('aria-valuenow', '120');
    await user.keyboard('{End}');
    expect(divider()).toHaveAttribute('aria-valuenow', '800');
    await user.keyboard('{Shift>}{ArrowUp}{ArrowUp}{/Shift}');
    expect(divider()).toHaveAttribute('aria-valuenow', '672');
    expect(localStorage.getItem(PREVIEW_HEIGHT_KEY)).toBe('672');
    expect(screen.getByRole('region', { name: 'Output' }).querySelector('.output')).toHaveStyle({ '--preview-height': '672px' });

    unmount();
    render(<Workspace />);
    expect(divider()).toHaveAttribute('aria-valuenow', '672');
    divider().focus();
    await user.keyboard('{Enter}');
    expect(divider()).toHaveAttribute('aria-valuenow', '320');
    expect(localStorage.getItem(PREVIEW_HEIGHT_KEY)).toBe('320');
  });

  it('resizes the preview by dragging the divider and resets it with a double-click', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    fireEvent.pointerDown(divider(), { clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(divider(), { clientY: 460, pointerId: 1 });
    fireEvent.pointerUp(divider(), { clientY: 460, pointerId: 1 });
    expect(divider()).toHaveAttribute('aria-valuenow', '380');
    expect(localStorage.getItem(PREVIEW_HEIGHT_KEY)).toBe('380');

    await user.dblClick(divider());
    expect(divider()).toHaveAttribute('aria-valuenow', '320');
    expect(localStorage.getItem(PREVIEW_HEIGHT_KEY)).toBe('320');
  });

  it('keeps the preview out of the Bundle half’s room in a short pane', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const root = screen.getByRole('region', { name: 'Output' }).querySelector<HTMLElement>('.output')!;
    vi.spyOn(root, 'clientHeight', 'get').mockReturnValue(500);
    divider().focus();
    await user.keyboard('{End}');
    // The Bundle half keeps 160 px of the 500 px pane.
    expect(divider()).toHaveAttribute('aria-valuenow', '340');
  });

  it('collapses each half to its header and expands it again', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const collapsePreview = output().getByRole('button', { name: 'Collapse preview' });
    expect(collapsePreview).toHaveAttribute('aria-expanded', 'true');
    await user.click(collapsePreview);
    expect(collapsePreview).toHaveAccessibleName('Expand preview');
    expect(collapsePreview).toHaveAttribute('aria-expanded', 'false');
    expect(output().queryByText(/No card preview/)).not.toBeInTheDocument();
    expect(output().queryByRole('group', { name: 'Preview view' })).not.toBeInTheDocument();
    // The Bundle half takes the room: no divider is left to drag.
    expect(screen.queryByRole('separator', { name: 'Resize the preview' })).not.toBeInTheDocument();
    expect(await built()).toBeInTheDocument();

    // Both halves can be collapsed at once.
    const collapseBundle = output().getByRole('button', { name: 'Collapse bundle' });
    await user.click(collapseBundle);
    expect(collapseBundle).toHaveAttribute('aria-expanded', 'false');
    expect(output().queryByText('uri#integrity')).not.toBeInTheDocument();
    expect(output().getByText('Preview')).toBeInTheDocument();
    expect(output().getByRole('tablist', { name: 'Output' })).toBeInTheDocument();

    await user.click(output().getByRole('button', { name: 'Expand preview' }));
    expect(output().getByText('No card preview for iOS here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'Resize the preview' })).not.toBeInTheDocument();
    await user.click(output().getByRole('button', { name: 'Expand bundle' }));
    expect(output().getByText('uri#integrity')).toBeInTheDocument();
    expect(divider()).toBeInTheDocument();
  });

  it('remembers the collapsed halves', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Workspace />);
    await user.click(output().getByRole('button', { name: 'Collapse bundle' }));
    expect(JSON.parse(localStorage.getItem(OUTPUT_HALVES_KEY)!)).toEqual({ preview: true, bundle: false });

    unmount();
    render(<Workspace />);
    expect(output().getByRole('button', { name: 'Expand bundle' })).toHaveAttribute('aria-expanded', 'false');
    expect(output().getByRole('button', { name: 'Collapse preview' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('starts from the defaults when the stored layout is broken', () => {
    localStorage.setItem(OUTPUT_HALVES_KEY, '{not json');
    localStorage.setItem(PREVIEW_HEIGHT_KEY, '99999');
    render(<Workspace />);
    expect(output().getByRole('button', { name: 'Collapse preview' })).toHaveAttribute('aria-expanded', 'true');
    expect(output().getByRole('button', { name: 'Collapse bundle' })).toHaveAttribute('aria-expanded', 'true');
    expect(divider()).toHaveAttribute('aria-valuenow', '800');
  });

  it('starts from the defaults when storage is unavailable', () => {
    useStore.getState().setOutputHalves({ preview: false, bundle: false });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    try {
      render(<Workspace />);
      expect(output().getByRole('button', { name: 'Collapse preview' })).toHaveAttribute('aria-expanded', 'true');
      expect(output().getByRole('button', { name: 'Collapse bundle' })).toHaveAttribute('aria-expanded', 'true');
      expect(divider()).toHaveAttribute('aria-valuenow', '320');
    } finally {
      getItem.mockRestore();
    }
  });
});

describe('Bundle half', () => {
  it('opens the hosting and sample settings from the gear button', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const gear = output().getByRole('button', { name: 'Bundle settings' });
    expect(gear).toHaveAttribute('aria-expanded', 'false');
    expect(output().queryByRole('radio', { name: /Embedded as a data URL/ })).not.toBeInTheDocument();
    expect(output().queryByRole('button', { name: 'Attach sample' })).not.toBeInTheDocument();

    await user.click(gear);
    expect(gear).toHaveAttribute('aria-expanded', 'true');
    const settings = within(output().getByRole('region', { name: 'Bundle settings' }));
    expect(settings.getByRole('radio', { name: /Embedded as a data URL/ })).toBeChecked();
    await user.click(settings.getByRole('radio', { name: /At a URL I host/ }));
    await user.type(settings.getByRole('textbox', { name: 'At a URL I host' }), 'https://issuer.example.ch/oca.json');
    expect(useStore.getState().project!.hosting).toEqual({ mode: 'url', url: 'https://issuer.example.ch/oca.json' });
    expect(settings.getByRole('button', { name: 'Attach sample' })).toBeInTheDocument();

    await user.click(gear);
    expect(gear).toHaveAttribute('aria-expanded', 'false');
    expect(output().queryByRole('region', { name: 'Bundle settings' })).not.toBeInTheDocument();
  });

  it('expands a collapsed Bundle half to show its settings', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(output().getByRole('button', { name: 'Collapse bundle' }));
    await user.click(output().getByRole('button', { name: 'Bundle settings' }));
    expect(output().getByRole('button', { name: 'Collapse bundle' })).toHaveAttribute('aria-expanded', 'true');
    expect(output().getByRole('region', { name: 'Bundle settings' })).toBeInTheDocument();
  });

  it('opens the settings in a collapsed Bundle half to go to a hosting issue', async () => {
    loadProject('emptyUrl');
    useStore.getState().setOutputHalves({ preview: true, bundle: false });
    localStorage.setItem(OUTPUT_HALVES_KEY, JSON.stringify({ preview: true, bundle: false }));
    const user = userEvent.setup();
    render(<Workspace />);
    expect(output().queryByRole('textbox', { name: 'At a URL I host' })).not.toBeInTheDocument();

    const issues = screen.getByRole('region', { name: 'Issues' });
    await user.click(within(issues).getByRole('button', { name: /Enter the URL where you will publish the bundle/ }));
    expect(output().getByRole('button', { name: 'Collapse bundle' })).toHaveAttribute('aria-expanded', 'true');
    expect(output().getByRole('button', { name: 'Bundle settings' })).toHaveAttribute('aria-expanded', 'true');
    expect(output().getByRole('textbox', { name: 'At a URL I host' })).toBeInTheDocument();
  });

  it('shows the size, copies what the tab shows and puts the integrity line under the JSON', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await built();
    expect(output().getByText(/^\d+\.\d KB$/)).toBeInTheDocument();
    const json = shownJson();
    const bundleText = json.textContent;
    const integrity = output().getByText('uri#integrity');
    expect(json.compareDocumentPosition(integrity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(output().getByRole('button', { name: 'Copy JSON' }));
    expect(await navigator.clipboard.readText()).toBe(bundleText);

    await user.click(output().getByRole('tab', { name: 'VCT snippet' }));
    expect(useStore.getState().outputTab).toBe('vct');
    const snippet = shownJson();
    expect(snippet.textContent).not.toBe(bundleText);
    await user.click(output().getByRole('button', { name: 'Copy snippet' }));
    expect(await navigator.clipboard.readText()).toBe(snippet.textContent);
    expect(output().getByText(/Add these entries to the "display" array/)).toBeInTheDocument();
  });
});

describe('Output pane on a narrow window', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stacks both halves with no divider', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(screen.getByRole('tablist', { name: 'Panes' })).getByRole('tab', { name: 'Output' }));
    expect(screen.getByRole('region', { name: 'Output' }).querySelector('.output')).toHaveClass('output--stacked');
    expect(output().getByText('No card preview for iOS here yet.')).toBeInTheDocument();
    expect(output().getByRole('tablist', { name: 'Output' })).toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'Resize the preview' })).not.toBeInTheDocument();
    expect(await built()).toBeInTheDocument();
  });
});
