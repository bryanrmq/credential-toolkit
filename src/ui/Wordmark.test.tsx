// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { version } from '../../package.json';
import { Wordmark } from './Wordmark';

describe('Wordmark', () => {
  it('shows the beta flag and the version from package.json', () => {
    render(<Wordmark />);
    expect(screen.getByText('Beta')).toHaveClass('badge');
    expect(screen.getByText(`v${version}`)).toBeInTheDocument();
  });

  it('keeps the beta flag in the compact top bar version', () => {
    render(<Wordmark compact />);
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText(`v${version}`)).toHaveClass('wordmark__version--compact');
  });
});
