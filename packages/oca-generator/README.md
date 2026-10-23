# @bryanrmq/oca-generator

Build and check the OCA bundle of a swiyu SD-JWT credential outside the browser, in your own tools
and in CI. This is the logic of the [OCA Generator](https://github.com/bryanrmq/oca-generator) web
app: it reads the project files the app saves (`*.oca-project.json`), reports the same issues, and
builds the same bundle, `uri#integrity` value and VCT `display` snippet.

ES modules with TypeScript declarations, for Node 20 or later (and browsers). No network access.

## Install

```bash
npm install @bryanrmq/oca-generator
```

## Example

```js
import { readFile, writeFile } from 'node:fs/promises';
import { exportProject, parseProjectFile } from '@bryanrmq/oca-generator';

const file = parseProjectFile(await readFile('pet-permit.oca-project.json', 'utf8'));
if (!file.ok) throw new Error(file.error === 'newer' ? 'Saved by a newer app' : 'Not a project file');

const result = await exportProject(file.project);
for (const issue of result.issues) console.log(`${issue.severity}: ${issue.message}`);
if (result.ok) {
  await writeFile('oca-bundle.json', result.outputs.json);
  console.log(result.outputs.integrity); // sha256-…
  console.log(JSON.stringify(result.vct, null, 2)); // { "display": [ … ] } for the VCT
}
```

## API

| Export | What it does |
| --- | --- |
| `parseProjectFile(text)` | Reads a project file. Gives `{ ok: true, project, baseline? }`, or `{ ok: false, error }` with `'invalid'` (not a project file) or `'newer'` (saved by a newer app). Never throws. |
| `serializeProjectFile(project, baseline?)`, `projectFileName(project)` | Write a project file the app opens, and its file name. |
| `validate(project)` | The issues the app lists: `{ severity: 'error' \| 'warning', code, message, summary, target, subject? }`. Errors block the export. |
| `hasErrors(issues)` | Whether any issue is an error. |
| `exportProject(project)` | Validates, then, when there is no error, builds everything: `{ ok: true, issues, bundle, outputs, vct }`, else `{ ok: false, issues }`. |
| `buildBundle(project)` | The bundle object (`{ bundle, digests }`). Throws when two groups would share a digest; `validate` reports that first. |
| `buildOutputs(project, bundle)` | The bundle text (`json`), its `dataUrl`, the `uri` to reference and its `integrity`. |
| `bundleIntegrity(json, hosting)` | The `uri#integrity` of bundle text as hosted at a URL or embedded as a data URL. |
| `buildVctSnippet(project, outputs)` | The `display` array for the SD-JWT VC Type Metadata. |
| `importBundle(bundle)` | A project from a parsed bundle, with a report of what was repaired. Throws `ImportError`. |
| `parseJsonText(text)` | `JSON.parse` that throws an `ImportError` naming the line and column. |

The types (`Project`, `Issue`, `BundleJson`, `ExportOutputs`, …) are exported too.

## Command line

An `oca` command with `build` and `check` is planned for this package
([#47](https://github.com/bryanrmq/oca-generator/issues/47)).

## License

[MIT](LICENSE) © 2026 Bryan Reymonenq.
