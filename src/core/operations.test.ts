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
  renameLanguage,
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

  it('renames a language everywhere it is used', () => {
    const { project: p, a, group, inner } = project();
    p.meta['en-GB'].name = 'Card';
    renameLanguage(p, 'en-GB', 'en-US');
    expect(p.languages).toEqual(['de-CH', 'en-US']);
    expect(p.meta['en-US'].name).toBe('Card');
    expect(p.branding['en-US']).toEqual({ light: {} });
    expect('en-GB' in p.meta || 'en-GB' in p.branding).toBe(false);
    expect(a.labels).toEqual({ 'de-CH': 'A', 'en-US': 'A' });
    expect(group.labels).toEqual({ 'en-US': 'G' });
    expect(inner.entries!.labels).toEqual({ 'en-US': { x: 'X' } });
  });

  it('does not rename a language onto one that already exists', () => {
    const { project: p } = project();
    renameLanguage(p, 'en-GB', 'de-CH');
    expect(p.languages).toEqual(['de-CH', 'en-GB']);
    expect(p.meta['en-GB']).toBeDefined();
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

describe('moving nodes keeps template references', () => {
  /** Root: given_name, nickname, person { name, address { city } }, pets[] { name }. */
  function tree() {
    const p = emptyProject(['de', 'en']);
    const given = newAttribute('given_name');
    const nickname = newAttribute('nickname');
    const name = newAttribute('name');
    const city = newAttribute('city');
    const address = newGroupLink('address');
    address.group.children.push(city);
    const person = newGroupLink('person');
    person.group.children.push(name, address);
    const petName = newAttribute('name');
    const pets = newGroupLink('pets', { array: true, source: ['pets', null] });
    pets.group.children.push(petName);
    p.root.children.push(given, nickname, person, pets);
    return { p, given, nickname, name, city, address, person, pets, petName };
  }

  it('rewrites branding fields in every language and theme when a node moves into a group', () => {
    const { p, given, person } = tree();
    p.branding.de = { light: { primaryField: '{{given_name}}', secondaryField: 'Hi {{given_name}}' }, dark: { primaryField: '{{given_name}}' } };
    p.branding.en = { light: { secondaryField: '{{/given_name}}' }, dark: { secondaryField: '{{given_name}} {{nickname}}' } };
    moveNode(p, given.id, person.group.id, 0);
    expect(p.branding.de).toEqual({
      light: { primaryField: '{{person.given_name}}', secondaryField: 'Hi {{person.given_name}}' },
      dark: { primaryField: '{{person.given_name}}' },
    });
    expect(p.branding.en).toEqual({
      light: { secondaryField: '{{/person.given_name}}' },
      dark: { secondaryField: '{{person.given_name}} {{nickname}}' },
    });
  });

  it('rewrites labels in every language when a node moves into a group', () => {
    const { p, given, nickname, address, person } = tree();
    nickname.labels = { de: 'Spitzname von {{given_name}}', en: 'Nickname of {{given_name}}' };
    address.labels = { en: 'Address of {{/given_name}}' };
    moveNode(p, given.id, person.group.id, 0);
    expect(nickname.labels).toEqual({ de: 'Spitzname von {{person.given_name}}', en: 'Nickname of {{person.given_name}}' });
    expect(address.labels.en).toBe('Address of {{/person.given_name}}');
  });

  it('rewrites references when a node moves out of a group', () => {
    const { p, name, nickname, person } = tree();
    nickname.labels = { en: '{{person.name}}' };
    person.labels = { en: 'Person {{person.name}}' };
    p.branding.en = { light: { primaryField: '{{person.name}}' } };
    moveNode(p, name.id, p.root.id, 0);
    expect(nickname.labels.en).toBe('{{name}}');
    expect(person.labels.en).toBe('Person {{name}}');
    expect(p.branding.en.light.primaryField).toBe('{{name}}');
  });

  it('rewrites references when a node moves between nested groups', () => {
    const { p, city, address, person } = tree();
    person.labels = { en: '{{person.address.city}}' };
    address.labels = { en: 'Address in {{address.city}}' };
    p.branding.en = { light: { primaryField: '{{person.address.city}}' } };
    moveNode(p, city.id, person.group.id, 0);
    expect(person.labels.en).toBe('{{person.city}}');
    expect(address.labels.en).toBe('Address in {{city}}');
    expect(p.branding.en.light.primaryField).toBe('{{person.city}}');
    moveNode(p, city.id, address.group.id, 0);
    expect(person.labels.en).toBe('{{person.address.city}}');
    expect(address.labels.en).toBe('Address in {{address.city}}');
    expect(p.branding.en.light.primaryField).toBe('{{person.address.city}}');
  });

  it('rewrites references when a node moves into and out of a list of objects, keeping suffixes', () => {
    const { p, nickname, pets } = tree();
    p.branding.en = { light: { primaryField: '{{nickname}}' } };
    pets.labels = { en: 'Pets of {{nickname}}' };
    moveNode(p, nickname.id, pets.group.id, 1);
    expect(p.branding.en.light.primaryField).toBe('{{pets.nickname}}');
    expect(pets.labels.en).toBe('Pets of {{pets.nickname}}');
    p.branding.en.light.primaryField = '{{pets.nickname.join(\', \')}} / {{pets.nickname[0]}}';
    moveNode(p, nickname.id, p.root.id, 1);
    expect(p.branding.en.light.primaryField).toBe("{{nickname.join(', ')}} / {{nickname[0]}}");
    expect(pets.labels.en).toBe('Pets of {{nickname}}');
  });

  it('rewrites references to the descendants of a moved group', () => {
    const { p, address, nickname, city, person, pets } = tree();
    p.branding.en = { light: { primaryField: '{{person.address.city}}' } };
    nickname.labels = { en: '{{/person.address.city}}' };
    city.labels = { en: 'City ({{/person.address.city}})' };
    moveNode(p, address.id, pets.group.id, 0);
    expect(p.branding.en.light.primaryField).toBe('{{pets.address.city}}');
    expect(nickname.labels.en).toBe('{{/pets.address.city}}');
    expect(city.labels.en).toBe('City ({{/pets.address.city}})');
    expect(person.group.children.map((child) => child.key)).toEqual(['name']);
  });

  it("keeps the moved node's own relative labels pointing to the same nodes", () => {
    const { p, nickname, person, address } = tree();
    nickname.labels = { en: '{{given_name}} aka {{person.name}}', de: '{{person.address.city}}' };
    address.labels = { en: 'Address of {{name}}' };
    moveNode(p, nickname.id, person.group.id, 0);
    expect(nickname.labels).toEqual({ en: '{{/given_name}} aka {{name}}', de: '{{address.city}}' });
    moveNode(p, address.id, p.root.id, 0);
    expect(address.labels.en).toBe('Address of {{person.name}}');
  });

  it('leaves references that did not resolve before the move untouched', () => {
    const { p, given, nickname, person, name } = tree();
    p.branding.en = { light: { primaryField: '{{missing}} {{refs:abc:given_name}} {{given_name}}' } };
    nickname.labels = { en: '{{person.missing}}' };
    name.labels = { en: '{{given_name}}' };
    moveNode(p, given.id, person.group.id, 0);
    expect(p.branding.en.light.primaryField).toBe('{{missing}} {{refs:abc:given_name}} {{person.given_name}}');
    expect(nickname.labels.en).toBe('{{person.missing}}');
    expect(name.labels.en).toBe('{{given_name}}');
  });

  it('leaves templates alone when a node is reordered within its group', () => {
    const { p, given, nickname } = tree();
    nickname.labels = { en: '{{/given_name}} {{given_name}}' };
    moveNode(p, given.id, p.root.id, 3);
    expect(keys(p.root.children)).toEqual(['nickname', 'person', 'given_name', 'pets']);
    expect(nickname.labels.en).toBe('{{/given_name}} {{given_name}}');
  });

  it('rewrites references for "Move to" (appending to the target group)', () => {
    const { p, given, person, nickname } = tree();
    nickname.labels = { en: '{{given_name}}' };
    moveNode(p, given.id, person.group.id, Number.MAX_SAFE_INTEGER);
    expect(keys(person.group.children)).toEqual(['name', 'address', 'given_name']);
    expect(nickname.labels.en).toBe('{{person.given_name}}');
  });
});
