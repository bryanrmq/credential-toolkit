import { describe, expect, it } from 'vitest';
import { type Project, emptyProject, newAttribute } from '../core/model';
import { type Issue, validate } from '../core/validate';
import type { FixTools } from '../core/validate/fixes';
import { pngDataUrl } from '../test/images';
import { fixAllGroups, groupFixes, groupIssues } from './issues';

const issue = (severity: Issue['severity'], code: string, summary: string, lang?: string): Issue => ({
  severity,
  code,
  message: lang ? `${summary} (${lang})` : summary,
  summary,
  target: lang ? { kind: 'credential', field: 'name', lang } : { kind: 'hosting' },
});

describe('groupIssues', () => {
  it('merges the same issue across languages and lists errors first', () => {
    const groups = groupIssues([
      issue('warning', 'name-missing', 'The credential name is missing.', 'de-CH'),
      issue('warning', 'hosting-url-missing', 'Enter the URL.'),
      issue('warning', 'name-missing', 'The credential name is missing.', 'fr-CH'),
      issue('error', 'color-format', 'Bad colour.', 'de-CH'),
    ]);
    expect(groups.map((group) => [group.severity, group.summary, group.langs])).toEqual([
      ['error', 'Bad colour.', ['de-CH']],
      ['warning', 'The credential name is missing.', ['de-CH', 'fr-CH']],
      ['warning', 'Enter the URL.', []],
    ]);
    expect(groups[1].issues).toHaveLength(2);
  });
});

const tools: FixTools = { reencodePng: async () => pngDataUrl(512, 512) };

function twoLanguages(): Project {
  const project = emptyProject(['de-CH', 'fr-CH']);
  project.meta['de-CH'] = { name: 'Bewilligung', description: 'Für Halter' };
  project.meta['fr-CH'] = { name: 'Permis', description: 'Pour les détenteurs' };
  project.hosting = { mode: 'dataUrl' };
  return project;
}

const groupOf = (project: Project, code: string) => groupIssues(validate(project)).find((group) => group.code === code)!;

describe('groupFixes', () => {
  it('uses the shared label when every language gets the same fix', () => {
    const project = twoLanguages();
    project.branding['de-CH'].light.primaryBackgroundColor = '#abc';
    project.branding['fr-CH'].light.primaryBackgroundColor = '#abc';
    const options = groupFixes(groupOf(project, 'color-format'), project, tools);
    expect(options.map((option) => option.label)).toEqual(['Use "#AABBCC"']);
    expect(options[0].fixes).toHaveLength(2);
  });

  it('labels the button "Fix" when the languages get different fixes', () => {
    const project = twoLanguages();
    project.branding['de-CH'].light.primaryBackgroundColor = '#abc';
    project.branding['fr-CH'].light.primaryBackgroundColor = '#123';
    expect(groupFixes(groupOf(project, 'color-format'), project, tools).map((option) => option.label)).toEqual(['Fix']);
  });

  it('offers one button per choice', () => {
    const project = twoLanguages();
    project.root.children.push(newAttribute('when', { type: 'DateTime', source: ['when'], labels: { 'de-CH': 'Wann', 'fr-CH': 'Quand' } }));
    expect(groupFixes(groupOf(project, 'datetime-standard'), project, tools).map((option) => option.label)).toEqual([
      'Use ISO 8601',
      'Use Unix time',
    ]);
  });

  it('offers nothing for an issue that needs content', () => {
    const project = twoLanguages();
    project.meta['fr-CH'].name = '';
    expect(groupFixes(groupOf(project, 'name-missing'), project, tools)).toEqual([]);
  });

  it('shrinks the logo in every language of the group', async () => {
    const project = twoLanguages();
    project.branding['de-CH'].light.logo = pngDataUrl(1024, 1024);
    project.branding['fr-CH'].light.logo = pngDataUrl(1024, 1024);
    const [option] = groupFixes(groupOf(project, 'logo-too-large'), project, tools);
    const draft = structuredClone(project);
    for (const fix of option.fixes) await fix.apply(draft);
    expect(draft.branding['de-CH'].light.logo).toBe(pngDataUrl(512, 512));
    expect(draft.branding['fr-CH'].light.logo).toBe(pngDataUrl(512, 512));
  });
});

describe('fixAllGroups', () => {
  it('takes only the groups with a single fix', () => {
    const project = twoLanguages();
    project.branding['de-CH'].light.primaryBackgroundColor = '#abc';
    project.root.children.push(newAttribute('when', { type: 'DateTime', source: ['when'], labels: { 'de-CH': 'Wann', 'fr-CH': 'Quand' } }));
    const groups = fixAllGroups(groupIssues(validate(project)), project, tools);
    expect(groups.map((fixes) => fixes.map((fix) => fix.label))).toEqual([['Use "#AABBCC"']]);
  });
});
