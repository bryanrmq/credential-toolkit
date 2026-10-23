import { describe, expect, it } from 'vitest';
import { type Group, type Node, type Project, emptyGroup, emptyProject, newAttribute, newGroupLink } from '../model';
import {
  type CredentialDetails,
  type DetailsClaim,
  type DetailsGroup,
  type DetailsOptions,
  type DetailsRow,
  androidAppLocale,
  credentialDetails,
  iosLanguageCodes,
} from './details';

const DE = 'de-CH';
const FR = 'fr-CH';

const group = (...children: Node[]): Group => ({ ...emptyGroup(), children });

function project(children: Node[], sample?: unknown, languages = [DE, FR]): Project {
  const result = emptyProject(languages);
  result.root.children.push(...children);
  if (sample !== undefined) result.sample = sample;
  return result;
}

const details = (p: Project, options: Partial<DetailsOptions> = {}) =>
  credentialDetails(p, { languages: ['de'], platform: 'ios', ...options });

/** A readable outline: claims as `label: value`, groups as `# title` (or `#` without one) with their rows. */
type Outline = string | { [title: string]: Outline[] };

function outline(rows: DetailsRow[]): Outline[] {
  return rows.map((row) => (row.kind === 'claim' ? `${row.label}: ${valueText(row)}` : { [`# ${row.title ?? ''}`.trim()]: outline(row.rows) }));
}

function valueText(claim: DetailsClaim): string {
  switch (claim.value.kind) {
    case 'raw':
      return String(claim.value.value);
    case 'entry':
      return claim.value.label;
    case 'null':
      return '–';
    case 'placeholder':
      return `‹${claim.value.type}›`;
  }
}

const sections = (result: CredentialDetails) => result.sections.map((section) => ({ [`# ${section.title ?? ''}`.trim()]: outline(section.rows) }));

const claims = (rows: DetailsRow[]): DetailsClaim[] =>
  rows.flatMap((row) => (row.kind === 'claim' ? [row] : claims(row.rows)));

describe('sections from groups', () => {
  const address = () =>
    newGroupLink('address', {
      source: ['address'],
      labels: { [DE]: 'Adresse' },
      group: group(
        newAttribute('street', { source: ['address', 'street'], labels: { [DE]: 'Strasse' } }),
        newGroupLink('geo', {
          source: ['address', 'geo'],
          group: group(newAttribute('lat', { type: 'Numeric', source: ['address', 'geo', 'lat'], labels: { [DE]: 'Breite' } })),
        }),
      ),
    });

  it('puts the root first and nests refs: groups, titled by the parent label, matching nested paths', () => {
    const p = project([newAttribute('name', { labels: { [DE]: 'Name' } }), address()], {
      name: 'Rex',
      address: { street: 'Bahnhofstrasse 1', geo: { lat: 46.9 } },
    });
    const result = details(p);
    expect(sections(result)).toEqual([{ '#': ['Name: Rex', { '# Adresse': ['Strasse: Bahnhofstrasse 1', { '#': ['Breite: 46.9'] }] }] }]);
    const [root] = result.sections;
    const addressGroup = root.rows[1] as DetailsGroup;
    expect(root.depth).toBe(0);
    expect(addressGroup.depth).toBe(1);
    expect((addressGroup.rows[1] as DetailsGroup).depth).toBe(2);
    expect(addressGroup.nodeId).toBe(p.root.children[1].id);
  });

  it('drops a root with only groups, recursively, so each group becomes its own titled section', () => {
    const inner = newGroupLink('inner', { labels: { [DE]: 'Innen' }, group: group(newAttribute('a', { source: ['a'] })) });
    const outer = newGroupLink('outer', { labels: { [DE]: 'Aussen' }, group: group(inner) });
    const other = newGroupLink('other', { labels: { [DE]: 'Andere' }, group: group(newAttribute('b', { source: ['b'] })) });
    expect(sections(details(project([outer, other], { a: 1, b: 2 })))).toEqual([{ '# Innen': ['["a"]: 1'] }, { '# Andere': ['["b"]: 2'] }]);
  });

  it('keeps the title of a group whose source is missing, with no rows', () => {
    expect(sections(details(project([newAttribute('name'), address()], { name: 'Rex' })))).toEqual([
      { '#': ['["name"]: Rex', { '# Adresse': [{ '#': [] }] }] },
    ]);
  });
});

describe('order', () => {
  const children = () => [
    newAttribute('a', { source: ['a'] }),
    newGroupLink('g', { labels: { [DE]: 'G' }, group: group(newAttribute('c', { source: ['c'] })) }),
    newAttribute('b', { source: ['b'] }),
  ];
  const sample = { a: 'A', b: 'B', c: 'C' };

  it('sorts claims and groups together by the Order overlay', () => {
    const p = project(children(), sample);
    expect(sections(details(p))).toEqual([{ '#': ['["a"]: A', { '# G': ['["c"]: C'] }, '["b"]: B'] }]);
    const orders = { a: 3, g: 1, b: 2 };
    expect(sections(details(p, { orders: (g) => (g === p.root ? orders : undefined) }))).toEqual([
      { '#': [{ '# G': ['["c"]: C'] }, '["b"]: B', '["a"]: A'] },
    ]);
  });

  it('puts unordered claims last (32767) and unordered groups first (-1)', () => {
    const p = project(children(), sample);
    const result = details(p, { orders: (g) => (g === p.root ? { b: 1 } : undefined) });
    expect(sections(result)).toEqual([{ '#': [{ '# G': ['["c"]: C'] }, '["b"]: B', '["a"]: A'] }]);
    expect(result.orderUndefined).toBe(false);
  });

  it('keeps the project order and flags it as undefined without an Order overlay', () => {
    const p = project([newAttribute('a', { source: ['a'] }), newAttribute('b', { source: ['b'] })], { a: 'A', b: 'B' });
    const result = details(p, { orders: () => undefined });
    expect(sections(result)).toEqual([{ '#': ['["a"]: A', '["b"]: B'] }]);
    expect(result.orderUndefined).toBe(true);
    expect(result.sections[0].orderUndefined).toBe(true);
    expect(details(p).orderUndefined).toBe(false);
  });
});

describe('labels and language', () => {
  it('takes the first preferred language that prefix-matches a label', () => {
    const p = project([newAttribute('name', { labels: { [DE]: 'Name', [FR]: 'Nom' } })], { name: 'Rex' });
    expect(claims(details(p, { languages: ['it', 'fr', 'de'] }).sections[0].rows)[0].label).toBe('Nom');
    expect(claims(details(p, { languages: ['de', 'fr'] }).sections[0].rows)[0].label).toBe('Name');
  });

  it("falls back to the first label's language when no preferred language matches", () => {
    const p = project([newAttribute('name', { labels: { [FR]: 'Nom' } })], { name: 'Rex' });
    expect(claims(details(p, { languages: ['en'] }).sections[0].rows)[0].label).toBe('Nom');
  });

  it('builds the language codes iOS uses: device languages without region, then English', () => {
    expect(iosLanguageCodes(['fr-CH', 'de'])).toEqual(['fr', 'de', 'en']);
  });

  it('shows the claims path as JSON for an attribute without a label, escaping slashes', () => {
    const p = project([newAttribute('given_name'), newAttribute('a/b', { source: ['a/b'] })], { given_name: 'Rex', 'a/b': 'x' });
    expect(claims(details(p).sections[0].rows).map((claim) => claim.label)).toEqual(['["given_name"]', '["a\\/b"]']);
  });

  it('replaces an entry code with its label in the chosen language', () => {
    const colour = newAttribute('colour', {
      labels: { [DE]: 'Farbe', [FR]: 'Couleur' },
      entries: { codes: ['br'], labels: { [DE]: { br: 'Braun' }, [FR]: { br: 'Brun' } } },
    });
    const [claim] = claims(details(project([colour], { colour: 'br' }), { languages: ['fr'] }).sections[0].rows);
    expect(claim.label).toBe('Couleur');
    expect(claim.value).toEqual({ kind: 'entry', code: 'br', label: 'Brun' });
  });

  it('keeps the code when the chosen language has a label but no entry translation', () => {
    const colour = newAttribute('colour', {
      labels: { [DE]: 'Farbe' },
      entries: { codes: ['br'], labels: { [FR]: { br: 'Brun' } } },
    });
    const [claim] = claims(details(project([colour], { colour: 'br' })).sections[0].rows);
    expect(claim).toMatchObject({ label: 'Farbe', value: { kind: 'raw', value: 'br' } });
  });

  it('falls back to the path label when the chosen language only translates the entry (wallet quirk)', () => {
    const colour = newAttribute('colour', {
      labels: { [DE]: 'Farbe' },
      entries: { codes: ['br'], labels: { [FR]: { br: 'Brun' } } },
    });
    const [claim] = claims(details(project([colour], { colour: 'br' }), { languages: ['fr'] }).sections[0].rows);
    expect(claim).toMatchObject({ label: '["colour"]', value: { kind: 'entry', label: 'Brun' } });
  });
});

describe('entries on dates', () => {
  it('matches iOS entry codes against the ISO 8601 form of a date', () => {
    const born = (value: string) =>
      claims(
        details(
          project(
            [
              newAttribute('born', {
                type: 'DateTime',
                labels: { [DE]: 'Geboren' },
                entries: { codes: ['2024-01-05T00:00:00Z', '2024-01-06'], labels: { [DE]: { '2024-01-05T00:00:00Z': 'Erster', '2024-01-06': 'Zweiter' } } },
              }),
            ],
            { born: value },
          ),
        ).sections[0].rows,
      )[0].value;
    expect(born('2024-01-05')).toEqual({ kind: 'entry', code: '2024-01-05T00:00:00Z', label: 'Erster' });
    expect(born('2024-01-06')).toEqual({ kind: 'raw', value: '2024-01-06' });
  });
});

describe('sensitive', () => {
  it('carries the attribute flag to the row, unmasked', () => {
    const p = project([newAttribute('id', { sensitive: true }), newAttribute('name')], { id: '756.1234', name: 'Rex' });
    expect(claims(details(p).sections[0].rows).map((claim) => [claim.sensitive, valueText(claim)])).toEqual([
      [true, '756.1234'],
      [false, 'Rex'],
    ]);
  });

  it("marks a section's rows and a group's sub-group rows, but not a nested group's own rows (wallet quirk)", () => {
    const deep = newGroupLink('deep', { group: group(newAttribute('c', { source: ['c'] })) });
    const nested = newGroupLink('nested', { sensitive: true, group: group(newAttribute('b', { source: ['b'] }), deep) });
    const p = project([newAttribute('a', { source: ['a'] }), nested], { a: 1, b: 2, c: 3 });
    expect(claims(details(p).sections[0].rows).map((claim) => [claim.label, claim.sensitive])).toEqual([
      ['["a"]', false],
      ['["b"]', false],
      ['["c"]', true],
    ]);
    // Once the root is dropped, the group is a section and marks its own rows.
    const alone = project([nested], { b: 2, c: 3 });
    expect(claims(details(alone).sections[0].rows).every((claim) => claim.sensitive)).toBe(true);
  });
});

describe('values from the sample', () => {
  it('passes the raw value with the type and standard for formatting', () => {
    const born = newAttribute('born', { type: 'DateTime', standard: 'urn:iso:std:iso:8601', source: ['born'] });
    const [claim] = claims(details(project([born], { born: '2020-01-02' })).sections[0].rows);
    expect(claim).toMatchObject({
      value: { kind: 'raw', value: '2020-01-02' },
      format: { type: 'DateTime', standard: 'urn:iso:std:iso:8601' },
      attributeId: born.id,
      path: ['born'],
    });
  });

  it('drops the row of a claim the sample lacks or holds as null, object or list', () => {
    const p = project(['a', 'b', 'c', 'd', 'e'].map((key) => newAttribute(key)), { a: 'A', c: null, d: { x: 1 }, e: [] });
    // The object's own value is left over and listed with the claims that have no attribute.
    expect(sections(details(p))).toEqual([{ '#': ['["d","x"]: 1'] }, { '#': ['["a"]: A'] }]);
  });

  it('shows type placeholders and reports noSample without a sample', () => {
    const p = project([
      newAttribute('name', { labels: { [DE]: 'Name' } }),
      newAttribute('age', { type: 'Numeric', source: ['person', 'age'] }),
      newAttribute('tags', { type: { array: 'Text' }, source: ['tags', null], labels: { [DE]: 'Tags' } }),
    ]);
    const result = details(p);
    expect(result.noSample).toBe(true);
    expect(sections(result)).toEqual([{ '#': ['Name: ‹Text›', '["person","age"]: ‹Numeric›', { '# Tags': ['["tags",0]: ‹Text›'] }] }]);
    expect(details(project([], {})).noSample).toBe(false);
  });
});

describe('arrays', () => {
  it('lists the values of an Array attribute under its label, without row labels', () => {
    const tags = newAttribute('tags', { type: { array: 'Text' }, source: ['tags', null], labels: { [DE]: 'Tags' } });
    // The root holds only the list, so the list becomes the section.
    const [list] = details(project([tags], { tags: ['a', 'b'] })).sections;
    expect(list).toMatchObject({ title: 'Tags', depth: 0, valuesOnly: true, path: ['tags', null], nodeId: tags.id });
    expect(claims(list.rows)).toMatchObject([
      { path: ['tags', 0], value: { kind: 'raw', value: 'a' }, attributeId: tags.id },
      { path: ['tags', 1], value: { kind: 'raw', value: 'b' } },
    ]);
    expect(claims(list.rows)[0].format).toBeUndefined();
  });

  it('gives an array of refs: groups one titled group per element, in an untitled wrapper', () => {
    const pets = newGroupLink('pets', {
      array: true,
      source: ['pets', null],
      labels: { [DE]: 'Tier' },
      group: group(newAttribute('name', { source: ['pets', null, 'name'], labels: { [DE]: 'Name' } })),
    });
    const result = details(project([newAttribute('owner'), pets], { owner: 'Ann', pets: [{ name: 'Rex' }, { name: 'Bello' }] }));
    expect(sections(result)).toEqual([{ '#': ['["owner"]: Ann', { '#': [{ '# Tier': ['Name: Rex'] }, { '# Tier': ['Name: Bello'] }] }] }]);
    expect(claims(result.sections[0].rows).map((claim) => claim.path)).toEqual([['owner'], ['pets', 0, 'name'], ['pets', 1, 'name']]);
  });
});

describe('templates in group titles', () => {
  const ZURICH = { locale: 'de-CH', timeZone: 'Europe/Zurich' };
  const pet = () =>
    newGroupLink('pet', {
      source: ['pet'],
      labels: { [DE]: 'Tier {{pet.name}}, {{pet.born}}{{nope}}' },
      group: group(
        newAttribute('name', { source: ['pet', 'name'], labels: { [DE]: 'Name' } }),
        newAttribute('born', { type: 'DateTime', source: ['pet', 'born'], labels: { [DE]: 'Geboren' } }),
      ),
    });
  const titles = (result: CredentialDetails): string[] => {
    const all: string[] = [];
    const visit = (group: DetailsGroup) => {
      if (group.title) all.push(group.title);
      group.rows.forEach((row) => row.kind === 'group' && visit(row));
    };
    result.sections.forEach(visit);
    return all;
  };

  it('fills them with the claim values, formatted on iOS and as stored on Android, and empties unknown ones', () => {
    const p = project([newAttribute('owner'), pet()], { owner: 'Ann', pet: { name: 'Rex', born: '2024-01-05' } });
    expect(titles(details(p, { valueOptions: ZURICH }))).toEqual(['Tier Rex, 05.01.24']);
    expect(titles(details(p, { platform: 'android', languages: ['de-CH'] }))).toEqual(['Tier Rex, 2024-01-05']);
  });

  it('takes list indices from the group, an [n] index, and joins several values', () => {
    const pets = newGroupLink('pets', {
      array: true,
      source: ['pets', null],
      labels: { [DE]: 'Tier {{pets.name}} (1: {{pets.name[1]}})' },
      group: group(newAttribute('name', { source: ['pets', null, 'name'], labels: { [DE]: 'Name' } })),
    });
    const all = newGroupLink('all', { labels: { [DE]: "Alle: {{/pets.name.join(' & ')}}" }, group: group(newAttribute('x')) });
    const p = project([pets, all], { pets: [{ name: 'Rex' }, { name: 'Bello' }], x: 1 });
    expect(titles(details(p)).sort()).toEqual(['Alle: Rex & Bello', 'Tier Bello (1: Bello)', 'Tier Rex (1: Bello)']);
  });

  it('shows the label of an attribute without a sample value, and drops a title that ends up empty', () => {
    const empty = newGroupLink('empty', { labels: { [DE]: '{{missing}}' }, group: group(newAttribute('y')) });
    expect(titles(details(project([newAttribute('owner'), pet(), empty])))).toEqual(['Tier ‹Name›, ‹Geboren›']);
  });
});

describe('claims without an attribute', () => {
  const sample = { iss: 'did:x', vct: 'v', cnf: {}, status: {}, iat: 1, name: 'Rex', sub: 's', extra: { deep: true } };

  it('lists them by path in an untitled section, first on the details screen and last on the offer', () => {
    const p = project([newAttribute('name', { labels: { [DE]: 'Name' } })], sample);
    expect(sections(details(p))).toEqual([{ '#': ['["sub"]: s', '["extra","deep"]: true'] }, { '#': ['Name: Rex'] }]);
    const offer = details(p, { screen: 'offer' });
    expect(sections(offer)).toEqual([{ '#': ['Name: Rex'] }, { '#': ['["sub"]: s', '["extra","deep"]: true'] }]);
    expect(offer.sections[1].unmapped).toBe(true);
    expect(offer.orderUndefined).toBe(true);
  });

  it('never lists the JWT claims', () => {
    const labels = claims(details(project([], sample)).sections.flatMap((section) => section.rows)).map((claim) => claim.label);
    for (const technical of ['iss', 'vct', 'cnf', 'status', 'iat']) expect(labels).not.toContain(`["${technical}"]`);
  });
});

describe('Android rules', () => {
  const android = (p: Project, options: Partial<DetailsOptions> = {}) => details(p, { platform: 'android', languages: ['de-CH'], ...options });

  it('puts unordered claims and groups last, claims first, with a defined order', () => {
    const p = project(
      [
        newAttribute('a', { source: ['a'] }),
        newGroupLink('g', { labels: { [DE]: 'G' }, group: group(newAttribute('c', { source: ['c'] })) }),
        newAttribute('b', { source: ['b'] }),
      ],
      { a: 'A', b: 'B', c: 'C' },
    );
    const result = android(p, { orders: (g) => (g === p.root ? { b: 1 } : undefined) });
    expect(sections(result)).toEqual([{ '#': ['["b"]: B', '["a"]: A', { '# G': ['["c"]: C'] }] }]);
    expect(result.orderUndefined).toBe(false);
    const unordered = android(p, { orders: () => undefined });
    expect(sections(unordered)).toEqual([{ '#': ['["a"]: A', '["b"]: B', { '# G': ['["c"]: C'] }] }]);
    expect(unordered.orderUndefined).toBe(false);
  });

  it('lists the claims without an attribute last, on the details screen too', () => {
    const p = project([newAttribute('name', { labels: { [DE]: 'Name' } })], { name: 'Rex', sub: 's' });
    expect(sections(android(p))).toEqual([{ '#': ['Name: Rex'] }, { '#': ['["sub"]: s'] }]);
  });

  it('keeps a null claim as a row and drops objects and lists', () => {
    const p = project(['a', 'b', 'c', 'd', 'e'].map((key) => newAttribute(key)), { a: 'A', c: null, d: { x: 1 }, e: [], f: null });
    expect(sections(android(p))).toEqual([{ '#': ['["a"]: A', '["c"]: –'] }, { '#': ['["d","x"]: 1', '["f"]: –'] }]);
  });

  it('drops a group with no claims below it', () => {
    const address = newGroupLink('address', {
      source: ['address'],
      labels: { [DE]: 'Adresse' },
      group: group(newAttribute('street', { source: ['address', 'street'] })),
    });
    expect(sections(android(project([newAttribute('name'), address], { name: 'Rex' })))).toEqual([{ '#': ['["name"]: Rex'] }]);
    expect(android(project([address], {})).sections).toEqual([]);
  });

  it("marks every row below a nested sensitive group, and ignores a section's flag (wallet quirk)", () => {
    const deep = newGroupLink('deep', { group: group(newAttribute('c', { source: ['c'] })) });
    const nested = newGroupLink('nested', { sensitive: true, group: group(newAttribute('b', { source: ['b'] }), deep) });
    const p = project([newAttribute('a', { source: ['a'] }), nested], { a: 1, b: 2, c: 3 });
    expect(claims(android(p).sections[0].rows).map((claim) => [claim.label, claim.sensitive])).toEqual([
      ['["a"]', false],
      ['["b"]', true],
      ['["c"]', true],
    ]);
    expect(claims(android(project([nested], { b: 2, c: 3 })).sections[0].rows).some((claim) => claim.sensitive)).toBe(false);
  });

  it('picks the app locale, then its language, then exactly de or en, then the path', () => {
    const regional = project([newAttribute('name', { labels: { [DE]: 'Name', [FR]: 'Nom' } })], { name: 'Rex' });
    const label = (p: Project, locale: string) => claims(android(p, { languages: [locale] }).sections[0].rows)[0].label;
    expect(label(regional, 'fr')).toBe('Nom');
    expect(label(regional, 'de-CH')).toBe('Name');
    // No label in Italian, de or en: the path display wins over de-CH and fr-CH.
    expect(label(regional, 'it')).toBe('["name"]');
    const bare = project([newAttribute('name', { labels: { fr: 'Nom', en: 'Name' } })], { name: 'Rex' }, ['fr', 'en']);
    expect(label(bare, 'it')).toBe('Name');
  });

  it('titles a group with its first label when no language matches, never the path', () => {
    const g = newGroupLink('g', { labels: { [FR]: 'Groupe' }, group: group(newAttribute('a', { source: ['a'] })) });
    expect(android(project([newAttribute('b'), g], { a: 1, b: 2 }), { languages: ['it'] }).sections[0].rows[1]).toMatchObject({ title: 'Groupe' });
  });

  it('builds the app locale from the device languages, else en-CH', () => {
    expect(androidAppLocale(['es', 'fr-CH', 'de'])).toBe('fr-CH');
    expect(androidAppLocale(['es'])).toBe('en-CH');
  });

  it('shows the path without escaping slashes, and matches entry codes against true and false', () => {
    const vaccinated = newAttribute('vaccinated', {
      type: 'Boolean',
      labels: { [DE]: 'Geimpft' },
      entries: { codes: ['true'], labels: { [DE]: { true: 'Ja' } } },
    });
    const p = project([newAttribute('a/b', { source: ['a/b'] }), vaccinated], { 'a/b': 'x', vaccinated: true });
    expect(outline(android(p).sections[0].rows)).toEqual(['["a/b"]: x', 'Geimpft: Ja']);
    expect(outline(details(p).sections[0].rows)).toEqual(['["a\\/b"]: x', 'Geimpft: true']);
  });

  it('turns an Array[refs:] attribute whose value is not a list into its group, which iOS shows as a row', () => {
    const people = newGroupLink('people', { array: true, source: ['people'], labels: { [DE]: 'Leute' }, group: group(newAttribute('name', { source: ['people', null, 'name'] })) });
    const p = project([newAttribute('owner'), people], { owner: 'Ann', people: 'oops' });
    // Android: the value is used up, and the group without claims is dropped.
    expect(sections(android(p))).toEqual([{ '#': ['["owner"]: Ann'] }]);
    expect(sections(details(p))).toEqual([{ '#': ['["owner"]: Ann', '["people"]: oops'] }]);
  });

  it('keeps the claims without an attribute in payload order, list elements included', () => {
    const p = project([newAttribute('name', { labels: { [DE]: 'Name' } })], { name: 'Rex', zzz: 'x', tags: ['a', 'b'], other: ['c'] });
    expect(sections(android(p))[1]).toEqual({ '#': ['["zzz"]: x', '["tags",0]: a', '["tags",1]: b', '["other",0]: c'] });
    // iOS sorts them by their last index, else 32767.
    expect(sections(details(p))[0]).toEqual({ '#': ['["tags",0]: a', '["other",0]: c', '["tags",1]: b', '["zzz"]: x'] });
  });

  it("hides a group's own claims when one is an image it cannot decode, but keeps its sub-groups", () => {
    const photo = newAttribute('photo', { standard: 'urn:ietf:rfc:2397', source: ['photo'] });
    const inner = newGroupLink('inner', { labels: { [DE]: 'Innen' }, group: group(newAttribute('c', { source: ['c'] })) });
    const p = project([newAttribute('a', { source: ['a'] }), photo, inner], { a: 'A', photo: 'data:image/png;base64,iVBORw0KGgo\nAAAAN', c: 'C' });
    expect(sections(android(p))).toEqual([{ '#': [{ '# Innen': ['["c"]: C'] }] }]);
    // iOS refuses such a credential; the preview shows the row and says so.
    expect(claims(details(p).sections[0].rows).map((claim) => claim.label)).toContain('["photo"]');
  });

  it('falls back to the path label when the app language only translates the entry, as iOS does', () => {
    const colour = newAttribute('colour', { labels: { [DE]: 'Farbe' }, entries: { codes: ['br'], labels: { [FR]: { br: 'Brun' } } } });
    const [claim] = claims(android(project([colour], { colour: 'br' }), { languages: ['fr-CH'] }).sections[0].rows);
    expect(claim).toMatchObject({ label: '["colour"]', value: { kind: 'entry', label: 'Brun' } });
  });
});
