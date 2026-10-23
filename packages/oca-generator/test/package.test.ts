import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundle } from '../../../src/core/export/bundle.ts';
import { buildOutputs, buildVctSnippet } from '../../../src/core/export/outputs.ts';
import type { Project } from '../../../src/core/model.ts';
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
    expect(paths).toContain('dist/cli.js');
    expect(paths).toContain('dist/index.d.ts');
    expect(paths).toContain('README.md');
    expect(paths.filter((path) => !path.startsWith('dist/')).sort()).toEqual(['LICENSE', 'README.md', 'package.json']);
    expect(paths.some((path) => path.includes('.test.'))).toBe(false);
  });

  describe('oca command', () => {
    const work = mkdtempSync(join(tmpdir(), 'oca-cli-'));
    afterAll(() => rmSync(work, { recursive: true, force: true }));

    /** Runs the built `oca` in a child process, as an installed bin would run. */
    function oca(...args: string[]): { status: number | null; stdout: string; stderr: string } {
      const { status, stdout, stderr } = spawnSync(process.execPath, [join(packageDir, 'dist/cli.js'), ...args], { cwd: work, encoding: 'utf8' });
      return { status, stdout, stderr };
    }

    /** The sample fixture changed by `edit`, saved as a project file in the work folder. */
    function projectFile(name: string, edit: (project: Project) => void): string {
      const file = JSON.parse(readFileSync(fixture, 'utf8')) as { project: Project };
      edit(file.project);
      const path = join(work, name);
      writeFileSync(path, JSON.stringify(file));
      return path;
    }

    async function appExport(path: string) {
      const parsed = parseProjectFile(readFileSync(path, 'utf8'));
      if (!parsed.ok) throw new Error(parsed.error);
      const outputs = await buildOutputs(parsed.project, (await buildBundle(parsed.project)).bundle);
      return { outputs, snippet: JSON.stringify(buildVctSnippet(parsed.project, outputs), null, 2) };
    }

    it('builds the bundle, #integrity and VCT snippet the app exports', async () => {
      const { outputs, snippet } = await appExport(fixture);

      const toFiles = oca('build', fixture, '-o', 'bundle.json', '--vct', 'vct.json');
      expect(toFiles.status).toBe(0);
      expect(readFileSync(join(work, 'bundle.json'), 'utf8')).toBe(outputs.json);
      expect(readFileSync(join(work, 'vct.json'), 'utf8')).toBe(`${snippet}\n`);
      expect(toFiles.stdout).toContain('Wrote bundle.json');
      expect(toFiles.stdout).toContain(`uri#integrity  ${outputs.integrity}`);
      expect(toFiles.stdout).not.toContain('"display": [');
      expect(toFiles.stderr).toBe('');

      // Without -o the bundle is all of stdout, byte for byte; the integrity and the snippet go to stderr.
      const toStdout = oca('build', fixture);
      expect(toStdout.status).toBe(0);
      expect(toStdout.stdout).toBe(outputs.json);
      expect(toStdout.stderr).toContain(`uri#integrity  ${outputs.integrity}`);
      expect(toStdout.stderr).toContain(snippet);
      expect(toStdout.stderr).not.toContain('\x1b['); // no colour when not a terminal

      const checked = oca('check', fixture);
      expect(checked).toEqual({ status: 0, stdout: 'No issues. The bundle is ready.\n', stderr: '' });
    });

    it('prints warnings and still builds when there are no errors', async () => {
      const path = projectFile('warnings.oca-project.json', (project) => {
        project.hosting = { mode: 'url', url: 'http://example.org/oca-bundle.json' };
      });

      const checked = oca('check', path);
      expect(checked.status).toBe(0);
      expect(checked.stdout).toBe('Warnings (1)\n  ● Hosting: The bundle URL should start with https://.\n\n1 warning.\n');

      const built = oca('build', path, '-o', 'warnings.json');
      expect(built.status).toBe(0);
      expect(built.stderr).toContain('Hosting: The bundle URL should start with https://.');
      expect(readFileSync(join(work, 'warnings.json'), 'utf8')).toBe((await appExport(path)).outputs.json);
    });

    it('lists errors with their location and languages, exits with 1 and writes nothing', () => {
      const path = projectFile('errors.oca-project.json', (project) => {
        const [first] = project.root.children;
        first.key = 'last name';
        first.labels = { 'de-CH': '{{nope}}', 'en-US': '{{nope}}' };
        project.languages.push('de-CH');
      });

      const checked = oca('check', path);
      expect(checked.status).toBe(1);
      expect(checked.stdout).toBe(
        [
          'Errors (3)',
          '  ● Languages: "de-CH" is listed twice.',
          '  ● last name: "last name" contains spaces or one of . [ ] { } : / " which break templates and paths.',
          '  ● last name (de-CH, en-US): "{{nope}}" does not match any attribute.',
          '',
          '3 errors.',
          '',
        ].join('\n'),
      );

      const built = oca('build', path, '-o', 'errors.json', '--vct', 'errors-vct.json');
      expect(built.status).toBe(1);
      expect(built.stderr).toContain('Errors (3)');
      expect(built.stderr).toContain('Nothing written: fix the errors first.');
      expect(built.stdout).toBe('');
      expect(existsSync(join(work, 'errors.json'))).toBe(false);
      expect(existsSync(join(work, 'errors-vct.json'))).toBe(false);
    });

    it('exits with 2 on input that is not a project file it can open', () => {
      const newer = join(work, 'newer.oca-project.json');
      writeFileSync(newer, JSON.stringify({ ...JSON.parse(readFileSync(fixture, 'utf8')), version: 99 }));

      const notProject = oca('check', join(packageDir, 'package.json'));
      expect(notProject.status).toBe(2);
      expect(notProject.stderr).toContain('is not an OCA Generator project file');
      expect(oca('build', newer).stderr).toContain('was saved by a newer OCA Generator');
      expect(oca('build', newer).status).toBe(2);
      expect(oca('check', 'missing.oca-project.json').status).toBe(2);
      expect(oca('build', fixture, '--colour').status).toBe(2);
      expect(oca('check', fixture, '-o', 'bundle.json').status).toBe(2);
      expect(oca('lint', fixture).status).toBe(2);
      expect(oca().status).toBe(2);
    });

    it('prints its help and version', () => {
      const help = oca('--help');
      expect(help.status).toBe(0);
      expect(help.stdout).toContain('oca build <project.oca-project.json> [-o bundle.json] [--vct vct.json]');
      expect(help.stdout).toContain('Exit codes:');
      const { version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version: string };
      expect(oca('--version')).toEqual({ status: 0, stdout: `${version}\n`, stderr: '' });
    });
  });
});
