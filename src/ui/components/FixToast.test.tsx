// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from '../../core/model';
import type { Fix } from '../../core/validate/fixes';
import { useStore } from '../../state/store';
import { FixToast, TOAST_DURATION_MS } from './FixToast';

const name = () => useStore.getState().project?.meta['de-CH'].name;

beforeEach(async () => {
  vi.useFakeTimers();
  useStore.getState().load(emptyProject(['de-CH']));
  const setName = (value: string): Fix => ({ label: 'Name', apply: (draft) => void (draft.meta['de-CH'].name = value) });
  await useStore.getState().applyFixes([[setName('Draft')], [setName('Fixed')]]);
});

afterEach(() => vi.useRealTimers());

describe('FixToast', () => {
  it('reports the fix and undoes it as a normal undo step', () => {
    render(<FixToast />);
    expect(screen.getByText('Fixed 2 issues')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByText('Fixed 2 issues')).not.toBeInTheDocument();
    expect(name()).toBe('');
    useStore.getState().redo();
    expect(name()).toBe('Fixed');
  });

  it('goes away after a few seconds, leaving the fix in the history', () => {
    render(<FixToast />);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.queryByText('Fixed 2 issues')).not.toBeInTheDocument();
    expect(useStore.getState().past).toHaveLength(1);
  });

  it('stays while the pointer is on it', () => {
    render(<FixToast />);
    const toast = screen.getByText('Fixed 2 issues').parentElement!;
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 3));
    expect(screen.getByText('Fixed 2 issues')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.queryByText('Fixed 2 issues')).not.toBeInTheDocument();
  });

  it('keeps progress until the next notice, and a plain note goes like a fix', () => {
    useStore.getState().showProgress('Downloading translation model', { detail: 'de-CH → fr-CH', share: 0.4 });
    render(<FixToast />);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 3));
    const bar = screen.getByRole('progressbar', { name: 'Downloading translation model' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar.closest('.toast')).toHaveClass('toast--progress');
    expect(bar.closest('.toast')).toHaveTextContent('Downloading translation modelde-CH → fr-CH40%');
    act(() => useStore.getState().showProgress('Translating 4 texts', { detail: 'de-CH → fr-CH, en-GB' }));
    expect(screen.getByRole('progressbar', { name: 'Translating 4 texts' })).toHaveAttribute('data-indeterminate');
    act(() => useStore.getState().showInfo("Romansh isn't available in this browser's translator"));
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.queryByText(/Romansh/)).not.toBeInTheDocument();
  });

  it('shows a failure without Undo', () => {
    useStore.setState({ fixNotice: { kind: 'failed', label: 'Convert to PNG' } });
    render(<FixToast />);
    expect(screen.getByText("Couldn't fix: Convert to PNG")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('shows another action with its own Undo, which runs it and hides the toast', () => {
    const undo = vi.fn();
    useStore.getState().showUndoable("'Hundebewilligung' deleted", undo);
    render(<FixToast />);
    expect(screen.getByText("'Hundebewilligung' deleted").parentElement).toHaveClass('toast');
    expect(screen.getByText("'Hundebewilligung' deleted").parentElement).not.toHaveClass('toast--error');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText("'Hundebewilligung' deleted")).not.toBeInTheDocument();
    expect(name()).toBe('Fixed');
  });

  it('lets another action go after a few seconds without undoing it', () => {
    const undo = vi.fn();
    useStore.getState().showUndoable("'Hundebewilligung' deleted", undo);
    render(<FixToast />);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.queryByText("'Hundebewilligung' deleted")).not.toBeInTheDocument();
    expect(undo).not.toHaveBeenCalled();
  });
});
