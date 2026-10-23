import { describe, expect, it } from 'vitest';
import { type Project, emptyProject, newAttribute, newGroupLink } from './model';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, parseProjectFile, projectFileName, serializeProjectFile } from './projectFile';

/** A project with every part a bundle leaves out: the sample credential and an I14Y link. */
function fullProject(): Project {
  const project = emptyProject(['de-CH', 'fr-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.meta['fr-CH'] = { name: 'Permis pour chien', description: '' };
  const canton = newAttribute('canton', {
    labels: { 'de-CH': 'Kanton', 'fr-CH': 'Canton' },
    i14y: {
      conceptId: '08d94604-5a6f-4e8f-9b5f-0123456789ab',
      identifier: 'CH_CANTON',
      registrationStatus: 'Recorded',
      name: { de: 'Kanton', fr: 'Canton' },
      publisher: { de: 'BFS' },
      values: { BE: { de: 'Bern', fr: 'Berne' } },
    },
    entries: { codes: ['BE'], labels: { 'de-CH': { BE: 'Bern' }, 'fr-CH': { BE: 'Berne' } } },
  });
  const holder = newGroupLink('holder', { source: ['holder'] });
  holder.group.children.push(newAttribute('name'));
  project.root.children.push(canton, holder);
  project.sample = { canton: 'BE', holder: { name: 'Seraina' } };
  project.hosting = { mode: 'url', url: 'https://example.ch/oca' };
  project.bundleExtras = { x_note: 'kept' };
  return project;
}

const file = (content: unknown) => JSON.stringify(content);

describe('project files', () => {
  it('round-trips every part of a project, the sample and I14Y links included', () => {
    const project = fullProject();
    const parsed = parseProjectFile(serializeProjectFile(project));
    expect(parsed).toEqual({ ok: true, project });
  });

  it('writes the format and the version around the project', () => {
    const project = fullProject();
    const content = JSON.parse(serializeProjectFile(project));
    expect(Object.keys(content)).toEqual(['format', 'version', 'project']);
    expect(content.format).toBe('oca-generator-project');
    expect(content.format).toBe(PROJECT_FILE_FORMAT);
    expect(content.version).toBe(1);
    expect(content.version).toBe(PROJECT_FILE_VERSION);
  });

  it('names the file after the credential name in the first language', () => {
    const project = fullProject();
    expect(projectFileName(project)).toBe('hundebewilligung.oca-project.json');
    project.meta['de-CH'].name = '  Führerausweis: Kat. B / C1 ';
    expect(projectFileName(project)).toBe('fuhrerausweis-kat-b-c1.oca-project.json');
    project.meta['de-CH'].name = 'Élève – Carte d’étudiant 2026';
    expect(projectFileName(project)).toBe('eleve-carte-d-etudiant-2026.oca-project.json');
    project.meta['de-CH'].name = 'a'.repeat(100);
    expect(projectFileName(project)).toBe(`${'a'.repeat(80)}.oca-project.json`);
  });

  it('names a file without a credential name untitled-credential', () => {
    const project = fullProject();
    project.meta['de-CH'].name = '';
    expect(projectFileName(project)).toBe('untitled-credential.oca-project.json');
    project.meta['de-CH'].name = '—?!';
    expect(projectFileName(project)).toBe('untitled-credential.oca-project.json');
    expect(projectFileName(emptyProject([]))).toBe('untitled-credential.oca-project.json');
  });

  it('refuses what is not a project file', () => {
    const project = fullProject();
    for (const text of [
      '',
      'not json',
      '[]',
      'null',
      file(project),
      file({ version: 1, project }),
      file({ format: 'something-else', version: 1, project }),
      file({ format: PROJECT_FILE_FORMAT, project }),
      file({ format: PROJECT_FILE_FORMAT, version: '1', project }),
      file({ format: PROJECT_FILE_FORMAT, version: 0, project }),
      file({ format: PROJECT_FILE_FORMAT, version: 1.5, project }),
      file({ format: PROJECT_FILE_FORMAT, version: 1 }),
      file({ format: PROJECT_FILE_FORMAT, version: 1, project: { ...project, root: null } }),
      file({ format: PROJECT_FILE_FORMAT, version: 1, project: { ...project, version: 2 } }),
      file({ format: PROJECT_FILE_FORMAT, version: 1, project: { ...project, languages: 'de-CH' } }),
    ]) {
      expect(parseProjectFile(text), text).toEqual({ ok: false, error: 'invalid' });
    }
  });

  it('refuses a file saved by a newer version', () => {
    const project = fullProject();
    expect(parseProjectFile(file({ format: PROJECT_FILE_FORMAT, version: 2, project }))).toEqual({ ok: false, error: 'newer' });
    expect(parseProjectFile(file({ format: PROJECT_FILE_FORMAT, version: 99, project: 'anything' }))).toEqual({ ok: false, error: 'newer' });
  });
});
