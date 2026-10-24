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
  BracketsCurlyIcon,
  CaretDownIcon,
  CaretRightIcon,
  DotsSixVerticalIcon,
  DotsThreeIcon,
  IdentificationCardIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import { type KeyboardEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type PendingLink, pendingLinks, textIn } from '../../core/import/i14y';
import { importSample } from '../../core/import/sample';
import { type Group, type Node, type Project, findNode, walkNodes } from '../../core/model';
import { moveNodesTo, outermostIds, renameNode } from '../../core/operations';
import { CREDENTIAL, extendTo, isSelected, oneNode, rowAfter, selectedIds, toggleNode } from '../../state/selection';
import { type Selection, useStore } from '../../state/store';
import { ancestorIds, filterRanges, filteredIds, visibleRows } from '../../state/treeView';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { nodeIcon } from '../components/nodeIcon';
import { PopupMenu, type PopupMenuItem } from '../components/PopupMenu';
import { useIssues } from '../issues';
import { useI14yCatalogue } from '../lib/i14y';
import { type CommandArgs, type CommandId, type LabelPlace, applies, command, commandLabel, runCommand, shortcutLabel, useCommandHost } from '../lib/commands';
import { type NewNodeKind, type NodePlace, addNode, newNodePlace } from '../lib/treeActions';
import { useTreeClipboard } from '../lib/treeClipboard';
import { type DropIndicator, type DropTarget, dropTarget, emptyRowId } from '../lib/treeDrop';
import { overlayOpen, treeActionsAvailable, treeShortcutsActive } from '../lib/treeShortcuts';
import { useWideWindow } from '../lib/wideWindow';
import { I14yDialog } from './I14yDialog';
import { SampleDialog } from './SampleControl';

/** The group new nodes go into: the selected group, the selected attribute's group, or the root. */
function targetGroup(project: Project, selectionId: string | null): Group {
  if (!selectionId) return project.root;
  const visit = findNode(project.root, selectionId);
  if (!visit) return project.root;
  return visit.node.kind === 'group' ? visit.node.group : visit.parent;
}

/**
 * An open menu: a right-click menu, a row's ⋯ menu or the header's Add menu (`add`). `at` is where it opens, in
 * window coordinates, and `align` which of its edges sits there; focus goes back to `returnFocus` when it closes.
 */
interface TreeMenu {
  add?: boolean;
  align: 'start' | 'end';
  label: string;
  sections: PopupMenuItem[][];
  at: { x: number; y: number };
  returnFocus: HTMLElement | null;
}

/** How a menu shows and runs a command: see `commandItem`. */
interface ItemOptions {
  labelAt?: LabelPlace;
  args?: CommandArgs;
  keys?: boolean;
  danger?: boolean;
  then?: () => void;
}

/** Unlinked attributes that look like I14Y concepts, by node id. */
type Matches = Map<string, PendingLink>;

/** The row id of the Credential row; node rows use their node id. */
const CREDENTIAL_ROW = 'credential';

/**
 * What every row needs from the tree: the I14Y matches, the one row in the tab order, the click
 * handlers, the row being renamed and how a rename ends, how a group expands or collapses, the rows a
 * filter shows (null when the tree is not filtered) and, while dragging, the dragged nodes, where a drop
 * would land and whether groups take drops inside (wide windows only). `filter` is the filter box's text,
 * whose occurrences rows mark, and `onMore` opens a row's menu from its ⋯ button (touch screens only).
 */
interface RowContext {
  matches: Matches;
  shown: ReadonlySet<string> | null;
  filter: string;
  focusId: string;
  onRowClick: (id: string, event: MouseEvent) => void;
  onRowDoubleClick: (id: string, event: MouseEvent) => void;
  renaming: string | null;
  endRename: (id: string, key: string | null, refocus: boolean) => void;
  dragged: string[] | null;
  drop: DropIndicator | null;
  inside: boolean;
  onToggle: (id: string, open: boolean) => void;
  onMore: (button: HTMLElement) => void;
}

/** Whether a filtered tree shows anything inside `group`: the group node around it is then expanded. */
function showsInside(group: Group, shown: ReadonlySet<string>): boolean {
  return group.children.some((child) => shown.has(child.id));
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
  // While filtering, nothing drags: drop places among hidden rows would be ambiguous.
  const draggable = useDraggable({ id: node.id, disabled: context.shown !== null });
  const droppable = useDroppable({ id: node.id, disabled: context.shown !== null });
  const match = context.matches.get(node.id)?.hits[0];
  const saidOpen = useStore((state) => node.kind === 'group' && !state.collapsed.includes(node.id));
  // A filtered tree expands the groups around its matches, without changing which groups are collapsed.
  const open = context.shown && node.kind === 'group' ? showsInside(node.group, context.shown) : saidOpen;
  const label = node.labels[editLang];

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
        // The key and label in full, for when the pane is too narrow for them.
        title={label ? `${node.key} · ${label}` : node.key}
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
        {node.kind === 'group' && context.shown ? (
          // While filtering, the matches decide what shows: the chevron only tells.
          <span className="tree__toggle" aria-hidden="true">
            <CaretRightIcon size={12} weight="bold" />
          </span>
        ) : node.kind === 'group' ? (
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
          <RowContent node={node} filter={context.filter} />
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
        <span className="tree__label">
          <Marked text={label ?? ''} filter={context.filter} />
        </span>
        {severity && <span className={`tree__dot tree__dot--${severity}`} aria-hidden="true" />}
        {/*
         * Touch screens only (styles.css): iOS Safari fires no contextmenu on a long press, so this opens the
         * right-click menu. Out of the tab order, like the handle: on wide windows Shift+F10 opens the same menu.
         */}
        <button
          type="button"
          className="tree__more"
          aria-label={t.treeMenu.nodeLabel(node.key)}
          aria-haspopup="menu"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            context.onMore(event.currentTarget);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <DotsThreeIcon size={16} weight="bold" />
        </button>
      </div>
      {node.kind === 'group' && open && <NodeList group={node.group} level={level + 1} context={context} />}
    </li>
  );
}

/** `text` with the filter box's `filter` marked wherever it occurs (`filterRanges`). */
function Marked({ text, filter }: { text: string; filter: string }) {
  const ranges = filterRanges(text, filter);
  if (ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    parts.push(text.slice(at, start), <mark key={start} className="tree__match">{text.slice(start, end)}</mark>);
    at = end;
  }
  parts.push(text.slice(at));
  return parts;
}

/** A node's icon and key, shared by its row and its drag preview; a row marks the filter in the key. */
function RowContent({ node, filter = '' }: { node: Node; filter?: string }) {
  return (
    <>
      {nodeIcon(node)}
      <span className="tree__key">{node.key ? <Marked text={node.key} filter={filter} /> : '—'}</span>
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
  const { shown } = context;
  // The top level's rows belong to the tree itself; a group's rows form a nested group.
  return (
    <ul className="tree" role={level === 1 ? 'none' : 'group'} data-drop-end={(level === 1 && context.drop?.kind === 'end') || undefined}>
      {group.children.length === 0 &&
        !shown &&
        (context.dragged && context.inside ? (
          <EmptyDrop group={group} />
        ) : (
          <li className="tree__empty" role="none">
            {t.structure.empty}
          </li>
        ))}
      {group.children.map((child) => (!shown || shown.has(child.id)) && <NodeRow key={child.id} node={child} level={level} context={context} />)}
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
  const filterText = useStore((state) => state.treeFilter);
  const editLang = useStore((state) => state.editLang);
  const { update, select, setGroupOpen, setReport, setTreeFilter } = useStore.getState();
  // The rows a filter shows, or null when the tree is not filtered.
  const shown = filteredIds(project, filterText, editLang);
  // The node rows on screen, in order: arrows, Home / End and ⇧ ranges move over these only.
  const nodeRows = visibleRows(project, collapsed, shown);
  const [filling, setFilling] = useState(false);
  const [i14yGroupId, setI14yGroupId] = useState<string | null>(null);
  const [menu, setMenu] = useState<TreeMenu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), [setMenu]);
  // Whether the Add menu was open when its button was pressed: the press closes it, so the click must not reopen it.
  const addWasOpen = useRef(false);
  // With unlinked attributes, load the cached I14Y catalogue to mark the ones that look like a concept.
  const unlinked = [...walkNodes(project.root)].some(({ node }) => node.kind === 'attribute' && !node.i14y);
  const { catalogue } = useI14yCatalogue(unlinked);
  const matches: Matches = new Map((catalogue && unlinked ? pendingLinks(project, catalogue) : []).map((pending) => [pending.nodeId, pending]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const wide = useWideWindow();
  const treeRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  // How the last press on the tree came: a touch tap always selects one node.
  const pointerType = useRef('mouse');
  // Roving tabindex: the primary row is the tree's one tab stop, or the Credential row while a filter hides the primary.
  const focusId = selection.kind === 'node' && nodeRows.includes(selection.id) ? selection.id : CREDENTIAL_ROW;

  /** Focuses row `id`; returns whether it is on screen. */
  const focusRow = (id: string): boolean => {
    const rows = treeRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [];
    const found = [...rows].find((row) => row.dataset.row === id);
    found?.focus();
    return found !== undefined;
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

  /**
   * Keeps keyboard focus in the tree once a change has re-rendered it: on the primary row, or the
   * Credential row, or the tree's tab stop when a filter hides the primary.
   */
  const refocusTree = () =>
    requestAnimationFrame(() => {
      const current = useStore.getState().selection;
      if (focusRow(current.kind === 'node' ? current.id : CREDENTIAL_ROW)) return;
      treeRef.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus();
    });

  // ⌘C, ⌘X and ⌘V while a row has focus; paste puts the nodes where N adds one.
  useTreeClipboard(treeRef, wide, refocusTree);

  const focusFilter = () => {
    filterRef.current?.focus();
    filterRef.current?.select();
  };

  // In the filter box, Escape clears it and goes back to the tree, and ↓ goes to the first row it shows.
  const onFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setTreeFilter('');
      refocusTree();
    } else if (event.key === 'ArrowDown' && nodeRows.length > 0) {
      event.preventDefault();
      select({ kind: 'node', id: nodeRows[0] });
      focusRow(nodeRows[0]);
    }
  };

  /**
   * → (`inward`) expands the primary row's group when collapsed, else goes to its first child; ← collapses
   * it when expanded, else goes to the group around the row (ARIA tree pattern). While filtering, the
   * matches decide which groups are expanded, so ← and → only step across levels.
   */
  const stepAcross = (current: Selection, inward: boolean) => {
    const node = current.kind === 'node' ? findNode(project.root, current.id)?.node : undefined;
    if (!node) return;
    const open = node.kind === 'group' && (shown ? showsInside(node.group, shown) : !collapsed.includes(node.id));
    if (node.kind === 'group' && open !== inward && !shown) {
      setGroupOpen(node.id, inward);
      return;
    }
    const firstChild = node.kind === 'group' ? node.group.children.find((child) => !shown || shown.has(child.id))?.id : undefined;
    const target = inward ? (open ? firstChild : undefined) : ancestorIds(project, node.id).at(-1);
    if (!target) return;
    select({ kind: 'node', id: target });
    focusRow(target);
  };

  // ↑ / ↓ move the selection over the rows on screen and ⇧↑ / ⇧↓ extend it (wide windows only); Home / End go
  // to the first and last rows; ← / → expand, collapse and step across levels (`stepAcross`).
  // ⏎ selects the focused row and shows the Edit pane, and on wide windows focuses its key (`tree.edit`).
  // The other tree keys are commands, which the workspace's keyboard handler runs (`useCommandShortcuts`).
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
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'treeitem') return;
    const current = useStore.getState().selection;
    if (event.key === 'Enter') {
      const id = event.target.dataset.row ?? CREDENTIAL_ROW;
      if (id !== focusId) select(id === CREDENTIAL_ROW ? CREDENTIAL : { kind: 'node', id });
      onSelect();
      if (treeShortcutsActive(event.target, wide)) runCommand('tree.edit');
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
    shown,
    filter: filterText,
    focusId,
    onRowClick,
    onRowDoubleClick,
    renaming,
    endRename,
    dragged,
    drop: drop?.indicator ?? null,
    inside: wide,
    onToggle,
    onMore: (button) => openRowMenu(button),
  };

  const add = (kind: NewNodeKind) => {
    addNode(kind);
    onSelect();
  };

  const openI14y = () => setI14yGroupId(targetGroup(project, selection.kind === 'node' ? selection.id : null).id);

  // What only this pane can do for the tree commands (`commands.ts`).
  useCommandHost('tree', {
    tree: treeRef,
    hasFilter: () => filterRef.current !== null,
    focusFilter,
    rename: renameSelection,
    addFromI14y: (groupId) => (groupId ? setI14yGroupId(groupId) : openI14y()),
    refocus: refocusTree,
  });

  /**
   * The menu item of command `id`: its label (at `labelAt`), icon and keys (unless `keys` is false), and
   * what it does with `args`, followed by `then`.
   */
  const commandItem = (id: CommandId, { labelAt, args, keys = true, danger, then }: ItemOptions = {}): PopupMenuItem => {
    const Icon = command(id).icon;
    return {
      label: commandLabel(id, labelAt),
      icon: <Icon />,
      shortcut: keys ? shortcutLabel(id) : undefined,
      danger,
      onSelect: () => {
        runCommand(id, args);
        then?.();
      },
    };
  };

  /** Opens the header's Add menu below `button`, right-aligned with it. New items go where N puts them. */
  const openAddMenu = (button: HTMLElement) => {
    const rect = button.getBoundingClientRect();
    setMenu({
      add: true,
      align: 'end',
      label: t.structure.addMenu,
      sections: [
        [
          commandItem('tree.addAttribute', { labelAt: 'addMenu', then: onSelect }),
          commandItem('tree.addGroup', { labelAt: 'addMenu', then: onSelect }),
          commandItem('tree.addList', { labelAt: 'addMenu', then: onSelect }),
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
  const openMenu = (rowElement: HTMLElement | null, at: { x: number; y: number }, align: TreeMenu['align'] = 'start') => {
    const id = rowElement?.dataset.row;
    const node = id && id !== CREDENTIAL_ROW ? findNode(project.root, id)?.node : undefined;
    if (node && !isSelected(useStore.getState().selection, node.id)) {
      select({ kind: 'node', id: node.id });
      onSelect();
    }
    const label = node ? t.treeMenu.nodeLabel(node.key) : t.treeMenu.areaLabel;
    setMenu({ label, align, sections: menuSections(node), at, returnFocus: rowElement });
  };

  /**
   * Opens a row's menu from its ⋯ button, below it and right-aligned with it: on touch screens, at any window
   * width, where no right-click menu opens. The row is selected first without switching panes, so the menu
   * stays in view on a narrow window.
   */
  const openRowMenu = (button: HTMLElement) => {
    const rowElement = button.closest<HTMLElement>('[data-row]');
    const id = rowElement?.dataset.row;
    if (!rowElement || !id || overlayOpen()) return;
    if (!isSelected(useStore.getState().selection, id)) select({ kind: 'node', id });
    const rect = button.getBoundingClientRect();
    openMenu(rowElement, { x: rect.right, y: rect.bottom + 4 }, 'end');
  };

  // Right-click on a row or the empty area below it, on wide windows; elsewhere the browser's own menu shows.
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!treeActionsAvailable(wide) || !(event.target instanceof Element)) return;
    event.preventDefault();
    openMenu(event.target.closest<HTMLElement>('[data-row]'), { x: event.clientX, y: event.clientY });
  };

  /**
   * The items of `node`'s menu, or the top level's. A node's menu acts on the selection (the node is in
   * it), so each command's `appliesWhen` decides whether its item shows; adding goes after an attribute,
   * or inside a group at its end.
   */
  const menuSections = (node: Node | undefined): PopupMenuItem[][] => {
    // Only a node's menu shows the keys: they act on the selection, as its items do. They run on wide windows only.
    const item = (id: CommandId, options: ItemOptions = {}) => commandItem(id, { keys: node !== undefined && wide, ...options });
    const when = (id: CommandId, options?: ItemOptions) => (applies(id) ? [item(id, options)] : []);
    const addHere = (groupId: string): PopupMenuItem[] => [
      item('tree.addAttribute', { labelAt: 'here', args: { place: { groupId } }, then: onSelect }),
      item('tree.addGroup', { labelAt: 'here', args: { place: { groupId } }, then: onSelect }),
      item('tree.addList', { labelAt: 'here', args: { place: { groupId } }, then: onSelect }),
      item('tree.addFromI14y', { args: { place: { groupId } } }),
    ];
    const paste = (place: NodePlace) => when('tree.paste', { args: { place }, then: onSelect });
    if (!node) return [addHere(project.root.id), paste({ groupId: project.root.id })];

    const below = newNodePlace(project, oneNode(node.id));
    const clipboard = [...when('tree.cut'), ...when('tree.copy'), ...paste(below)];
    const moves = [...when('tree.moveUp'), ...when('tree.moveDown')];
    const duplicate = when('tree.duplicate');
    const remove = (labelAt?: LabelPlace) => when('tree.delete', { labelAt, danger: true });
    if (node.kind === 'group') {
      return [addHere(node.group.id), [...duplicate, ...when('tree.ungroup'), ...moves], clipboard, remove('groupMenu')];
    }
    return [
      [...when('tree.group'), ...duplicate, item('tree.addAttribute', { labelAt: 'below', args: { place: below }, then: onSelect })],
      moves,
      clipboard,
      remove(),
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
        {(project.root.children.length > 0 || filterText) && (
          <input
            ref={filterRef}
            className="input tree-filter"
            type="search"
            aria-label={t.structure.filter}
            placeholder={t.structure.filterPlaceholder}
            value={filterText}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setTreeFilter(event.target.value)}
            onKeyDown={onFilterKeyDown}
          />
        )}
      </div>
      <div className="pane__body" onContextMenu={onContextMenu}>
        <div
          ref={treeRef}
          role="tree"
          aria-label={t.structure.title}
          aria-multiselectable={wide}
          data-filtered={shown !== null || undefined}
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
        {shown?.size === 0 && (
          <div className="tree__empty tree__no-matches">
            <p role="status">{t.structure.noMatches(filterText.trim())}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setTreeFilter('');
                focusFilter();
              }}
            >
              {t.structure.clearFilter}
            </button>
          </div>
        )}
        {project.root.children.length === 0 && (
          <div className="empty-structure">
            <p className="empty-structure__title">{t.structure.empty}</p>
            <p className="field__hint">{t.structure.emptyHint}</p>
            <div className="empty-structure__actions">
              <Button size="small" variant="primary" onClick={() => add('attribute')}>
                <PlusIcon /> {t.structure.addFirst}
              </Button>
              <Button size="small" onClick={() => setFilling(true)}>
                <BracketsCurlyIcon /> {t.structure.fillFromSample}
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
            align={menu.align}
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
