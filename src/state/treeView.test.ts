// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Project, emptyProject, newAttribute, newGroupLink } from '../core/model';
import { CREDENTIAL, oneNode } from './selection';
import { COLLAPSED_KEY, ancestorIds, loadCollapsed, revealSelection, saveCollapsed, selectionOnCollapse, visibleRows } from './treeView';

/** a, g { b, h { c } }, d: in tree order a, g, b, h, c, d. */
function project(): { project: Project; a: string; g: string; b: string; h: string; c: string; d: string } {
  const result = emptyProject(['de-CH']);
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((key) => newAttribute(key));
  const h = newGroupLink('h');
  h.group.children.push(c);
  const g = newGroupLink('g');
  g.group.children.push(b, h);
  result.root.children.push(a, g, d);
  return { project: result, a: a.id, g: g.id, b: b.id, h: h.id, c: c.id, d: d.id };
}

const several = (id: string, ids: string[], anchor = id) => ({ kind: 'node' as const, id, ids, anchor });

describe('visibleRows', () => {
  it('lists every node in tree order without the ones inside collapsed groups', () => {
    const { project: p, a, g, b, h, c, d } = project();
    expect(visibleRows(p, [])).toEqual([a, g, b, h, c, d]);
    expect(visibleRows(p, [h])).toEqual([a, g, b, h, d]);
    expect(visibleRows(p, [g])).toEqual([a, g, d]);
    // An inner group's own state is kept while an outer one hides it.
    expect(visibleRows(p, [g, h])).toEqual([a, g, d]);
  });
});

describe('ancestorIds', () => {
  it('lists the groups around a node, outermost first', () => {
    const { project: p, a, g, h, c } = project();
    expect(ancestorIds(p, c)).toEqual([g, h]);
    expect(ancestorIds(p, h)).toEqual([g]);
    expect(ancestorIds(p, a)).toEqual([]);
    expect(ancestorIds(p, 'unknown')).toEqual([]);
  });
});

describe('revealSelection', () => {
  it('expands every group that hides a selected node', () => {
    const { project: p, a, g, h, c, d } = project();
    expect(revealSelection(p, oneNode(c), [g, h])).toEqual([]);
    expect(revealSelection(p, several(d, [a, h, d]), [g, h])).toEqual([h]);
  });

  it('returns the same list when nothing selected is hidden', () => {
    const { project: p, a, g, h } = project();
    const collapsed = [g, h];
    expect(revealSelection(p, oneNode(a), collapsed)).toBe(collapsed);
    expect(revealSelection(p, oneNode(g), collapsed)).toBe(collapsed);
    expect(revealSelection(p, CREDENTIAL, collapsed)).toBe(collapsed);
  });
});

describe('selectionOnCollapse', () => {
  it('moves the selected nodes inside the group to the group itself', () => {
    const { project: p, a, g, b, c } = project();
    expect(selectionOnCollapse(p, oneNode(c), g)).toEqual(several(g, [g]));
    expect(selectionOnCollapse(p, several(b, [a, b], a), g)).toEqual(several(g, [a, g], a));
    expect(selectionOnCollapse(p, several(a, [a, b], b), g)).toEqual(several(a, [a, g], g));
  });

  it('leaves a selection outside the group alone', () => {
    const { project: p, a, g, h } = project();
    expect(selectionOnCollapse(p, oneNode(a), g)).toBeNull();
    expect(selectionOnCollapse(p, oneNode(g), g)).toBeNull();
    expect(selectionOnCollapse(p, oneNode(g), h)).toBeNull();
    expect(selectionOnCollapse(p, CREDENTIAL, g)).toBeNull();
  });
});

describe('remembering collapsed groups', () => {
  beforeEach(() => localStorage.clear());

  it('keeps them per project and forgets the groups a project no longer has', () => {
    const first = project();
    const second = project();
    saveCollapsed(first.project, [first.g, 'deleted']);
    saveCollapsed(second.project, [second.h]);
    expect(loadCollapsed(first.project)).toEqual([first.g]);
    expect(loadCollapsed(second.project)).toEqual([second.h]);
    saveCollapsed(first.project, []);
    expect(loadCollapsed(first.project)).toEqual([]);
    expect(Object.keys(JSON.parse(localStorage.getItem(COLLAPSED_KEY)!))).toEqual([second.project.root.id]);
  });

  it('remembers the 20 projects touched last', () => {
    const projects = Array.from({ length: 21 }, () => project());
    for (const { project: p, g } of projects) saveCollapsed(p, [g]);
    expect(loadCollapsed(projects[0].project)).toEqual([]);
    expect(loadCollapsed(projects[1].project)).toEqual([projects[1].g]);
  });

  it('starts with every group expanded when the stored value is broken', () => {
    const { project: p } = project();
    localStorage.setItem(COLLAPSED_KEY, '{not json');
    expect(loadCollapsed(p)).toEqual([]);
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify({ [p.root.id]: 'g' }));
    expect(loadCollapsed(p)).toEqual([]);
  });

  describe('without storage', () => {
    afterEach(() => vi.restoreAllMocks());

    it('neither throws nor remembers anything', () => {
      const { project: p, g } = project();
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      expect(() => saveCollapsed(p, [g])).not.toThrow();
      expect(loadCollapsed(p)).toEqual([]);
    });
  });
});
