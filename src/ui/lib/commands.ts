import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChecksIcon,
  ClipboardTextIcon,
  CopyIcon,
  CopySimpleIcon,
  DesktopIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  FolderSimpleDashedIcon,
  FolderSimpleIcon,
  FolderSimplePlusIcon,
  FunnelSimpleIcon,
  type Icon,
  MagnifyingGlassIcon,
  MoonIcon,
  PencilSimpleIcon,
  PlusIcon,
  ScissorsIcon,
  SidebarSimpleIcon,
  StackIcon,
  SunIcon,
  TextboxIcon,
  TranslateIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { type RefObject, useEffect, useLayoutEffect } from 'react';
import { canFillFromI14y } from '../../core/import/i14y';
import { confirmReview, hasUnreviewed } from '../../core/review';
import { selectedIds } from '../../state/selection';
import { endTyping, isOutputShown, useStore } from '../../state/store';
import { t } from '../../strings';
import { fillMissingFromI14y } from './i14y';
import { usesCommandKey } from './platform';
import { openProjectFile, saveProjectFile } from './projectFile';
import { type Theme, setTheme, useTheme } from './theme';
import { missingTexts, translateMissing, useTranslationState } from './translate';
import { hasTranslator } from './translator';
import {
  type NodePlace,
  addNode,
  canDeleteSelection,
  canDuplicateSelection,
  canEditSelection,
  canGroupSelection,
  canMoveSelection,
  canUngroupSelection,
  deleteSelection,
  duplicateSelection,
  editSelection,
  groupSelection,
  moveSelection,
  ungroupSelection,
} from './treeActions';
import { canCopySelection, canPasteCopied, copySelection, cutSelection, pasteCopied } from './treeClipboard';
import { overlayOpen, treeShortcutsActive } from './treeShortcuts';
import { isWideWindow } from './wideWindow';

/*
 * Every command of the workspace that has a shortcut or a menu entry, defined once: its label, icon,
 * keys, where its keys work, when it applies and what it does. Menus, the Edit pane's buttons, the
 * tour and the one keyboard handler (`useCommandShortcuts`) read from here. The actions themselves
 * live in `treeActions.ts`, `treeClipboard.ts`, `projectFile.ts`, `i14y.ts` and the store.
 */

export type CommandId =
  | 'tree.addAttribute'
  | 'tree.addGroup'
  | 'tree.addList'
  | 'tree.addFromI14y'
  | 'tree.delete'
  | 'tree.edit'
  | 'tree.rename'
  | 'tree.duplicate'
  | 'tree.group'
  | 'tree.ungroup'
  | 'tree.moveUp'
  | 'tree.moveDown'
  | 'tree.filter'
  | 'tree.copy'
  | 'tree.cut'
  | 'tree.paste'
  | 'workspace.undo'
  | 'workspace.redo'
  | 'workspace.toggleOutput'
  | 'workspace.saveProjectFile'
  | 'workspace.openProjectFile'
  | 'workspace.fillFromI14y'
  | 'workspace.translateMissing'
  | 'workspace.confirmSuggestions'
  | 'workspace.palette'
  | `workspace.theme.${Theme}`;

/** Where a command's keys work: on a row of the Structure tree (`tree`), or anywhere in the workspace, text fields included. */
export type CommandScope = 'tree' | 'workspace';

/**
 * A command's keys. ⌘ (`mod`) is Ctrl on Windows and Linux; either one matches on every platform.
 * Every modifier must be exactly as given: ⌘G is not ⇧⌘G.
 */
export interface Keys {
  /** The `KeyboardEvent.key` values that match, in any case; the first one is the one named in `aria-keyshortcuts`. */
  key?: string[];
  /** Or the physical key (`KeyboardEvent.code`), for ⌥ combinations, since ⌥ changes `key` on a Mac. AltGr never matches it. */
  code?: string;
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** How labels show the key: ⌫ on Apple platforms and Del elsewhere. */
  show: string | { apple: string; other: string };
}

/** Text that depends on the moment, such as a count of the selected items. */
type Text = string | (() => string);

/**
 * Where a label shows, when it is not the command's own `label`: the header's Add menu, which already
 * says Add (`addMenu`); a menu item adding inside a group (`here`) or after an attribute (`below`); a
 * group's right-click menu (`groupMenu`); a button of the Edit pane for several items (`editPane`).
 */
export type LabelPlace = 'addMenu' | 'here' | 'below' | 'groupMenu' | 'editPane';

/** What the menus pass to a command: where adding or pasting puts the new nodes. */
export interface CommandArgs {
  place?: NodePlace;
}

export interface Command {
  id: CommandId;
  /** Its name, as a list of every command shows it. */
  label: Text;
  labels?: Partial<Record<LabelPlace, Text>>;
  icon: Icon;
  keys?: Keys;
  scope: CommandScope;
  /**
   * Who takes its keys, when not the keyboard handler: the browser's copy, cut and paste events, which
   * carry the clipboard (`clipboard`), or the tree's own ⏎, which also selects the focused row and shows
   * the Edit pane (`tree`).
   */
  keysHandledBy?: 'clipboard' | 'tree';
  /** Whether the command exists right now; when not, its keys keep the browser's behaviour. */
  available?: () => boolean;
  /** Whether it would do something now. Its keys are taken either way, as `run` then does nothing. */
  appliesWhen: () => boolean;
  run: (args?: CommandArgs) => void;
}

/** What the Structure pane lends the tree commands: what only it can do. */
export interface TreeHost {
  /** The tree, whose rows the tree keys work on. */
  tree: RefObject<HTMLElement | null>;
  /** Whether the filter box shows; an empty structure has none. */
  hasFilter: () => boolean;
  focusFilter: () => void;
  /** Renames the one selected node inline. */
  rename: () => void;
  /** Opens the I14Y dialog to add into `groupId`, by default the group new nodes go into. */
  addFromI14y: (groupId?: string) => void;
  /** Keeps keyboard focus in the tree once a change has re-rendered it. */
  refocus: () => void;
}

/** What the workspace lends its commands. */
export interface WorkspaceHost {
  /** Shows or hides the Output pane, moving focus out of it when it hides with focus inside. */
  toggleOutput: () => void;
  /** Opens the command palette. */
  openPalette: () => void;
}

interface Hosts {
  tree: TreeHost;
  workspace: WorkspaceHost;
}

const hosts: Partial<Hosts> = {};

/** Lends `host` to the commands of `scope` while the calling component is mounted. */
export function useCommandHost<S extends CommandScope>(scope: S, host: Hosts[S]): void {
  useLayoutEffect(() => {
    hosts[scope] = host;
  });
  useLayoutEffect(
    () => () => {
      delete hosts[scope];
    },
    [scope],
  );
}

const count = () => selectedIds(useStore.getState().selection).length;
const always = () => true;
const mod = (letter: string, extra: Partial<Keys> = {}): Keys => ({ key: [letter], mod: true, ...extra, show: letter.toUpperCase() });
/** Switches to `theme`; it applies whenever another theme is current. */
const themeCommand = (theme: Theme, icon: Icon): Command => ({
  id: `workspace.theme.${theme}`,
  label: t.workspace.theme[theme],
  icon,
  scope: 'workspace',
  appliesWhen: () => useTheme.getState().theme !== theme,
  run: () => setTheme(theme),
});

/** Every command, tree commands in the order the menus list them, then the workspace ones. */
export const COMMANDS: readonly Command[] = [
  {
    id: 'tree.addAttribute',
    label: t.commands.addAttribute,
    labels: { addMenu: t.structure.addAttribute, here: t.treeMenu.addAttributeHere, below: t.treeMenu.addBelow },
    icon: PlusIcon,
    keys: { key: ['n'], show: 'N' },
    scope: 'tree',
    appliesWhen: () => useStore.getState().project !== null,
    run: (args) => void addNode('attribute', args?.place),
  },
  {
    id: 'tree.addGroup',
    label: t.commands.addGroup,
    labels: { addMenu: t.structure.addGroup, here: t.treeMenu.addGroupHere },
    icon: FolderSimpleIcon,
    scope: 'tree',
    appliesWhen: () => useStore.getState().project !== null,
    run: (args) => void addNode('group', args?.place),
  },
  {
    id: 'tree.addList',
    label: t.commands.addList,
    labels: { addMenu: t.structure.addList, here: t.treeMenu.addListHere },
    icon: StackIcon,
    scope: 'tree',
    appliesWhen: () => useStore.getState().project !== null,
    run: (args) => void addNode('list', args?.place),
  },
  {
    id: 'tree.addFromI14y',
    label: t.treeMenu.addFromI14y,
    icon: MagnifyingGlassIcon,
    scope: 'tree',
    appliesWhen: () => useStore.getState().project !== null,
    run: (args) => hosts.tree?.addFromI14y(args?.place?.groupId),
  },
  {
    id: 'tree.duplicate',
    label: () => t.treeMenu.duplicate(count()),
    icon: CopyIcon,
    keys: mod('d'),
    scope: 'tree',
    appliesWhen: () => canDuplicateSelection(),
    run: () => {
      duplicateSelection();
      hosts.tree?.refocus();
    },
  },
  {
    id: 'tree.group',
    label: t.treeMenu.groupSelection,
    labels: { editPane: t.selection.group },
    icon: FolderSimplePlusIcon,
    keys: mod('g'),
    scope: 'tree',
    appliesWhen: () => canGroupSelection(),
    run: groupSelection,
  },
  {
    id: 'tree.ungroup',
    label: t.treeMenu.ungroup,
    icon: FolderSimpleDashedIcon,
    keys: mod('g', { shift: true }),
    scope: 'tree',
    appliesWhen: () => canUngroupSelection(),
    run: () => {
      ungroupSelection();
      hosts.tree?.refocus();
    },
  },
  {
    id: 'tree.moveUp',
    label: t.treeMenu.moveUp,
    icon: ArrowUpIcon,
    keys: { key: ['ArrowUp'], alt: true, show: '↑' },
    scope: 'tree',
    appliesWhen: () => canMoveSelection('up'),
    run: () => {
      moveSelection('up');
      hosts.tree?.refocus();
    },
  },
  {
    id: 'tree.moveDown',
    label: t.treeMenu.moveDown,
    icon: ArrowDownIcon,
    keys: { key: ['ArrowDown'], alt: true, show: '↓' },
    scope: 'tree',
    appliesWhen: () => canMoveSelection('down'),
    run: () => {
      moveSelection('down');
      hosts.tree?.refocus();
    },
  },
  {
    id: 'tree.cut',
    label: () => t.treeMenu.cut(count()),
    icon: ScissorsIcon,
    keys: mod('x'),
    scope: 'tree',
    keysHandledBy: 'clipboard',
    appliesWhen: () => canCopySelection(),
    run: () => {
      cutSelection();
      hosts.tree?.refocus();
    },
  },
  {
    id: 'tree.copy',
    label: () => t.treeMenu.copy(count()),
    icon: CopySimpleIcon,
    keys: mod('c'),
    scope: 'tree',
    keysHandledBy: 'clipboard',
    appliesWhen: () => canCopySelection(),
    run: copySelection,
  },
  {
    id: 'tree.paste',
    label: t.treeMenu.paste,
    icon: ClipboardTextIcon,
    keys: mod('v'),
    scope: 'tree',
    keysHandledBy: 'clipboard',
    appliesWhen: canPasteCopied,
    run: (args) => {
      pasteCopied(args?.place);
      hosts.tree?.refocus();
    },
  },
  {
    id: 'tree.delete',
    label: () => t.treeMenu.delete(count()),
    labels: { groupMenu: () => t.treeMenu.deleteGroup(count()), editPane: t.selection.delete },
    icon: TrashIcon,
    keys: { key: ['Backspace', 'Delete'], show: { apple: '⌫', other: 'Del' } },
    scope: 'tree',
    appliesWhen: () => canDeleteSelection(),
    run: () => {
      deleteSelection();
      hosts.tree?.refocus();
    },
  },
  {
    id: 'tree.edit',
    label: t.commands.edit,
    icon: PencilSimpleIcon,
    keys: { key: ['Enter'], show: { apple: '⏎', other: 'Enter' } },
    scope: 'tree',
    keysHandledBy: 'tree',
    appliesWhen: () => canEditSelection(),
    run: editSelection,
  },
  {
    id: 'tree.rename',
    label: t.commands.rename,
    icon: TextboxIcon,
    keys: { key: ['F2'], show: 'F2' },
    scope: 'tree',
    appliesWhen: () => count() === 1,
    run: () => hosts.tree?.rename(),
  },
  {
    id: 'tree.filter',
    label: t.structure.filter,
    icon: FunnelSimpleIcon,
    keys: mod('f'),
    scope: 'tree',
    // An empty structure has no filter box: ⌘F is the browser's find then.
    available: () => hosts.tree?.hasFilter() ?? false,
    appliesWhen: always,
    run: () => hosts.tree?.focusFilter(),
  },
  {
    id: 'workspace.undo',
    label: t.commands.undo,
    icon: ArrowCounterClockwiseIcon,
    keys: mod('z'),
    scope: 'workspace',
    appliesWhen: () => useStore.getState().past.length > 0,
    run: () => useStore.getState().undo(),
  },
  {
    id: 'workspace.redo',
    label: t.commands.redo,
    icon: ArrowClockwiseIcon,
    keys: mod('z', { shift: true }),
    scope: 'workspace',
    appliesWhen: () => useStore.getState().future.length > 0,
    run: () => useStore.getState().redo(),
  },
  {
    id: 'workspace.toggleOutput',
    label: () => (isOutputShown(useStore.getState()) ? t.workspace.hideOutput : t.workspace.showOutput),
    icon: SidebarSimpleIcon,
    // As ⌥⌘B toggles VS Code's secondary side bar.
    keys: { code: 'KeyB', mod: true, alt: true, show: 'B' },
    scope: 'workspace',
    // A narrow window has Output as one of its pane tabs, never hidden.
    available: () => isWideWindow() && hosts.workspace !== undefined,
    appliesWhen: always,
    run: () => hosts.workspace?.toggleOutput(),
  },
  {
    id: 'workspace.saveProjectFile',
    label: t.projectFile.save,
    icon: FloppyDiskIcon,
    // Instead of the browser's Save Page As.
    keys: mod('s'),
    scope: 'workspace',
    appliesWhen: () => useStore.getState().project !== null,
    run: saveProjectFile,
  },
  {
    id: 'workspace.openProjectFile',
    label: t.projectFile.open,
    icon: FolderOpenIcon,
    // Instead of the browser's Open File.
    keys: mod('o'),
    scope: 'workspace',
    appliesWhen: always,
    run: openProjectFile,
  },
  {
    id: 'workspace.fillFromI14y',
    label: t.i14yFill.command,
    icon: TranslateIcon,
    scope: 'workspace',
    // Offered only when a linked attribute lacks a text its concept may have.
    available: () => {
      const project = useStore.getState().project;
      return project !== null && canFillFromI14y(project);
    },
    appliesWhen: always,
    // Every text at once, as one undo step.
    run: () => void fillMissingFromI14y(),
  },
  {
    id: 'workspace.translateMissing',
    label: t.translate.missing,
    icon: TranslateIcon,
    scope: 'workspace',
    // Only in browsers with the on-device Translator API, and with another language to fill.
    available: () => {
      const project = useStore.getState().project;
      return hasTranslator() && project !== null && project.languages.length > 1;
    },
    // Not while a translation runs: one at a time.
    appliesWhen: () => {
      const { project, editLang } = useStore.getState();
      return project !== null && !useTranslationState.getState().running && missingTexts(project, editLang).length > 0;
    },
    // Every empty text in every other language, from the editing language, as one undo step.
    run: () => {
      endTyping();
      void translateMissing();
    },
  },
  {
    id: 'workspace.confirmSuggestions',
    label: t.review.confirmAll,
    icon: ChecksIcon,
    scope: 'workspace',
    // Offered only while some suggested text waits for review.
    available: () => {
      const project = useStore.getState().project;
      return project !== null && hasUnreviewed(project);
    },
    appliesWhen: always,
    // Every mark at once, as one undo step.
    run: () => {
      endTyping();
      useStore.getState().update((draft) => void confirmReview(draft));
    },
  },
  {
    id: 'workspace.palette',
    label: t.palette.title,
    icon: MagnifyingGlassIcon,
    keys: mod('k'),
    scope: 'workspace',
    available: () => hosts.workspace !== undefined,
    // Never over a dialog or the tour, the palette itself included.
    appliesWhen: () => !overlayOpen(),
    run: () => {
      if (!overlayOpen()) hosts.workspace?.openPalette();
    },
  },
  themeCommand('system', DesktopIcon),
  themeCommand('light', SunIcon),
  themeCommand('dark', MoonIcon),
];

const BY_ID = new Map(COMMANDS.map((entry) => [entry.id, entry]));

export function command(id: CommandId): Command {
  return BY_ID.get(id)!;
}

const text = (value: Text) => (typeof value === 'function' ? value() : value);

/** The label of command `id` at `place`, or its own label. */
export function commandLabel(id: CommandId, place?: LabelPlace): string {
  const { label, labels } = command(id);
  const atPlace = place && labels?.[place];
  return text(atPlace ?? label);
}

/** Whether command `id` exists right now: tree commands need the Structure pane on screen. */
export function isAvailable(id: CommandId): boolean {
  const entry = command(id);
  return (entry.scope !== 'tree' || hosts.tree !== undefined) && (entry.available?.() ?? true);
}

/** Whether command `id` is available and would do something now. */
export function applies(id: CommandId): boolean {
  return isAvailable(id) && command(id).appliesWhen();
}

/** Every command that is available and would do something now, in menu order: what a command palette lists. */
export function availableCommands(): Command[] {
  return COMMANDS.filter((entry) => applies(entry.id));
}

/** Puts keyboard focus on the tree's selected row, once a change has re-rendered the tree. */
export function focusTreeSelection(): void {
  hosts.tree?.refocus();
}

/** Runs command `id`; it does nothing when it does not apply. */
export function runCommand(id: CommandId, args?: CommandArgs): void {
  if (isAvailable(id)) command(id).run(args);
}

/** How command `id`'s keys show: ⇧⌘G on Apple platforms, Ctrl+Shift+G elsewhere. Undefined for a command without keys. */
export function shortcutLabel(id: CommandId, apple = usesCommandKey()): string | undefined {
  const keys = command(id).keys;
  if (!keys) return undefined;
  const key = typeof keys.show === 'string' ? keys.show : apple ? keys.show.apple : keys.show.other;
  if (apple) return `${keys.alt ? '⌥' : ''}${keys.shift ? '⇧' : ''}${keys.mod ? '⌘' : ''}${key}`;
  return [keys.mod && 'Ctrl', keys.alt && 'Alt', keys.shift && 'Shift', key].filter(Boolean).join('+');
}

/** Command `id`'s keys for `aria-keyshortcuts`: Meta+G on Apple platforms, Control+G elsewhere. */
export function ariaKeyShortcuts(id: CommandId, apple = usesCommandKey()): string | undefined {
  const keys = command(id).keys;
  if (!keys) return undefined;
  const name = keys.code ? keys.code.replace(/^Key/, '') : keys.key![0];
  const key = name.length === 1 ? name.toUpperCase() : name;
  return [keys.mod && (apple ? 'Meta' : 'Control'), keys.alt && 'Alt', keys.shift && 'Shift', key].filter(Boolean).join('+');
}

type KeyPress = Pick<KeyboardEvent, 'key' | 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'isComposing'> &
  Partial<Pick<KeyboardEvent, 'code' | 'getModifierState'>>;

/** Whether `event` presses `keys`, whatever the platform: ⌘ and Ctrl both count as `mod`. */
export function matchesKeys(keys: Keys, event: KeyPress): boolean {
  if (event.isComposing) return false;
  if ((event.metaKey || event.ctrlKey) !== !!keys.mod || event.altKey !== !!keys.alt || event.shiftKey !== !!keys.shift) return false;
  if (keys.code) return event.code === keys.code && !event.getModifierState?.('AltGraph');
  const pressed = (event.key ?? '').toLowerCase();
  return keys.key?.some((key) => key.toLowerCase() === pressed) ?? false;
}

/** The command of `scope` whose keys `event` presses, leaving out copy, cut and paste, which arrive as clipboard events. */
export function keydownCommand(scope: CommandScope, event: KeyPress): Command | undefined {
  return COMMANDS.find((entry) => entry.scope === scope && entry.keys && entry.keysHandledBy !== 'clipboard' && matchesKeys(entry.keys, event));
}

/**
 * The command a key pressed in the workspace runs, if any. A tree command runs on a row of the tree,
 * never while typing in a field, on wide windows with no dialog or tour open (`treeShortcutsActive`).
 * A workspace command runs anywhere, text fields included, with no dialog or tour open. A command that
 * is not available (⌘F on an empty structure, ⌥⌘B on a narrow window) leaves its key to the browser,
 * and ⏎ is left to the tree.
 */
export function commandForKey(event: KeyboardEvent): Command | undefined {
  const tree = hosts.tree?.tree.current;
  const target = event.target;
  const onTree =
    !event.defaultPrevented && !!tree && target instanceof HTMLElement && tree.contains(target) && treeShortcutsActive(target, isWideWindow());
  const found = (onTree && keydownCommand('tree', event)) || keydownCommand('workspace', event);
  if (!found || found.keysHandledBy || !isAvailable(found.id)) return undefined;
  if (found.scope === 'workspace' && overlayOpen()) return undefined;
  return found;
}

/**
 * The workspace's one keyboard handler: runs the command a key asks for (`commandForKey`). Leaving a
 * field also ends its typing step, so the next edit there is a new undo step.
 */
export function useCommandShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const found = commandForKey(event);
      if (!found) return;
      event.preventDefault();
      found.run();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusout', endTyping);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusout', endTyping);
    };
  }, []);
}
