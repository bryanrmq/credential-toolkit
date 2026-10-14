import { findNode } from '../../core/model';
import { useStore } from '../../state/store';
import { CredentialInspector } from './CredentialInspector';
import { NodeInspector } from './NodeInspector';
import { TranslationsAside } from './TranslationsAside';
import { credentialRows, nodeRows } from './translationRows';

export function Inspector() {
  const project = useStore((state) => state.project)!;
  const selection = useStore((state) => state.selection);
  const visit = selection.kind === 'node' ? findNode(project.root, selection.id) : undefined;
  return (
    <div className="inspector">
      <div className="inspector__main">
        {visit ? <NodeInspector key={visit.node.id} node={visit.node} parent={visit.parent} /> : <CredentialInspector />}
      </div>
      {project.languages.length > 1 && <TranslationsAside rows={visit ? nodeRows(visit.node) : credentialRows()} />}
    </div>
  );
}
