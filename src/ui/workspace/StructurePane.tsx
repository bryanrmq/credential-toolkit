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
  ArrowDownIcon,
  ArrowUpIcon,
  BinaryIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretRightIcon,
  ClipboardTextIcon,
  CopyIcon,
  CopySimpleIcon,
  DotsSixVerticalIcon,
  FolderSimpleDashedIcon,
  FolderSimpleIcon,
  FolderSimplePlusIcon,
  HashIcon,
  IdentificationCardIcon,
  ImageIcon,
  ListBulletsIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ScissorsIcon,
  StackIcon,
  TextTIcon,
  ToggleLeftIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { type KeyboardEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
import { CREDENTIAL, extendTo, isSelected, oneNode, rowAfter, selectedIds, toggleNode } from '../../state/selection';
import { type Selection, useStore } from '../../state/store';
import { ancestorIds, visibleRows } from '../../state/treeView';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { PopupMenu, type PopupMenuItem } from '../components/PopupMenu';
import { useIssues } from '../issues';
import { useI14yCatalogue } from '../lib/i14y';
import {
  type NewNodeKind,
  type NodePlace,
  addNode,
  canDeleteSelection,
  canDuplicateSelection,
  canGroupSelection,
  canMoveSelection,
  canUngroupSelection,
  deleteSelection,
  duplicateSelection,
  editSelection,
  groupSelection,
  moveSelection,
  newNodePlace,
  ungroupSelection,
} from '../lib/treeActions';
import { canCopySelection, canPasteCopied, copySelection, cutSelection, pasteCopied, useTreeClipboard } from '../lib/treeClipboard';
import { type DropIndicator, type DropTarget, dropTarget, emptyRowId } from '../lib/treeDrop';
import { type ClipboardShortcut, type TreeShortcut, treeActionsAvailable, treeShortcut, treeShortcutLabel, treeShortcutsActive } from '../lib/treeShortcuts';
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

/**
 * An open menu: a right-click menu, or the header's Add menu (`add`). `at` is where it opens, in window
 * coordinates; focus goes back to `returnFocus` when it closes.
 */
interface TreeMenu {
  add?: boolean;
  label: string;
  sections: PopupMenuItem[][];
  at: { x: number; y: number };
  returnFocus: HTMLElement | null;
}

/** Unlinked attributes that look like I14Y concepts, by node id. */
type Matches = Map<string, PendingLink>;

/** The row id of the Credential row; node rows use their node id. */
const CREDENTIAL_ROW = 'credential';

/**
 * What every row needs from the tree: the I14Y matches, the one row in the tab order, the click
 * handlers, the row being renamed and how a rename ends, how a group expands or collapses and, while
 * dragging, the dragged nodes, where a drop would land and whether groups take drops inside (wide windows only).
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
  onToggle: (id: string, open: boolean) => void;
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
  const open = useStore((state) => node.kind === 'group' && !state.collapsed.includes(node.id));

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
        aria-expanded={node.kind === 'group' ? open : undefined}
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
        {node.kind === 'group' ? (
          // Also out of the tab order (← / → expand and collapse), and a click on it neither takes focus nor selects the row.
          <button
            type="button"
            className="tree__toggle"
            aria-label={open ? t.structure.collapse(node.key) : t.structure.expand(node.key)}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              context.onToggle(node.id, !open);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <CaretRightIcon size={12} weight="bold" />
          </button>
        ) : (
          <span className="tree__toggle" aria-hidden="true" />
        )}
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
      {node.kind === 'group' && open && <NodeList group={node.group} level={level + 1} context={context} />}
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
  const collapsed = useStore((state) => state.collapsed);
  const { update, select, setGroupOpen, setReport } = useStore.getState();
  // The node rows on screen, in order: arrows, Home / End and ⇧ ranges move over these only.
  const nodeRows = visibleRows(project, collapsed);
  const [filling, setFilling] = useState(false);
  const [i14yGroupId, setI14yGroupId] = useState<string | null>(null);
  const [menu, setMenu] = useState<TreeMenu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  // Whether the Add menu was open when its button was pressed: the press closes it, so the click must not reopen it.
  const addWasOpen = useRef(false);
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
      select(extendTo(nodeRows, current, id));
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

  // A click on a chevron leaves the selection alone, unless collapsing hides selected rows: the group then takes their place.
  const onToggle = (id: string, open: boolean) => {
    const focused = treeRef.current?.contains(document.activeElement);
    setGroupOpen(id, open);
    if (focused) refocusTree();
  };

  /** Keeps keyboard focus in the tree once a change has re-rendered it: on the primary row, or the Credential row. */
  const refocusTree = () =>
    requestAnimationFrame(() => {
      const current = useStore.getState().selection;
      focusRow(current.kind === 'node' ? current.id : CREDENTIAL_ROW);
    });

  // ⌘C, ⌘X and ⌘V while a row has focus; paste puts the nodes where N adds one.
  useTreeClipboard(treeRef, wide, refocusTree);

  // The tree shortcuts other than ⏎, which the Enter branch below handles. Adding and grouping focus the new key field.
  const runShortcut = (shortcut: Exclude<TreeShortcut, 'edit'>) => {
    if (shortcut === 'add') addNode();
    else if (shortcut === 'rename') renameSelection();
    else if (shortcut === 'group') groupSelection();
    else {
      if (shortcut === 'delete') deleteSelection();
      else if (shortcut === 'ungroup') ungroupSelection();
      else if (shortcut === 'duplicate') duplicateSelection();
      else moveSelection(shortcut === 'moveUp' ? 'up' : 'down');
      refocusTree();
    }
  };

  /**
   * → (`inward`) expands the primary row's group when collapsed, else goes to its first child; ← collapses
   * it when expanded, else goes to the group around the row (ARIA tree pattern).
   */
  const stepAcross = (current: Selection, inward: boolean) => {
    const node = current.kind === 'node' ? findNode(project.root, current.id)?.node : undefined;
    if (!node) return;
    const open = node.kind === 'group' && !collapsed.includes(node.id);
    if (node.kind === 'group' && open !== inward) {
      setGroupOpen(node.id, inward);
      return;
    }
    const target = inward ? (open ? node.group.children[0]?.id : undefined) : ancestorIds(project, node.id).at(-1);
    if (!target) return;
    select({ kind: 'node', id: target });
    focusRow(target);
  };

  // ↑ / ↓ move the selection over the rows on screen and ⇧↑ / ⇧↓ extend it (wide windows only); Home / End go
  // to the first and last rows; ← / → expand, collapse and step across levels (`stepAcross`).
  // On wide windows the tree shortcuts (`treeShortcut`) run too, while a row has focus.
  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const menuKey = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey);
    if (menuKey && treeShortcutsActive(event.target, wide)) {
      event.preventDefault();
      const rowElement = event.target as HTMLElement;
      const rect = rowElement.getBoundingClientRect();
      openMenu(rowElement, { x: rect.left + 24, y: rect.bottom });
      return;
    }
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
    if (arrow) target = rowAfter(nodeRows, current, arrow);
    else if (event.key === 'Home') target = CREDENTIAL_ROW;
    else if (event.key === 'End') target = nodeRows.at(-1) ?? CREDENTIAL_ROW;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      if (!event.shiftKey) stepAcross(current, event.key === 'ArrowRight');
      return;
    } else return;
    event.preventDefault();
    if (target === null) return;
    if (arrow && event.shiftKey && wide && current.kind === 'node') {
      // The credential cannot join a multi-selection.
      if (target === CREDENTIAL_ROW) return;
      select(extendTo(nodeRows, current, target));
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
    onToggle,
  };

  const add = (kind: NewNodeKind) => {
    addNode(kind);
    onSelect();
  };

  const openI14y = () => setI14yGroupId(targetGroup(project, selection.kind === 'node' ? selection.id : null).id);

  /** Opens the header's Add menu below `button`, right-aligned with it. New items go where N puts them. */
  const openAddMenu = (button: HTMLElement) => {
    const rect = button.getBoundingClientRect();
    setMenu({
      add: true,
      label: t.structure.addMenu,
      sections: [
        [
          { label: t.structure.addAttribute, icon: <PlusIcon />, shortcut: treeShortcutLabel('add'), onSelect: () => add('attribute') },
          { label: t.structure.addGroup, icon: <FolderSimpleIcon />, onSelect: () => add('group') },
          { label: t.structure.addList, icon: <StackIcon />, onSelect: () => add('list') },
        ],
      ],
      at: { x: rect.right, y: rect.bottom + 4 },
      returnFocus: button,
    });
  };

  /**
   * Opens the right-click menu of `rowElement`: a node's, or the top level's for the Credential row and
   * the empty area (no row). An unselected node is selected first.
   */
  const openMenu = (rowElement: HTMLElement | null, at: { x: number; y: number }) => {
    const id = rowElement?.dataset.row;
    const node = id && id !== CREDENTIAL_ROW ? findNode(project.root, id)?.node : undefined;
    if (node && !isSelected(useStore.getState().selection, node.id)) {
      select({ kind: 'node', id: node.id });
      onSelect();
    }
    const label = node ? t.treeMenu.nodeLabel(node.key) : t.treeMenu.areaLabel;
    setMenu({ label, sections: menuSections(node), at, returnFocus: rowElement });
  };

  // Right-click on a row or the empty area below it, on wide windows; elsewhere the browser's own menu shows.
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!treeActionsAvailable(wide) || !(event.target instanceof Element)) return;
    event.preventDefault();
    openMenu(event.target.closest<HTMLElement>('[data-row]'), { x: event.clientX, y: event.clientY });
  };

  /**
   * The items of `node`'s menu, or the top level's. A node's menu acts on the selection (the node is in
   * it), so the shared `canX` checks decide which items show; adding goes after an attribute, or inside a
   * group at its end.
   */
  const menuSections = (node: Node | undefined): PopupMenuItem[][] => {
    const addTo = (kind: NewNodeKind, groupId: string, index?: number) => () => {
      addNode(kind, { groupId, index });
      onSelect();
    };
    const shortcut = (name: TreeShortcut | ClipboardShortcut) => (node ? treeShortcutLabel(name) : undefined);
    const addHere = (groupId: string): PopupMenuItem[] => [
      { label: t.treeMenu.addAttributeHere, icon: <PlusIcon />, shortcut: shortcut('add'), onSelect: addTo('attribute', groupId) },
      { label: t.treeMenu.addGroupHere, icon: <FolderSimpleIcon />, onSelect: addTo('group', groupId) },
      { label: t.treeMenu.addListHere, icon: <StackIcon />, onSelect: addTo('list', groupId) },
      { label: t.treeMenu.addFromI14y, icon: <MagnifyingGlassIcon />, onSelect: () => setI14yGroupId(groupId) },
    ];
    const when = (applies: boolean, item: PopupMenuItem) => (applies ? [item] : []);
    const paste = (place: NodePlace) =>
      when(canPasteCopied(), {
        label: t.treeMenu.paste,
        icon: <ClipboardTextIcon />,
        shortcut: shortcut('paste'),
        onSelect: () => {
          pasteCopied(place);
          onSelect();
          refocusTree();
        },
      });
    if (!node) return [addHere(project.root.id), paste({ groupId: project.root.id })];

    const state = useStore.getState();
    const count = selectedIds(state.selection).length;
    const below = newNodePlace(project, oneNode(node.id));
    const clipboard = [
      ...when(canCopySelection(state.selection), {
        label: t.treeMenu.cut(count),
        icon: <ScissorsIcon />,
        shortcut: shortcut('cut'),
        onSelect: () => {
          cutSelection();
          refocusTree();
        },
      }),
      ...when(canCopySelection(state.selection), { label: t.treeMenu.copy(count), icon: <CopySimpleIcon />, shortcut: shortcut('copy'), onSelect: copySelection }),
      ...paste(below),
    ];
    const moves = [
      ...when(canMoveSelection('up', state), { label: t.treeMenu.moveUp, icon: <ArrowUpIcon />, shortcut: shortcut('moveUp'), onSelect: () => runShortcut('moveUp') }),
      ...when(canMoveSelection('down', state), { label: t.treeMenu.moveDown, icon: <ArrowDownIcon />, shortcut: shortcut('moveDown'), onSelect: () => runShortcut('moveDown') }),
    ];
    const duplicate = when(canDuplicateSelection(state.selection), {
      label: t.treeMenu.duplicate(count),
      icon: <CopyIcon />,
      shortcut: shortcut('duplicate'),
      onSelect: () => runShortcut('duplicate'),
    });
    const remove = (label: string) =>
      when(canDeleteSelection(state.selection), { label, icon: <TrashIcon />, shortcut: shortcut('delete'), danger: true, onSelect: () => runShortcut('delete') });
    if (node.kind === 'group') {
      return [
        addHere(node.group.id),
        [
          ...duplicate,
          ...when(canUngroupSelection(state), { label: t.treeMenu.ungroup, icon: <FolderSimpleDashedIcon />, shortcut: shortcut('ungroup'), onSelect: () => runShortcut('ungroup') }),
          ...moves,
        ],
        clipboard,
        remove(t.treeMenu.deleteGroup(count)),
      ];
    }
    return [
      [
        ...when(canGroupSelection(state.selection), { label: t.treeMenu.groupSelection, icon: <FolderSimplePlusIcon />, shortcut: shortcut('group'), onSelect: () => runShortcut('group') }),
        ...duplicate,
        { label: t.treeMenu.addBelow, icon: <PlusIcon />, shortcut: shortcut('add'), onSelect: addTo('attribute', below.groupId, below.index) },
      ],
      moves,
      clipboard,
      remove(t.treeMenu.delete(count)),
    ];
  };

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
    const target = dropTarget(project, dragged ?? draggedFor(String(active.id)), rows, y, wide, collapsed);
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
        <Button
          size="small"
          variant="ghost"
          aria-haspopup="menu"
          aria-expanded={menu?.add === true}
          onMouseDown={() => {
            addWasOpen.current = menu?.add === true;
          }}
          onClick={(event) => {
            if (addWasOpen.current) addWasOpen.current = false;
            else openAddMenu(event.currentTarget);
          }}
          onKeyDown={(event) => {
            // ↓ and ↑ open the menu too, as on any menu button.
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            openAddMenu(event.currentTarget);
          }}
        >
          <PlusIcon /> {t.structure.add}
          <CaretDownIcon className="btn__caret" />
        </Button>
      </div>
      <div className="pane__body" onContextMenu={onContextMenu}>
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
        {menu && (
          <PopupMenu
            label={menu.label}
            at={menu.at}
            sections={menu.sections}
            returnFocus={menu.returnFocus}
            align={menu.add ? 'end' : 'start'}
            onClose={closeMenu}
          />
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
