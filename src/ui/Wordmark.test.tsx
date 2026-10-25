// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RELEASE_CACHE_KEY, RELEASE_MAX_AGE_MS, RELEASES_API } from './lib/latestRelease';
import { Wordmark } from './Wordmark';

const releaseUrl = 'https://github.com/bryanrmq/credential-toolkit/releases/tag/v0.3.0';

function stubLatestRelease(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => localStorage.clear());

describe('Wordmark', () => {
  it('shows the beta flag and the latest release, linked to its notes', async () => {
    const fetchMock = stubLatestRelease({ tag_name: 'v0.3.0', html_url: releaseUrl });
    render(<Wordmark />);
    expect(screen.getByText('Beta')).toHaveClass('badge');
    const link = await screen.findByRole('link', { name: 'v0.3.0' });
    expect(link).toHaveAttribute('href', releaseUrl);
    expect(fetchMock).toHaveBeenCalledWith(RELEASES_API, expect.anything());
    expect(JSON.parse(localStorage.getItem(RELEASE_CACHE_KEY) ?? 'null')).toMatchObject({ tag: 'v0.3.0', url: releaseUrl });
  });

  it('lets the compact top bar version hide the beta flag and the release when the bar runs short of room', async () => {
    stubLatestRelease({ tag_name: 'v0.3.0', html_url: releaseUrl });
    render(<Wordmark compact />);
    expect(screen.getByText('Beta').parentElement).toHaveClass('wordmark__beta--compact');
    expect(await screen.findByText('v0.3.0')).toHaveClass('wordmark__version--compact');
  });

  it('shows a fresh cached release without asking GitHub again', () => {
    localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ tag: 'v0.2.0', url: releaseUrl, fetchedAt: Date.now() }));
    const fetchMock = stubLatestRelease({ tag_name: 'v0.3.0', html_url: releaseUrl });
    render(<Wordmark />);
    expect(screen.getByText('v0.2.0')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a stale cached release until the newer one arrives', async () => {
    localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ tag: 'v0.2.0', url: releaseUrl, fetchedAt: Date.now() - RELEASE_MAX_AGE_MS - 1 }));
    stubLatestRelease({ tag_name: 'v0.3.0', html_url: releaseUrl });
    render(<Wordmark />);
    expect(screen.getByText('v0.2.0')).toBeInTheDocument();
    expect(await screen.findByText('v0.3.0')).toBeInTheDocument();
  });

  it('shows no version when there is no release yet or the answer is malformed', async () => {
    const missing = stubLatestRelease({ message: 'Not Found' }, 404);
    const { unmount } = render(<Wordmark />);
    await vi.waitFor(() => expect(missing).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    unmount();

    const malformed = stubLatestRelease({ tag_name: '<script>', html_url: 'https://evil.example/' });
    render(<Wordmark />);
    await vi.waitFor(() => expect(malformed).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(localStorage.getItem(RELEASE_CACHE_KEY)).toBeNull();
  });
});
