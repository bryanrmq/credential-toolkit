import { useRef } from 'react';
import { t } from '../../strings';

const STEP = 16;
const BIG_STEP = 64;

/**
 * A drag handle between two panes. A vertical one (the default) sits between side-by-side panes and resizes a width;
 * a horizontal one sits between stacked panes and resizes a height. `direction` is 1 when moving the handle right
 * (or down) makes the pane bigger and -1 when it makes it smaller.
 * Keyboard: arrows move it (Shift for bigger steps), Home/End go to the limits, Enter resets.
 */
export function PaneResizer({
  label,
  value,
  min,
  max,
  direction,
  orientation = 'vertical',
  onResize,
  onCommit,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  direction: 1 | -1;
  orientation?: 'vertical' | 'horizontal';
  onResize: (width: number) => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const drag = useRef<{ start: number; startValue: number } | null>(null);
  const horizontal = orientation === 'horizontal';
  const position = (event: { clientX: number; clientY: number }) => (horizontal ? event.clientY : event.clientX);
  const [less, more] = horizontal ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];

  return (
    <div
      className={horizontal ? 'pane-resizer pane-resizer--horizontal' : 'pane-resizer'}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={t.workspace.resizeHint}
      onPointerDown={(event) => {
        drag.current = { start: position(event), startValue: value };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current) onResize(drag.current.startValue + (position(event) - drag.current.start) * direction);
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        onCommit();
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? BIG_STEP : STEP;
        let next: number | null = null;
        if (event.key === more) next = value + step * direction;
        else if (event.key === less) next = value - step * direction;
        else if (event.key === 'Home') next = min;
        else if (event.key === 'End') next = max;
        else if (event.key === 'Enter') {
          event.preventDefault();
          onReset();
          return;
        }
        if (next === null) return;
        event.preventDefault();
        onResize(next);
        onCommit();
      }}
    />
  );
}
