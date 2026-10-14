import { describe, expect, it } from 'vitest';
import { type AttributeNode, type GroupLink, KNOWN_STANDARDS } from '../model';
import { ImportError } from './report';
import { importSample, inferPrimitive, parseSampleText } from './sample';

const sample = {
  iss: 'did:tdw:example',
  vct: 'https://example.ch/vct/pet-permit',
  cnf: { jwk: {} },
  firstname: 'Seraina',
  birth_date: '1988-04-05',
  height: 1.72,
  over_18: true,
  portrait: 'data:image/png;base64,iVBORw0KGgo=',
  middle_name: null,
  nationalities: ['CH', 'FR'],
  address: { street: 'Bundesplatz 3', city: 'Bern' },
  pets: [
    { name: 'Rex', race: 'Dog' },
    { name: 'Mr. Pineapple', microchip: 4711 },
  ],
};

describe('inferPrimitive', () => {
  it('maps JSON values to OCA types', () => {
    expect(inferPrimitive(3)).toEqual({ type: 'Numeric' });
    expect(inferPrimitive(false)).toEqual({ type: 'Boolean' });
    expect(inferPrimitive('2007-04-05T14:30:40Z')).toEqual({ type: 'DateTime', standard: KNOWN_STANDARDS.iso8601 });
    expect(inferPrimitive('data:image/jpeg;base64,/9j/')).toEqual({ type: 'Text', standard: KNOWN_STANDARDS.dataUrl });
    expect(inferPrimitive('Bern')).toEqual({ type: 'Text' });
    expect(inferPrimitive(null)).toEqual({ type: 'Text' });
  });
});

describe('importSample', () => {
  const { project, report } = importSample(sample, ['de-CH', 'en-GB']);
  const byKey = (key: string) => project.root.children.find((child) => child.key === key)!;

  it('skips technical claims and keeps the sample', () => {
    expect(project.root.children.map((child) => child.key)).toEqual([
      'firstname',
      'birth_date',
      'height',
      'over_18',
      'portrait',
      'middle_name',
      'nationalities',
      'address',
      'pets',
    ]);
    expect(report[0].message).toBe('Skipped technical claims: iss, vct, cnf.');
    expect(project.sample).toBe(sample);
    expect(project.languages).toEqual(['de-CH', 'en-GB']);
  });

  it('infers types, standards and paths', () => {
    expect(byKey('birth_date')).toMatchObject({ type: 'DateTime', standard: KNOWN_STANDARDS.iso8601, source: ['birth_date'] });
    expect(byKey('height')).toMatchObject({ type: 'Numeric' });
    expect(byKey('portrait')).toMatchObject({ type: 'Text', standard: KNOWN_STANDARDS.dataUrl });
    expect(byKey('nationalities')).toMatchObject({ type: { array: 'Text' }, source: ['nationalities', null] });
  });

  it('turns objects into groups and arrays of objects into array groups', () => {
    const address = byKey('address') as GroupLink;
    expect(address).toMatchObject({ kind: 'group', array: false, source: ['address'] });
    expect((address.group.children[1] as AttributeNode).source).toEqual(['address', 'city']);
    const pets = byKey('pets') as GroupLink;
    expect(pets).toMatchObject({ array: true, source: ['pets', null] });
    expect(pets.group.children.map((child) => [child.key, child.source])).toEqual([
      ['name', ['pets', null, 'name']],
      ['race', ['pets', null, 'race']],
      ['microchip', ['pets', null, 'microchip']],
    ]);
  });

  it('notes nulls', () => {
    expect(report.some((note) => note.message.includes('"middle_name" is null'))).toBe(true);
  });

  it('rejects non-objects and samples with only technical claims', () => {
    expect(() => importSample([1, 2], ['en-GB'])).toThrow(ImportError);
    expect(() => importSample({ iss: 'x' }, ['en-GB'])).toThrow(/no credential claims/);
  });
});

describe('parseSampleText', () => {
  it('explains what to paste when given an encoded SD-JWT', () => {
    expect(() => parseSampleText('eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ4In0.c2ln~WyJzYWx0IiwiYSIsMV0~')).toThrow(/encoded SD-JWT/);
  });

  it('parses JSON', () => {
    expect(parseSampleText('{"a": 1}')).toEqual({ a: 1 });
  });
});
