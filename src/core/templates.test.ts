import { describe, expect, it } from 'vitest';
import { type Group, emptyGroup, newAttribute, newGroupLink } from './model';
import {
  listExpressions,
  parseExpression,
  renameInTemplate,
  resolveEditorPath,
  templatePaths,
  toEditorTemplate,
  toSpecTemplate,
} from './templates';

function tree() {
  const pets = emptyGroup();
  pets.children.push(newAttribute('name'), newAttribute('race'));
  const address = emptyGroup();
  address.children.push(newAttribute('city'));
  const person = emptyGroup();
  person.children.push(newAttribute('lastname'), newGroupLink('address', { group: address }));
  const root = emptyGroup();
  root.children.push(
    newAttribute('firstname'),
    newAttribute('nationalities', { type: { array: 'Text' } }),
    newGroupLink('pets', { array: true, group: pets }),
    newGroupLink('person', { group: person }),
  );
  return { root, pets, person, address };
}

const digestOf = (names: Map<Group, string>) => (group: Group) => names.get(group) ?? 'UNKNOWN';

describe('parseExpression', () => {
  it('splits editor paths and keeps suffixes verbatim', () => {
    expect(parseExpression("pets.name.join('/')")).toMatchObject({ path: ['pets', 'name'], suffix: ".join('/')", absolute: false });
    expect(parseExpression('array_strings[null].join(" ")')).toMatchObject({ path: ['array_strings'], suffix: '[null].join(" ")' });
    expect(parseExpression('/person.lastname')).toMatchObject({ path: ['person', 'lastname'], absolute: true });
  });

  it('recognises the spec refs form', () => {
    expect(parseExpression('refs:IAbc:array_integers[1]')).toMatchObject({ refDigest: 'IAbc', path: ['array_integers'], suffix: '[1]' });
  });

  it('lists every expression in a text', () => {
    expect(listExpressions('{{firstname}} {{pets.name}} static').map((e) => e.path)).toEqual([['firstname'], ['pets', 'name']]);
  });
});

describe('resolveEditorPath', () => {
  it('resolves relative and absolute paths', () => {
    const { root, person, address } = tree();
    expect(resolveEditorPath(root, root, parseExpression('person.address.city'))?.group).toBe(address);
    expect(resolveEditorPath(root, person, parseExpression('address.city'))?.group).toBe(address);
    expect(resolveEditorPath(root, address, parseExpression('/firstname'))?.group).toBe(root);
    expect(resolveEditorPath(root, root, parseExpression('person.unknown'))).toBeNull();
  });
});

describe('toSpecTemplate / toEditorTemplate', () => {
  it('rewrites nested paths to refs and back', () => {
    const { root, pets, person, address } = tree();
    const names = new Map<Group, string>([[root, 'IRoot'], [pets, 'IPets'], [person, 'IPerson'], [address, 'IAddress']]);
    const editor = "{{firstname}} owns {{pets.name}} in {{person.address.city}} ({{nationalities.join('/')}})";
    const spec = toSpecTemplate(editor, root, root, digestOf(names));
    expect(spec).toBe("{{firstname}} owns {{refs:IPets:name}} in {{refs:IAddress:city}} ({{nationalities.join('/')}})");

    const groupsFor = (digest: string) => [...names].filter(([, name]) => name === digest).map(([group]) => group);
    expect(toEditorTemplate(spec, root, root, groupsFor)).toBe(editor);
  });

  it('uses a root path when the target is not below the owner', () => {
    const { root, pets, address } = tree();
    const names = new Map<Group, string>([[root, 'IRoot'], [pets, 'IPets'], [address, 'IAddress']]);
    const groupsFor = (digest: string) => [...names].filter(([, name]) => name === digest).map(([group]) => group);
    expect(toEditorTemplate('{{refs:IRoot:firstname}}', root, address, groupsFor)).toBe('{{/firstname}}');
    expect(toSpecTemplate('{{/firstname}}', root, address, digestOf(names))).toBe('{{refs:IRoot:firstname}}');
  });

  it('leaves unresolved expressions untouched', () => {
    const { root } = tree();
    expect(toSpecTemplate('{{nope}}', root, root, () => 'X')).toBe('{{nope}}');
    expect(toEditorTemplate('{{refs:IMissing:x}}', root, root, () => [])).toBe('{{refs:IMissing:x}}');
  });
});

describe('templatePaths', () => {
  it('lists attribute paths below the owner', () => {
    const { root } = tree();
    expect(templatePaths(root)).toEqual(['firstname', 'nationalities', 'pets.name', 'pets.race', 'person.lastname', 'person.address.city']);
  });
});

describe('renameInTemplate', () => {
  it('renames path segments that pass through the node', () => {
    const { root, person } = tree();
    const address = person.children.find((child) => child.key === 'address')!;
    const lastname = person.children.find((child) => child.key === 'lastname')!;
    expect(renameInTemplate('{{person.address.city}} {{firstname}}', root, root, address.id, 'home')).toBe('{{person.home.city}} {{firstname}}');
    expect(renameInTemplate("{{/person.lastname.join(' ')}}", root, person, lastname.id, 'surname')).toBe("{{/person.surname.join(' ')}}");
    expect(renameInTemplate('{{lastname}}', root, person, lastname.id, 'surname')).toBe('{{surname}}');
  });

  it('leaves unrelated, unresolved and refs-form expressions alone', () => {
    const { root } = tree();
    const firstname = root.children[0];
    expect(renameInTemplate('{{nationalities}} {{nope}} {{refs:IAbc:firstname}}', root, root, firstname.id, 'given')).toBe(
      '{{nationalities}} {{nope}} {{refs:IAbc:firstname}}',
    );
  });
});
