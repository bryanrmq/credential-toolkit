import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PopupMenuItem {
  label: string;
  /** A 14px Phosphor icon. */
  icon: ReactNode;
  /** The key that runs the same action, shown right-aligned. */
  shortcut?: string;
  /** Red, for destructive actions. */
  danger?: boolean;
  onSelect: () => void;
}

/** Margin kept between the menu and the window edges. */
const EDGE = 8;

/**
 * A menu of actions floating at `at` (window coordinates), for right-click menus and dropdowns. `sections`
 * are separated by a rule; empty ones are left out, so inapplicable items are simply not passed. Focus goes
 * to the first item; ↑ / ↓, Home / End, ⏎ and Escape work. It closes on selection, Escape, Tab, a click
 * elsewhere, scrolling, resizing or leaving the window. On selection, Escape and Tab focus returns to
 * `returnFocus` first, so whatever the item opens (a dialog) can hand it back there when it closes. With
 * `align` 'end' (a dropdown under a right-hand button) its right edge sits at `at` instead of its left edge.
 */
export function PopupMenu({
  label,
  at,
  sections,
  returnFocus,
  align = 'start',
  onClose,
}: {
  label: string;
  at: { x: number; y: number };
  sections: PopupMenuItem[][];
  returnFocus?: HTMLElement | null;
  align?: 'start' | 'end';
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept inside the window: flipped to the left of or above `at` when it would overflow.
  const [placement, setPlacement] = useState<{ left: number; top: number; origin: string } | null>(null);
  const filled = sections.filter((section) => section.length > 0);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const fitsRight = at.x + width <= window.innerWidth - EDGE;
    const fitsLeft = at.x - width >= EDGE;
    const leftward = align === 'end' ? fitsLeft || !fitsRight : !fitsRight && fitsLeft;
    const flipY = at.y + height > window.innerHeight - EDGE && at.y - height >= EDGE;
    setPlacement({
      left: Math.max(EDGE, Math.min(leftward ? at.x - width : at.x, window.innerWidth - EDGE - width)),
      top: flipY ? at.y - height : Math.max(EDGE, Math.min(at.y, window.innerHeight - EDGE - height)),
      origin: `${flipY ? 'bottom' : 'top'} ${leftward ? 'right' : 'left'}`,
    });
  }, [at.x, at.y, align]);

  // Once placed (a hidden element cannot take focus), the first item has it.
  const placed = placement !== null;
  useLayoutEffect(() => {
    if (placed) ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [placed]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onScroll = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const close = () => {
    onClose();
    returnFocus?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The menu is portalled out of the page, but React still bubbles its events to whoever renders it.
    event.stopPropagation();
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
      return;
    }
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  };

  const style: CSSProperties = placement
    ? { left: placement.left, top: placement.top, transformOrigin: placement.origin }
    : // Measured before it shows, so it never flashes in the wrong place.
      { left: at.x, top: at.y, visibility: 'hidden' };

  return createPortal(
    <div
      ref={ref}
      className="popup-menu"
      role="menu"
      aria-label={label}
      style={style}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        // Right-clicking the menu (or the context-menu key inside it) opens nothing else.
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {filled.map((section, sectionIndex) => (
        <div key={sectionIndex} className="popup-menu__section" role="none">
          {sectionIndex > 0 && <div className="popup-menu__separator" role="separator" />}
          {section.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={item.danger ? 'popup-menu__item popup-menu__item--danger' : 'popup-menu__item'}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              <span className="popup-menu__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="popup-menu__label">{item.label}</span>
              {/* Always there, so labels stay aligned whether or not an item has a key. */}
              <span className="popup-menu__shortcut" aria-hidden="true">
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}
