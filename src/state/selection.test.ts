import { describe, expect, it } from 'vitest';
import { type Project, emptyProject, newAttribute, newGroupLink } from '../core/model';
import { CREDENTIAL, extendTo, normalizeSelection, oneNode, rowAfter, selectionIn, toggleNode, visibleOrder } from './selection';

/** a, g { b, c }, d: in tree order a, g, b, c, d. */
function project(): { project: Project; a: string; g: string; b: string; c: string; d: string } {
  const result = emptyProject(['de-CH']);
  const b = newAttribute('b');
  const c = newAttribute('c');
  const group = newGroupLink('g');
  group.group.children.push(b, c);
  const a = newAttribute('a');
  const d = newAttribute('d');
  result.root.children.push(a, group, d);
  return { project: result, a: a.id, g: group.id, b: b.id, c: c.id, d: d.id };
}

const several = (id: string, ids: string[], anchor = id) => ({ kind: 'node' as const, id, ids, anchor });

describe('visibleOrder', () => {
  it('lists the nodes depth-first, the way the tree shows them', () => {
    const { project: p, a, g, b, c, d } = project();
    expect(visibleOrder(p)).toEqual([a, g, b, c, d]);
  });
});

describe('normalizeSelection', () => {
  it('selects one node on its own by default', () => {
    const { project: p, b } = project();
    expect(normalizeSelection(p, { kind: 'node', id: b })).toEqual(oneNode(b));
  });

  it('puts the ids in tree order and adds the primary', () => {
    const { project: p, a, b, d } = project();
    expect(normalizeSelection(p, { kind: 'node', id: a, ids: [d, b] })).toEqual(several(a, [a, b, d]));
  });

  it('drops ids that are not in the project and keeps a known anchor', () => {
    const { project: p, a, b } = project();
    expect(normalizeSelection(p, { kind: 'node', id: a, ids: [b, 'gone'], anchor: b })).toEqual(several(a, [a, b], b));
    expect(normalizeSelection(p, { kind: 'node', id: a, anchor: 'gone' })).toEqual(oneNode(a));
  });

  it('keeps the credential as it is', () => {
    expect(normalizeSelection(project().project, { kind: 'credential' })).toEqual(CREDENTIAL);
  });
});

describe('toggleNode', () => {
  it('adds a node and makes it the primary', () => {
    const { project: p, a, c } = project();
    expect(normalizeSelection(p, toggleNode(p, oneNode(a), c))).toEqual(several(c, [a, c]));
  });

  it('takes a selected node out, but never the last one', () => {
    const { project: p, a, c } = project();
    expect(normalizeSelection(p, toggleNode(p, several(c, [a, c]), a))).toEqual(several(c, [c], a));
    expect(toggleNode(p, oneNode(a), a)).toEqual(oneNode(a));
  });

  it('hands the primary to the nearest selected node above it when the primary is taken out', () => {
    const { project: p, a, b, d } = project();
    expect(normalizeSelection(p, toggleNode(p, several(d, [a, b, d]), d))).toEqual(several(b, [a, b], d));
    expect(normalizeSelection(p, toggleNode(p, several(a, [a, b, d]), a))).toEqual(several(b, [b, d], a));
  });

  it('selects the node alone when the credential was selected', () => {
    const { project: p, b } = project();
    expect(normalizeSelection(p, toggleNode(p, CREDENTIAL, b))).toEqual(oneNode(b));
  });
});

describe('extendTo', () => {
  it('selects the range from the anchor in tree order, across groups', () => {
    const { project: p, a, g, b, c, d } = project();
    expect(normalizeSelection(p, extendTo(p, oneNode(a), c))).toEqual(several(c, [a, g, b, c], a));
    expect(normalizeSelection(p, extendTo(p, oneNode(d), b))).toEqual(several(b, [b, c, d], d));
  });

  it('keeps the anchor, so a second range replaces the first', () => {
    const { project: p, a, g, b, d } = project();
    const first = normalizeSelection(p, extendTo(p, oneNode(b), d));
    expect(normalizeSelection(p, extendTo(p, first, a))).toEqual(several(a, [a, g, b], b));
  });

  it('selects the node alone when the credential was selected', () => {
    const { project: p, c } = project();
    expect(normalizeSelection(p, extendTo(p, CREDENTIAL, c))).toEqual(oneNode(c));
  });
});

describe('rowAfter', () => {
  it('steps from the primary through the Credential row and the nodes', () => {
    const { project: p, a, g, d } = project();
    expect(rowAfter(p, CREDENTIAL, 1)).toBe(a);
    expect(rowAfter(p, oneNode(a), -1)).toBe('credential');
    expect(rowAfter(p, several(a, [a, d]), 1)).toBe(g);
    expect(rowAfter(p, CREDENTIAL, -1)).toBeNull();
    expect(rowAfter(p, oneNode(d), 1)).toBeNull();
  });
});

describe('selectionIn', () => {
  it('returns the same selection when every node is still there', () => {
    const { project: p, a, b } = project();
    const selection = several(a, [a, b]);
    expect(selectionIn(p, selection)).toBe(selection);
  });

  it('drops missing nodes and moves the primary and anchor to a node left', () => {
    const { project: p, b, d } = project();
    expect(selectionIn(p, several('gone', [b, 'gone', d], 'gone'))).toEqual(several(b, [b, d]));
  });

  it('falls back to the credential when no node is left', () => {
    expect(selectionIn(project().project, several('gone', ['gone']))).toEqual(CREDENTIAL);
  });
});
