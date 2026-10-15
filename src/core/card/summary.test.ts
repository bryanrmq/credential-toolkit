import { describe, expect, it } from 'vitest';
import { type Group, type Node, type Project, emptyGroup, emptyProject, newAttribute, newGroupLink } from '../model';
import { cardSummary, resolveCardText } from './summary';

const LANG = 'de-CH';

const group = (...children: Node[]): Group => ({ ...emptyGroup(), children });

function project(sample?: unknown): Project {
  const result = emptyProject([LANG]);
  result.meta[LANG] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  result.root.children.push(
    newAttribute('attribute1', { source: ['attribute1'], labels: { [LANG]: 'Erstes' } }),
    newAttribute('attribute2', { source: ['attribute2'] }),
    newAttribute('tags', { type: { array: 'Text' }, source: ['tags', null] }),
    newGroupLink('address', { source: ['address'], group: group(newAttribute('city', { source: ['address', 'city'] })) }),
    newGroupLink('pets', { array: true, source: ['pets', null], group: group(newAttribute('name', { source: ['pets', null, 'name'] })) }),
  );
  if (sample !== undefined) result.sample = sample;
  return result;
}

const SAMPLE = {
  attribute1: 'attribute1Value',
  attribute2: 'attribute2Value',
  tags: ['value1', 'value2'],
  address: { city: 'Bern' },
  pets: [{ name: 'Rex' }, { name: 'Bello' }],
};

/** Flattens segments to a string; placeholders as ‹label›. */
const render = (p: Project, template: string) =>
  resolveCardText(p, LANG, template)
    .map((segment) => (segment.kind === 'text' ? segment.text : `‹${segment.label}›`))
    .join('');

describe('resolveCardText with a sample', () => {
  const withSample = project(SAMPLE);

  it('keeps text without templates (iOS resolvePathTemplate_noTemplate_returnsAsIs)', () => {
    expect(render(withSample, 'Test')).toBe('Test');
  });

  it('fills one attribute (iOS oneStringPath, Android "resolves a simple template")', () => {
    expect(render(withSample, 'Test: {{attribute1}}')).toBe('Test: attribute1Value');
  });

  it('fills several attributes (iOS multiStringPaths, Android "resolves a multi template")', () => {
    expect(render(withSample, 'Test: {{attribute1}} {{attribute2}}')).toBe('Test: attribute1Value attribute2Value');
    expect(render(withSample, 'Test: {{attribute1}}, {{attribute2}}')).toBe('Test: attribute1Value, attribute2Value');
  });

  it.each(['Test: {{}}', 'Test: {{ }}', 'Test: {{attribute3}}'])(
    'empties an unknown key in %s (Android "references an unknown key")',
    (template) => {
      expect(render(withSample, template)).toBe('Test: ');
    },
  );

  it('empties something that is not a path (iOS notAPath) and a malformed join (iOS malformedJoin)', () => {
    expect(render(withSample, '{{notAPath}}')).toBe('');
    expect(render(withSample, "{{attribute1[null].join(' '}}")).toBe('');
  });

  it('leaves text that is not a template untouched (Android "does not match invalid templates")', () => {
    for (const template of ['{attribute1}', '{attribute1}}', '{{attribute1}']) {
      expect(render(withSample, template)).toBe(template);
    }
  });

  it('shows – for a null value (iOS nullValue, Android "references an null claim")', () => {
    expect(render(project({ attribute1: null }), 'Test: {{attribute1}}')).toBe('Test: –');
    expect(render(project({ tags: [null, null] }), '{{tags}}')).toBe('–, –');
  });

  it('shows the value translation of an entry code (iOS claimWithDisplay, Android "claim with display")', () => {
    const p = project({ attribute1: 'a' });
    const attribute = p.root.children[0];
    if (attribute.kind !== 'attribute') throw new Error('expected an attribute');
    attribute.entries = { codes: ['a'], labels: { [LANG]: { a: 'otherValue' } } };
    expect(render(p, 'Test: {{attribute1}}')).toBe('Test: otherValue');
  });

  it.each([
    ['{{tags}}', 'value1, value2'],
    ["{{tags.join('; ')}}", 'value1; value2'],
    ['{{tags.join("; ")}}', 'value1; value2'],
    ['{{tags[0]}}', 'value1'],
    ["{{tags[1].join('; ')}}", 'value2'],
  ])('resolves the array template %s (Android "resolves array templates")', (template, expected) => {
    expect(render(withSample, template)).toBe(expected);
  });

  it('empties an array with no elements (iOS arrayPathNoClaims)', () => {
    expect(render(project({ tags: [] }), 'Test: {{tags}}')).toBe('Test: ');
  });

  it('picks one element of a list of objects by index (iOS indices)', () => {
    expect(render(withSample, 'Test: {{pets.name[1]}}')).toBe('Test: Bello');
  });

  it('walks nested groups and lists of objects', () => {
    expect(render(withSample, '{{address.city}}')).toBe('Bern');
    expect(render(withSample, '{{/address.city}}')).toBe('Bern');
    expect(render(withSample, '{{pets.name}}')).toBe('Rex, Bello');
  });

  it('empties a missing claim', () => {
    expect(render(project({ attribute1: 'x' }), 'Test: {{attribute2}}')).toBe('Test: ');
  });

  it('writes numbers and booleans as text and empties objects', () => {
    expect(render(project({ attribute1: 42, attribute2: true }), '{{attribute1}} {{attribute2}}')).toBe('42 true');
    expect(render(project({ attribute1: { nested: 1 } }), '{{attribute1}}')).toBe('');
  });

  it('empties every template when the sample is not an object', () => {
    expect(render(project(['attribute1Value']), 'Test: {{attribute1}}')).toBe('Test: ');
    expect(render(project('attribute1Value'), 'Test: {{attribute1}}')).toBe('Test: ');
  });

  it('empties templates that point at a group or use the refs: form', () => {
    expect(render(withSample, 'A{{address}}B')).toBe('AB');
    expect(render(withSample, 'A{{refs:EAbc:attribute1}}B')).toBe('AB');
  });
});

describe('resolveCardText without a sample', () => {
  it('shows each attribute as a placeholder named by its label, else its key', () => {
    expect(resolveCardText(project(), LANG, 'Hi {{attribute1}} {{attribute2}}')).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'placeholder', label: 'Erstes' },
      { kind: 'text', text: ' ' },
      { kind: 'placeholder', label: 'attribute2' },
    ]);
  });

  it('still empties unknown keys, groups and refs: templates', () => {
    expect(resolveCardText(project(), LANG, '{{attribute3}}{{address}}{{refs:EAbc:attribute1}}')).toEqual([]);
  });
});

describe('cardSummary', () => {
  it('uses the primary field when it is set', () => {
    expect(cardSummary(project(SAMPLE), LANG, { primaryField: '{{address.city}}' })).toEqual([{ kind: 'text', text: 'Bern' }]);
  });

  it('falls back to the description, which is resolved too', () => {
    expect(cardSummary(project(SAMPLE), LANG, {})).toEqual([{ kind: 'text', text: 'Für Hundehalter' }]);
    const p = project(SAMPLE);
    p.meta[LANG].description = 'Halter: {{attribute1}}';
    expect(cardSummary(p, LANG, {})).toEqual([{ kind: 'text', text: 'Halter: attribute1Value' }]);
  });

  it('is empty when there is neither a primary field nor a description', () => {
    const p = project(SAMPLE);
    p.meta[LANG].description = '';
    expect(cardSummary(p, LANG, {})).toEqual([]);
    expect(cardSummary(p, 'fr-CH', {})).toEqual([]);
  });
});
