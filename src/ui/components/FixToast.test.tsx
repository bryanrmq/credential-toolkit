// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from '../../core/model';
import { useStore } from '../../state/store';
import { FixToast, TOAST_DURATION_MS } from './FixToast';

beforeEach(() => {
  vi.useFakeTimers();
  const project = emptyProject(['de-CH']);
  useStore.getState().load(project);
  useStore.setState({ undo: structuredClone(project), fixNotice: { kind: 'fixed', fixed: 2, total: 2 } });
});

afterEach(() => vi.useRealTimers());

describe('FixToast', () => {
  it('reports the fix and undoes it', () => {
    render(<FixToast />);
    expect(screen.getByText('Fixed 2 issues')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByText('Fixed 2 issues')).not.toBeInTheDocument();
    expect(useStore.getState().undo).toBeNull();
  });

  it('goes away after a few seconds and takes the undo with it', () => {
    render(<FixToast />);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.queryByText('Fixed 2 issues')).not.toBeInTheDocument();
    expect(useStore.getState().undo).toBeNull();
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

  it('shows a failure without Undo', () => {
    useStore.setState({ undo: null, fixNotice: { kind: 'failed', label: 'Convert to PNG' } });
    render(<FixToast />);
    expect(screen.getByText("Couldn't fix: Convert to PNG")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
