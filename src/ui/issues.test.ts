import { describe, expect, it } from 'vitest';
import { type Project, emptyProject, newAttribute } from '../core/model';
import { reviewMarks, suggestText } from '../core/review';
import { type Issue, hasErrors, validate } from '../core/validate';
import type { FixTools } from '../core/validate/fixes';
import { pngDataUrl } from '../test/images';
import { REVIEW_CODE, fixAllGroups, groupFixes, groupIssues, issueLocation, projectIssues } from './issues';

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

  it('renames languages after the fixes that look a language up', async () => {
    const project = emptyProject(['de', 'fr']);
    project.meta.de = { name: 'Bewilligung', description: 'Für Halter' };
    project.meta.fr = { name: 'Permis', description: 'Pour les détenteurs' };
    project.hosting = { mode: 'dataUrl' };
    project.branding.de.light.logo = pngDataUrl(1024, 1024);
    project.branding.fr.light.logo = pngDataUrl(1024, 1024);
    const draft = structuredClone(project);
    for (const fixes of fixAllGroups(groupIssues(validate(project)), project, tools)) {
      for (const fix of fixes) await fix.apply(draft);
    }
    expect(draft.languages).toEqual(['de-CH', 'fr-CH']);
    expect(draft.branding['de-CH'].light.logo).toBe(pngDataUrl(512, 512));
    expect(draft.branding['fr-CH'].light.logo).toBe(pngDataUrl(512, 512));
    expect(validate(draft)).toEqual([]);
  });
});

describe('suggested texts in the issues', () => {
  /** De and fr; `sex` with a value list, its French label and values suggested, and the French name translated. */
  function suggested(): Project {
    const project = twoLanguages();
    const sex = newAttribute('sex', {
      source: ['sex'],
      labels: { 'de-CH': 'Geschlecht' },
      entries: { codes: ['f'], labels: { 'de-CH': { f: 'weiblich' } } },
    });
    project.root.children.push(sex);
    suggestText(project, { kind: 'label', nodeId: sex.id }, 'fr-CH', 'Sexe', 'i14y');
    suggestText(project, { kind: 'entry', nodeId: sex.id, code: 'f' }, 'fr-CH', 'féminin', 'i14y');
    suggestText(project, { kind: 'label', nodeId: sex.id }, 'de-CH', 'Geschlecht', 'i14y');
    suggestText(project, { kind: 'meta', field: 'name' }, 'fr-CH', 'Autorisation', 'translation');
    return project;
  }
  const reviewGroups = (project: Project) => groupIssues(projectIssues(project)).filter((group) => group.code === REVIEW_CODE);

  it('lists one warning per attribute and per credential field, with the languages and the location', () => {
    const project = suggested();
    const groups = reviewGroups(project);
    expect(groups.map((group) => [group.severity, group.summary, group.langs, issueLocation(group.issues[0], project)])).toEqual([
      ['warning', 'Suggested text needs review.', ['fr-CH'], 'Credential'],
      ['warning', 'Suggested text needs review.', ['de-CH', 'fr-CH'], 'sex'],
    ]);
    expect(hasErrors(projectIssues(project))).toBe(false);
  });

  it('confirms the texts of that attribute or field in each listed language with Confirm', async () => {
    const project = suggested();
    const [, sex] = reviewGroups(project);
    const options = groupFixes(sex, project, tools);
    expect(options.map((option) => option.label)).toEqual(['Confirm']);
    const draft = structuredClone(project);
    for (const fix of options[0].fixes) await fix.apply(draft);
    expect(reviewMarks(draft).map((mark) => mark.place.kind)).toEqual(['meta']);
    expect(reviewGroups(draft)).toHaveLength(1);
  });

  it('is left alone by Fix all', () => {
    const project = suggested();
    project.branding['de-CH'].light.primaryBackgroundColor = '#abc';
    const groups = fixAllGroups(groupIssues(projectIssues(project)), project, tools);
    expect(groups.map((fixes) => fixes.map((fix) => fix.label))).toEqual([['Use "#AABBCC"']]);
  });
});
