import { describe, expect, it } from 'vitest';
import { type Project, emptyProject, newAttribute } from '../model';
import { buildBundle } from './bundle';
import { buildIssuerMetadata } from './issuerMetadata';
import { buildOutputs } from './outputs';
import { exportProject } from './project';
import { buildTypeMetadata } from './typeMetadata';

function clean(): Project {
  const project = emptyProject(['de-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }));
  project.hosting = { mode: 'url', url: 'https://issuer.example.ch/oca/oca-bundle.json' };
  return project;
}

describe('exportProject', () => {
  it('gives what the Output pane shows', async () => {
    const project = clean();
    const result = await exportProject(project);
    const { bundle } = await buildBundle(project);
    const outputs = await buildOutputs(project, bundle);
    expect(result).toEqual({ ok: true, issues: [], bundle, outputs, vct: buildTypeMetadata(project, outputs), issuerMetadata: buildIssuerMetadata(project) });
  });

  it('computes vct_metadata_uri#integrity when the Issuer URL is set', async () => {
    const project = clean();
    project.issuer = { name: { 'de-CH': 'Kanton Bern' }, url: 'https://issuer.example.ch' };
    const result = await exportProject(project);
    if (!result.ok) throw new Error('expected an export');
    const integrity = result.issuerMetadata.metadata.credential_configurations_supported.hundebewilligung_sd_jwt['vct_metadata_uri#integrity'];
    expect(integrity).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
    expect(result.issuerMetadata).toEqual(buildIssuerMetadata(project, integrity));
  });

  it('builds despite warnings and returns them', async () => {
    const project = clean();
    project.hosting = { mode: 'url', url: '' };
    const result = await exportProject(project);
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => `${issue.severity}:${issue.code}`)).toEqual(['warning:hosting-url-missing']);
  });

  it('refuses to build when there are errors', async () => {
    const project = clean();
    project.root.children.push(newAttribute('name', { source: ['other'] }));
    const result = await exportProject(project);
    expect(result).toEqual({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ severity: 'error', code: 'key-duplicate' })]) });
    expect(result).not.toHaveProperty('bundle');
  });
});
