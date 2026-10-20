import { describe, expect, it } from 'vitest';
import catalogueResponse from '../../test/fixtures/i14y-catalogue.json';
import concepts from '../../test/fixtures/i14y-concepts.json';
import search from '../../test/fixtures/i14y-search-geschlecht.json';
import { buildBundle, serializeBundle } from '../export/bundle';
import { type AttributeNode, KNOWN_STANDARDS, emptyProject, newAttribute, newGroupLink } from '../model';
import { insertNode } from '../operations';
import {
  type I14yConcept,
  type I14yHit,
  addConcepts,
  clearLink,
  compareWithI14y,
  fillFromConcept,
  i14yLabel,
  i14yValueLabel,
  linkConcept,
  matchConcepts,
  parseCatalogue,
  parseConcept,
  parseSearchResults,
  pendingLinks,
  suggestLinks,
} from './i14y';
import { ImportError } from './report';

const LANGUAGES = ['de-CH', 'fr-CH', 'it-CH', 'rm-CH', 'en-GB'];
const sex = parseConcept(concepts.sex);
const dateOfBirth = parseConcept(concepts.dateOfBirth);
const firstName = parseConcept(concepts.personFirstName);
const ahvn = parseConcept(concepts.ahvn13);

function addToRoot(conceptList: I14yConcept[], languages = LANGUAGES) {
  const project = emptyProject(languages);
  const result = addConcepts(project, project.root.id, conceptList);
  return { project, ...result };
}

describe('addConcepts', () => {
  it('turns a code list into a text attribute with translated labels and values', () => {
    const { project, nodes } = addToRoot([sex]);
    expect(project.root.children).toEqual(nodes);
    const [attribute] = nodes;
    expect(attribute).toMatchObject({ key: 'sex', type: 'Text', source: ['sex'], sensitive: false });
    expect(attribute.labels).toEqual({ 'de-CH': 'Geschlecht', 'fr-CH': 'Sexe', 'it-CH': 'Sesso', 'en-GB': 'Sex' });
    expect(attribute.entries?.codes).toEqual(['1', '2', '3']);
    expect(attribute.entries?.labels['fr-CH']).toEqual({ '1': 'Masculin', '2': 'Féminin', '3': 'Indéterminé' });
    expect(attribute.entries?.labels['rm-CH']).toEqual({});
  });

  it('types dates as ISO 8601 date-times and numbers as numeric', () => {
    const { nodes } = addToRoot([dateOfBirth, ahvn, firstName]);
    expect(nodes.map(({ key, type, standard }) => ({ key, type, standard }))).toEqual([
      { key: 'dateOfBirth', type: 'DateTime', standard: KNOWN_STANDARDS.iso8601 },
      { key: 'AHVN13', type: 'Numeric', standard: undefined },
      { key: 'personFirstName', type: 'Text', standard: undefined },
    ]);
    expect(nodes[0].entries).toBeUndefined();
  });

  it('collapses line breaks and repeated spaces in I14Y text', () => {
    const { nodes } = addToRoot([firstName]);
    expect(nodes[0].labels['fr-CH']).toBe('Prénoms officiel');
  });

  it('reports the languages I14Y has no text for', () => {
    const { report } = addToRoot([sex, dateOfBirth], ['de-CH', 'rm-CH', 'es-ES']);
    expect(report).toEqual([
      { level: 'warning', message: 'sex: I14Y has no text in rm-CH, es-ES. Fill it in the Translations view.' },
      { level: 'warning', message: 'dateOfBirth: I14Y has no text in rm-CH, es-ES. Fill it in the Translations view.' },
    ]);
  });

  it('reports nothing when every language is covered', () => {
    expect(addToRoot([sex], ['de-CH', 'en-GB']).report).toEqual([]);
  });

  it('keeps keys unique and free of characters the bundle forbids', () => {
    const project = emptyProject(['de-CH']);
    insertNode(project, project.root.id, newAttribute('sex'));
    const oid = { ...sex, identifier: '2.16.840.1.113883.4.642.3.1' };
    const { nodes } = addConcepts(project, project.root.id, [sex, oid, sex]);
    expect(nodes.map((node) => node.key)).toEqual(['sex_2', '2_16_840_1_113883_4_642_3_1', 'sex_3']);
  });

  it('adds to the given group under its source path', () => {
    const project = emptyProject(['de-CH']);
    const person = newGroupLink('person', { source: ['person'] });
    insertNode(project, project.root.id, person);
    const { nodes } = addConcepts(project, person.group.id, [dateOfBirth]);
    expect(person.group.children).toEqual(nodes);
    expect(nodes[0].source).toEqual(['person', 'dateOfBirth']);
  });
});

describe('parseConcept', () => {
  it('reads the identifier, name, type, status, publisher and code list entries', () => {
    expect(sex).toMatchObject({ id: '86365acd-3ad1-40a3-a76a-447653a4da6f', identifier: 'sex', conceptType: 'CodeList', registrationStatus: 'Standard' });
    expect(sex.publisher.fr).toBe('Office Fédéral de la Statistique (OFS)');
    expect(sex.name.de).toBe('Geschlecht');
    expect(sex.entries).toHaveLength(3);
    expect(dateOfBirth.entries).toEqual([]);
  });

  it('rejects a response that is not a concept', () => {
    expect(() => parseConcept({ data: { id: 'x' } })).toThrow(ImportError);
    expect(() => parseConcept('nope')).toThrow(ImportError);
  });
});

describe('parseSearchResults', () => {
  it('hides retired and superseded concepts and lists official standards first', () => {
    const hits = parseSearchResults(search);
    expect(hits.map((hit) => `${hit.identifier} ${hit.registrationStatus}`)).toEqual([
      'AHVN13 PreferredStandard',
      'sex Standard',
      'AHVN13 Qualified',
      '2.16.840.1.113883.4.642.3.1 Recorded',
      'COUPLE_GENDER_CONST Recorded',
    ]);
  });

  it('keeps the name and publisher of each hit', () => {
    const sexHit = parseSearchResults(search).find((hit) => hit.identifier === 'sex');
    expect(sexHit).toMatchObject({ id: '86365acd-3ad1-40a3-a76a-447653a4da6f', conceptType: 'CodeList' });
    expect(sexHit?.name.en).toBe('Sex');
    expect(sexHit?.publisher.de).toBe('Bundesamt für Statistik (BFS)');
  });

  it('returns no hits for a malformed response', () => {
    expect(parseSearchResults({ nothing: true })).toEqual([]);
  });
});

describe('parseCatalogue', () => {
  it('keeps one entry per identifier, the most authoritative one', () => {
    const catalogue = parseCatalogue(catalogueResponse);
    expect(catalogue.map((hit) => `${hit.identifier} ${hit.registrationStatus}`).sort()).toEqual([
      'AHVN13 PreferredStandard',
      'HGDE_KT Recorded',
      'dateOfBirth Standard',
      'personFirstName Standard',
      'personOfficialName Standard',
      'religion Standard',
      'sex Standard',
    ]);
  });

  it('returns nothing for a malformed response', () => {
    expect(parseCatalogue('nope')).toEqual([]);
  });
});

describe('matchConcepts', () => {
  const catalogue = parseCatalogue(catalogueResponse);
  const identifiers = (query: string) => matchConcepts(catalogue, query).map((hit) => hit.identifier);

  it('matches names in any language and identifiers', () => {
    expect(identifiers('geschl')).toEqual(['sex']);
    expect(identifiers('Date of b')).toEqual(['dateOfBirth']);
    expect(identifiers('AHVN')).toEqual(['AHVN13']);
  });

  it('ignores case and accents', () => {
    expect(identifiers('ZUGEHORIGKEIT')).toEqual(['religion']);
  });

  it('matches words inside camel-case identifiers', () => {
    expect(identifiers('officialname')).toEqual(['personOfficialName']);
    expect(identifiers('birth')).toEqual(['dateOfBirth']);
  });

  it('needs two characters', () => {
    expect(identifiers('g')).toEqual([]);
  });

  it('ranks exact matches, then prefixes, then word starts, then the rest', () => {
    const hit = (identifier: string): I14yHit => ({ id: identifier, identifier, name: {}, conceptType: 'String', registrationStatus: 'Recorded', publisher: {} });
    const list = [hit('rebirthCount'), hit('dateOfBirth'), hit('birthPlace'), hit('birth')];
    expect(matchConcepts(list, 'birth').map((entry) => entry.identifier)).toEqual(['birth', 'birthPlace', 'dateOfBirth', 'rebirthCount']);
  });

  it('lists at most `limit` concepts', () => {
    expect(matchConcepts(catalogue, 'e', { limit: 3 })).toEqual([]);
    expect(matchConcepts(catalogue, 'er', { limit: 3 })).toHaveLength(3);
  });

  it('matches names only in the given language', () => {
    const inLanguage = (query: string, language: 'de' | 'fr') => matchConcepts(catalogue, query, { language }).map((hit) => hit.identifier);
    expect(inLanguage('geschl', 'de')).toEqual(['sex']);
    expect(inLanguage('geschl', 'fr')).toEqual([]);
    expect(inLanguage('sexe', 'fr')).toEqual(['sex']);
  });

  it('matches every name of a concept that has none in the given language', () => {
    const hit = (identifier: string, name: I14yHit['name']): I14yHit => ({ id: identifier, identifier, name, conceptType: 'Date', registrationStatus: 'Standard', publisher: {} });
    const list = [hit('dateOfBirth', { de: 'Geburtsdatum', rm: 'Data da naschientscha' }), hit('birthPlace', { de: 'Geburtsort' })];
    expect(matchConcepts(list, 'geburt', { language: 'rm' }).map((entry) => entry.identifier)).toEqual(['birthPlace']);
  });

  it('leaves identifiers out when asked', () => {
    expect(matchConcepts(catalogue, 'personOfficial', { identifier: false })).toEqual([]);
    expect(matchConcepts(catalogue, 'personOfficial').map((hit) => hit.identifier)).toEqual(['personOfficialName']);
  });
});

describe('fillFromConcept', () => {
  function projectWith(attribute: AttributeNode, languages = ['de-CH', 'fr-CH', 'en-GB']) {
    const project = emptyProject(languages);
    insertNode(project, project.root.id, attribute);
    return project;
  }
  const attributeIn = (project: ReturnType<typeof projectWith>, id: string) => project.root.children.find((node) => node.id === id) as AttributeNode;

  it('fills empty labels and keeps the ones already written', () => {
    const node = newAttribute('dob', { labels: { 'de-CH': 'Geb. Datum' } });
    const project = projectWith(node);
    fillFromConcept(project, node.id, dateOfBirth);
    expect(attributeIn(project, node.id).labels).toEqual({ 'de-CH': 'Geb. Datum', 'fr-CH': 'Date de naissance', 'en-GB': 'Date of birth' });
  });

  it('replaces the label being typed when the suggestion was picked from it', () => {
    const node = newAttribute('dob', { labels: { 'de-CH': 'Gebu' } });
    const project = projectWith(node);
    fillFromConcept(project, node.id, dateOfBirth, { replaceLabelIn: 'de-CH' });
    expect(attributeIn(project, node.id).labels['de-CH']).toBe('Geburtsdatum');
  });

  it('sets the type and format from the concept', () => {
    const node = newAttribute('dob');
    const project = projectWith(node);
    fillFromConcept(project, node.id, dateOfBirth);
    expect(attributeIn(project, node.id)).toMatchObject({ type: 'DateTime', standard: KNOWN_STANDARDS.iso8601 });
    fillFromConcept(project, node.id, firstName);
    expect(attributeIn(project, node.id).type).toBe('Text');
    expect(attributeIn(project, node.id).standard).toBeUndefined();
  });

  it('replaces a placeholder key and its source path', () => {
    const node = newAttribute('attribute_2', { source: ['attribute_2'] });
    const project = projectWith(node);
    fillFromConcept(project, node.id, dateOfBirth);
    expect(attributeIn(project, node.id)).toMatchObject({ key: 'dateOfBirth', source: ['dateOfBirth'] });
  });

  it('keeps a key the issuer chose unless the suggestion was picked from the key field', () => {
    const node = newAttribute('dob', { source: ['dob'] });
    const project = projectWith(node);
    fillFromConcept(project, node.id, dateOfBirth);
    expect(attributeIn(project, node.id).key).toBe('dob');
    fillFromConcept(project, node.id, dateOfBirth, { replaceKey: true });
    expect(attributeIn(project, node.id)).toMatchObject({ key: 'dateOfBirth', source: ['dob'] });
  });

  it('keeps keys unique among siblings without renaming a key that already fits', () => {
    const node = newAttribute('attribute');
    const project = projectWith(node);
    insertNode(project, project.root.id, newAttribute('sex'));
    fillFromConcept(project, node.id, sex);
    expect(attributeIn(project, node.id).key).toBe('sex_2');
    const own = newAttribute('sex');
    const other = projectWith(own);
    fillFromConcept(other, own.id, sex, { replaceKey: true });
    expect(attributeIn(other, own.id).key).toBe('sex');
  });

  it('adds the value list when the attribute has none', () => {
    const node = newAttribute('sex');
    const project = projectWith(node);
    fillFromConcept(project, node.id, sex);
    expect(attributeIn(project, node.id).entries).toEqual({
      codes: ['1', '2', '3'],
      labels: {
        'de-CH': { '1': 'Männlich', '2': 'Weiblich', '3': 'Unbestimmt' },
        'fr-CH': { '1': 'Masculin', '2': 'Féminin', '3': 'Indéterminé' },
        'en-GB': { '1': 'Male', '2': 'Female', '3': 'Undefined' },
      },
    });
  });

  it('keeps existing values and only fills their empty labels', () => {
    const node = newAttribute('sex', { entries: { codes: ['1', '2'], labels: { 'de-CH': { '1': 'Mann' } } } });
    const project = projectWith(node, ['de-CH', 'en-GB']);
    fillFromConcept(project, node.id, sex);
    expect(attributeIn(project, node.id).entries).toEqual({
      codes: ['1', '2'],
      labels: { 'de-CH': { '1': 'Mann', '2': 'Weiblich' }, 'en-GB': { '1': 'Male', '2': 'Female' } },
    });
  });

  it('reports the languages that are still empty', () => {
    const covered = newAttribute('dob', { labels: { 'rm-CH': 'Data da naschientscha' } });
    expect(fillFromConcept(projectWith(covered, ['de-CH', 'rm-CH']), covered.id, dateOfBirth)).toEqual([]);
    const node = newAttribute('sex');
    expect(fillFromConcept(projectWith(node, ['de-CH', 'rm-CH']), node.id, sex)).toEqual([
      { level: 'warning', message: 'sex: I14Y has no text in rm-CH. Fill it in the Translations view.' },
    ]);
  });
});

describe('I14Y link', () => {
  it('is kept on every attribute added from a concept', () => {
    const { nodes } = addToRoot([sex]);
    expect(nodes[0].i14y).toEqual({
      conceptId: '86365acd-3ad1-40a3-a76a-447653a4da6f',
      identifier: 'sex',
      registrationStatus: 'Standard',
      name: { de: 'Geschlecht', fr: 'Sexe', it: 'Sesso', en: 'Sex' },
      publisher: expect.objectContaining({ de: 'Bundesamt für Statistik (BFS)' }),
      values: {
        '1': { de: 'Männlich', fr: 'Masculin', it: 'Maschile', en: 'Male' },
        '2': { de: 'Weiblich', fr: 'Féminin', it: 'Femminile', en: 'Female' },
        '3': { de: 'Unbestimmt', fr: 'Indéterminé', it: 'Indeterminato', en: 'Undefined' },
      },
    });
  });

  it('is kept on an attribute filled from a concept', () => {
    const project = emptyProject(['de-CH']);
    const node = newAttribute('dob', { labels: { 'de-CH': 'Geb. Datum' } });
    insertNode(project, project.root.id, node);
    fillFromConcept(project, node.id, dateOfBirth);
    expect((project.root.children[0] as AttributeNode).i14y).toMatchObject({ identifier: 'dateOfBirth', values: {} });
  });

  it("gives I14Y's text for a label or value in a project language", () => {
    const [node] = addToRoot([sex]).nodes;
    expect(i14yLabel(node, 'fr-CH')).toBe('Sexe');
    expect(i14yValueLabel(node, 'en-GB', '2')).toBe('Female');
    expect(i14yLabel(node, 'rm-CH')).toBeUndefined();
    expect(i14yValueLabel(node, 'de-CH', '9')).toBeUndefined();
    expect(i14yLabel(newAttribute('sex', { labels: { 'de-CH': 'Geschlecht' } }), 'de-CH')).toBeUndefined();
  });

  it('tells whether a text still matches I14Y', () => {
    expect(compareWithI14y('Geschlecht', 'Geschlecht')).toBe('same');
    expect(compareWithI14y('Sex (official)', 'Geschlecht')).toBe('edited');
    expect(compareWithI14y('', 'Geschlecht')).toBe('empty');
    expect(compareWithI14y('Anything', undefined)).toBeUndefined();
  });

  it('is never exported in the bundle', async () => {
    const { project } = addToRoot([sex]);
    const json = serializeBundle((await buildBundle(project)).bundle);
    expect(json).toContain('Geschlecht');
    expect(json).not.toContain(sex.id);
    expect(json).not.toContain('i14y');
  });
});

describe('suggestLinks', () => {
  const catalogue = parseCatalogue(catalogueResponse);
  const LANGUAGES = ['de-CH', 'fr-CH'];
  const identifiers = (node: AttributeNode) => suggestLinks(node, catalogue, LANGUAGES).map((hit) => hit.identifier);
  const hit = (identifier: string, name: I14yHit['name']): I14yHit => ({ id: identifier, identifier, name, conceptType: 'String', registrationStatus: 'Standard', publisher: {} });

  it('suggests the concept whose identifier is the key, ignoring case and underscores', () => {
    expect(identifiers(newAttribute('date_of_birth'))).toEqual(['dateOfBirth']);
    expect(identifiers(newAttribute('SEX'))).toEqual(['sex']);
  });

  it('suggests a concept whose name is a label in the same language', () => {
    expect(identifiers(newAttribute('gender', { labels: { 'fr-CH': 'Sexe' } }))).toEqual(['sex']);
    expect(identifiers(newAttribute('gender', { labels: { 'de-CH': 'Sexe' } }))).toEqual([]);
  });

  it('ignores partial matches', () => {
    expect(identifiers(newAttribute('birth', { labels: { 'de-CH': 'Geburts' } }))).toEqual([]);
  });

  it('suggests nothing for an attribute that is already linked', () => {
    const [linked] = addToRoot([sex], LANGUAGES).nodes;
    expect(identifiers(linked)).toEqual([]);
  });

  it('lists the concepts that match on more points first', () => {
    const list = [hit('gender', {}), hit('sex', { de: 'Geschlecht', fr: 'Sexe' })];
    const node = newAttribute('gender', { labels: { 'de-CH': 'Geschlecht', 'fr-CH': 'Sexe' } });
    expect(suggestLinks(node, list, LANGUAGES).map((entry) => entry.identifier)).toEqual(['sex', 'gender']);
  });

  it('names a clear link only when one concept matches best', () => {
    const list = [hit('gender', {}), hit('sex', { de: 'Geschlecht' })];
    expect(clearLink(newAttribute('gender', { labels: { 'de-CH': 'Geschlecht' } }), list, LANGUAGES)).toBeUndefined();
    expect(clearLink(newAttribute('gender', { labels: { 'fr-CH': 'Genre' } }), list, LANGUAGES)?.identifier).toBe('gender');
  });
});

describe('linkConcept', () => {
  it('records the concept and leaves the texts, key and type alone', () => {
    const project = emptyProject(['de-CH']);
    const node = newAttribute('gender', { labels: { 'de-CH': 'Geschlecht (amtlich)' }, entries: { codes: ['1'], labels: { 'de-CH': { '1': 'Mann' } } } });
    insertNode(project, project.root.id, node);
    const before = structuredClone(node);
    linkConcept(project, node.id, sex);
    const linked = project.root.children[0] as AttributeNode;
    expect(linked.i14y?.identifier).toBe('sex');
    expect({ ...linked, i14y: undefined }).toEqual({ ...before, i14y: undefined });
  });
});

describe('pendingLinks', () => {
  it('lists the unlinked attributes that look like concepts, in structure order', () => {
    const catalogue = parseCatalogue(catalogueResponse);
    const project = emptyProject(['de-CH', 'fr-CH']);
    const person = newGroupLink('person', { source: ['person'] });
    insertNode(project, project.root.id, newAttribute('date_of_birth'));
    insertNode(project, project.root.id, person);
    insertNode(project, person.group.id, newAttribute('gender', { labels: { 'fr-CH': 'Sexe' } }));
    insertNode(project, project.root.id, newAttribute('permit_number', { labels: { 'de-CH': 'Bewilligungsnummer' } }));
    addConcepts(project, project.root.id, [sex]);

    const pending = pendingLinks(project, catalogue);
    expect(pending.map(({ path, hits, clear }) => ({ path, hits: hits.map((hit) => hit.identifier), clear: clear?.identifier }))).toEqual([
      { path: 'date_of_birth', hits: ['dateOfBirth'], clear: 'dateOfBirth' },
      { path: 'person.gender', hits: ['sex'], clear: 'sex' },
    ]);
    expect(pending[0].nodeId).toBe(project.root.children[0].id);
  });
});
