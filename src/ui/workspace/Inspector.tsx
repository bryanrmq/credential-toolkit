import { useLayoutEffect, useRef, useState } from 'react';
import { findNode } from '../../core/model';
import { useStore } from '../../state/store';
import { CredentialInspector } from './CredentialInspector';
import { EditPreview, PREVIEW_BESIDE_WIDTH } from './EditPreview';
import { NodeInspector } from './NodeInspector';
import { SelectionInspector } from './SelectionInspector';

/** Whether the element is at least `PREVIEW_BESIDE_WIDTH` wide, kept current as it is resized. False in tests. */
function useBeside() {
  const ref = useRef<HTMLDivElement>(null);
  const [beside, setBeside] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setBeside(element.offsetWidth >= PREVIEW_BESIDE_WIDTH);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, beside };
}

/** The Edit pane: the form for the selection and the wallet preview, beside the form on a wide pane or below it. */
export function Inspector() {
  const project = useStore((state) => state.project)!;
  const selection = useStore((state) => state.selection);
  const { ref, beside } = useBeside();
  const several = selection.kind === 'node' && selection.ids.length > 1 ? selection.ids : undefined;
  const visit = selection.kind === 'node' ? findNode(project.root, selection.id) : undefined;
  return (
    <div ref={ref} className="inspector">
      <div className="inspector__main">
        {several ? (
          <SelectionInspector ids={several} />
        ) : visit ? (
          <NodeInspector key={visit.node.id} node={visit.node} parent={visit.parent} />
        ) : (
          <CredentialInspector />
        )}
      </div>
      <EditPreview beside={beside} />
    </div>
  );
}
