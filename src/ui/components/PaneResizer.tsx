import { useRef } from 'react';
import { t } from '../../strings';

const STEP = 16;
const BIG_STEP = 64;

/**
 * A vertical drag handle between two panes. `direction` is 1 when moving the handle right makes
 * the pane wider (handle on the pane's right edge) and -1 when it makes it narrower (left edge).
 * Keyboard: arrows move it (Shift for bigger steps), Home/End go to the limits, Enter resets.
 */
export function PaneResizer({
  label,
  value,
  min,
  max,
  direction,
  onResize,
  onCommit,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  direction: 1 | -1;
  onResize: (width: number) => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const drag = useRef<{ startX: number; startValue: number } | null>(null);

  return (
    <div
      className="pane-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={t.workspace.resizeHint}
      onPointerDown={(event) => {
        drag.current = { startX: event.clientX, startValue: value };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current) onResize(drag.current.startValue + (event.clientX - drag.current.startX) * direction);
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
        if (event.key === 'ArrowRight') next = value + step * direction;
        else if (event.key === 'ArrowLeft') next = value - step * direction;
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
