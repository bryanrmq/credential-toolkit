import { findNode } from '../../core/model';
import { useStore } from '../../state/store';
import { CredentialInspector } from './CredentialInspector';
import { NodeInspector } from './NodeInspector';
import { SelectionInspector } from './SelectionInspector';

export function Inspector() {
  const project = useStore((state) => state.project)!;
  const selection = useStore((state) => state.selection);
  const several = selection.kind === 'node' && selection.ids.length > 1 ? selection.ids : undefined;
  const visit = selection.kind === 'node' ? findNode(project.root, selection.id) : undefined;
  return (
    <div className="inspector">
      <div className="inspector__main">
        {several ? (
          <SelectionInspector ids={several} />
        ) : visit ? (
          <NodeInspector key={visit.node.id} node={visit.node} parent={visit.parent} />
        ) : (
          <CredentialInspector />
        )}
      </div>
    </div>
  );
}
