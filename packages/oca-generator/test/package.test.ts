import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildBundle } from '../../../src/core/export/bundle.ts';
import { buildOutputs, buildVctSnippet } from '../../../src/core/export/outputs.ts';
import { parseProjectFile } from '../../../src/core/projectFile.ts';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/sample.oca-project.json', import.meta.url));

function runSmoke(file: string): { status: number; output: Record<string, unknown> } {
  try {
    const stdout = execFileSync(process.execPath, ['test/smoke.mjs', file], { cwd: packageDir, encoding: 'utf8' });
    return { status: 0, output: JSON.parse(stdout) };
  } catch (error) {
    const { status, stdout } = error as { status: number; stdout: string };
    return { status, output: JSON.parse(stdout) };
  }
}

describe('@bryanrmq/oca-generator', () => {
  beforeAll(() => {
    execFileSync('npm', ['run', 'build', '--silent'], { cwd: packageDir, stdio: 'pipe' });
  }, 60_000);

  it('runs in Node without browser globals and builds the bundle the app exports', async () => {
    const { status, output } = runSmoke(fixture);
    expect(status).toBe(0);

    const parsed = parseProjectFile(readFileSync(fixture, 'utf8'));
    if (!parsed.ok) throw new Error(parsed.error);
    const { bundle } = await buildBundle(parsed.project);
    const outputs = await buildOutputs(parsed.project, bundle);
    expect(output).toMatchObject({
      ok: true,
      issues: [],
      json: outputs.json,
      uri: 'https://example.org/oca/oca-bundle.json',
      integrity: outputs.integrity,
      vct: buildVctSnippet(parsed.project, outputs),
      roundTrip: true,
    });
  });

  it('exports the documented API', async () => {
    const entry = await import(new URL('../dist/index.js', import.meta.url).href);
    expect(Object.keys(entry).sort()).toEqual([
      'BUNDLE_FILE_NAME',
      'ImportError',
      'PROJECT_FILE_EXTENSION',
      'PROJECT_FILE_FORMAT',
      'PROJECT_FILE_VERSION',
      'buildBundle',
      'buildOutputs',
      'buildVctSnippet',
      'bundleDataUrl',
      'bundleIntegrity',
      'exportProject',
      'hasErrors',
      'importBundle',
      'isProject',
      'parseJsonText',
      'parseProjectFile',
      'projectFileName',
      'serializeBundle',
      'serializeProjectFile',
      'validate',
    ]);
  });

  it('packs only the build, the README and package.json', () => {
    const [pack] = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    ) as Array<{ files: Array<{ path: string }> }>;
    const paths = pack.files.map((file) => file.path);
    expect(paths).toContain('dist/index.js');
    expect(paths).toContain('dist/index.d.ts');
    expect(paths).toContain('README.md');
    expect(paths.filter((path) => !path.startsWith('dist/')).sort()).toEqual(['LICENSE', 'README.md', 'package.json']);
    expect(paths.some((path) => path.includes('.test.'))).toBe(false);
  });
});
