// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
