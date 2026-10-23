import { describe, expect, it } from 'vitest';
import { jpegDataUrl, pngDataUrl } from '../../test/images';
import { KNOWN_STANDARDS, type Project, emptyGroup, emptyProject, ensureIssuer, newAttribute, newGroupLink } from '../model';
import { ISSUER_ISSUE_CODES, type Issue, hasErrors, isValidPathSegment, pathExists, validate, validateIssuer, valuesAt } from './index';

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
      newAttribute('single', { source: ['single', null] }),
      newGroupLink('pets', { array: true }),
    );
    const found = codes(validate(project));
    expect(found.filter((code) => code === 'error:source-missing')).toHaveLength(2);
    expect(found).toEqual(expect.arrayContaining(['error:source-invalid', 'warning:source-array-shape']));
  });

  it('accepts an array source path with or without a trailing null', () => {
    const project = clean();
    project.root.children.push(
      newAttribute('nationalities', { type: { array: 'Text' }, source: ['nationalities'], labels: { 'de-CH': 'Nationalitäten' } }),
      newAttribute('languages', { type: { array: 'Text' }, source: ['languages', null], labels: { 'de-CH': 'Sprachen' } }),
    );
    expect(validate(project)).toEqual([]);
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

  it('rejects a join separator longer than the 10 characters wallets accept', () => {
    const project = clean();
    project.root.children.push(newAttribute('tags', { type: { array: 'Text' }, source: ['tags', null], labels: { 'de-CH': 'Tags' } }));
    project.branding['de-CH'].light.primaryField = "{{tags.join('0123456789')}} {{tags.join('0123456789X')}}";
    const issues = validate(project);
    expect(codes(issues)).toEqual(['error:template-join-too-long']);
    expect(issues[0].message).toContain("{{tags.join('0123456789X')}}");
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

  it('valuesAt collects every value a path selects', () => {
    const data = { pets: [{ born: 1 }, { born: 2 }, {}], name: 'Rex' };
    expect(valuesAt(data, ['pets', null, 'born'])).toEqual([1, 2]);
    expect(valuesAt(data, ['pets', 1, 'born'])).toEqual([2]);
    expect(valuesAt(data, ['name'])).toEqual(['Rex']);
    expect(valuesAt(data, ['missing'])).toEqual([]);
    expect(valuesAt(data, ['name', null])).toEqual([]);
    expect(valuesAt(data, [])).toEqual([data]);
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

  it('names the language or value code an issue is about', () => {
    const project = clean();
    project.languages.push('gsw', 'fr', 'de-CH');
    project.root.children.push(
      newAttribute('status', {
        source: ['status'],
        labels: { 'de-CH': 'Status' },
        entries: { codes: ['a'], labels: { 'de-CH': { a: 'A', b: 'B' } } },
      }),
    );
    const subjects = validate(project)
      .filter((issue) => issue.subject !== undefined)
      .map((issue) => `${issue.code}:${issue.subject}`);
    expect(subjects).toEqual(
      expect.arrayContaining(['language-invalid:gsw', 'language-no-region:fr', 'language-duplicate:de-CH', 'entry-undeclared:b']),
    );
  });

  it('uses the message as summary for issues without a language', () => {
    const project = clean();
    project.hosting = { mode: 'url', url: '' };
    const [hosting] = validate(project);
    expect(hosting.summary).toBe(hosting.message);
  });
});

describe('validateIssuer', () => {
  /** `clean()` with an issuer name in its one language: no issuer issues. */
  function withIssuer(languages = ['de-CH']): Project {
    const project = clean();
    for (const lang of languages.slice(1)) {
      project.languages.push(lang);
      project.meta[lang] = { name: 'Permis', description: 'Pour les chiens' };
    }
    const issuer = ensureIssuer(project);
    for (const lang of languages) issuer.name[lang] = 'Kanton Bern';
    return project;
  }

  it('reports nothing for complete issuer settings, and an unset logo, URL and identifiers are fine', () => {
    const project = withIssuer();
    expect(validateIssuer(project)).toEqual([]);
    Object.assign(ensureIssuer(project), { logo: pngDataUrl(64, 64), url: 'https://issuer.example.ch', configurationId: 'lfa_sd_jwt', typeKey: 'lfa-v01' });
    expect(validateIssuer(project)).toEqual([]);
    ensureIssuer(project).logo = jpegDataUrl(64, 64);
    expect(validateIssuer(project)).toEqual([]);
  });

  it('warns about a missing issuer name per language, on projects saved without issuer settings too', () => {
    const project = withIssuer(['de-CH', 'fr-CH', 'en-GB']);
    ensureIssuer(project).name['fr-CH'] = '';
    delete ensureIssuer(project).name['en-GB'];
    const issues = validateIssuer(project);
    expect(issues.map((issue) => [issue.severity, issue.code, issue.target])).toEqual([
      ['warning', 'issuer-name-missing', { kind: 'credential', field: 'issuerName', lang: 'fr-CH' }],
      ['warning', 'issuer-name-missing', { kind: 'credential', field: 'issuerName', lang: 'en-GB' }],
    ]);
    expect(issues[0].message).toBe('The issuer name is missing in fr-CH.');
    expect(issues[0].summary).toBe('The issuer name is missing.');

    const legacy = clean();
    delete legacy.issuer;
    expect(codes(validateIssuer(legacy))).toEqual(['warning:issuer-name-missing']);
  });

  it('rejects an issuer logo that is not a PNG or JPEG data URL', () => {
    for (const logo of ['data:image/gif;base64,R0lGODlh', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://issuer.example.ch/logo.png', 'data:image/png,raw']) {
      const project = withIssuer();
      ensureIssuer(project).logo = logo;
      expect(validateIssuer(project).map((issue) => [issue.severity, issue.code, issue.target])).toEqual([
        ['error', 'issuer-logo-format', { kind: 'credential', field: 'issuerLogo' }],
      ]);
    }
  });

  it('rejects an Issuer URL that is set but not an https URL', () => {
    for (const url of ['http://issuer.example.ch', 'issuer.example.ch', '${external-url}', 'https://']) {
      const project = withIssuer();
      ensureIssuer(project).url = url;
      expect(validateIssuer(project).map((issue) => [issue.severity, issue.code, issue.target])).toEqual([
        ['error', 'issuer-url-invalid', { kind: 'credential', field: 'issuerUrl' }],
      ]);
    }
    const blank = withIssuer();
    ensureIssuer(blank).url = '  ';
    expect(validateIssuer(blank)).toEqual([]);
  });

  it('rejects a Configuration id or Type key with anything but lower-case letters, digits, _ and -', () => {
    const project = withIssuer();
    Object.assign(ensureIssuer(project), { configurationId: 'Lernfahrausweis_SD_JWT', typeKey: 'lfa v01' });
    const issues = validateIssuer(project);
    expect(issues.map((issue) => [issue.severity, issue.code, issue.target])).toEqual([
      ['error', 'issuer-identifier-invalid', { kind: 'credential', field: 'issuerConfigurationId' }],
      ['error', 'issuer-identifier-invalid', { kind: 'credential', field: 'issuerTypeKey' }],
    ]);
    expect(issues.map((issue) => issue.message)).toEqual([
      'The Configuration id may only contain lower-case letters, digits, _ and -.',
      'The Type key may only contain lower-case letters, digits, _ and -.',
    ]);

    // Empty means derived from the credential name, which always matches.
    Object.assign(ensureIssuer(project), { configurationId: '', typeKey: '   ' });
    project.meta['de-CH'].name = 'Lernfahrausweis (Kat. B) – Zürich';
    expect(validateIssuer(project)).toEqual([]);
  });

  it('stays out of validate, so issuer settings never block the bundle export', () => {
    const project = clean();
    Object.assign(ensureIssuer(project), { logo: 'data:image/gif;base64,R0lGODlh', url: 'http://x', configurationId: 'A B' });
    expect(validate(project)).toEqual([]);
    expect(hasErrors(validateIssuer(project))).toBe(true);
    expect(new Set(validateIssuer(project).map((issue) => issue.code))).toEqual(new Set(ISSUER_ISSUE_CODES));
  });
});
