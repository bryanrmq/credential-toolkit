import { describe, expect, it } from 'vitest';
import { treeShortcut } from './treeShortcuts';

const press = (key: string, modifiers: { alt?: boolean; meta?: boolean; ctrl?: boolean; shift?: boolean; composing?: boolean } = {}) =>
  treeShortcut({
    key,
    altKey: !!modifiers.alt,
    metaKey: !!modifiers.meta,
    ctrlKey: !!modifiers.ctrl,
    shiftKey: !!modifiers.shift,
    isComposing: !!modifiers.composing,
  });

describe('treeShortcut', () => {
  it('maps the tree keys to their actions, with ⌘ or Ctrl', () => {
    expect(press('n')).toBe('add');
    expect(press('Backspace')).toBe('delete');
    expect(press('Delete')).toBe('delete');
    expect(press('Enter')).toBe('edit');
    expect(press('F2')).toBe('rename');
    expect(press('g', { meta: true })).toBe('group');
    expect(press('g', { ctrl: true })).toBe('group');
    expect(press('G', { meta: true, shift: true })).toBe('ungroup');
    expect(press('g', { ctrl: true, shift: true })).toBe('ungroup');
    expect(press('ArrowUp', { alt: true })).toBe('moveUp');
    expect(press('ArrowDown', { alt: true })).toBe('moveDown');
  });

  it('ignores other keys and modifier combinations', () => {
    expect(press('N', { shift: true })).toBeNull();
    expect(press('n', { meta: true })).toBeNull();
    expect(press('g')).toBeNull();
    expect(press('g', { meta: true, alt: true })).toBeNull();
    expect(press('ArrowUp')).toBeNull();
    expect(press('ArrowUp', { alt: true, shift: true })).toBeNull();
    expect(press('Backspace', { meta: true })).toBeNull();
    expect(press('n', { composing: true })).toBeNull();
    expect(press('F2', { meta: true })).toBeNull();
  });
});
