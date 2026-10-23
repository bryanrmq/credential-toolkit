// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sriSha256, utf8 } from '../../core/cesr';
import { emptyProject, newAttribute } from '../../core/model';
import { useStore } from '../../state/store';
import { downloadText } from '../lib/download';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

vi.mock(import('../lib/download'), async (original) => ({ ...(await original()), downloadText: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  vi.mocked(downloadText).mockClear();
  const project = emptyProject(['de-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: '' };
  project.root.children.push(newAttribute('name', { labels: { 'de-CH': 'Name' } }));
  project.hosting = { mode: 'url', url: 'https://issuer.example.ch/oca-bundle.json' };
  useStore.getState().load(project);
});

afterEach(() => vi.unstubAllGlobals());

describe('Download', () => {
  it('downloads the bundle and makes it the published baseline', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const download = screen.getByRole('button', { name: 'Download bundle' });
    await waitFor(() => expect(download).toBeEnabled());
    const project = useStore.getState().project;
    expect(useStore.getState().baseline).toBeNull();

    await user.click(download);
    expect(downloadText).toHaveBeenCalledWith('oca-bundle.json', expect.any(String));
    const [, json] = vi.mocked(downloadText).mock.calls[0];
    expect(useStore.getState().baseline).toMatchObject({ json, source: 'download', integrity: await sriSha256(utf8(json)) });
    expect(useStore.getState().project).toBe(project);
  });
});

describe('search button', () => {
  const button = (container: HTMLElement) => within(container.querySelector<HTMLElement>('.topbar')!).getByRole('button', { name: 'Search and commands' });
  const palette = () => screen.queryByRole('dialog', { name: 'Search and commands' });

  it('opens the command palette, focus coming back to it when the palette closes', async () => {
    const user = userEvent.setup();
    const { container } = render(<Workspace />);
    await user.click(button(container));
    expect(palette()).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search attributes and commands' }), { key: 'Escape' });
    expect(palette()).not.toBeInTheDocument();
    expect(button(container)).toHaveFocus();
  });

  it('is reachable by keyboard, left of Download, with its name, tooltip and shortcut', async () => {
    const user = userEvent.setup();
    const { container } = render(<Workspace />);
    const search = button(container);
    expect(search).toHaveAttribute('title', 'Search and commands');
    expect(search).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    expect(search.querySelector('kbd')).toHaveTextContent('Ctrl+K');
    expect(search.compareDocumentPosition(screen.getByRole('button', { name: 'Download bundle' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    search.focus();
    await user.keyboard('{Enter}');
    expect(palette()).toBeInTheDocument();
  });

  it('shows ⌘K on Apple platforms', () => {
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const { container } = render(<Workspace />);
    expect(button(container)).toHaveAttribute('aria-keyshortcuts', 'Meta+K');
    expect(button(container).querySelector('kbd')).toHaveTextContent('⌘K');
    platform.mockRestore();
  });

  it('shows only its icon on narrow windows', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = render(<Workspace />);
    const search = button(container);
    expect(search.querySelector('kbd')).toBeNull();
    expect(search.querySelector('svg')).toBeInTheDocument();
    expect(search).toHaveAttribute('title', 'Search and commands');
    expect(search).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    expect(search).toHaveClass('btn--icon');
  });
});
