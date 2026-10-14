import { describe, expect, it } from 'vitest';
import {
  emptyGroup,
  emptyProject,
  findGroup,
  findNode,
  newAttribute,
  newGroupLink,
  parseTypeString,
  typeToString,
  walkGroups,
  walkNodes,
} from './model';

describe('types', () => {
  it('converts attribute types to and from capture base strings', () => {
    expect(typeToString('Text')).toBe('Text');
    expect(typeToString({ array: 'Numeric' })).toBe('Array[Numeric]');
    expect(parseTypeString('DateTime')).toBe('DateTime');
    expect(parseTypeString('Array[Boolean]')).toEqual({ array: 'Boolean' });
    expect(parseTypeString('Binary')).toBe('Binary');
    expect(parseTypeString('Array[Array[Text]]')).toBeNull();
    expect(parseTypeString('refs:IAbc')).toBeNull();
    expect(parseTypeString('String')).toBeNull();
  });
});

describe('emptyProject', () => {
  it('creates meta and branding slots for every language', () => {
    const project = emptyProject(['de-CH', 'en-GB']);
    expect(project.languages).toEqual(['de-CH', 'en-GB']);
    expect(project.meta['en-GB']).toEqual({ name: '', description: '' });
    expect(project.branding['de-CH']).toEqual({ light: {} });
    expect(project.hosting).toEqual({ mode: 'url', url: '' });
    expect(project.root.children).toEqual([]);
  });
});

describe('tree walking', () => {
  const inner = emptyGroup();
  const city = newAttribute('city');
  inner.children.push(city);
  const address = newGroupLink('address', { group: inner });
  const name = newAttribute('name');
  const root = emptyGroup();
  root.children.push(name, address);

  it('walks nodes depth-first with their parent and depth', () => {
    expect([...walkNodes(root)].map(({ node, parent, depth }) => [node.key, parent === root, depth])).toEqual([
      ['name', true, 0],
      ['address', true, 0],
      ['city', false, 1],
    ]);
  });

  it('walks groups root first', () => {
    expect([...walkGroups(root)]).toEqual([root, inner]);
  });

  it('finds nodes and groups by id', () => {
    expect(findNode(root, city.id)?.parent).toBe(inner);
    expect(findGroup(root, inner.id)).toBe(inner);
    expect(findNode(root, 'missing')).toBeUndefined();
  });

  it('gives new nodes unique ids and sensible defaults', () => {
    const a = newAttribute('a');
    expect(a).toMatchObject({ kind: 'attribute', type: 'Text', source: ['a'], sensitive: false, labels: {} });
    expect(newAttribute('a').id).not.toBe(a.id);
    expect(newGroupLink('g')).toMatchObject({ kind: 'group', array: false, sensitive: false });
  });
});
