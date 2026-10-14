import { describe, expect, it } from 'vitest';
import { pngDataUrl } from '../../test/images';
import { KNOWN_STANDARDS, type Project, emptyGroup, emptyProject, newAttribute, newGroupLink } from '../model';
import { type Issue, hasErrors, isValidPathSegment, pathExists, validate } from './index';

/** A project with no issues at all, to which each test adds one problem. */
function clean(): Project {
  const project = emptyProject(['de-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }));
  project.hosting = { mode: 'url', url: 'https://issuer.example.ch/oca/oca-bundle.json' };
  return project;
}

const codes = (issues: Issue[]) => issues.map((issue) => `${issue.severity}:${issue.code}`);

describe('validate', () => {
  it('reports nothing for a complete project', () => {
    expect(validate(clean())).toEqual([]);
  });

  it('enforces the wallet language pattern', () => {
    const project = clean();
    project.languages.push('gsw', 'fr', 'de-CH');
    expect(codes(validate(project))).toEqual(
      expect.arrayContaining(['error:language-invalid', 'warning:language-no-region', 'error:language-duplicate']),
    );
  });

  it('checks keys', () => {
    const project = clean();
    project.root.children.push(newAttribute('name', { source: ['x'] }), newAttribute('a.b', { source: ['x'] }), newAttribute('', { source: ['x'] }));
    expect(codes(validate(project))).toEqual(expect.arrayContaining(['error:key-duplicate', 'error:key-characters', 'error:key-empty']));
  });

  it('checks source paths', () => {
    const project = clean();
    project.root.children.push(
      newAttribute('missing', { source: [] }),
      newAttribute('bad', { source: ['', -1] }),
      newAttribute('list', { type: { array: 'Text' }, source: ['list'] }),
      newGroupLink('pets', { array: true }),
    );
    const found = codes(validate(project));
    expect(found.filter((code) => code === 'error:source-missing')).toHaveLength(2);
    expect(found).toEqual(expect.arrayContaining(['error:source-invalid', 'warning:source-array-shape']));
  });

  it('checks source paths against the sample', () => {
    const project = clean();
    project.sample = { other: 1 };
    expect(codes(validate(project))).toContain('warning:source-not-in-sample');
  });

  it('reports unresolved templates and accepts resolvable ones', () => {
    const project = clean();
    project.branding['de-CH'].light.primaryField = '{{name}} {{nope}}';
    const issues = validate(project).filter((issue) => issue.code === 'template-unresolved');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('{{nope}}');
  });

  it('checks logos and colours', () => {
    const project = clean();
    project.branding['de-CH'] = {
      light: { logo: 'https://example.ch/logo.png', primaryBackgroundColor: '#FF573380' },
      dark: { logo: pngDataUrl(600, 300) },
    };
    expect(codes(validate(project))).toEqual(
      expect.arrayContaining(['error:logo-format', 'error:color-format', 'warning:logo-too-large', 'warning:logo-not-square']),
    );
  });

  it('warns about missing translations and summaries', () => {
    const project = clean();
    project.languages.push('fr-CH');
    project.meta['fr-CH'] = { name: '', description: '' };
    project.branding['fr-CH'] = { light: {} };
    expect(codes(validate(project))).toEqual(['warning:name-missing', 'warning:summary-missing', 'warning:label-missing']);
  });

  it('requires a standard for DateTime attributes', () => {
    const project = clean();
    project.root.children.push(newAttribute('birth', { type: 'DateTime', labels: { 'de-CH': 'Geburt' } }));
    expect(codes(validate(project))).toEqual(['error:datetime-standard']);
    (project.root.children[1] as { standard?: string }).standard = KNOWN_STANDARDS.iso8601;
    expect(validate(project)).toEqual([]);
  });

  it('checks value translations', () => {
    const project = clean();
    project.root.children.push(
      newAttribute('sex', {
        labels: { 'de-CH': 'Geschlecht' },
        entries: { codes: ['F', 'M', 'M'], labels: { 'de-CH': { F: 'weiblich', X: 'divers' } } },
      }),
    );
    expect(codes(validate(project))).toEqual(['error:entry-code-invalid', 'error:entry-undeclared', 'warning:entry-missing']);
  });

  it('warns about clusters deeper than three levels', () => {
    const project = clean();
    let group = project.root;
    for (const key of ['a', 'b', 'c', 'd']) {
      const link = newGroupLink(key, { source: [key], labels: { 'de-CH': key } });
      group.children.push(link);
      group = link.group;
    }
    group.children.push(newAttribute('leaf', { source: ['leaf'], labels: { 'de-CH': 'Leaf' } }));
    expect(codes(validate(project))).toEqual(['warning:cluster-too-deep']);
  });

  it('reports identical groups whose overlays differ', () => {
    const project = clean();
    const make = (source: string) => {
      const group = emptyGroup();
      group.children.push(newAttribute('city', { source: [source, 'city'], labels: { 'de-CH': 'Ort' } }));
      return group;
    };
    project.root.children.push(
      newGroupLink('home', { source: ['home'], group: make('home'), labels: { 'de-CH': 'Wohnort' } }),
      newGroupLink('work', { source: ['work'], group: make('work'), labels: { 'de-CH': 'Arbeitsort' } }),
    );
    const issues = validate(project);
    expect(codes(issues)).toEqual(['error:digest-collision']);
    expect(hasErrors(issues)).toBe(true);
  });
});

describe('helpers', () => {
  it('isValidPathSegment mirrors the wallet regex', () => {
    expect([null, 'a', 0, 12].every(isValidPathSegment)).toBe(true);
    expect(['', 'a"b', -1, 1.5].some(isValidPathSegment)).toBe(false);
  });

  it('pathExists walks objects and arrays', () => {
    const data = { pets: [{ name: 'Rex' }, { race: 'Cat' }], empty: [] };
    expect(pathExists(data, ['pets', null, 'race'])).toBe(true);
    expect(pathExists(data, ['pets', 1, 'name'])).toBe(false);
    expect(pathExists(data, ['empty', null, 'x'])).toBe(true);
    expect(pathExists(data, ['missing'])).toBe(false);
  });
});

describe('hosting', () => {
  it('warns when the hosting URL is missing or not https', () => {
    const project = clean();
    project.hosting = { mode: 'url', url: '' };
    expect(codes(validate(project))).toEqual(['warning:hosting-url-missing']);
    project.hosting = { mode: 'url', url: 'http://issuer.example.ch/oca.json' };
    expect(codes(validate(project))).toEqual(['warning:hosting-url-insecure']);
    project.hosting = { mode: 'dataUrl' };
    expect(validate(project)).toEqual([]);
  });
});

describe('digest collisions with reordered attributes', () => {
  it('reports identical groups even when their attributes are listed in a different order', () => {
    const project = clean();
    const make = (prefix: string, keys: string[]) => {
      const group = emptyGroup();
      for (const key of keys) group.children.push(newAttribute(key, { source: [prefix, key], labels: { 'de-CH': key } }));
      return group;
    };
    project.root.children.push(
      newGroupLink('home', { source: ['home'], group: make('home', ['street', 'city']), labels: { 'de-CH': 'Wohnort' } }),
      newGroupLink('work', { source: ['work'], group: make('work', ['city', 'street']), labels: { 'de-CH': 'Arbeitsort' } }),
    );
    expect(codes(validate(project))).toEqual(['error:digest-collision']);
  });
});

describe('issue summaries', () => {
  it('gives per-language issues a summary without the language', () => {
    const project = clean();
    project.languages.push('fr-CH');
    project.meta['fr-CH'] = { name: '', description: 'Pour les détenteurs' };
    project.branding['fr-CH'] = { light: {} };
    const issues = validate(project);
    const name = issues.find((issue) => issue.code === 'name-missing')!;
    expect(name.message).toBe('The credential name is missing in fr-CH.');
    expect(name.summary).toBe('The credential name is missing.');
    const label = issues.find((issue) => issue.code === 'label-missing')!;
    expect(label.summary).toBe('"name" has no label.');
  });

  it('uses the message as summary for issues without a language', () => {
    const project = clean();
    project.hosting = { mode: 'url', url: '' };
    const [hosting] = validate(project);
    expect(hosting.summary).toBe(hosting.message);
  });
});
