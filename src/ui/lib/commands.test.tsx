// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject, newAttribute, newGroupLink, walkNodes } from '../../core/model';
import { useStore } from '../../state/store';
import { Workspace } from '../workspace/Workspace';
import {
  COMMANDS,
  type CommandId,
  type CommandScope,
  type Keys,
  ariaKeyShortcuts,
  availableCommands,
  command,
  commandLabel,
  isAvailable,
  keydownCommand,
  matchesKeys,
  runCommand,
  shortcutLabel,
} from './commands';
import { TOUR_SEEN_KEY } from './tour';
import { copySelection, forgetCopiedNodes } from './treeClipboard';

const press = (key: string, modifiers: { alt?: boolean; meta?: boolean; ctrl?: boolean; shift?: boolean; composing?: boolean } = {}) =>
  keydownCommand('tree', {
    key,
    altKey: !!modifiers.alt,
    metaKey: !!modifiers.meta,
    ctrlKey: !!modifiers.ctrl,
    shiftKey: !!modifiers.shift,
    isComposing: !!modifiers.composing,
  })?.id ?? null;

/** a, person { b }, items[] { e }. */
function loadProject() {
  const project = emptyProject(['de-CH']);
  const person = newGroupLink('person', { source: ['person'] });
  person.group.children.push(newAttribute('b'));
  const items = newGroupLink('items', { array: true, source: ['items', null] });
  items.group.children.push(newAttribute('e'));
  project.root.children.push(newAttribute('a'), person, items);
  useStore.getState().load(project);
}

const nodes = () => [...walkNodes(useStore.getState().project!.root)].map(({ node }) => node);
const id = (key: string) => nodes().find((node) => node.key === key)!.id;
const select = (...keys: string[]) => useStore.getState().select({ kind: 'node', id: id(keys.at(-1)!), ids: keys.map(id) });
const appliesNow = (id: CommandId) => command(id).appliesWhen();
const row = (key: string) =>
  within(screen.getByRole('tree', { name: 'Structure' }))
    .getAllByRole('treeitem')
    .find((item) => item.querySelector('.tree__key')?.textContent === key)!;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  forgetCopiedNodes();
  useStore.getState().close();
  loadProject();
});

describe('the command list', () => {
  it('holds every command with a shortcut or a menu entry, each with a label and an icon', () => {
    expect(COMMANDS.map((entry) => entry.id).sort()).toEqual(
      [
        'tree.addAttribute',
        'tree.addGroup',
        'tree.addList',
        'tree.addFromI14y',
        'tree.delete',
        'tree.edit',
        'tree.rename',
        'tree.duplicate',
        'tree.group',
        'tree.ungroup',
        'tree.moveUp',
        'tree.moveDown',
        'tree.filter',
        'tree.copy',
        'tree.cut',
        'tree.paste',
        'workspace.undo',
        'workspace.redo',
        'workspace.toggleOutput',
        'workspace.saveProjectFile',
        'workspace.openProjectFile',
        'workspace.fillFromI14y',
        'workspace.translateMissing',
        'workspace.confirmSuggestions',
        'workspace.palette',
        'workspace.area.oca',
        'workspace.area.metadata',
        'workspace.view.editor',
        'workspace.view.translations',
        'workspace.preview.ios',
        'workspace.preview.android',
        'workspace.previewView.card',
        'workspace.previewView.details',
        'workspace.previewView.home',
        'workspace.walletTheme.light',
        'workspace.walletTheme.dark',
        'workspace.showIssues',
        'workspace.fixAll',
        'workspace.downloadBundle',
        'workspace.copyBundle',
        'workspace.copyIntegrity',
        'workspace.copyDataUrl',
        'workspace.downloadVct',
        'workspace.copyVct',
        'workspace.downloadIssuerMetadata',
        'workspace.copyIssuerMetadata',
        'workspace.manageLanguages',
        'workspace.shortcuts',
        'workspace.tour',
        'workspace.theme.system',
        'workspace.theme.light',
        'workspace.theme.dark',
      ].sort(),
    );
    for (const entry of COMMANDS) {
      expect(commandLabel(entry.id)).not.toBe('');
      expect(entry.icon).toBeDefined();
    }
  });

  it('labels a command by where it shows, counting the selected items', () => {
    select('a', 'person');
    expect(commandLabel('tree.delete')).toBe('Delete 2 items');
    expect(commandLabel('tree.delete', 'editPane')).toBe('Delete');
    expect(commandLabel('tree.addAttribute')).toBe('Add attribute');
    expect(commandLabel('tree.addAttribute', 'addMenu')).toBe('Attribute');
    expect(commandLabel('tree.addAttribute', 'below')).toBe('Add attribute below');
    expect(commandLabel('tree.group', 'editPane')).toBe('Group');
    // A place it has no label for falls back to its own.
    expect(commandLabel('tree.paste', 'here')).toBe('Paste');
    select('person');
    expect(commandLabel('tree.delete', 'groupMenu')).toBe('Delete group');
    expect(commandLabel('workspace.toggleOutput')).toBe('Hide output');
    useStore.getState().setOutputOpen(false);
    expect(commandLabel('workspace.toggleOutput')).toBe('Show output');
  });

  it('no two commands of a scope share their keys', () => {
    const eventFor = (keys: Keys) => ({
      key: keys.key?.[0] ?? 'b',
      code: keys.code,
      metaKey: !!keys.mod,
      ctrlKey: false,
      altKey: !!keys.alt,
      shiftKey: !!keys.shift,
      isComposing: false,
    });
    for (const scope of ['tree', 'workspace'] as CommandScope[]) {
      const withKeys = COMMANDS.filter((entry) => entry.scope === scope && entry.keys);
      for (const entry of withKeys) {
        for (const key of entry.keys!.key ?? [entry.keys!.code]) {
          const event = { ...eventFor(entry.keys!), key: key ?? 'b' };
          expect(withKeys.filter((other) => matchesKeys(other.keys!, event)).map((other) => other.id)).toEqual([entry.id]);
        }
      }
    }
  });
});

describe('applies when', () => {
  it('needs selected nodes for the selection commands, and one node to rename', () => {
    const selectionCommands: CommandId[] = ['tree.delete', 'tree.duplicate', 'tree.group', 'tree.edit', 'tree.copy', 'tree.cut', 'tree.rename'];
    expect(selectionCommands.filter(appliesNow)).toEqual([]);
    expect(appliesNow('tree.addAttribute')).toBe(true);
    select('a');
    expect(selectionCommands.filter(appliesNow)).toEqual(selectionCommands);
    select('a', 'person');
    expect(appliesNow('tree.rename')).toBe(false);
    expect(appliesNow('tree.group')).toBe(true);
  });

  it('ungroups one group only, never a list of objects', () => {
    select('a');
    expect(appliesNow('tree.ungroup')).toBe(false);
    select('person');
    expect(appliesNow('tree.ungroup')).toBe(true);
    select('items');
    expect(appliesNow('tree.ungroup')).toBe(false);
    select('a', 'person');
    expect(appliesNow('tree.ungroup')).toBe(false);
  });

  it('moves only where the selection can go', () => {
    select('a');
    expect(appliesNow('tree.moveUp')).toBe(false);
    expect(appliesNow('tree.moveDown')).toBe(true);
  });

  it('pastes only once this tab has copied nodes', () => {
    expect(appliesNow('tree.paste')).toBe(false);
    select('a');
    copySelection();
    expect(appliesNow('tree.paste')).toBe(true);
  });

  it('undoes and redoes only with history', () => {
    expect(appliesNow('workspace.undo')).toBe(false);
    useStore.getState().update((draft) => void (draft.meta['de-CH'].name = 'Dog'));
    expect(appliesNow('workspace.undo')).toBe(true);
    expect(appliesNow('workspace.redo')).toBe(false);
    useStore.getState().undo();
    expect(appliesNow('workspace.redo')).toBe(true);
  });

  it('saves a project file with a project open, and opens one any time', () => {
    expect(appliesNow('workspace.saveProjectFile')).toBe(true);
    expect(appliesNow('workspace.openProjectFile')).toBe(true);
    useStore.getState().close();
    expect(appliesNow('workspace.saveProjectFile')).toBe(false);
    expect(appliesNow('workspace.openProjectFile')).toBe(true);
  });

  it('lists the commands that apply now: tree ones only while the Structure pane shows', () => {
    const { unmount } = render(<Workspace />);
    select('a');
    const ids = availableCommands().map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining(['tree.delete', 'tree.rename', 'tree.filter', 'workspace.toggleOutput']));
    expect(ids).not.toContain('tree.paste');
    expect(ids).not.toContain('workspace.undo');

    useStore.getState().setView('translations');
    unmount();
    render(<Workspace />);
    expect(availableCommands().filter((entry) => entry.scope === 'tree')).toEqual([]);
  });
});

describe('keys', () => {
  it('maps the tree keys to their commands, with ⌘ or Ctrl', () => {
    expect(press('n')).toBe('tree.addAttribute');
    expect(press('Backspace')).toBe('tree.delete');
    expect(press('Delete')).toBe('tree.delete');
    expect(press('Enter')).toBe('tree.edit');
    expect(press('F2')).toBe('tree.rename');
    expect(press('d', { meta: true })).toBe('tree.duplicate');
    expect(press('d', { ctrl: true })).toBe('tree.duplicate');
    expect(press('g', { meta: true })).toBe('tree.group');
    expect(press('g', { ctrl: true })).toBe('tree.group');
    expect(press('G', { meta: true, shift: true })).toBe('tree.ungroup');
    expect(press('g', { ctrl: true, shift: true })).toBe('tree.ungroup');
    expect(press('ArrowUp', { alt: true })).toBe('tree.moveUp');
    expect(press('ArrowDown', { alt: true })).toBe('tree.moveDown');
    expect(press('f', { meta: true })).toBe('tree.filter');
    expect(press('f', { ctrl: true })).toBe('tree.filter');
  });

  it('ignores other keys and modifier combinations', () => {
    expect(press('N', { shift: true })).toBeNull();
    expect(press('n', { meta: true })).toBeNull();
    expect(press('g')).toBeNull();
    expect(press('g', { meta: true, alt: true })).toBeNull();
    expect(press('d')).toBeNull();
    expect(press('D', { meta: true, shift: true })).toBeNull();
    expect(press('d', { meta: true, alt: true })).toBeNull();
    expect(press('ArrowUp')).toBeNull();
    expect(press('ArrowUp', { alt: true, shift: true })).toBeNull();
    expect(press('Backspace', { meta: true })).toBeNull();
    expect(press('n', { composing: true })).toBeNull();
    expect(press('F2', { meta: true })).toBeNull();
    // Copy, cut and paste come from the clipboard events, so their keys keep the browser's behaviour.
    expect(press('c', { meta: true })).toBeNull();
    expect(press('x', { ctrl: true })).toBeNull();
    expect(press('v', { meta: true })).toBeNull();
    expect(press('f')).toBeNull();
    expect(press('F', { meta: true, shift: true })).toBeNull();
    expect(press('f', { meta: true, alt: true })).toBeNull();
  });

  it('matches ⌘ and Ctrl on every platform, and labels them by platform', () => {
    const group = command('tree.group').keys!;
    expect(matchesKeys(group, { key: 'g', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false })).toBe(true);
    expect(matchesKeys(group, { key: 'g', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, isComposing: false })).toBe(true);
    expect(shortcutLabel('tree.group', true)).toBe('⌘G');
    expect(shortcutLabel('tree.group', false)).toBe('Ctrl+G');
    expect(ariaKeyShortcuts('tree.group', true)).toBe('Meta+G');
    expect(ariaKeyShortcuts('tree.group', false)).toBe('Control+G');
    expect(ariaKeyShortcuts('tree.delete', true)).toBe('Backspace');
    expect(ariaKeyShortcuts('tree.delete', false)).toBe('Backspace');
    expect(ariaKeyShortcuts('workspace.toggleOutput', true)).toBe('Meta+Alt+B');
    expect(ariaKeyShortcuts('workspace.toggleOutput', false)).toBe('Control+Alt+B');
    expect(shortcutLabel('tree.addGroup')).toBeUndefined();
  });

  it('shows ⌘ and ⌥ on Apple platforms and Ctrl and Alt elsewhere', () => {
    expect(shortcutLabel('tree.group', true)).toBe('⌘G');
    expect(shortcutLabel('tree.ungroup', true)).toBe('⇧⌘G');
    expect(shortcutLabel('tree.moveUp', true)).toBe('⌥↑');
    expect(shortcutLabel('tree.delete', true)).toBe('⌫');
    expect(shortcutLabel('tree.group', false)).toBe('Ctrl+G');
    expect(shortcutLabel('tree.ungroup', false)).toBe('Ctrl+Shift+G');
    expect(shortcutLabel('tree.moveDown', false)).toBe('Alt+↓');
    expect(shortcutLabel('tree.addAttribute', false)).toBe('N');
    expect(shortcutLabel('tree.rename', false)).toBe('F2');
    expect(shortcutLabel('tree.copy', true)).toBe('⌘C');
    expect(shortcutLabel('tree.paste', false)).toBe('Ctrl+V');
    expect(shortcutLabel('tree.filter', true)).toBe('⌘F');
    expect(shortcutLabel('tree.filter', false)).toBe('Ctrl+F');
    expect(shortcutLabel('tree.delete', false)).toBe('Del');
    expect(shortcutLabel('tree.edit', true)).toBe('⏎');
    expect(shortcutLabel('workspace.undo', false)).toBe('Ctrl+Z');
    expect(shortcutLabel('workspace.redo', true)).toBe('⇧⌘Z');
    expect(shortcutLabel('workspace.toggleOutput', true)).toBe('⌥⌘B');
    expect(shortcutLabel('workspace.toggleOutput', false)).toBe('Ctrl+Alt+B');
    expect(shortcutLabel('workspace.saveProjectFile', true)).toBe('⌘S');
    expect(shortcutLabel('workspace.openProjectFile', false)).toBe('Ctrl+O');
  });
});

describe('scope', () => {
  it('runs tree keys on a tree row only, and workspace keys anywhere, text fields included', () => {
    render(<Workspace />);
    const count = () => nodes().length;
    const before = count();

    // N in a text field types; on a button outside the tree it does nothing either.
    const field = screen.getByLabelText('Filter the structure');
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'n' });
    fireEvent.keyDown(field, { key: 'n' });
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Hide output' })[0], { key: 'n' });
    expect(count()).toBe(before);

    // On a tree row it adds a node.
    fireEvent.keyDown(row('a'), { key: 'n' });
    expect(count()).toBe(before + 1);

    // ⌘Z undoes from a field as well as from the tree.
    fireEvent.keyDown(field, { key: 'z', metaKey: true });
    expect(count()).toBe(before);
    fireEvent.keyDown(row('a'), { key: 'z', metaKey: true, shiftKey: true });
    expect(count()).toBe(before + 1);
  });
});

describe('areas and languages', () => {
  it('keeps the commands of the OCA off the Metadata page, and those of the metadata files off the OCA', () => {
    render(<Workspace />);
    const ids = () => availableCommands().map((entry) => entry.id);
    expect(ids()).toEqual(expect.arrayContaining(['workspace.toggleOutput', 'workspace.view.translations', 'workspace.area.metadata']));
    expect(ids()).not.toContain('workspace.downloadVct');

    act(() => useStore.getState().setArea('metadata'));
    expect(ids()).toEqual(expect.arrayContaining(['workspace.area.oca', 'workspace.preview.android', 'workspace.walletTheme.dark', 'workspace.tour']));
    for (const ocaOnly of ['workspace.toggleOutput', 'workspace.view.editor', 'workspace.view.translations', 'workspace.previewView.home', 'workspace.copyBundle', 'workspace.area.metadata'] as const) {
      expect(ids()).not.toContain(ocaOnly);
      expect(isAvailable(ocaOnly) && command(ocaOnly).appliesWhen()).toBe(false);
    }
    expect(ids().filter((id) => id.startsWith('tree.'))).toEqual([]);
  });

  it('switches the editing language, one command per other language, except in the Translations view', () => {
    useStore.getState().load(emptyProject(['de-CH', 'en-GB']));
    render(<Workspace />);
    const languages = () => availableCommands().filter((entry) => entry.id.startsWith('workspace.lang.'));
    expect(languages().map((entry) => commandLabel(entry.id))).toEqual(['Edit in English (en-GB)']);
    act(() => runCommand('workspace.lang.en-GB'));
    expect(useStore.getState().editLang).toBe('en-GB');
    expect(languages().map((entry) => entry.id)).toEqual(['workspace.lang.de-CH']);
    act(() => useStore.getState().setView('translations'));
    expect(languages()).toEqual([]);
  });

  it('sets the preview platform, view and wallet theme', () => {
    render(<Workspace />);
    act(() => runCommand('workspace.preview.android'));
    act(() => runCommand('workspace.previewView.home'));
    act(() => runCommand('workspace.walletTheme.dark'));
    expect(useStore.getState()).toMatchObject({ cardPlatform: 'android', cardVariant: 'home', brandingTheme: 'dark' });
    expect(appliesNow('workspace.previewView.home')).toBe(false);
    act(() => runCommand('workspace.previewView.card'));
    expect(useStore.getState().cardVariant).toBe('detail');
  });
});

describe('the keyboard shortcuts dialog', () => {
  const dialog = () => screen.queryByRole('dialog', { name: 'Keyboard shortcuts' });

  it('opens with ?, typed with or without ⇧, but not in a text field, where ? types', () => {
    render(<Workspace />);
    fireEvent.keyDown(screen.getByLabelText('Filter the structure'), { key: '?', shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: '?' });
    expect(dialog()).not.toBeInTheDocument();

    fireEvent.keyDown(row('a'), { key: '?', shiftKey: true });
    expect(dialog()).toBeInTheDocument();
    // Its own Escape closes it; ? does nothing over it.
    fireEvent.keyDown(dialog()!, { key: 'Escape' });
    expect(dialog()).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(dialog()).toBeInTheDocument();
    expect(shortcutLabel('workspace.shortcuts', true)).toBe('?');
    expect(shortcutLabel('workspace.shortcuts', false)).toBe('?');
  });

  it('lists every shortcut of the command list, the tree ones apart, with the keys of the platform', () => {
    render(<Workspace />);
    fireEvent.keyDown(document.body, { key: '?' });
    const section = (name: string) =>
      within(screen.getByRole('region', { name }))
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    const listed = [...section('On a row of the Structure tree'), ...section('In the workspace')];
    expect(listed).toHaveLength(COMMANDS.filter((entry) => entry.keys).length);
    expect(section('On a row of the Structure tree')).toEqual(expect.arrayContaining([['Delete', 'Del'], ['Group selection', 'Ctrl+G'], ['Move up', 'Alt+↑']]));
    expect(section('In the workspace')).toEqual(
      expect.arrayContaining([['Undo', 'Ctrl+Z'], ['Show or hide output', 'Ctrl+Alt+B'], ['Search and commands', 'Ctrl+K'], ['Keyboard shortcuts', '?']]),
    );
  });

  it('opens from the ⋯ menu, focus going back to the menu button when it closes', () => {
    render(<Workspace />);
    const more = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('menuitem', { name: /^Keyboard shortcuts/ }));
    expect(dialog()).toBeInTheDocument();
    fireEvent.click(within(dialog()!).getByRole('button', { name: 'Close' }));
    expect(dialog()).not.toBeInTheDocument();
  });
});
