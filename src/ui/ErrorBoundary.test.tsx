// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { downloadText } from './lib/download';

vi.mock(import('./lib/download'), async (original) => ({ ...(await original()), downloadText: vi.fn() }));

function Broken(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('shows the error and downloads the draft under the toolkit name', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download draft' }));
    expect(downloadText).toHaveBeenCalledWith('credential-toolkit-draft.json', expect.any(String));
  });
});
