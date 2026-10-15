import { describe, expect, it } from 'vitest';
import { pngDataUrl } from '../../test/images';
import { type Project, emptyProject, newAttribute, newGroupLink } from '../model';
import { type FixTools, fixesFor } from './fixes';
import { type Issue, validate } from './index';

const TOOLS: FixTools = { reencodePng: async () => pngDataUrl(512, 512) };

/** A project with no issues at all, to which each test adds one problem. */
function clean(): Project {
  const project = emptyProject(['de-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }));
  project.hosting = { mode: 'url', url: 'https://issuer.example.ch/oca/oca-bundle.json' };
  return project;
}

const codes = (project: Project) => validate(project).map((issue) => issue.code);

function issueOf(project: Project, code: string): Issue {
  const issue = validate(project).find((candidate) => candidate.code === code);
  if (!issue) throw new Error(`No ${code} issue`);
  return issue;
}

const labels = (project: Project, code: string, tools = TOOLS) => fixesFor(issueOf(project, code), project, tools).map((fix) => fix.label);

/** Applies the fix with `label` (or the only fix) for the first `code` issue to a copy, and returns the copy. */
async function fixed(project: Project, code: string, label?: string, tools = TOOLS): Promise<Project> {
  const fixes = fixesFor(issueOf(project, code), project, tools);
  if (!label) expect(fixes).toHaveLength(1);
  const fix = label ? fixes.find((candidate) => candidate.label === label) : fixes[0];
  if (!fix) throw new Error(`No "${label}" fix for ${code}`);
  const draft = structuredClone(project);
  await fix.apply(draft);
  return draft;
}

/** Applies every fix of every `code` issue, in order, to one copy (as Fix all does). */
async function fixedAll(project: Project, code: string): Promise<Project> {
  const draft = structuredClone(project);
  for (const issue of validate(project).filter((candidate) => candidate.code === code)) {
    for (const fix of fixesFor(issue, project, TOOLS)) await fix.apply(draft);
  }
  return draft;
}

const keys = (project: Project) => project.root.children.map((node) => node.key);

describe('fixesFor', () => {
  it('offers nothing for codes without a fix', () => {
    const project = clean();
    project.meta['de-CH'].name = '';
    expect(labels(project, 'name-missing')).toEqual([]);
  });
});

describe('structural fixes', () => {
  it('removes a duplicate language', async () => {
    const project = clean();
    project.languages.push('de-CH');
    expect(labels(project, 'language-duplicate')).toEqual(['Remove the duplicate']);
    const result = await fixed(project, 'language-duplicate');
    expect(result.languages).toEqual(['de-CH']);
    expect(codes(result)).toEqual([]);
  });

  it('renames a duplicate key, and fixing both copies renames only one', async () => {
    const project = clean();
    project.root.children.push(newAttribute('name', { source: ['other'], labels: { 'de-CH': 'Andere' } }));
    expect(labels(project, 'key-duplicate')).toEqual(['Rename to "name_2"']);
    const result = await fixed(project, 'key-duplicate');
    expect(keys(result)).toEqual(['name_2', 'name']);
    expect(result.root.children[0].source).toEqual(['name']);
    expect(codes(result)).toEqual([]);
    expect(keys(await fixedAll(project, 'key-duplicate'))).toEqual(['name_2', 'name']);
  });

  it('replaces forbidden key characters', async () => {
    const project = clean();
    project.root.children.push(newAttribute('birth date', { source: ['birth date'], labels: { 'de-CH': 'Geburtsdatum' } }));
    expect(labels(project, 'key-characters')).toEqual(['Rename to "birth_date"']);
    const result = await fixed(project, 'key-characters');
    expect(keys(result)).toEqual(['name', 'birth_date']);
    expect(codes(result)).toEqual([]);
  });

  it('gives keys that sanitise to the same name distinct names', async () => {
    const project = clean();
    project.root.children.push(
      newAttribute('a b', { source: ['ab'], labels: { 'de-CH': 'AB' } }),
      newAttribute('a.b', { source: ['ab2'], labels: { 'de-CH': 'AB2' } }),
    );
    const result = await fixedAll(project, 'key-characters');
    expect(keys(result)).toEqual(['name', 'a_b', 'a_b_2']);
    expect(codes(result)).toEqual([]);
  });

  it('offers no key when nothing is left after removing forbidden characters', () => {
    const project = clean();
    project.root.children.push(newAttribute('...', { source: ['dots'], labels: { 'de-CH': 'Punkte' } }));
    expect(labels(project, 'key-characters')).toEqual([]);
  });

  it('takes an empty key from the source path', async () => {
    const project = clean();
    project.root.children.push(newAttribute('', { source: ['person', 'email'], labels: { 'de-CH': 'E-Mail' } }));
    expect(labels(project, 'key-empty')).toEqual(['Use "email" as key']);
    const result = await fixed(project, 'key-empty');
    expect(keys(result)).toEqual(['name', 'email']);
    expect(codes(result)).toEqual([]);
  });

  it('does not take a key that a sibling uses or that has forbidden characters', () => {
    const taken = clean();
    taken.root.children.push(newAttribute('', { source: ['name'], labels: { 'de-CH': 'Name 2' } }));
    expect(labels(taken, 'key-empty')).toEqual([]);
    const spaced = clean();
    spaced.root.children.push(newAttribute('', { source: ['e mail'], labels: { 'de-CH': 'E-Mail' } }));
    expect(labels(spaced, 'key-empty')).toEqual([]);
  });

  it('sets a missing source from the key', async () => {
    const project = clean();
    project.root.children.push(newAttribute('email', { source: [], labels: { 'de-CH': 'E-Mail' } }));
    expect(labels(project, 'source-missing')).toEqual(['Set source to email']);
    const result = await fixed(project, 'source-missing');
    expect(result.root.children[1].source).toEqual(['email']);
    expect(codes(result)).toEqual([]);
  });

  it('starts a missing source from the enclosing array group', async () => {
    const project = clean();
    const pets = newGroupLink('pets', { array: true, source: ['pets', null], labels: { 'de-CH': 'Tiere' } });
    pets.group.children.push(newAttribute('race', { source: [], labels: { 'de-CH': 'Rasse' } }));
    project.root.children.push(pets);
    expect(labels(project, 'source-missing')).toEqual(['Set source to pets[].race']);
    const result = await fixed(project, 'source-missing');
    const group = result.root.children[1];
    expect(group.kind === 'group' && group.group.children[0].source).toEqual(['pets', null, 'race']);
    expect(codes(result)).toEqual([]);
  });

  it('ends the source of an array group with null', async () => {
    const project = clean();
    project.root.children.push(newGroupLink('items', { array: true, labels: { 'de-CH': 'Einträge' } }));
    expect(labels(project, 'source-missing')).toEqual(['Set source to items[]']);
    const result = await fixed(project, 'source-missing');
    expect(result.root.children[1].source).toEqual(['items', null]);
    expect(codes(result)).toEqual([]);
  });

  it('offers no source for a node without a usable key', () => {
    const project = clean();
    project.root.children.push(newAttribute('', { source: [], labels: { 'de-CH': 'Leer' } }));
    expect(labels(project, 'source-missing')).toEqual([]);
  });

  it('removes the trailing null of a single value', async () => {
    const project = clean();
    project.root.children.push(newAttribute('nickname', { source: ['nickname', null], labels: { 'de-CH': 'Spitzname' } }));
    expect(labels(project, 'source-array-shape')).toEqual(['Remove the trailing null']);
    const result = await fixed(project, 'source-array-shape');
    expect(result.root.children[1].source).toEqual(['nickname']);
    expect(codes(result)).toEqual([]);
  });

  it('does not empty a source that is only null', () => {
    const project = clean();
    project.root.children.push(newAttribute('solo', { source: [null], labels: { 'de-CH': 'Solo' } }));
    expect(labels(project, 'source-array-shape')).toEqual([]);
  });

  it('removes empty and duplicate value codes', async () => {
    const project = clean();
    project.root.children.push(
      newAttribute('status', {
        source: ['status'],
        labels: { 'de-CH': 'Status' },
        entries: { codes: ['a', '', 'a'], labels: { 'de-CH': { a: 'A', '': 'Leer' } } },
      }),
    );
    expect(labels(project, 'entry-code-invalid')).toEqual(['Remove empty and duplicate codes']);
    const result = await fixed(project, 'entry-code-invalid');
    const status = result.root.children[1];
    expect(status.kind === 'attribute' && status.entries).toEqual({ codes: ['a'], labels: { 'de-CH': { a: 'A' } } });
    expect(codes(result)).toEqual([]);
  });

  it('declares or deletes an undeclared value translation', async () => {
    const project = clean();
    project.root.children.push(
      newAttribute('status', {
        source: ['status'],
        labels: { 'de-CH': 'Status' },
        entries: { codes: ['a'], labels: { 'de-CH': { a: 'A', b: 'B' } } },
      }),
    );
    expect(labels(project, 'entry-undeclared')).toEqual(['Declare "b"', 'Delete the translation']);
    const declared = await fixed(project, 'entry-undeclared', 'Declare "b"');
    const withCode = declared.root.children[1];
    expect(withCode.kind === 'attribute' && withCode.entries?.codes).toEqual(['a', 'b']);
    expect(codes(declared)).toEqual([]);
    const deleted = await fixed(project, 'entry-undeclared', 'Delete the translation');
    const withoutLabel = deleted.root.children[1];
    expect(withoutLabel.kind === 'attribute' && withoutLabel.entries?.labels).toEqual({ 'de-CH': { a: 'A' } });
    expect(codes(deleted)).toEqual([]);
  });

  it('switches the bundle URL to https', async () => {
    const cases: Array<[string, string]> = [
      ['http://issuer.example.ch/oca.json', 'https://issuer.example.ch/oca.json'],
      ['  HTTP://issuer.example.ch/oca.json ', 'https://issuer.example.ch/oca.json'],
      ['issuer.example.ch:8443/oca', 'https://issuer.example.ch:8443/oca'],
    ];
    for (const [url, expected] of cases) {
      const project = clean();
      project.hosting = { mode: 'url', url };
      expect(labels(project, 'hosting-url-insecure')).toEqual(['Use https://']);
      const result = await fixed(project, 'hosting-url-insecure');
      expect(result.hosting).toEqual({ mode: 'url', url: expected });
      expect(codes(result)).toEqual([]);
    }
  });

  it('leaves other URL schemes alone', () => {
    const project = clean();
    project.hosting = { mode: 'url', url: 'ftp://issuer.example.ch/oca.json' };
    expect(labels(project, 'hosting-url-insecure')).toEqual([]);
  });
});
