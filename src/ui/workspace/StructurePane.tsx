import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  BinaryIcon,
  CalendarBlankIcon,
  DotsSixVerticalIcon,
  FolderSimpleIcon,
  HashIcon,
  IdentificationCardIcon,
  ImageIcon,
  ListBulletsIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StackIcon,
  TextTIcon,
  ToggleLeftIcon,
} from '@phosphor-icons/react';
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type PendingLink, pendingLinks, textIn } from '../../core/import/i14y';
import { importSample } from '../../core/import/sample';
import {
  type Group,
  KNOWN_STANDARDS,
  type Node,
  type Project,
  findNode,
  isArrayType,
  walkNodes,
} from '../../core/model';
import { moveNodesTo, outermostIds, renameNode } from '../../core/operations';
import { CREDENTIAL, extendTo, isSelected, rowAfter, selectedIds, toggleNode, visibleOrder } from '../../state/selection';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { useIssues } from '../issues';
import { useI14yCatalogue } from '../lib/i14y';
import { type NewNodeKind, addNode, deleteSelection, editSelection, groupSelection, moveSelection, ungroupSelection } from '../lib/treeActions';
import { type DropIndicator, type DropTarget, dropTarget, emptyRowId } from '../lib/treeDrop';
import { type TreeShortcut, treeShortcut, treeShortcutsActive } from '../lib/treeShortcuts';
import { useWideWindow } from '../lib/wideWindow';
import { I14yDialog } from './I14yDialog';
import { SampleDialog } from './SampleControl';

function nodeIcon(node: Node): ReactNode {
  if (node.kind === 'group') return node.array ? <StackIcon /> : <FolderSimpleIcon />;
  const type = isArrayType(node.type) ? node.type.array : node.type;
  if (isArrayType(node.type)) return <ListBulletsIcon />;
  if (node.standard === KNOWN_STANDARDS.dataUrl) return <ImageIcon />;
  if (type === 'Numeric') return <HashIcon />;
  if (type === 'Boolean') return <ToggleLeftIcon />;
  if (type === 'DateTime') return <CalendarBlankIcon />;
  if (type === 'Binary') return <BinaryIcon />;
  return <TextTIcon />;
}

/** The group new nodes go into: the selected group, the selected attribute's group, or the root. */
function targetGroup(project: Project, selectionId: string | null): Group {
  if (!selectionId) return project.root;
  const visit = findNode(project.root, selectionId);
  if (!visit) return project.root;
  return visit.node.kind === 'group' ? visit.node.group : visit.parent;
}

/** Unlinked attributes that look like I14Y concepts, by node id. */
type Matches = Map<string, PendingLink>;

/** The row id of the Credential row; node rows use their node id. */
const CREDENTIAL_ROW = 'credential';

/**
 * What every row needs from the tree: the I14Y matches, the one row in the tab order, the click
 * handlers, the row being renamed and how a rename ends and, while dragging, the dragged nodes, where
 * a drop would land and whether groups take drops inside (wide windows only).
 */
interface RowContext {
  matches: Matches;
  focusId: string;
  onRowClick: (id: string, event: MouseEvent) => void;
  onRowDoubleClick: (id: string, event: MouseEvent) => void;
  renaming: string | null;
  endRename: (id: string, key: string | null, refocus: boolean) => void;
  dragged: string[] | null;
  drop: DropIndicator | null;
  inside: boolean;
}

/** The `data-drop` value of row `id` for `indicator`: an outline (inside) or an insertion line above or below it. */
function dropMark(indicator: DropIndicator | null, id: string): 'inside' | 'before' | 'after' | undefined {
  if (!indicator || indicator.kind === 'end' || indicator.row !== id) return undefined;
  if (indicator.kind === 'inside') return 'inside';
  return indicator.edge === 'top' ? 'before' : 'after';
}

function NodeRow({ node, level, context }: { node: Node; level: number; context: RowContext }) {
  const selected = useStore((state) => isSelected(state.selection, node.id));
  // The primary is marked only in a multi-selection; alone, it looks like any selected row.
  const primary = useStore((state) => state.selection.kind === 'node' && state.selection.ids.length > 1 && state.selection.id === node.id);
  const editLang = useStore((state) => state.editLang);
  const issues = useIssues().filter((issue) => issue.target.kind === 'node' && issue.target.nodeId === node.id);
  const severity = issues.some((issue) => issue.severity === 'error') ? 'error' : issues.length ? 'warning' : null;
  const draggable = useDraggable({ id: node.id });
  const droppable = useDroppable({ id: node.id });
  const match = context.matches.get(node.id)?.hits[0];

  return (
    <li role="none" className={context.dragged?.includes(node.id) ? 'tree__dragging' : undefined}>
      <div
        ref={(element) => {
          draggable.setNodeRef(element);
          droppable.setNodeRef(element);
        }}
        className="tree__row"
        role="treeitem"
        aria-level={level}
        aria-selected={selected}
        data-row={node.id}
        data-primary={primary || undefined}
        data-drop={dropMark(context.drop, node.id)}
        tabIndex={context.focusId === node.id ? 0 : -1}
        onClick={(event) => context.onRowClick(node.id, event)}
        onDoubleClick={(event) => context.onRowDoubleClick(node.id, event)}
      >
        {/* Out of the tab order: the tree is one tab stop. */}
        <button
          type="button"
          className="tree__handle"
          aria-label={t.structure.dragHandle(node.key)}
          {...draggable.attributes}
          {...draggable.listeners}
          tabIndex={-1}
        >
          <DotsSixVerticalIcon />
        </button>
        {context.renaming === node.id ? (
          <>
            {nodeIcon(node)}
            <RenameInput node={node} onDone={(key, refocus) => context.endRename(node.id, key, refocus)} />
          </>
        ) : (
          <RowContent node={node} />
        )}
        {node.kind === 'attribute' && node.i14y && (
          <span className="tree__tag" title={t.i14yLink.tagTitle(node.i14y.identifier)}>
            {t.i14yLink.tag}
          </span>
        )}
        {match && (
          <span className="tree__tag tree__tag--maybe" title={t.i14yMatch.markerTitle(textIn(match.name, editLang) || match.identifier, match.identifier)}>
            {t.i14yMatch.marker}
          </span>
        )}
        {node.sensitive && <LockSimpleIcon size={12} aria-label={t.inspector.sensitive} />}
        <span className="tree__label">{node.labels[editLang]}</span>
        {severity && <span className={`tree__dot tree__dot--${severity}`} aria-hidden="true" />}
      </div>
      {node.kind === 'group' && <NodeList group={node.group} level={level + 1} context={context} />}
    </li>
  );
}

/** A node's icon and key, shared by its row and its drag preview. */
function RowContent({ node }: { node: Node }) {
  return (
    <>
      {nodeIcon(node)}
      <span className="tree__key">{node.key || '—'}</span>
    </>
  );
}

/**
 * A row's key as an inline input, while renaming it: ⏎ and leaving the input commit, Escape restores
 * the old key (`null`). Like the Edit pane's key field, any key is accepted; the issues flag bad ones.
 */
function RenameInput({ node, onDone }: { node: Node; onDone: (key: string | null, refocus: boolean) => void }) {
  const [text, setText] = useState(node.key);
  const ref = useRef<HTMLInputElement>(null);
  // ⏎ and Escape end the rename before the input goes away, so its blur must not end it again.
  const done = useRef(false);
  const finish = (key: string | null, refocus: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(key, refocus);
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="input input--mono tree__rename"
      aria-label={t.structure.rename(node.key)}
      value={text}
      spellCheck={false}
      onChange={(event) => setText(event.target.value)}
      // Clicks in the input stay in it: they neither select the row again nor start another rename.
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={() => finish(text, false)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') finish(text, true);
        else if (event.key === 'Escape') finish(null, true);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}

/** While dragging, an empty group's line invites a drop (into that group). */
function EmptyDrop({ group }: { group: Group }) {
  const { setNodeRef } = useDroppable({ id: emptyRowId(group.id) });
  return (
    <li ref={setNodeRef} className="tree__empty tree__empty--drop" role="none">
      {t.structure.emptyDrop}
    </li>
  );
}

function NodeList({ group, level, context }: { group: Group; level: number; context: RowContext }) {
  // The top level's rows belong to the tree itself; a group's rows form a nested group.
  return (
    <ul className="tree" role={level === 1 ? 'none' : 'group'} data-drop-end={(level === 1 && context.drop?.kind === 'end') || undefined}>
      {group.children.length === 0 &&
        (context.dragged && context.inside ? (
          <EmptyDrop group={group} />
        ) : (
          <li className="tree__empty" role="none">
            {t.structure.empty}
          </li>
        ))}
      {group.children.map((child) => (
        <NodeRow key={child.id} node={child} level={level} context={context} />
      ))}
    </ul>
  );
}

/** What follows the pointer while dragging: the dragged row, or a chip counting the dragged nodes. */
function DragPreview({ project, ids }: { project: Project; ids: string[] }) {
  const editLang = useStore((state) => state.editLang);
  const node = ids.length === 1 ? findNode(project.root, ids[0])?.node : undefined;
  if (!node) return <div className="tree__chip">{t.structure.dragCount(ids.length)}</div>;
  return (
    <div className="tree__row tree__preview">
      <span className="tree__handle">
        <DotsSixVerticalIcon />
      </span>
      <RowContent node={node} />
      <span className="tree__label">{node.labels[editLang]}</span>
    </div>
  );
}

export function StructurePane({ onSelect }: { onSelect: () => void }) {
  const project = useStore((state) => state.project)!;
  const selection = useStore((state) => state.selection);
  const { update, select, setReport } = useStore.getState();
  const [filling, setFilling] = useState(false);
  const [i14yGroupId, setI14yGroupId] = useState<string | null>(null);
  // With unlinked attributes, load the cached I14Y catalogue to mark the ones that look like a concept.
  const unlinked = [...walkNodes(project.root)].some(({ node }) => node.kind === 'attribute' && !node.i14y);
  const { catalogue } = useI14yCatalogue(unlinked);
  const matches: Matches = new Map((catalogue && unlinked ? pendingLinks(project, catalogue) : []).map((pending) => [pending.nodeId, pending]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const wide = useWideWindow();
  const treeRef = useRef<HTMLDivElement>(null);
  // How the last press on the tree came: a touch tap always selects one node.
  const pointerType = useRef('mouse');
  // Roving tabindex: the primary row is the tree's one tab stop.
  const focusId = selection.kind === 'node' && findNode(project.root, selection.id) ? selection.id : CREDENTIAL_ROW;

  const focusRow = (id: string) => {
    const rows = treeRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [];
    [...rows].find((row) => row.dataset.row === id)?.focus();
  };

  // On wide windows with a mouse, ⌘-click (Ctrl-click) toggles a node and ⇧-click selects a range.
  // Otherwise a click selects one node and, on narrow windows, switches to the Edit pane.
  const onRowClick = (id: string, event: MouseEvent) => {
    const current = useStore.getState().selection;
    const multi = wide && pointerType.current !== 'touch' && id !== CREDENTIAL_ROW;
    if (multi && event.shiftKey) {
      select(extendTo(project, current, id));
    } else if (multi && (event.metaKey || event.ctrlKey)) {
      select(toggleNode(project, current, id));
    } else {
      select(id === CREDENTIAL_ROW ? CREDENTIAL : { kind: 'node', id });
      onSelect();
    }
  };

  // The node whose key is an inline input, while renaming it.
  const [renaming, setRenaming] = useState<string | null>(null);

  /** Renames the one selected node inline (F2); not for the credential or several nodes at once. */
  const renameSelection = () => {
    const ids = selectedIds(useStore.getState().selection);
    if (ids.length === 1) setRenaming(ids[0]);
  };

  // On wide windows with a mouse, a plain double-click renames the row; its first click has selected it alone.
  const onRowDoubleClick = (id: string, event: MouseEvent) => {
    if (pointerType.current === 'touch' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!treeShortcutsActive(event.currentTarget, wide)) return;
    const ids = selectedIds(useStore.getState().selection);
    if (ids.length === 1 && ids[0] === id) setRenaming(id);
  };

  // One rename is one undo step; `renameNode` makes `{{…}}` references follow. ⏎ and Escape put focus back on the row.
  const endRename = (id: string, key: string | null, refocus: boolean) => {
    setRenaming(null);
    const node = findNode(useStore.getState().project!.root, id)?.node;
    if (node && key !== null && key !== node.key) update((draft) => renameNode(draft, id, key));
    if (refocus) refocusTree();
  };

  /** Keeps keyboard focus in the tree once a change has re-rendered it: on the primary row, or the Credential row. */
  const refocusTree = () =>
    requestAnimationFrame(() => {
      const current = useStore.getState().selection;
      focusRow(current.kind === 'node' ? current.id : CREDENTIAL_ROW);
    });

  // The tree shortcuts other than ⏎, which the Enter branch below handles. Adding and grouping focus the new key field.
  const runShortcut = (shortcut: Exclude<TreeShortcut, 'edit'>) => {
    if (shortcut === 'add') addNode();
    else if (shortcut === 'rename') renameSelection();
    else if (shortcut === 'group') groupSelection();
    else {
      if (shortcut === 'delete') deleteSelection();
      else if (shortcut === 'ungroup') ungroupSelection();
      else moveSelection(shortcut === 'moveUp' ? 'up' : 'down');
      refocusTree();
    }
  };

  // ↑ / ↓ move the selection and ⇧↑ / ⇧↓ extend it (wide windows only); Home / End go to the first and last rows.
  // On wide windows the tree shortcuts (`treeShortcut`) run too, while a row has focus.
  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const shortcut = treeShortcut(event.nativeEvent);
    const active = treeShortcutsActive(event.target, wide);
    if (shortcut && shortcut !== 'edit' && active) {
      event.preventDefault();
      runShortcut(shortcut);
      return;
    }
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'treeitem') return;
    const current = useStore.getState().selection;
    if (event.key === 'Enter') {
      const id = event.target.dataset.row ?? CREDENTIAL_ROW;
      if (id !== focusId) select(id === CREDENTIAL_ROW ? CREDENTIAL : { kind: 'node', id });
      onSelect();
      if (active) editSelection();
      return;
    }
    const arrow = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    let target: string | null;
    if (arrow) target = rowAfter(project, current, arrow);
    else if (event.key === 'Home') target = CREDENTIAL_ROW;
    else if (event.key === 'End') target = visibleOrder(project).at(-1) ?? CREDENTIAL_ROW;
    else return;
    event.preventDefault();
    if (target === null) return;
    if (arrow && event.shiftKey && wide && current.kind === 'node') {
      // The credential cannot join a multi-selection.
      if (target === CREDENTIAL_ROW) return;
      select(extendTo(project, current, target));
    } else {
      select(target === CREDENTIAL_ROW ? CREDENTIAL : { kind: 'node', id: target });
    }
    focusRow(target);
  };
  // While dragging: the dragged nodes, and where dropping them would land (null for nowhere).
  const [dragged, setDragged] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const context: RowContext = {
    matches,
    focusId,
    onRowClick,
    onRowDoubleClick,
    renaming,
    endRename,
    dragged,
    drop: drop?.indicator ?? null,
    inside: wide,
  };

  const add = (kind: NewNodeKind) => {
    addNode(kind);
    onSelect();
  };

  const openI14y = () => setI14yGroupId(targetGroup(project, selection.kind === 'node' ? selection.id : null).id);

  // On wide windows, dragging a node of a multi-selection drags the whole selection; otherwise the node alone.
  const draggedFor = (id: string): string[] => {
    const current = useStore.getState().selection;
    const ids = selectedIds(current);
    return wide && ids.length > 1 && ids.includes(id) ? outermostIds(project, ids) : [id];
  };

  // The one collision is where a drop would land, worked out from the pointer's height over the rows.
  const collisionDetection: CollisionDetection = ({ active, collisionRect, droppableRects, droppableContainers, pointerCoordinates }) => {
    const rows = droppableContainers.flatMap(({ id }) => {
      const rect = droppableRects.get(id);
      return rect ? [{ id: String(id), top: rect.top, bottom: rect.bottom }] : [];
    });
    const y = pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2;
    const target = dropTarget(project, dragged ?? draggedFor(String(active.id)), rows, y, wide);
    if (!target) return [];
    return [{ id: target.indicator.kind === 'end' ? 'end' : target.indicator.row, data: { target } }];
  };
  const targetOf = (event: DragMoveEvent | DragEndEvent): DropTarget | null => (event.collisions?.[0]?.data?.target as DropTarget | undefined) ?? null;

  const onDragMove = (event: DragMoveEvent) => {
    const target = targetOf(event);
    setDrop((current) => (JSON.stringify(current) === JSON.stringify(target) ? current : target));
  };

  const endDrag = () => {
    setDragged(null);
    setDrop(null);
  };

  // One drop is one undo step; `moveNodesTo` moves each node through `moveNode`, so references follow.
  const onDragEnd = (event: DragEndEvent) => {
    const target = targetOf(event);
    const ids = dragged ?? draggedFor(String(event.active.id));
    endDrag();
    if (target) update((draft) => void moveNodesTo(draft, ids, target.groupId, target.index));
  };

  return (
    <>
      <div className="pane__header">
        <span className="pane__title">{t.structure.title}</span>
        <div className="row">
          <Button size="small" variant="ghost" onClick={() => add('attribute')} title={t.structure.addAttribute}>
            <PlusIcon /> {t.structure.addAttribute}
          </Button>
          <Button size="small" variant="ghost" onClick={openI14y} title={t.structure.addFromI14yTitle}>
            <MagnifyingGlassIcon /> {t.structure.addFromI14y}
          </Button>
          <Button size="small" variant="ghost" onClick={() => add('group')} aria-label={t.structure.addGroup} title={t.structure.addGroup}>
            <FolderSimpleIcon />
          </Button>
          <Button size="small" variant="ghost" onClick={() => add('list')} aria-label={t.structure.addList} title={t.structure.addList}>
            <StackIcon />
          </Button>
        </div>
      </div>
      <div className="pane__body">
        <div
          ref={treeRef}
          role="tree"
          aria-label={t.structure.title}
          aria-multiselectable={wide}
          onKeyDown={onTreeKeyDown}
          onPointerDown={(event) => {
            pointerType.current = event.pointerType;
          }}
        >
          <div
            className="tree__row"
            role="treeitem"
            aria-level={1}
            aria-selected={selection.kind === 'credential'}
            data-row={CREDENTIAL_ROW}
            tabIndex={focusId === CREDENTIAL_ROW ? 0 : -1}
            onClick={(event) => onRowClick(CREDENTIAL_ROW, event)}
          >
            <IdentificationCardIcon />
            <span className="tree__key">{t.structure.credential}</span>
          </div>
          {project.root.children.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={({ active }) => setDragged(draggedFor(String(active.id)))}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDragCancel={endDrag}
            >
              <NodeList group={project.root} level={1} context={context} />
              {createPortal(
                <DragOverlay className="tree__overlay" dropAnimation={null}>
                  {dragged && <DragPreview project={project} ids={dragged} />}
                </DragOverlay>,
                document.body,
              )}
            </DndContext>
          )}
        </div>
        {project.root.children.length === 0 && (
          <div className="empty-structure">
            <p className="empty-structure__title">{t.structure.empty}</p>
            <p className="field__hint">{t.structure.emptyHint}</p>
            <div className="row row--wrap">
              <Button size="small" variant="primary" onClick={() => add('attribute')}>
                <PlusIcon /> {t.structure.addFirst}
              </Button>
              <Button size="small" onClick={() => setFilling(true)}>
                {t.structure.fillFromSample}
              </Button>
              <Button size="small" onClick={openI14y}>
                <MagnifyingGlassIcon /> {t.structure.addFromI14yTitle}
              </Button>
            </div>
          </div>
        )}
        {i14yGroupId && (
          <I14yDialog
            groupId={i14yGroupId}
            onAdded={(nodeIds) => {
              if (nodeIds.length === 0) return;
              select({ kind: 'node', id: nodeIds[0] });
              onSelect();
            }}
            onClose={() => setI14yGroupId(null)}
          />
        )}
        {filling && (
          <SampleDialog
            title={t.structure.fillTitle}
            intro={t.structure.fillIntro}
            submitLabel={t.structure.fillSubmit}
            onSample={(sample) => {
              const result = importSample(sample, project.languages);
              update((draft) => {
                draft.root = result.project.root;
                draft.sample = sample;
              });
              setReport(result.report);
            }}
            onClose={() => setFilling(false)}
          />
        )}
      </div>
    </>
  );
}
