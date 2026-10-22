import { describe, expect, it } from 'vitest';
import { CLIPBOARD_KIND, parseClipboard, pasteNodes, serializeNodes } from './clipboard';
import { type GroupLink, type Node, emptyProject, newAttribute, newGroupLink, walkNodes } from './model';

/** a, person { name, address { city } }, b: labels in German and English, a value list and an I14Y link on name. */
function source() {
  const project = emptyProject(['de-CH', 'en-GB']);
  const city = newAttribute('city', { labels: { 'de-CH': 'Ort', 'en-GB': 'City' } });
  const address = newGroupLink('address', { source: ['person', 'address'], labels: { 'en-GB': '{{city}}' } });
  address.group.children.push(city);
  const name = newAttribute('name', {
    source: ['person', 'name'],
    labels: { 'de-CH': 'Name', 'en-GB': 'Name' },
    entries: { codes: ['x'], labels: { 'de-CH': { x: 'X de' }, 'en-GB': { x: 'X en' } } },
    i14y: { conceptId: 'c1', identifier: 'NAME', registrationStatus: 'Standard', name: { de: 'Name' }, publisher: { de: 'BFS' }, values: {} },
  });
  const person = newGroupLink('person', { source: ['person'], labels: { 'en-GB': '{{name}} in {{address.city}}' } });
  person.group.children.push(name, address);
  const a = newAttribute('a', { labels: { 'en-GB': '{{person.name}}, {{b}}, {{/b}}' } });
  const b = newAttribute('b', { type: { array: 'Numeric' }, sensitive: true, standard: 'urn:x', labels: { 'en-GB': 'B' } });
  project.root.children.push(a, person, b);
  return { project, a, person, name, address, city, b };
}

const keys = (nodes: Node[]) => nodes.map((node) => node.key);
const ids = (node: Node) => [node.id, ...(node.kind === 'group' ? [node.group.id, ...[...walkNodes(node.group)].map(({ node: inner }) => inner.id)] : [])];
const clip = (text: string | undefined) => parseClipboard(text!)!;

describe('serializeNodes and parseClipboard', () => {
  it('round-trips the given nodes with their subtrees, outermost only, in tree order', () => {
    const { project, a, person, name, city } = source();
    const text = serializeNodes(project, [city.id, person.id, name.id, a.id]);
    const parsed = JSON.parse(text!);
    expect(parsed.kind).toBe(CLIPBOARD_KIND);
    expect(parsed.version).toBe(1);
    expect(clip(text).items).toEqual([
      { parent: 0, node: a },
      { parent: 0, node: person },
    ]);
  });

  it('numbers the source groups, so siblings share a number', () => {
    const { project, a, name, city, b } = source();
    const items = clip(serializeNodes(project, [a.id, name.id, city.id, b.id])).items;
    expect(items.map(({ parent, node }) => [node.key, parent])).toEqual([
      ['a', 0],
      ['name', 1],
      ['city', 2],
      ['b', 0],
    ]);
  });

  it('gives nothing for ids that name no node', () => {
    expect(serializeNodes(source().project, ['nope'])).toBeUndefined();
    expect(serializeNodes(source().project, [])).toBeUndefined();
  });

  it('ignores text that is not nodes from this app', () => {
    const { project, b } = source();
    const valid = JSON.parse(serializeNodes(project, [b.id])!);
    const node = valid.items[0].node;
    const variants: unknown[] = [
      'b',
      '',
      '{',
      'null',
      '[]',
      { ...valid, kind: 'something-else' },
      { ...valid, version: 2 },
      { ...valid, items: [] },
      { ...valid, items: [{ node }] },
      { ...valid, items: [{ parent: -1, node }] },
      { ...valid, items: [{ parent: 0, node: { ...node, kind: 'thing' } }] },
      { ...valid, items: [{ parent: 0, node: { ...node, id: 3 } }] },
      { ...valid, items: [{ parent: 0, node: { ...node, type: 'Colour' } }] },
      { ...valid, items: [{ parent: 0, node: { ...node, source: [{}] } }] },
      { ...valid, items: [{ parent: 0, node: { ...node, labels: { en: 3 } } }] },
      { ...valid, items: [{ parent: 0, node: { ...node, entries: { codes: [1], labels: {} } } }] },
      { ...valid, items: [{ parent: 0, node: { ...node, i14y: { conceptId: 'c' } } }] },
      { ...valid, items: [{ parent: 0, node: { kind: 'group', id: 'g', key: 'g', array: false, sensitive: false, labels: {}, group: { id: 'x', children: [{}], passthrough: [] } } }] },
    ];
    for (const variant of variants) expect(parseClipboard(typeof variant === 'string' ? variant : JSON.stringify(variant))).toBeNull();
  });

  it('keeps only the fields of a node', () => {
    const { project, b } = source();
    const text = serializeNodes(project, [b.id])!;
    const withExtra = JSON.parse(text);
    withExtra.items[0].node.extra = 'dropped';
    expect(parseClipboard(JSON.stringify(withExtra))!.items[0].node).toEqual(b);
  });
});

describe('pasteNodes', () => {
  it('inserts copies with fresh ids and unique keys at the given place, and returns their ids', () => {
    const { project, a, person } = source();
    const before = [...walkNodes(project.root)].map(({ node }) => node.id);
    const pasted = pasteNodes(project, clip(serializeNodes(project, [a.id, person.id])), project.root.id, 1);
    expect(keys(project.root.children)).toEqual(['a', 'a_2', 'person_2', 'person', 'b']);
    expect(pasted).toEqual([project.root.children[1].id, project.root.children[2].id]);
    const copy = project.root.children[2] as GroupLink;
    expect(keys(copy.group.children)).toEqual(['name', 'address']);
    expect(copy.group.id).not.toBe(person.group.id);
    for (const id of ids(copy)) expect(before).not.toContain(id);
    expect(new Set(ids(copy)).size).toBe(ids(copy).length);
  });

  it('puts copies at the end of the group without an index, and keys unique among themselves', () => {
    const { project, person, name } = source();
    const text = serializeNodes(project, [name.id])!;
    const target = emptyProject(['en-GB']);
    pasteNodes(target, clip(text), target.root.id);
    pasteNodes(target, clip(text), target.root.id);
    expect(keys(target.root.children)).toEqual(['name', 'name_2']);
    pasteNodes(project, clip(text), person.group.id);
    expect(keys(person.group.children)).toEqual(['name', 'address', 'name_2']);
  });

  it('changes nothing for a group that does not exist', () => {
    const { project, a } = source();
    expect(pasteNodes(project, clip(serializeNodes(project, [a.id])), 'nope')).toEqual([]);
    expect(keys(project.root.children)).toEqual(['a', 'person', 'b']);
  });

  it('drops labels in languages the project lacks and leaves its other languages empty', () => {
    const { project, person } = source();
    const target = emptyProject(['en-GB', 'fr-CH']);
    pasteNodes(target, clip(serializeNodes(project, [person.id])), target.root.id);
    const copy = target.root.children[0] as GroupLink;
    const name = copy.group.children[0];
    expect(name.labels).toEqual({ 'en-GB': 'Name' });
    expect(name.kind === 'attribute' && name.entries?.labels).toEqual({ 'en-GB': { x: 'X en' } });
    expect(name.kind === 'attribute' && name.i14y?.name).toEqual({ de: 'Name' });
    const city = [...walkNodes(copy.group)].find(({ node }) => node.key === 'city')!.node;
    expect(city.labels).toEqual({ 'en-GB': 'City' });
  });

  it('keeps every other field of the nodes', () => {
    const { project, b } = source();
    pasteNodes(project, clip(serializeNodes(project, [b.id])), project.root.id);
    const { id, ...copy } = project.root.children[3];
    const { id: original, ...rest } = b;
    expect(id).not.toBe(original);
    expect(copy).toEqual({ ...rest, key: 'b_2' });
  });

  it('points relative references inside the copied nodes at the copies, and keeps the rest as written', () => {
    const { project, a, person, b } = source();
    pasteNodes(project, clip(serializeNodes(project, [a.id, person.id, b.id])), project.root.id);
    const [copyA, copyPerson] = project.root.children.slice(3) as [Node, GroupLink];
    // {{person.name}} follows the renamed copy person_2; {{b}} goes to the copy b_2; the absolute {{/b}} stays.
    expect(copyA.labels['en-GB']).toBe('{{person_2.name}}, {{b_2}}, {{/b}}');
    // Inside the copied group, references already resolve to the copies.
    expect(copyPerson.labels['en-GB']).toBe('{{name}} in {{address.city}}');
    expect(person.labels['en-GB']).toBe('{{name}} in {{address.city}}');
    expect(a.labels['en-GB']).toBe('{{person.name}}, {{b}}, {{/b}}');
  });

  it('keeps references to nodes left behind as written, even when they no longer resolve', () => {
    const { project, a } = source();
    const target = emptyProject(['en-GB']);
    pasteNodes(target, clip(serializeNodes(project, [a.id])), target.root.id);
    expect(target.root.children[0].labels['en-GB']).toBe('{{person.name}}, {{b}}, {{/b}}');
  });

  it('does not tie together nodes copied from different groups', () => {
    // a refers to its sibling `name`; a node called `name` copied from another group is not that sibling.
    const project = emptyProject(['en-GB']);
    const person = newGroupLink('person');
    const inner = newAttribute('name');
    person.group.children.push(inner);
    const a = newAttribute('a', { labels: { 'en-GB': '{{name}}' } });
    project.root.children.push(a, person, newAttribute('name'));
    const target = emptyProject(['en-GB']);
    const other = newGroupLink('other');
    other.group.children.push(newAttribute('name'));
    target.root.children.push(other);
    pasteNodes(target, clip(serializeNodes(project, [a.id, inner.id])), other.group.id);
    expect(keys(other.group.children)).toEqual(['name', 'a', 'name_2']);
    expect(other.group.children[1].labels['en-GB']).toBe('{{name}}');
  });
});
