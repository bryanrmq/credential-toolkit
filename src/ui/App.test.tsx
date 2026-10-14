// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../state/store';
import { App } from './App';

beforeEach(() => {
  localStorage.clear();
  useStore.getState().close();
});

describe('App', () => {
  it('starts a blank project and adds an attribute', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    const dialog = screen.getByRole('dialog', { name: 'Start blank' });
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));

    expect(screen.getByRole('heading', { name: 'Untitled credential' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Attribute/ }));
    expect(screen.getByLabelText('Key')).toHaveValue('attribute');
    expect(screen.getByLabelText('Source path')).toHaveValue('attribute');
  });

  it('opens a pasted sample and lists its attributes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start from a sample credential/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Paste JSON/));
    await user.paste('{"iss":"did:example","given_name":"Seraina","birth_date":"1988-04-05"}');
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));

    expect(screen.getByText('Import report')).toBeInTheDocument();
    expect(screen.getByText('given_name')).toBeInTheDocument();
    expect(screen.getByText('birth_date')).toBeInTheDocument();
  });

  it('shows the import error for invalid JSON', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Open an OCA bundle/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Paste JSON/));
    await user.paste('{"capture_bases": [}');
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Invalid JSON at line 1/);
  });
});
