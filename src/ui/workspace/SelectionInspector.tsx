import { TrashIcon } from '@phosphor-icons/react';
import { findNode } from '../../core/model';
import { groupNodes, moveNodesInto, removeNodes } from '../../core/operations';
import { CREDENTIAL, visibleOrder } from '../../state/selection';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { fieldId, focusField } from '../issues';
import { usesCommandKey } from '../lib/platform';
import { moveTargets } from './moveTargets';

/** How many selected keys the list shows before "+ N more". */
const SHOWN_KEYS = 5;

/** The Edit pane for several selected nodes: their count and keys, and the actions that apply to all of them. */
export function SelectionInspector({ ids }: { ids: string[] }) {
  const project = useStore((state) => state.project)!;
  const { update, select } = useStore.getState();
  const nodes = ids.flatMap((id) => findNode(project.root, id)?.node ?? []);
  const targets = moveTargets(project.root, nodes);
  const command = usesCommandKey();

  const group = () => {
    let groupId: string | undefined;
    update((draft) => void (groupId = groupNodes(draft, ids)));
    if (!groupId) return;
    select({ kind: 'node', id: groupId });
    focusField(fieldId({ kind: 'node', nodeId: groupId, field: 'key' }));
  };

  // After a delete the row below the deleted ones is selected, else the one above (Credential at the top).
  const remove = () => {
    const rows = ['credential', ...visibleOrder(project)];
    const last = Math.max(...ids.map((id) => rows.indexOf(id)));
    update((draft) => void removeNodes(draft, ids));
    const left = new Set(['credential', ...visibleOrder(useStore.getState().project!)]);
    const next = rows.slice(last + 1).find((row) => left.has(row)) ?? rows.slice(0, last).findLast((row) => left.has(row));
    select(next && next !== 'credential' ? { kind: 'node', id: next } : CREDENTIAL);
  };

  return (
    <>
      <header className="inspector__header">
        <h1 className="inspector__title">{t.selection.count(ids.length)}</h1>
        <ul className="selection-keys" aria-label={t.selection.keys}>
          {nodes.slice(0, SHOWN_KEYS).map((node) => (
            <li key={node.id} className="mono">
              {node.key}
            </li>
          ))}
          {nodes.length > SHOWN_KEYS && <li>{t.selection.more(nodes.length - SHOWN_KEYS)}</li>}
        </ul>
      </header>
      <div className="row row--wrap">
        <Button onClick={group} aria-keyshortcuts={command ? 'Meta+G' : 'Control+G'}>
          {t.selection.group}
          <kbd aria-hidden="true">{command ? t.selection.groupKeys.command : t.selection.groupKeys.control}</kbd>
        </Button>
        <select
          className="select selection-move"
          aria-label={t.selection.moveTo}
          value=""
          onChange={(event) => update((draft) => void moveNodesInto(draft, ids, event.target.value))}
        >
          <option value="" disabled>
            {t.selection.moveToPlaceholder}
          </option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </select>
        <Button variant="danger" onClick={remove} aria-keyshortcuts="Backspace">
          <TrashIcon /> {t.selection.delete}
          <kbd aria-hidden="true">{t.selection.deleteKeys}</kbd>
        </Button>
      </div>
    </>
  );
}
