import { describe, expect, it } from 'vitest';
import { emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { type RowBox, dropTarget, emptyRowId, rowAt, zoneAt } from './treeDrop';

/** a, person { b, c }, empty {}, d, each row 32px tall from y = 0, with the empty group's hint line under it. */
function tree() {
  const project = emptyProject(['en']);
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((key) => newAttribute(key));
  const person = newGroupLink('person');
  person.group.children.push(b, c);
  const empty = newGroupLink('empty');
  project.root.children.push(a, person, empty, d);
  const ids = [a.id, person.id, b.id, c.id, empty.id, emptyRowId(empty.group.id), d.id];
  const rows: RowBox[] = ids.map((id, at) => ({ id, top: at * 32, bottom: at * 32 + 32 }));
  return { project, a, b, c, d, person, empty, rows };
}

/** The middle of row `at`, plus `offset`. */
const yOf = (at: number, offset = 16) => at * 32 + offset;

describe('zoneAt', () => {
  it('splits a group row into a top quarter, a middle half and a bottom quarter', () => {
    expect([0, 7, 8, 16, 23, 24, 31].map((y) => zoneAt(0, 32, y, true))).toEqual(['before', 'before', 'inside', 'inside', 'inside', 'after', 'after']);
  });

  it('splits any other row into halves', () => {
    expect([0, 15, 16, 31].map((y) => zoneAt(0, 32, y, false))).toEqual(['before', 'before', 'after', 'after']);
  });

  it('counts above and below the row as its nearest edge', () => {
    expect([zoneAt(32, 64, 10, true), zoneAt(32, 64, 90, true)]).toEqual(['before', 'after']);
  });
});

describe('rowAt', () => {
  const rows: RowBox[] = [
    { id: 'b', top: 40, bottom: 72 },
    { id: 'a', top: 0, bottom: 32 },
  ];

  it('finds the row under the pointer, the nearest one between rows, and the end below the last row', () => {
    expect(rowAt(rows, 31)).toBe(rows[1]);
    expect(rowAt(rows, 40)).toBe(rows[0]);
    expect(rowAt(rows, 34)).toBe(rows[1]);
    expect(rowAt(rows, 38)).toBe(rows[0]);
    expect(rowAt(rows, -20)).toBe(rows[1]);
    expect(rowAt(rows, 72)).toBe('end');
    expect(rowAt([], 10)).toBeNull();
  });
});

describe('dropTarget', () => {
  it('drops inside a group, at its end, on the middle of its row', () => {
    const { project, a, person, rows } = tree();
    expect(dropTarget(project, [a.id], rows, yOf(1), true)).toEqual({
      groupId: person.group.id,
      index: 2,
      indicator: { kind: 'inside', row: person.id },
    });
  });

  it('drops inside an empty group on the middle of its row or on its hint line', () => {
    const { project, d, empty, rows } = tree();
    const inside = { groupId: empty.group.id, index: 0, indicator: { kind: 'inside', row: empty.id } };
    expect(dropTarget(project, [d.id], rows, yOf(4), true)).toEqual(inside);
    expect(dropTarget(project, [d.id], rows, yOf(5, 2), true)).toEqual(inside);
    expect(dropTarget(project, [d.id], rows, yOf(5, 30), true)).toEqual(inside);
  });

  it('reorders on the upper or lower part of a row', () => {
    const { project, a, c, d, rows } = tree();
    // Upper half of c: before c, inside person.
    expect(dropTarget(project, [d.id], rows, yOf(3, 4), true)).toMatchObject({ index: 1, indicator: { kind: 'line', row: c.id, edge: 'top' } });
    // Lower half of a: after a, at the top level.
    expect(dropTarget(project, [d.id], rows, yOf(0, 28), true)).toEqual({
      groupId: project.root.id,
      index: 1,
      indicator: { kind: 'line', row: a.id, edge: 'bottom' },
    });
    // Upper quarter of a group row: before the group.
    expect(dropTarget(project, [a.id], rows, yOf(4, 2), true)).toMatchObject({ groupId: project.root.id, index: 2 });
  });

  it("drops on the lower part of a group row with children before its first child, and after an empty group's row", () => {
    const { project, a, b, d, empty, person, rows } = tree();
    expect(dropTarget(project, [d.id], rows, yOf(1, 30), true)).toEqual({
      groupId: person.group.id,
      index: 0,
      indicator: { kind: 'line', row: b.id, edge: 'top' },
    });
    expect(dropTarget(project, [a.id], rows, yOf(4, 30), true)).toEqual({
      groupId: project.root.id,
      index: 3,
      indicator: { kind: 'line', row: empty.id, edge: 'bottom' },
    });
  });

  it('keeps a collapsed group shut: its middle drops inside it at its end, its lower part after it', () => {
    const { project, a, d, empty, person } = tree();
    // Collapsed, person's children have no rows: a, person, empty, its hint line, d.
    const ids = [a.id, person.id, empty.id, emptyRowId(empty.group.id), d.id];
    const rows: RowBox[] = ids.map((id, at) => ({ id, top: at * 32, bottom: at * 32 + 32 }));
    expect(dropTarget(project, [d.id], rows, yOf(1), true, [person.id])).toEqual({
      groupId: person.group.id,
      index: 2,
      indicator: { kind: 'inside', row: person.id },
    });
    expect(dropTarget(project, [d.id], rows, yOf(1, 30), true, [person.id])).toEqual({
      groupId: project.root.id,
      index: 2,
      indicator: { kind: 'line', row: person.id, edge: 'bottom' },
    });
  });

  it('drops at the end of the top level below the last row', () => {
    const { project, b, rows } = tree();
    expect(dropTarget(project, [b.id], rows, 400, true)).toEqual({ groupId: project.root.id, index: 4, indicator: { kind: 'end' } });
  });

  it('refuses a drop into a dragged group or one of its descendants', () => {
    const { project, a, person, rows } = tree();
    // On the dragged group itself, and on its children.
    expect(dropTarget(project, [person.id], rows, yOf(1), true)).toBeNull();
    expect(dropTarget(project, [a.id, person.id], rows, yOf(2, 4), true)).toBeNull();
    expect(dropTarget(project, [person.id], rows, yOf(3, 28), true)).toBeNull();
  });

  it('shows nothing where the drop would change nothing', () => {
    const { project, a, b, c, rows } = tree();
    expect(dropTarget(project, [a.id], rows, yOf(0, 4), true)).toBeNull();
    expect(dropTarget(project, [a.id], rows, yOf(0, 28), true)).toBeNull();
    expect(dropTarget(project, [a.id], rows, yOf(1, 2), true)).toBeNull();
    // b and c are already the whole of person.
    expect(dropTarget(project, [b.id, c.id], rows, yOf(1), true)).toBeNull();
  });

  it('moves a multi-selection to the spot, as one target', () => {
    const { project, a, d, empty, rows } = tree();
    expect(dropTarget(project, [a.id, d.id], rows, yOf(4), true)).toMatchObject({ groupId: empty.group.id, index: 0 });
  });

  it('only reorders when dropping inside is off (narrow windows)', () => {
    const { project, a, d, empty, person, rows } = tree();
    expect(dropTarget(project, [d.id], rows, yOf(1, 12), false)).toMatchObject({ groupId: project.root.id, indicator: { kind: 'line', row: person.id, edge: 'top' } });
    expect(dropTarget(project, [a.id], rows, yOf(4, 20), false)).toMatchObject({ groupId: project.root.id, index: 3, indicator: { kind: 'line', row: empty.id, edge: 'bottom' } });
    expect(dropTarget(project, [d.id], rows, yOf(5), false)).toBeNull();
  });
});
