import { describe, expect, it } from 'vitest';
import { type Group, type Node, type Project, emptyGroup, emptyProject, newAttribute, newGroupLink } from '../model';
import { detailsDevice, detailsDifferences } from './detailsDifferences';

const DE = 'de-CH';
const group = (...children: Node[]): Group => ({ ...emptyGroup(), children });

/** A date, a boolean, a null note, an empty address group, a sensitive owner group and a claim without an attribute. */
function project(): Project {
  const p = emptyProject([DE]);
  p.root.children.push(
    newAttribute('born', { type: 'DateTime', labels: { [DE]: 'Geboren' } }),
    newAttribute('vaccinated', { type: 'Boolean', labels: { [DE]: 'Geimpft' } }),
    newAttribute('note', { labels: { [DE]: 'Notiz' } }),
    newGroupLink('address', {
      source: ['address'],
      labels: { [DE]: 'Adresse' },
      group: group(newAttribute('street', { source: ['address', 'street'], labels: { [DE]: 'Strasse' } })),
    }),
    newGroupLink('owner', {
      source: ['owner'],
      sensitive: true,
      labels: { [DE]: 'Halter' },
      group: group(newAttribute('given_name', { source: ['owner', 'given_name'], labels: { [DE]: 'Vorname' } })),
    }),
  );
  p.sample = { born: '2020-01-02', vaccinated: true, note: null, owner: { given_name: 'Anna' }, sub: 's' };
  return p;
}

const options = { deviceLanguages: [DE], timeZone: 'Europe/Zurich' };

describe('detailsDifferences', () => {
  it('names where Android differs from iOS: unmapped claims last, empty groups, pill, values and null rows', () => {
    expect(detailsDifferences(project(), 'ios', options)).toEqual([
      { kind: 'unmapped', first: false },
      { kind: 'group', title: 'Adresse', shown: false, empty: true },
      { kind: 'value', label: 'Geboren', value: { kind: 'text', text: '02.01.2020' } },
      { kind: 'value', label: 'Geimpft', value: { kind: 'text', text: 'true' } },
      { kind: 'sensitive', label: 'Vorname', shown: true },
      { kind: 'row', label: 'Notiz', shown: true, empty: true },
    ]);
  });

  it('names where iOS differs from Android, the other way round', () => {
    expect(detailsDifferences(project(), 'android', options)).toEqual([
      { kind: 'unmapped', first: true },
      { kind: 'group', title: 'Adresse', shown: true, empty: true },
      { kind: 'value', label: 'Geboren', value: { kind: 'text', text: '02.01.20' } },
      { kind: 'value', label: 'Geimpft', value: { kind: 'text', text: '1' } },
      { kind: 'row', label: 'Notiz', shown: false, empty: true },
      { kind: 'sensitive', label: 'Vorname', shown: false },
    ]);
  });

  it('notes a different order without an Order overlay, and the undefined iOS order', () => {
    const p = emptyProject([DE]);
    p.root.children.push(
      newGroupLink('g', { labels: { [DE]: 'G' }, group: group(newAttribute('c', { source: ['c'] })) }),
      newAttribute('a', { source: ['a'] }),
      newAttribute('b', { source: ['b'] }),
    );
    p.sample = { a: 'A', b: 'B', c: 'C' };
    const unordered = { ...options, orders: () => undefined };
    // iOS puts the unordered group first and leaves the claims' order open; Android lists the claims first.
    expect(detailsDifferences(p, 'android', unordered)).toEqual([{ kind: 'order' }, { kind: 'orderUndefined' }]);
    expect(detailsDifferences(p, 'ios', unordered)).toEqual([{ kind: 'order' }]);
    expect(detailsDifferences(p, 'ios', options)).toEqual([]);
  });

  it('notes labels and titles Android picks by its own language rules', () => {
    const p = emptyProject(['fr-CH', 'de']);
    p.root.children.push(
      newAttribute('name', { labels: { 'fr-CH': 'Nom', de: 'Name' } }),
      newGroupLink('g', { labels: { 'fr-CH': 'Groupe', de: 'Gruppe' }, group: group(newAttribute('c', { source: ['c'], labels: { 'fr-CH': 'C' } })) }),
    );
    p.sample = { name: 'Rex', c: 'C' };
    // An Italian phone: iOS falls back to the first label language; Android to exactly de or en, else the path.
    expect(detailsDifferences(p, 'ios', { ...options, deviceLanguages: ['it-CH'] })).toEqual([
      { kind: 'title', title: 'Groupe', other: 'Gruppe' },
      { kind: 'label', label: 'Nom', other: 'Name' },
      { kind: 'label', label: 'C', other: '["c"]' },
    ]);
  });

  it('has nothing to say when both wallets agree', () => {
    const p = emptyProject([DE]);
    p.root.children.push(newAttribute('name', { labels: { [DE]: 'Name' } }));
    p.sample = { name: 'Rex' };
    expect(detailsDifferences(p, 'ios', options)).toEqual([]);
    expect(detailsDifferences(p, 'android', options)).toEqual([]);
  });

  it('sets each platform up for the device languages', () => {
    expect(detailsDevice('ios', ['it-CH'])).toEqual({ languages: ['it', 'en'], valueOptions: { locale: 'it-CH' } });
    expect(detailsDevice('android', ['ja', 'it-CH'], 'UTC')).toEqual({ languages: ['it-CH'], valueOptions: { locale: 'it-CH', platform: 'android', timeZone: 'UTC' } });
  });
});
