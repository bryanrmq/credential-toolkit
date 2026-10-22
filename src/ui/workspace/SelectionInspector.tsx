import { TrashIcon } from '@phosphor-icons/react';
import { findNode } from '../../core/model';
import { moveNodesInto } from '../../core/operations';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { usesCommandKey } from '../lib/platform';
import { deleteSelection, groupSelection } from '../lib/treeActions';
import { moveTargets } from './moveTargets';

/** How many selected keys the list shows before "+ N more". */
const SHOWN_KEYS = 5;

/**
 * The Edit pane for several selected nodes (`ids`, the selection): their count and keys, and the actions
 * that apply to all of them. Group and Delete are the tree's own actions, so they select what the tree would.
 */
export function SelectionInspector({ ids }: { ids: string[] }) {
  const project = useStore((state) => state.project)!;
  const { update } = useStore.getState();
  const nodes = ids.flatMap((id) => findNode(project.root, id)?.node ?? []);
  const targets = moveTargets(project.root, nodes);
  const command = usesCommandKey();

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
        <Button onClick={groupSelection} aria-keyshortcuts={command ? 'Meta+G' : 'Control+G'}>
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
        <Button variant="danger" onClick={deleteSelection} aria-keyshortcuts="Backspace">
          <TrashIcon /> {t.selection.delete}
          <kbd aria-hidden="true">{t.selection.deleteKeys}</kbd>
        </Button>
      </div>
    </>
  );
}
