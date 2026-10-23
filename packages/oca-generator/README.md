# @bryanrmq/oca-generator

Build and check the OCA bundle of a swiyu SD-JWT credential outside the browser, in your own tools
and in CI. This is the logic of the [OCA Generator](https://github.com/bryanrmq/oca-generator) web
app: it reads the project files the app saves (`*.oca-project.json`), reports the same issues, and
builds the same bundle, `uri#integrity` value and VCT `display` snippet, and the `issuer_metadata.json`
of the swiyu generic issuer.

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
| `buildIssuerMetadata(project)` | The generic issuer's `issuer_metadata.json` (`ISSUER_METADATA_FILE_NAME`): `{ metadata, json, placeholders }`. The infrastructure keeps the generic issuer's `${external-url}` (`EXTERNAL_URL_PLACEHOLDER`), which the service fills in; the configuration entry under the Configuration id is the project's: `dc+sd-jwt`, ES256, `jwk`, `vct` and `vct_metadata_uri`, the issuer and credential `display` and one claim per attribute. `vct_metadata_uri#integrity` holds `VCT_INTEGRITY_PLACEHOLDER`, to replace with the SRI hash of `vct.json` as served. `placeholders` lists each placeholder left in `json` (`{ text, explanation, integrity }`). No `profile_version` and no encryption fields: the generic issuer adds them itself. |
| `serializeIssuerMetadata(metadata)` | The file text: 2-space JSON, the same bytes for the same project. |
| `issuerOf(project)` | The issuer settings (`project.issuer`: issuer name per language, logo, Issuer URL, identifiers), with a name for every language. Projects saved before them read as empty. They never go into the bundle. |
| `issuerIdentifiers(project)`, `defaultIdentifiers(name)` | The Configuration id and Type key of the generic issuer files: the ones set in the project, else derived from the credential name (`Lernfahrausweis` gives `lernfahrausweis_sd_jwt` and `lernfahrausweis-v01`). Both match `IDENTIFIER_PATTERN` (`^[a-z0-9_-]+$`). |
| `isIssuerLogo(uri)`, `isIssuerUrl(value)` | Whether a value can be the issuer logo (a PNG or JPEG data URL) or the Issuer URL (a real https URL). |
| `importBundle(bundle)` | A project from a parsed bundle, with a report of what was repaired. Throws `ImportError`. |
| `parseJsonText(text)` | `JSON.parse` that throws an `ImportError` naming the line and column. |

The types (`Project`, `IssuerSettings`, `Issue`, `BundleJson`, `ExportOutputs`, …) are exported too.

## Command line

The package installs an `oca` command that checks a project file and builds its bundle, for scripts and
CI. It uses the API above and makes no network request.

```bash
npx -p @bryanrmq/oca-generator oca check pet-permit.oca-project.json   # or, once installed: npx oca check …
```

```text
oca build <project.oca-project.json> [-o bundle.json] [--vct vct.json]
oca check <project.oca-project.json>
```

- **`oca check`** lists the issues the app's Issues panel lists, in the same words: errors first, then
  warnings, each with where it is (the attribute's key path, or `Credential`, `Languages`, `Hosting`) and
  the languages it occurs in.

  ```text
  Errors (1)
    ● lastName (de-CH, en-US): "{{nope}}" does not match any attribute.

  Warnings (1)
    ● Hosting: The bundle URL should start with https://.

  1 error, 1 warning.
  ```

- **`oca build`** checks the same way, then writes the bundle byte for byte as the app downloads it, to
  `-o <file>` or to stdout, and prints its `uri#integrity` and the VCT `display` snippet (or writes the
  snippet to `--vct <file>`). When the bundle goes to stdout, everything else goes to stderr, so
  `oca build project.oca-project.json > oca-bundle.json` works. It writes nothing when there are errors.

| Exit code | Meaning |
| --- | --- |
| `0` | No errors. Warnings are printed. |
| `1` | Validation errors: `oca build` wrote nothing. |
| `2` | Input it can't use: a file it can't read or write, a file that isn't a project file, one saved by a newer app, or bad arguments. |

Colours are used only on a terminal, and never when `NO_COLOR` is set. `oca --help` and `oca --version`
work as usual.

In CI, for example:

```yaml
- run: npx -p @bryanrmq/oca-generator oca build credential.oca-project.json -o public/oca/oca-bundle.json --vct vct-display.json
```

## License

[MIT](LICENSE) © 2026 Bryan Reymonenq.
