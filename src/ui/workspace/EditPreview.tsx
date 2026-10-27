import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { loadEditPreviewOpen, saveEditPreviewOpen } from '../lib/paneLayout';
import { OutputPreview } from './OutputPreview';
import { PreviewControls } from './PreviewControls';

/** The Edit pane width from which the preview sits beside the form; keep in step with `src/ui/styles/inspector.css`. */
export const PREVIEW_BESIDE_WIDTH = 600;

/** Keeps `--edit-preview-header` on the preview at its header's height, for the scroll padding beside the form. */
function useHeaderHeight() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header?.parentElement || typeof ResizeObserver === 'undefined') return;
    const section = header.parentElement;
    const observer = new ResizeObserver(() => section.style.setProperty('--edit-preview-header', `${header.offsetHeight}px`));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/**
 * The wallet preview in the Edit pane, for whatever is selected, drawn in the editing language. `beside` (a pane at
 * least `PREVIEW_BESIDE_WIDTH` wide) puts it in a column of its own next to the form, where it always shows; below
 * the form its header collapses it, and the choice is remembered.
 */
export function EditPreview({ beside }: { beside: boolean }) {
  const titleId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(loadEditPreviewOpen);
  const shown = beside || open;
  const headerRef = useHeaderHeight();

  return (
    <section
      className={shown ? 'edit-preview' : 'edit-preview edit-preview--collapsed'}
      aria-labelledby={titleId}
      data-placement={beside ? 'beside' : 'below'}
      data-tour="preview"
    >
      <div ref={headerRef} className="edit-preview__header">
        <span className="pane__title" id={titleId}>
          {t.editPreview.title}
        </span>
        {!beside && (
          <Button
            variant="ghost"
            size="icon"
            className="edit-preview__toggle"
            aria-label={open ? t.editPreview.collapse : t.editPreview.expand}
            title={open ? t.editPreview.collapse : t.editPreview.expand}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => {
              setOpen(!open);
              saveEditPreviewOpen(!open);
            }}
          >
            {open ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
          </Button>
        )}
        {shown && <PreviewControls className="edit-preview__controls" />}
      </div>
      {shown && (
        <div className="edit-preview__body" id={bodyId}>
          <OutputPreview />
        </div>
      )}
    </section>
  );
}
