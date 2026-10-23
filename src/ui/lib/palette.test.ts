import { describe, expect, it } from 'vitest';
import { emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { PALETTE_LIMIT, filterHides, findNodes, matchRank, nodeEntries, rankMatches } from './palette';

/** name, address { street, city }, birth_date; labelled in de-CH only. */
function project() {
  const result = emptyProject(['de-CH', 'en-GB']);
  const address = newGroupLink('address', { labels: { 'de-CH': 'Adresse', 'en-GB': 'Address' } });
  address.group.children.push(
    newAttribute('street', { labels: { 'de-CH': 'Strasse' } }),
    newAttribute('city', { labels: { 'de-CH': 'Ort' } }),
  );
  result.root.children.push(newAttribute('name', { labels: { 'de-CH': 'Name' } }), address, newAttribute('birth_date', { labels: { 'de-CH': 'Geburtsdatum' } }));
  return result;
}

describe('matchRank', () => {
  it('ranks a match at the start, then at the start of a word, then anywhere, ignoring case', () => {
    expect(matchRank('Street name', 'str')).toBe(0);
    expect(matchRank('Main Street', 'str')).toBe(1);
    expect(matchRank('address.street', 'str')).toBe(1);
    expect(matchRank('birth_date', 'date')).toBe(1);
    expect(matchRank('Geburtsdatum', 'datum')).toBe(2);
    expect(matchRank('Geburtsdatum', 'xyz')).toBeNull();
  });

  it('finds the start of a word after an earlier match inside one', () => {
    expect(matchRank('Bestand Stand', 'stand')).toBe(1);
  });

  it('does not match fuzzily', () => {
    expect(matchRank('Geburtsdatum', 'gbd')).toBeNull();
  });
});

describe('rankMatches', () => {
  const texts = (item: string) => [item];

  it('orders by rank and keeps the given order between equals', () => {
    expect(rankMatches(['Add list', 'Undo', 'Paste list', 'List all', 'Listen', 'Unlisted'], 'list', texts)).toEqual([
      'List all',
      'Listen',
      'Add list',
      'Paste list',
      'Unlisted',
    ]);
  });

  it('ranks an item by its best text', () => {
    const items = [{ texts: ['xx-date', 'birthdate'] }, { texts: ['date'] }, { texts: ['Birthdate', 'Date'] }];
    expect(rankMatches(items, 'date', (item) => item.texts)).toEqual([items[1], items[2], items[0]]);
  });

  it('lists at most the limit, and nothing for a blank query', () => {
    const many = Array.from({ length: 20 }, (_, index) => `item ${index}`);
    expect(rankMatches(many, 'item', texts)).toHaveLength(PALETTE_LIMIT);
    expect(PALETTE_LIMIT).toBe(8);
    expect(rankMatches(many, '   ', texts)).toEqual([]);
  });
});

describe('nodeEntries', () => {
  it('lists every attribute and group in tree order with its label, key path and group', () => {
    expect(nodeEntries(project(), 'de-CH').map(({ node, label, path, parent }) => [node.key, label, path, parent])).toEqual([
      ['name', 'Name', 'name', ''],
      ['address', 'Adresse', 'address', ''],
      ['street', 'Strasse', 'address.street', 'Adresse'],
      ['city', 'Ort', 'address.city', 'Adresse'],
      ['birth_date', 'Geburtsdatum', 'birth_date', ''],
    ]);
  });

  it('labels in the editing language, naming a group without a label by its key', () => {
    const entries = nodeEntries(project(), 'en-GB');
    expect(entries.map((entry) => entry.label)).toEqual(['', 'Address', '', '', '']);
    const unlabelled = project();
    unlabelled.root.children[1].labels = {};
    expect(nodeEntries(unlabelled, 'de-CH')[2].parent).toBe('address');
  });
});

describe('findNodes', () => {
  const keys = (query: string, lang = 'de-CH') => findNodes(nodeEntries(project(), lang), query).map((entry) => entry.node.key);

  it('matches on label, key and path', () => {
    expect(keys('strasse')).toEqual(['street']);
    expect(keys('city')).toEqual(['city']);
    expect(keys('address.c')).toEqual(['city']);
  });

  it('ranks matches at the start first, then at a word start, then anywhere, ties in tree order', () => {
    // "address" starts the group's key and the paths below it; "Name" and "Geburtsdatum" only hold an "a".
    expect(keys('a')).toEqual(['address', 'street', 'city', 'name', 'birth_date']);
    // "_date" starts a word of birth_date; the others only hold a "d".
    expect(keys('d')).toEqual(['birth_date', 'address', 'street', 'city']);
  });

  it('searches only the editing language', () => {
    expect(keys('strasse', 'en-GB')).toEqual([]);
    expect(keys('address', 'en-GB')).toEqual(['address', 'street', 'city']);
  });
});

describe('filterHides', () => {
  it('tells whether the tree filter hides a node', () => {
    const tree = project();
    const [name, address] = tree.root.children;
    const city = address.kind === 'group' ? address.group.children[1] : name;
    expect(filterHides(tree, '', 'de-CH', city.id)).toBe(false);
    expect(filterHides(tree, 'ort', 'de-CH', city.id)).toBe(false);
    expect(filterHides(tree, 'ort', 'de-CH', address.id)).toBe(false);
    expect(filterHides(tree, 'ort', 'de-CH', name.id)).toBe(true);
  });
});
