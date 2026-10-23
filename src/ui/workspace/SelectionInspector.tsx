import { findNode } from '../../core/model';
import { moveNodesInto } from '../../core/operations';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { ariaKeyShortcuts, command, commandLabel, shortcutLabel } from '../lib/commands';
import { deleteSelection, groupSelection } from '../lib/treeActions';
import { moveTargets } from './moveTargets';

/** How many selected keys the list shows before "+ N more". */
const SHOWN_KEYS = 5;

const DeleteIcon = command('tree.delete').icon;

/**
 * The Edit pane for several selected nodes (`ids`, the selection): their count and keys, and the actions
 * that apply to all of them. Group and Delete are the tree's own actions, so they select what the tree would.
 */
export function SelectionInspector({ ids }: { ids: string[] }) {
  const project = useStore((state) => state.project)!;
  const { update } = useStore.getState();
  const nodes = ids.flatMap((id) => findNode(project.root, id)?.node ?? []);
  const targets = moveTargets(project.root, nodes);

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
        <Button onClick={groupSelection} aria-keyshortcuts={ariaKeyShortcuts('tree.group')}>
          {commandLabel('tree.group', 'editPane')}
          <kbd aria-hidden="true">{shortcutLabel('tree.group')}</kbd>
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
        <Button variant="danger" onClick={deleteSelection} aria-keyshortcuts={ariaKeyShortcuts('tree.delete')}>
          <DeleteIcon /> {commandLabel('tree.delete', 'editPane')}
          <kbd aria-hidden="true">{shortcutLabel('tree.delete')}</kbd>
        </Button>
      </div>
    </>
  );
}
