import { describe, expect, it } from 'vitest';
import { type Group, type GroupLink, emptyProject, findNode, newAttribute, newGroupLink, walkNodes } from './model';
import {
  addLanguage,
  NEW_NODE_KEYS,
  groupNodes,
  insertNode,
  moveLanguage,
  canMoveNodesTo,
  moveNode,
  moveNodes,
  moveNodesInto,
  moveNodesTo,
  outermostIds,
  removeLanguage,
  removeNode,
  removeNodes,
  renameLanguage,
  renameNode,
  sourcePrefixFor,
  ungroupNode,
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

describe('group, ungroup, move up/down and delete several', () => {
  /** Root: a, b, g { x, y, z }, c, pets[] { name }. */
  function tree() {
    const p = emptyProject(['en']);
    const [a, b, c, x, y, z, name] = ['a', 'b', 'c', 'x', 'y', 'z', 'name'].map((key) => newAttribute(key));
    const g = newGroupLink('g', { source: ['g'] });
    g.group.children.push(x, y, z);
    const pets = newGroupLink('pets', { array: true, source: ['pets', null] });
    pets.group.children.push(name);
    p.root.children.push(a, b, g, c, pets);
    return { p, a, b, c, g, x, y, z, pets, name };
  }

  /** The tree as nested keys, e.g. ['a', { g: ['x'] }]. */
  type Shape = (string | { [key: string]: Shape })[];
  const shape = (group: Group): Shape =>
    group.children.map((child) => (child.kind === 'group' ? { [child.key]: shape(child.group) } : child.key));

  describe('group selection', () => {
    it('wraps the nodes in a group without a source at the first node, keeping their order', () => {
      const { p, a, c, y } = tree();
      const id = groupNodes(p, [c.id, y.id, a.id]);
      const link = findNode(p.root, id!)!.node as GroupLink;
      expect(link.kind).toBe('group');
      expect(link.array).toBe(false);
      expect(link.source).toBeUndefined();
      expect(shape(p.root)).toEqual([{ group: ['a', 'y', 'c'] }, 'b', { g: ['x', 'z'] }, { pets: ['name'] }]);
    });

    it('places the group inside the parent of the first node in tree order', () => {
      const { p, c, y } = tree();
      groupNodes(p, [c.id, y.id]);
      expect(shape(p.root)).toEqual(['a', 'b', { g: ['x', { group: ['y', 'c'] }, 'z'] }, { pets: ['name'] }]);
    });

    it('moves only the group when a group and some of its children are selected', () => {
      const { p, b, g, x, z } = tree();
      groupNodes(p, [x.id, g.id, z.id, b.id]);
      expect(shape(p.root)).toEqual(['a', { group: ['b', { g: ['x', 'y', 'z'] }] }, 'c', { pets: ['name'] }]);
    });

    it('gives the new group a unique key', () => {
      const { p, a, b, c } = tree();
      groupNodes(p, [a.id]);
      groupNodes(p, [b.id]);
      groupNodes(p, [c.id]);
      expect(keys(p.root.children)).toEqual(['group', 'group_2', 'g', 'group_3', 'pets']);
    });

    it('returns undefined and changes nothing when no id names a node', () => {
      const { p } = tree();
      expect(groupNodes(p, [])).toBeUndefined();
      expect(groupNodes(p, ['missing', p.root.id])).toBeUndefined();
      expect(keys(p.root.children)).toEqual(['a', 'b', 'g', 'c', 'pets']);
    });

    it('keeps the wrapped attributes reading the same claims', () => {
      const { p, a, x } = tree();
      const id = groupNodes(p, [a.id, x.id])!;
      expect([a.source, x.source]).toEqual([['a'], ['x']]);
      expect(sourcePrefixFor(p, (findNode(p.root, id)!.node as GroupLink).group.id)).toEqual([]);
    });

    it('rewrites template references to the grouped nodes', () => {
      const { p, a, b, c, g, y } = tree();
      p.branding.en = { light: { primaryField: '{{a}} {{g.y}}', secondaryField: '{{/c}}' } };
      b.labels = { en: '{{a}} and {{g.y}}' };
      a.labels = { en: 'Next to {{b}}' };
      g.labels = { en: '{{g.y}}' };
      groupNodes(p, [a.id, y.id, c.id]);
      expect(p.branding.en.light).toEqual({ primaryField: '{{group.a}} {{group.y}}', secondaryField: '{{/group.c}}' });
      expect(b.labels.en).toBe('{{group.a}} and {{group.y}}');
      expect(a.labels.en).toBe('Next to {{/b}}');
      expect(g.labels.en).toBe('{{group.y}}');
    });
  });

  describe('ungroup', () => {
    it("lifts the children into the parent at the group's position, in order, and removes the group", () => {
      const { p, g, x, y, z } = tree();
      expect(ungroupNode(p, g.id)).toEqual([x.id, y.id, z.id]);
      expect(shape(p.root)).toEqual(['a', 'b', 'x', 'y', 'z', 'c', { pets: ['name'] }]);
    });

    it('removes an empty group', () => {
      const { p } = tree();
      const empty = newGroupLink('empty');
      p.root.children.unshift(empty);
      expect(ungroupNode(p, empty.id)).toEqual([]);
      expect(keys(p.root.children)).toEqual(['a', 'b', 'g', 'c', 'pets']);
    });

    it('refuses a list of objects and anything that is not a group', () => {
      const { p, a, pets } = tree();
      expect(ungroupNode(p, pets.id)).toBeUndefined();
      expect(ungroupNode(p, a.id)).toBeUndefined();
      expect(ungroupNode(p, 'missing')).toBeUndefined();
      expect(shape(p.root)).toEqual(['a', 'b', { g: ['x', 'y', 'z'] }, 'c', { pets: ['name'] }]);
    });

    it('lifts a nested group into its own parent', () => {
      const { p, y, z } = tree();
      const inner = findNode(p.root, groupNodes(p, [y.id, z.id])!)!.node;
      ungroupNode(p, inner.id);
      expect(shape(p.root)).toEqual(['a', 'b', { g: ['x', 'y', 'z'] }, 'c', { pets: ['name'] }]);
    });

    it('rewrites template references to the lifted children', () => {
      const { p, a, g, x, z } = tree();
      p.branding.en = { light: { primaryField: '{{g.x}} {{g.z}}' } };
      a.labels = { en: '{{g.y}}' };
      x.labels = { en: '{{y}} near {{/a}}' };
      ungroupNode(p, g.id);
      expect(p.branding.en.light.primaryField).toBe('{{x}} {{z}}');
      expect(a.labels.en).toBe('{{y}}');
      expect(x.labels.en).toBe('{{y}} near {{/a}}');
      expect(z.labels).toEqual({});
    });

    it('undoes a group of several nodes, templates included', () => {
      const { p, a, b, c, y } = tree();
      p.branding.en = { light: { primaryField: '{{a}} {{g.y}} {{c}}' } };
      b.labels = { en: '{{g.y}}' };
      const id = groupNodes(p, [a.id, y.id, c.id])!;
      ungroupNode(p, id);
      expect(shape(p.root)).toEqual(['a', 'y', 'c', 'b', { g: ['x', 'z'] }, { pets: ['name'] }]);
      expect(p.branding.en.light.primaryField).toBe('{{a}} {{y}} {{c}}');
      expect(b.labels.en).toBe('{{y}}');
    });
  });

  describe('move up and down', () => {
    it('moves a node one place within its group', () => {
      const { p, b, y } = tree();
      expect(moveNodes(p, [b.id], 'up')).toBe(true);
      expect(moveNodes(p, [y.id], 'down')).toBe(true);
      expect(shape(p.root)).toEqual(['b', 'a', { g: ['x', 'z', 'y'] }, 'c', { pets: ['name'] }]);
    });

    it('moves out of the group at its edges, just before or after it', () => {
      const { p, x, z } = tree();
      moveNodes(p, [x.id], 'up');
      moveNodes(p, [z.id], 'down');
      expect(shape(p.root)).toEqual(['a', 'b', 'x', { g: ['y'] }, 'z', 'c', { pets: ['name'] }]);
    });

    it('passes over a neighbouring group without entering it', () => {
      const { p, b, c } = tree();
      moveNodes(p, [b.id], 'down');
      expect(shape(p.root)).toEqual(['a', { g: ['x', 'y', 'z'] }, 'b', 'c', { pets: ['name'] }]);
      moveNodes(p, [c.id], 'down');
      expect(shape(p.root)).toEqual(['a', { g: ['x', 'y', 'z'] }, 'b', { pets: ['name'] }, 'c']);
      moveNodes(p, [b.id], 'up');
      expect(shape(p.root)).toEqual(['a', 'b', { g: ['x', 'y', 'z'] }, { pets: ['name'] }, 'c']);
    });

    it('moves a group as a whole', () => {
      const { p, g } = tree();
      moveNodes(p, [g.id], 'up');
      expect(shape(p.root)).toEqual(['a', { g: ['x', 'y', 'z'] }, 'b', 'c', { pets: ['name'] }]);
    });

    it('does nothing at the very top or bottom of the tree', () => {
      const { p, a, pets } = tree();
      expect(moveNodes(p, [a.id], 'up')).toBe(false);
      expect(moveNodes(p, [pets.id], 'down')).toBe(false);
      expect(moveNodes(p, ['missing'], 'down')).toBe(false);
      expect(shape(p.root)).toEqual(['a', 'b', { g: ['x', 'y', 'z'] }, 'c', { pets: ['name'] }]);
    });

    it('moves several nodes together, keeping their order', () => {
      const { p, b, c, x, y } = tree();
      moveNodes(p, [c.id, b.id], 'up');
      expect(shape(p.root)).toEqual(['b', 'a', 'c', { g: ['x', 'y', 'z'] }, { pets: ['name'] }]);
      moveNodes(p, [x.id, y.id], 'up');
      expect(shape(p.root)).toEqual(['b', 'a', 'c', 'x', 'y', { g: ['z'] }, { pets: ['name'] }]);
      moveNodes(p, [y.id, x.id], 'down');
      expect(shape(p.root)).toEqual(['b', 'a', 'c', { g: ['z'] }, 'x', 'y', { pets: ['name'] }]);
    });

    it('keeps nodes stacked against the top or bottom of the tree in place, and their order', () => {
      const { p, a, b, c, name, pets } = tree();
      expect(moveNodes(p, [b.id, a.id], 'up')).toBe(false);
      expect(moveNodes(p, [a.id, c.id], 'up')).toBe(true);
      expect(keys(p.root.children)).toEqual(['a', 'b', 'c', 'g', 'pets']);
      moveNodes(p, [name.id], 'down');
      expect(moveNodes(p, [pets.id, name.id], 'down')).toBe(false);
      expect(shape(p.root)).toEqual(['a', 'b', 'c', { g: ['x', 'y', 'z'] }, { pets: [] }, 'name']);
    });

    it('moves a group and its selected children as the group alone', () => {
      const { p, g, x } = tree();
      moveNodes(p, [x.id, g.id], 'down');
      expect(shape(p.root)).toEqual(['a', 'b', 'c', { g: ['x', 'y', 'z'] }, { pets: ['name'] }]);
    });

    it('moves into and out of a list of objects like any group, at its edges', () => {
      const { p, name } = tree();
      moveNodes(p, [name.id], 'up');
      expect(shape(p.root)).toEqual(['a', 'b', { g: ['x', 'y', 'z'] }, 'c', 'name', { pets: [] }]);
    });

    it('rewrites template references when nodes cross group edges', () => {
      const { p, a, x, z } = tree();
      p.branding.en = { light: { primaryField: '{{g.x}} {{g.z}} {{/pets.name}}' } };
      a.labels = { en: '{{g.x}}' };
      x.labels = { en: '{{y}}' };
      moveNodes(p, [x.id, z.id], 'up');
      expect(p.branding.en.light.primaryField).toBe('{{x}} {{g.z}} {{/pets.name}}');
      expect(a.labels.en).toBe('{{x}}');
      expect(x.labels.en).toBe('{{g.y}}');
      moveNodes(p, [z.id], 'down');
      moveNodes(p, [z.id], 'down');
      expect(shape(p.root)).toEqual(['a', 'b', 'x', { g: ['y'] }, 'z', 'c', { pets: ['name'] }]);
      expect(p.branding.en.light.primaryField).toBe('{{x}} {{z}} {{/pets.name}}');
      moveNodes(p, [x.id], 'down');
      expect(shape(p.root)).toEqual(['a', 'b', { g: ['y'] }, 'x', 'z', 'c', { pets: ['name'] }]);
      expect([p.branding.en.light.primaryField, a.labels.en, x.labels.en]).toEqual(['{{x}} {{z}} {{/pets.name}}', '{{x}}', '{{g.y}}']);
    });
  });

  describe('move to a spot (drag and drop)', () => {
    it('moves several nodes into a group at its end, in tree order, from different groups', () => {
      const { p, b, g, y, c } = tree();
      expect(moveNodesTo(p, [c.id, y.id, b.id], g.group.id, g.group.children.length)).toBe(true);
      expect(shape(p.root)).toEqual(['a', { g: ['x', 'z', 'b', 'y', 'c'] }, { pets: ['name'] }]);
    });

    it('moves into an empty group', () => {
      const { p, a, pets } = tree();
      pets.group.children = [];
      expect(moveNodesTo(p, [a.id], pets.group.id, 0)).toBe(true);
      expect(shape(p.root)).toEqual(['b', { g: ['x', 'y', 'z'] }, 'c', { pets: ['a'] }]);
    });

    it('moves several nodes just before a node, side by side and in order', () => {
      const { p, a, c, x, z } = tree();
      expect(moveNodesTo(p, [z.id, a.id], p.root.id, p.root.children.indexOf(c))).toBe(true);
      expect(shape(p.root)).toEqual(['b', { g: ['x', 'y'] }, 'a', 'z', 'c', { pets: ['name'] }]);
      // Before a node that is moving itself: the nodes gather at the first one that is not.
      expect(moveNodesTo(p, [x.id, c.id], p.root.id, p.root.children.indexOf(c))).toBe(true);
      expect(shape(p.root)).toEqual(['b', { g: ['y'] }, 'a', 'z', 'x', 'c', { pets: ['name'] }]);
    });

    it('moves a group with its selected children as the group alone', () => {
      const { p, g, x, pets } = tree();
      expect(outermostIds(p, [x.id, g.id, 'missing'])).toEqual([g.id]);
      expect(moveNodesTo(p, [x.id, g.id], pets.group.id, 1)).toBe(true);
      expect(shape(p.root)).toEqual(['a', 'b', 'c', { pets: ['name', { g: ['x', 'y', 'z'] }] }]);
    });

    it('refuses to drop a group into itself or one of its descendants, changing nothing', () => {
      const { p, a, g } = tree();
      const inner = newGroupLink('inner');
      g.group.children.push(inner);
      const before = structuredClone(p);
      expect(canMoveNodesTo(p, [a.id, g.id], g.group.id, 0)).toBe(false);
      expect(moveNodesTo(p, [a.id, g.id], g.group.id, 0)).toBe(false);
      expect(moveNodesTo(p, [g.id], inner.group.id, 0)).toBe(false);
      expect(p).toEqual(before);
    });

    it('does nothing when the nodes are already there', () => {
      const { p, a, b, c, g, x, y } = tree();
      expect(canMoveNodesTo(p, [a.id, b.id], p.root.id, 0)).toBe(false);
      expect(canMoveNodesTo(p, [a.id, b.id], p.root.id, 2)).toBe(false);
      expect(canMoveNodesTo(p, [x.id, y.id], g.group.id, 1)).toBe(false);
      expect(canMoveNodesTo(p, [a.id, c.id], p.root.id, 3)).toBe(true);
      expect(canMoveNodesTo(p, [b.id], p.root.id, 0)).toBe(true);
      expect(canMoveNodesTo(p, ['missing'], p.root.id, 0)).toBe(false);
    });

    it('rewrites template references when nodes are dropped into and out of a group', () => {
      const { p, a, c, x, g } = tree();
      p.branding.en = { light: { primaryField: '{{a}} {{c}} {{g.x}}' } };
      x.labels = { en: '{{/a}}' };
      a.labels = { en: '{{g.y}}' };
      moveNodesTo(p, [a.id, c.id], g.group.id, g.group.children.length);
      expect(p.branding.en.light.primaryField).toBe('{{g.a}} {{g.c}} {{g.x}}');
      expect(a.labels.en).toBe('{{y}}');
      expect(x.labels.en).toBe('{{/g.a}}');
      moveNodesTo(p, [x.id], p.root.id, 0);
      expect(shape(p.root)).toEqual(['x', 'b', { g: ['y', 'z', 'a', 'c'] }, { pets: ['name'] }]);
      expect(p.branding.en.light.primaryField).toBe('{{g.a}} {{g.c}} {{x}}');
    });
  });

  describe('move several into a group', () => {
    it('appends the nodes to the group in tree order, a nested node travelling with its group', () => {
      const { p, a, c, g, x, pets } = tree();
      expect(moveNodesInto(p, [c.id, x.id, a.id, g.id], pets.group.id)).toBe(true);
      expect(shape(p.root)).toEqual(['b', { pets: ['name', 'a', { g: ['x', 'y', 'z'] }, 'c'] }]);
    });

    it('rewrites references to the moved nodes', () => {
      const { p, a, c, g } = tree();
      c.labels = { en: '{{a}}' };
      moveNodesInto(p, [a.id], g.group.id);
      expect(c.labels.en).toBe('{{g.a}}');
    });

    it('leaves a group that holds the target where it is', () => {
      const { p, b, g } = tree();
      expect(moveNodesInto(p, [g.id, b.id], g.group.id)).toBe(true);
      expect(shape(p.root)).toEqual(['a', { g: ['x', 'y', 'z', 'b'] }, 'c', { pets: ['name'] }]);
      expect(moveNodesInto(p, [g.id], g.group.id)).toBe(false);
    });
  });

  describe('delete several', () => {
    it('removes every given node', () => {
      const { p, a, c, y, name } = tree();
      expect(removeNodes(p, [a.id, y.id, c.id, name.id])).toEqual([a, y, c, name]);
      expect(shape(p.root)).toEqual(['b', { g: ['x', 'z'] }, { pets: [] }]);
    });

    it('removes a group together with its own selected children without error', () => {
      const { p, g, x, z, b } = tree();
      expect(removeNodes(p, [x.id, g.id, z.id, b.id, 'missing'])).toEqual([b, g]);
      expect(shape(p.root)).toEqual(['a', 'c', { pets: ['name'] }]);
    });
  });
});
