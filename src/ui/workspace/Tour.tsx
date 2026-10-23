import {
  CompassIcon,
  PackageIcon,
  PencilSimpleIcon,
  SlidersHorizontalIcon,
  TranslateIcon,
  TreeStructureIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { type View, useStore } from '../../state/store';
import { type TourKeys, t } from '../../strings';
import { Button } from '../components/controls';
import { withKeys } from '../components/keys';
import { type CommandId, shortcutLabel } from '../lib/commands';
import type { WorkspacePane } from '../lib/paneLayout';
import { type Box, type Size, placeCard, saveTourSeen, spotlightBox } from '../lib/tour';

interface TourStep {
  id: keyof typeof t.tour.steps;
  icon: ReactNode;
  tone: string;
  /** The `data-tour` value of the area to light up; without one the card sits in the middle. */
  target?: string;
  view: View;
  /** The pane a narrow window switches to so the area is on screen. */
  pane?: WorkspacePane;
}

const STEPS: TourStep[] = [
  { id: 'welcome', icon: <CompassIcon />, tone: 'var(--surface-muted)', view: 'editor' },
  { id: 'structure', icon: <TreeStructureIcon />, tone: 'var(--blue-bg)', target: 'structure', view: 'editor', pane: 'structure' },
  { id: 'edit', icon: <PencilSimpleIcon />, tone: 'var(--yellow-bg)', target: 'edit', view: 'editor', pane: 'inspector' },
  { id: 'output', icon: <PackageIcon />, tone: 'var(--green-bg)', target: 'output', view: 'editor', pane: 'output' },
  { id: 'issues', icon: <WarningCircleIcon />, tone: 'var(--red-bg)', target: 'issues', view: 'editor', pane: 'issues' },
  { id: 'topbar', icon: <SlidersHorizontalIcon />, tone: 'var(--surface-muted)', target: 'topbar', view: 'editor' },
  { id: 'translations', icon: <TranslateIcon />, tone: 'var(--blue-bg)', target: 'translations', view: 'translations' },
];

function tourKeys(): TourKeys {
  const label = (id: CommandId) => shortcutLabel(id)!;
  return {
    add: label('tree.addAttribute'),
    delete: label('tree.delete'),
    group: label('tree.group'),
    moveUp: label('tree.moveUp'),
    moveDown: label('tree.moveDown'),
    filter: label('tree.filter'),
    undo: label('workspace.undo'),
    output: label('workspace.toggleOutput'),
  };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (a !== null && b !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

function readViewport(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

function useViewport(): Size {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewport;
}

/** Where the area marked `data-tour={target}` is on screen; null when there is none or it is hidden. */
function useTargetBox(target: string | undefined): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const element = target ? document.querySelector(`[data-tour="${target}"]`) : null;
    const measure = () => {
      const rect = element?.getBoundingClientRect();
      const next = rect && rect.width > 0 && rect.height > 0 ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null;
      setBox((previous) => (sameBox(previous, next) ? previous : next));
    };
    measure();
    if (!element) return;
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [target]);
  return box;
}

/** Keeps Tab and Shift+Tab on the card's buttons. */
function trapFocus(event: KeyboardEvent, card: HTMLElement) {
  const buttons = [...card.querySelectorAll<HTMLElement>('button:not(:disabled)')];
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

/**
 * Walks through the areas of the workspace: lights each one up and says what it is for and what it
 * can do. It switches the view, and on a narrow window the pane, so the area is on screen, and puts
 * both back when it closes. Closing it, by Done, Skip or Escape, marks it as seen in this browser.
 */
export function Tour({ pane, onPane }: { pane: WorkspacePane; onPane: (pane: WorkspacePane) => void }) {
  const view = useStore((state) => state.view);
  const { setView, setTourOpen, setOutputOpen } = useStore.getState();
  const [start] = useState({ view, pane });
  const [returnFocus] = useState(() => document.activeElement);
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const copy = t.tour.steps[step.id];
  const features = typeof copy.features === 'function' ? copy.features(tourKeys()) : copy.features;
  const last = index === STEPS.length - 1;
  const target = useTargetBox(step.target);
  const viewport = useViewport();
  const cardRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const show = (next: number) => {
    setView(STEPS[next].view);
    const nextPane = STEPS[next].pane;
    if (nextPane) onPane(nextPane);
    // A wide window may have the Output pane hidden: show it for its step.
    if (STEPS[next].target === 'output') setOutputOpen(true);
    setIndex(next);
  };
  const finish = () => {
    saveTourSeen();
    setView(start.view);
    onPane(start.pane);
    setTourOpen(false);
  };

  // Measured after each step renders, so the card is placed with its own height before it is painted.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { top, left } = placeCard(target, { width: card.offsetWidth, height: card.offsetHeight }, viewport);
    setPosition((previous) => (previous?.top === top && previous.left === left ? previous : { top, left }));
  }, [target, viewport, index]);

  // Focus stays on the card: on the main button when the step's buttons changed under it (Back vanishes on the first step).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) card.querySelector<HTMLElement>('[data-tour-primary]')?.focus();
  }, [index]);
  useEffect(
    () => () => {
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
    },
    [returnFocus],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    } else if (event.key === 'ArrowRight' && !last) {
      show(index + 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      show(index - 1);
    } else if (event.key === 'Tab' && cardRef.current) {
      trapFocus(event, cardRef.current);
    }
  };

  return (
    // The layer blocks the workspace while the tour runs; pressing on it must not take focus from the card.
    <div className="tour" onMouseDown={(event) => event.target === event.currentTarget && event.preventDefault()}>
      {target ? <div className="tour__spotlight" style={spotlightBox(target, viewport)} /> : <div className="tour__backdrop" />}
      <div
        ref={cardRef}
        className="tour__card"
        role="dialog"
        aria-modal="true"
        aria-label={t.tour.label}
        aria-describedby={contentId}
        style={position ?? { visibility: 'hidden' }}
        onKeyDown={onKeyDown}
      >
        <div id={contentId} aria-live="polite">
          <div key={step.id} className="tour__content">
            <div className="tour__head">
              <span className="tour__icon" style={{ background: step.tone }} aria-hidden="true">
                {step.icon}
              </span>
              <h2 className="tour__title">{copy.title}</h2>
              <span className="tour__progress">{t.tour.progress(index + 1, STEPS.length)}</span>
            </div>
            <p className="tour__body">{copy.body}</p>
            <ul className="tour__features">
              {features.map((feature) => (
                <li key={feature}>{withKeys(feature)}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="tour__actions">
          {!last && (
            <Button size="small" variant="ghost" onClick={finish}>
              {t.tour.skip}
            </Button>
          )}
          <span className="grow" />
          {index > 0 && (
            <Button size="small" onClick={() => show(index - 1)}>
              {t.tour.back}
            </Button>
          )}
          <Button size="small" variant="primary" data-tour-primary="" onClick={() => (last ? finish() : show(index + 1))}>
            {last ? t.tour.done : t.tour.next}
          </Button>
        </div>
      </div>
    </div>
  );
}
