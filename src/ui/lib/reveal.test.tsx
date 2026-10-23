// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReveal } from './reveal';

function Blocks() {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref);
  return (
    <div ref={ref}>
      <p className="reveal">first</p>
      <p className="reveal">second</p>
    </div>
  );
}

/** Blocks that grow: the hook watches the ones added since when `count` changes. */
function GrowingBlocks({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref, count);
  return (
    <div ref={ref}>
      {Array.from({ length: count }, (_, index) => (
        <p key={index} className="reveal">
          block {index}
        </p>
      ))}
    </div>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('useReveal', () => {
  it('shows every block at once when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { getByText } = render(<Blocks />);
    expect(getByText('first')).toHaveClass('is-visible');
    expect(getByText('second')).toHaveClass('is-visible');
  });

  it('shows a block when it scrolls into view', () => {
    let report: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void = () => {};
    class FakeObserver {
      constructor(callback: typeof report) {
        report = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { getByText } = render(<Blocks />);
    expect(getByText('first')).not.toHaveClass('is-visible');
    report([{ isIntersecting: true, target: getByText('first') }]);
    expect(getByText('first')).toHaveClass('is-visible');
    expect(getByText('second')).not.toHaveClass('is-visible');
  });

  it('shows blocks added later once their content key changes', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { getByText, rerender } = render(<GrowingBlocks count={1} />);
    expect(getByText('block 0')).toHaveClass('is-visible');
    rerender(<GrowingBlocks count={2} />);
    expect(getByText('block 1')).toHaveClass('is-visible');
  });
});
