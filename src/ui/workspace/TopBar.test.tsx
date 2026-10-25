// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sriSha256, utf8 } from '../../core/cesr';
import { emptyProject, newAttribute } from '../../core/model';
import { useStore } from '../../state/store';
import { downloadText } from '../lib/download';
import { RELEASES_PAGE } from '../lib/latestRelease';
import { THEME_KEY, setTheme } from '../lib/theme';
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

afterEach(() => {
  vi.unstubAllGlobals();
  setTheme('system');
});

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

describe('theme', () => {
  it('offers System, Light and Dark in the ⋯ menu, ticking the current one', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const choices = async () => {
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      return within(screen.getByRole('menu')).getAllByRole('menuitemradio');
    };
    const options = await choices();
    expect(options.map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([
      ['System theme', 'true'],
      ['Light theme', 'false'],
      ['Dark theme', 'false'],
    ]);
    await user.click(options[2]);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect((await choices()).map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
  });
});

describe('blocked Download', () => {
  beforeEach(() => {
    const project = useStore.getState().project!;
    project.root.children.push(newAttribute('broken', { source: [] }));
    useStore.getState().load(project);
  });
  const narrow = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));

  it('stays reachable by Tab, says why it is blocked, and shows the first error when pressed', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const download = screen.getByRole('button', { name: 'Fix 1 error' });
    expect(download).toHaveAttribute('aria-disabled', 'true');
    expect(download).toHaveAccessibleDescription('Fix 1 error to download');
    screen.getByRole('button', { name: 'Search and commands' }).focus();
    await user.tab();
    expect(download).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(downloadText).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /"broken" has no source path/ })).toHaveFocus();
  });

  it('on a narrow Metadata page, goes to the Issues pane of the OCA', async () => {
    narrow();
    const user = userEvent.setup();
    useStore.getState().setArea('metadata');
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Fix 1 error' }));
    expect(useStore.getState().area).toBe('oca');
    expect(screen.getByRole('button', { name: /"broken" has no source path/ })).toHaveFocus();
  });
});

describe('one primary action', () => {
  it('is the Download in the top bar, on the OCA and on the Metadata page', async () => {
    const user = userEvent.setup();
    const { container } = render(<Workspace />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download bundle' })).toBeEnabled());
    expect([...container.querySelectorAll('.btn--primary')]).toEqual([screen.getByRole('button', { name: 'Download bundle' })]);

    await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    await user.click(screen.getByRole('tab', { name: 'Type metadata' }));
    await screen.findByRole('button', { name: 'vct.json' });
    expect([...container.querySelectorAll('.btn--primary')]).toEqual([screen.getByRole('button', { name: 'Download OCA bundle' })]);
  });
});

describe('crowded bar', () => {
  it('takes out the brand, then the language switch, until the project name has its room', () => {
    // The lead overflows until the language switch has become a dropdown (jsdom has no layout of its own).
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('topbar__lead') && !this.parentElement?.dataset.fit?.split(' ').includes('lang') ? 100 : 0;
    });
    const { container } = render(<Workspace />);
    expect(container.querySelector('.topbar')).toHaveAttribute('data-fit', 'brand lang');
    scrollWidth.mockRestore();
  });
});

describe('menu', () => {
  it('lists the app, its release and the Beta flag for windows too narrow to show them', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const about = screen.getByRole('menuitem', { name: 'Credential Toolkit (Beta)' });
    expect(about).toHaveClass('compact-only');
    await user.click(about);
    expect(open).toHaveBeenCalledWith(RELEASES_PAGE, '_blank', 'noopener,noreferrer');
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
