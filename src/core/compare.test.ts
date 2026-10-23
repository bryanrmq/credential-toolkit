import { describe, expect, it } from 'vitest';
import nested from '../test/fixtures/oca-bundle-nested.json';
import { type ChangeTarget, type ProjectChange, compareProjects, countChanges, normaliseProject } from './compare';
import { buildBundle } from './export/bundle';
import { importBundle } from './import/bundle';
import { type AttributeNode, type GroupLink, type Node, type Project, emptyProject, newAttribute, newGroupLink, walkNodes } from './model';

/** A project with two languages, branding in both themes, a group, a list of objects and entries. */
function project(): Project {
  const result = emptyProject(['de-CH', 'fr-CH']);
  result.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  result.meta['fr-CH'] = { name: 'Permis pour chien', description: '' };
  result.branding['de-CH'] = {
    light: { primaryBackgroundColor: '#ffffff', primaryField: '{{name}}' },
    dark: { primaryBackgroundColor: '#000000' },
  };
  result.branding['fr-CH'] = { light: { primaryBackgroundColor: '#ffffff', primaryField: '{{name}}' } };
  const name = newAttribute('name', { labels: { 'de-CH': 'Name', 'fr-CH': 'Nom' } });
  const canton = newAttribute('canton', {
    labels: { 'de-CH': 'Kanton', 'fr-CH': 'Canton' },
    entries: { codes: ['BE', 'ZH'], labels: { 'de-CH': { BE: 'Bern', ZH: 'Zürich' }, 'fr-CH': { BE: 'Berne', ZH: 'Zurich' } } },
  });
  const address = newGroupLink('address', { source: ['address'], labels: { 'de-CH': 'Adresse', 'fr-CH': 'Adresse' } });
  address.group.children.push(
    newAttribute('street', { source: ['street'], labels: { 'de-CH': 'Strasse', 'fr-CH': 'Rue' } }),
    newAttribute('city', { source: ['city'], labels: { 'de-CH': 'Ort', 'fr-CH': 'Lieu' } }),
  );
  const dogs = newGroupLink('dogs', { array: true, source: ['dogs', null], labels: { 'de-CH': 'Hunde', 'fr-CH': 'Chiens' } });
  dogs.group.children.push(
    newAttribute('chip', { source: ['chip'], labels: { 'de-CH': 'Chip', 'fr-CH': 'Puce' } }),
    newAttribute('born', { type: 'DateTime', source: ['born'], standard: 'urn:iso:std:iso:8601', labels: { 'de-CH': 'Geboren', 'fr-CH': 'Né' } }),
  );
  result.root.children.push(name, canton, address, dogs);
  return result;
}

function edited(edit: (draft: Project) => void): Project {
  const draft = structuredClone(project());
  edit(draft);
  return draft;
}

function at(draft: Project, path: string): Node {
  const keys = path.split('.');
  let children = draft.root.children;
  let found: Node | undefined;
  for (const key of keys) {
    found = children.find((node) => node.key === key);
    if (!found) throw new Error(`no node at ${path}`);
    if (found.kind === 'group') children = found.group.children;
  }
  return found!;
}

const attribute = (draft: Project, path: string) => at(draft, path) as AttributeNode;
const group = (draft: Project, path: string) => at(draft, path) as GroupLink;

/** The changes, checked to all be about a node. */
function nodeChanges(changes: ProjectChange[]): (ProjectChange & ChangeTarget)[] {
  const onNodes = changes.filter((change): change is ProjectChange & ChangeTarget => 'path' in change);
  expect(onNodes).toHaveLength(changes.length);
  return onNodes;
}

async function changesFrom(edit: (draft: Project) => void): Promise<{ after: Project; changes: ProjectChange[] }> {
  const after = edited(edit);
  return { after, changes: await compareProjects(project(), after) };
}

describe('compareProjects: nothing changed', () => {
  it('reports nothing for a project and itself', async () => {
    const same = project();
    expect(await compareProjects(same, same)).toEqual([]);
  });

  it('reports nothing between a project and its exported then imported bundle', async () => {
    const draft = project();
    const { bundle } = await buildBundle(draft);
    const { project: imported } = await importBundle(JSON.parse(JSON.stringify(bundle)));
    expect(await compareProjects(imported, draft)).toEqual([]);
    expect(await compareProjects(draft, imported)).toEqual([]);
  });

  it('reports nothing between an imported bundle and its own round trip', async () => {
    const { project: imported } = await importBundle(nested);
    expect(await compareProjects(imported, await normaliseProject(imported))).toEqual([]);
  });

  it('ignores the sample credential and I14Y links', async () => {
    const { changes } = await changesFrom((draft) => {
      draft.sample = { name: 'Seraina', canton: 'BE' };
      attribute(draft, 'canton').i14y = {
        conceptId: '08d94604-5a6f-4e8f-9b5f-0123456789ab',
        identifier: 'CH_CANTON',
        registrationStatus: 'Recorded',
        name: { de: 'Kanton' },
        publisher: { de: 'BFS' },
        values: { BE: { de: 'Bern' } },
      };
    });
    expect(changes).toEqual([]);
  });

  it('ignores empty labels and branding fields, which the bundle leaves out', async () => {
    const { changes } = await changesFrom((draft) => {
      attribute(draft, 'name').labels['it-CH'] = 'Nome';
      draft.branding['fr-CH'].dark = { logo: '' };
      draft.branding['de-CH'].light.secondaryField = '';
    });
    expect(changes).toEqual([]);
  });
});

describe('compareProjects: attributes', () => {
  it('reports an attribute added at the root with its id in "after"', async () => {
    const { after, changes } = await changesFrom((draft) => draft.root.children.push(newAttribute('breed')));
    expect(changes).toEqual([
      { section: 'attributes', kind: 'node', tag: 'added', keyPath: ['breed'], path: 'breed', nodeKind: 'attribute', nodeId: at(after, 'breed').id },
    ]);
  });

  it('reports attributes added and removed inside a group and a list of objects', async () => {
    const { after, changes } = await changesFrom((draft) => {
      group(draft, 'address').group.children.push(newAttribute('zip'));
      group(draft, 'dogs').group.children.splice(0, 1);
    });
    expect(changes).toEqual([
      { section: 'attributes', kind: 'node', tag: 'added', keyPath: ['address', 'zip'], path: 'address.zip', nodeKind: 'attribute', nodeId: at(after, 'address.zip').id },
      { section: 'attributes', kind: 'node', tag: 'removed', keyPath: ['dogs', 'chip'], path: 'dogs.chip', nodeKind: 'attribute' },
    ]);
  });

  it('reports an added or removed group once, without its children', async () => {
    const { changes } = await changesFrom((draft) => {
      draft.root.children = draft.root.children.filter((node) => node.key !== 'address');
      const owner = newGroupLink('owner');
      owner.group.children.push(newAttribute('first'), newAttribute('last'));
      draft.root.children.push(owner);
    });
    expect(nodeChanges(changes).map(({ tag, path, nodeKind }) => ({ tag, path, nodeKind }))).toEqual([
      { tag: 'added', path: 'owner', nodeKind: 'group' },
      { tag: 'removed', path: 'address', nodeKind: 'group' },
    ]);
  });

  it('reports a rename as a removal plus an addition', async () => {
    const { changes } = await changesFrom((draft) => {
      attribute(draft, 'address.city').key = 'town';
    });
    expect(nodeChanges(changes).map(({ section, tag, path }) => ({ section, tag, path }))).toEqual([
      { section: 'attributes', tag: 'added', path: 'address.town' },
      { section: 'attributes', tag: 'removed', path: 'address.city' },
    ]);
  });

  it('reports type, source and position changes separately', async () => {
    const { after, changes } = await changesFrom((draft) => {
      attribute(draft, 'name').type = 'Numeric';
      attribute(draft, 'dogs.chip').source = ['microchip'];
      group(draft, 'address').group.children.reverse();
    });
    expect(changes).toEqual([
      { section: 'attributes', kind: 'type', tag: 'changed', from: 'Text', to: 'Numeric', keyPath: ['name'], path: 'name', nodeKind: 'attribute', nodeId: at(after, 'name').id },
      {
        section: 'attributes',
        kind: 'position',
        tag: 'changed',
        from: 1,
        to: 2,
        keyPath: ['address', 'street'],
        path: 'address.street',
        nodeKind: 'attribute',
        nodeId: at(after, 'address.street').id,
      },
      {
        section: 'attributes',
        kind: 'source',
        tag: 'changed',
        from: ['chip'],
        to: ['microchip'],
        keyPath: ['dogs', 'chip'],
        path: 'dogs.chip',
        nodeKind: 'attribute',
        nodeId: at(after, 'dogs.chip').id,
      },
    ]);
  });

  it('reports a group turned into a list of objects as a type change', async () => {
    const { changes } = await changesFrom((draft) => {
      group(draft, 'address').array = true;
    });
    expect(changes).toMatchObject([{ kind: 'type', path: 'address', nodeKind: 'group', from: 'Object', to: 'Array[Object]' }]);
  });

  it('reports only the node that moved, not siblings shifted by an addition or removal', async () => {
    const { changes } = await changesFrom((draft) => {
      const children = draft.root.children;
      children.unshift(newAttribute('breed'));
      const [canton] = children.splice(2, 1);
      children.push(canton);
    });
    expect(nodeChanges(changes).map(({ kind, path }) => `${kind} ${path}`)).toEqual(['node breed', 'position canton']);
    expect(changes[1]).toMatchObject({ from: 2, to: 5 });
  });

  it('reports sensitive, standard and entry changes', async () => {
    const { changes } = await changesFrom((draft) => {
      attribute(draft, 'name').sensitive = true;
      attribute(draft, 'dogs.born').standard = undefined;
      attribute(draft, 'canton').entries!.labels['fr-CH'].ZH = 'Zurich (ville)';
    });
    expect(nodeChanges(changes).map(({ kind, tag, path }) => `${kind} ${tag} ${path}`)).toEqual([
      'sensitive changed name',
      'entries changed canton',
      'standard removed dogs.born',
    ]);
  });
});

describe('compareProjects: labels', () => {
  it('lists the languages a label changed in', async () => {
    const { after, changes } = await changesFrom((draft) => {
      attribute(draft, 'address.city').labels['fr-CH'] = 'Localité';
      group(draft, 'dogs').labels = { 'de-CH': 'Tiere', 'fr-CH': 'Animaux' };
    });
    expect(changes).toEqual([
      {
        section: 'labels',
        kind: 'label',
        tag: 'changed',
        languages: ['fr-CH'],
        keyPath: ['address', 'city'],
        path: 'address.city',
        nodeKind: 'attribute',
        nodeId: at(after, 'address.city').id,
      },
      { section: 'labels', kind: 'label', tag: 'changed', languages: ['de-CH', 'fr-CH'], keyPath: ['dogs'], path: 'dogs', nodeKind: 'group', nodeId: at(after, 'dogs').id },
    ]);
  });

  it('tags labels that were all cleared as removed', async () => {
    const { changes } = await changesFrom((draft) => {
      attribute(draft, 'name').labels = {};
    });
    expect(changes).toMatchObject([{ section: 'labels', tag: 'removed', path: 'name', languages: ['de-CH', 'fr-CH'] }]);
  });
});

describe('compareProjects: branding', () => {
  it('reports each field with its theme and the languages it changed in', async () => {
    const { changes } = await changesFrom((draft) => {
      draft.branding['de-CH'].light.primaryBackgroundColor = '#ff0000';
      draft.branding['fr-CH'].light.primaryBackgroundColor = '#ff0000';
      draft.branding['de-CH'].dark!.logo = 'data:image/png;base64,AAAA';
      draft.branding['fr-CH'].light.primaryField = '';
    });
    expect(changes).toEqual([
      { section: 'branding', kind: 'field', tag: 'changed', field: 'primaryBackgroundColor', theme: 'light', languages: ['de-CH', 'fr-CH'] },
      { section: 'branding', kind: 'field', tag: 'removed', field: 'primaryField', theme: 'light', languages: ['fr-CH'] },
      { section: 'branding', kind: 'field', tag: 'added', field: 'logo', theme: 'dark', languages: ['de-CH'] },
    ]);
  });

  it('reports the credential name and description', async () => {
    const { changes } = await changesFrom((draft) => {
      draft.meta['fr-CH'] = { name: 'Permis de chien', description: 'Pour les détenteurs' };
    });
    expect(changes).toEqual([
      { section: 'branding', kind: 'field', tag: 'changed', field: 'name', languages: ['fr-CH'] },
      { section: 'branding', kind: 'field', tag: 'added', field: 'description', languages: ['fr-CH'] },
    ]);
  });
});

describe('compareProjects: languages', () => {
  it('reports languages added and removed, without listing their labels and branding', async () => {
    const { changes } = await changesFrom((draft) => {
      draft.languages = ['de-CH', 'it-CH'];
      draft.meta['it-CH'] = { name: 'Permesso per cani', description: '' };
      for (const { node } of walkNodes(draft.root)) node.labels['it-CH'] = node.key;
    });
    expect(changes).toEqual([
      { section: 'languages', kind: 'language', tag: 'added', language: 'it-CH' },
      { section: 'languages', kind: 'language', tag: 'removed', language: 'fr-CH' },
    ]);
  });

  it('reports a new language order', async () => {
    const { changes } = await changesFrom((draft) => {
      draft.languages.reverse();
    });
    expect(changes).toEqual([{ section: 'languages', kind: 'order', tag: 'changed', from: ['de-CH', 'fr-CH'], to: ['fr-CH', 'de-CH'] }]);
  });
});

describe('compareProjects: everything else', () => {
  it('reports a bundle change nothing else explains', async () => {
    const { changes } = await changesFrom((draft) => {
      draft.bundleExtras = { x_note: 'kept' };
    });
    expect(changes).toEqual([{ section: 'other', kind: 'bundle', tag: 'changed' }]);
  });

  it('compares a project that cannot be exported as it is', async () => {
    const { changes } = await changesFrom((draft) => {
      // Two groups with the same keys and types but different labels share one digest, so export fails.
      const twin = newGroupLink('home');
      twin.group.children.push(newAttribute('street', { source: ['street'] }), newAttribute('city', { source: ['city'] }));
      draft.root.children.push(twin);
    });
    expect(nodeChanges(changes).map(({ tag, path }) => `${tag} ${path}`)).toEqual(['added home']);
  });

  it('counts changes per section', async () => {
    const { changes } = await changesFrom((draft) => {
      draft.root.children.push(newAttribute('breed'));
      attribute(draft, 'name').labels['de-CH'] = 'Vorname';
      draft.languages.push('it-CH');
      draft.meta['it-CH'] = { name: 'Permesso', description: '' };
    });
    expect(countChanges(changes)).toEqual({ attributes: 1, labels: 1, branding: 0, languages: 1, other: 0 });
  });
});
