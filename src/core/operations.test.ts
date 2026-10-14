import { describe, expect, it } from 'vitest';
import { type GroupLink, emptyProject, newAttribute, newGroupLink, walkNodes } from './model';
import {
  addLanguage,
  NEW_NODE_KEYS,
  insertNode,
  moveLanguage,
  moveNode,
  removeLanguage,
  removeNode,
  renameNode,
  sourcePrefixFor,
  uniqueKey,
} from './operations';

function project() {
  const result = emptyProject(['de-CH', 'en-GB']);
  const a = newAttribute('a', { labels: { 'de-CH': 'A', 'en-GB': 'A' } });
  const b = newAttribute('b');
  const group = newGroupLink('g', { labels: { 'en-GB': 'G' } });
  const inner = newAttribute('inner', { entries: { codes: ['x'], labels: { 'en-GB': { x: 'X' } } } });
  group.group.children.push(inner);
  result.root.children.push(a, b, group);
  return { project: result, a, b, group, inner };
}

const keys = (nodes: { key: string }[]) => nodes.map((node) => node.key);

describe('tree operations', () => {
  it('inserts at a position', () => {
    const { project: p } = project();
    insertNode(p, p.root.id, newAttribute('first'), 0);
    expect(keys(p.root.children)).toEqual(['first', 'a', 'b', 'g']);
  });

  it('removes nested nodes', () => {
    const { project: p, inner, group } = project();
    expect(removeNode(p, inner.id)).toBe(inner);
    expect(group.group.children).toEqual([]);
  });

  it('moves within a group, accounting for the removed slot', () => {
    const { project: p, a } = project();
    expect(moveNode(p, a.id, p.root.id, 2)).toBe(true);
    expect(keys(p.root.children)).toEqual(['b', 'a', 'g']);
  });

  it('moves into another group', () => {
    const { project: p, b, group } = project();
    moveNode(p, b.id, group.group.id, 0);
    expect(keys(group.group.children)).toEqual(['b', 'inner']);
  });

  it('refuses to move a group into itself', () => {
    const { project: p, group } = project();
    const nested = newGroupLink('nested');
    group.group.children.push(nested);
    expect(moveNode(p, group.id, nested.group.id, 0)).toBe(false);
    expect(moveNode(p, group.id, group.group.id, 0)).toBe(false);
    expect(keys(p.root.children)).toEqual(['a', 'b', 'g']);
  });
});

describe('language operations', () => {
  it('adds a language with empty slots', () => {
    const { project: p } = project();
    addLanguage(p, 'fr-CH');
    expect(p.languages).toEqual(['de-CH', 'en-GB', 'fr-CH']);
    expect(p.meta['fr-CH']).toEqual({ name: '', description: '' });
    expect(p.branding['fr-CH']).toEqual({ light: {} });
  });

  it('removes a language and its strings everywhere', () => {
    const { project: p, a, group, inner } = project();
    removeLanguage(p, 'en-GB');
    expect(p.languages).toEqual(['de-CH']);
    expect(p.meta['en-GB']).toBeUndefined();
    expect(a.labels).toEqual({ 'de-CH': 'A' });
    expect((group as GroupLink).labels).toEqual({});
    expect(inner.entries?.labels).toEqual({});
    expect([...walkNodes(p.root)].every(({ node }) => !('en-GB' in node.labels))).toBe(true);
  });

  it('reorders languages', () => {
    const { project: p } = project();
    moveLanguage(p, 'en-GB', 0);
    expect(p.languages).toEqual(['en-GB', 'de-CH']);
  });
});

describe('key and source helpers', () => {
  it('finds a free key', () => {
    const { project: p } = project();
    expect(uniqueKey(p.root, 'c')).toBe('c');
    p.root.children.push(newAttribute('a_2'));
    expect(uniqueKey(p.root, 'a')).toBe('a_3');
  });

  it('derives the source prefix from the nearest group link with a source', () => {
    const p = emptyProject(['en']);
    const pets = newGroupLink('pets', { array: true, source: ['pets', null] });
    const cluster = newGroupLink('details');
    pets.group.children.push(cluster);
    p.root.children.push(pets);
    expect(sourcePrefixFor(p, p.root.id)).toEqual([]);
    expect(sourcePrefixFor(p, pets.group.id)).toEqual(['pets', null]);
    expect(sourcePrefixFor(p, cluster.group.id)).toEqual(['pets', null]);
  });

  it('keeps the source path when an existing key is renamed (spec §5.1)', () => {
    const p = emptyProject(['en']);
    const city = newAttribute('city', { source: ['work', 'city'] });
    const tags = newAttribute('tags', { type: { array: 'Text' }, source: ['tags', null] });
    p.root.children.push(city, tags);
    renameNode(p, city.id, 'city2');
    renameNode(p, tags.id, 'labels');
    expect(p.root.children.map((child) => [child.key, child.source])).toEqual([
      ['city2', ['work', 'city']],
      ['labels', ['tags', null]],
    ]);
  });

  it('moves the source of a newly added item that still has its placeholder key', () => {
    const p = emptyProject(['en']);
    const attribute = newAttribute(NEW_NODE_KEYS.attribute, { source: ['pets', null, NEW_NODE_KEYS.attribute] });
    const list = newGroupLink(`${NEW_NODE_KEYS.list}_2`, { array: true, source: [`${NEW_NODE_KEYS.list}_2`, null] });
    p.root.children.push(attribute, list);
    renameNode(p, attribute.id, 'name');
    renameNode(p, list.id, 'pets');
    expect(p.root.children.map((child) => [child.key, child.source])).toEqual([
      ['name', ['pets', null, 'name']],
      ['pets', ['pets', null]],
    ]);
  });

  it('updates templates that reference the renamed node', () => {
    const p = emptyProject(['en']);
    const given = newAttribute('given_name');
    const pets = newGroupLink('pets', { array: true, source: ['pets', null], labels: { en: 'Pet {{pets.name}}' } });
    pets.group.children.push(newAttribute('name'));
    p.root.children.push(given, pets);
    p.branding.en = { light: { primaryField: '{{given_name}} and {{pets.name}}' }, dark: { secondaryField: '{{given_name}}' } };
    renameNode(p, given.id, 'firstname');
    renameNode(p, pets.id, 'animals');
    expect(p.branding.en.light.primaryField).toBe('{{firstname}} and {{animals.name}}');
    expect(p.branding.en.dark?.secondaryField).toBe('{{firstname}}');
    expect(pets.labels.en).toBe('Pet {{animals.name}}');
  });
});
