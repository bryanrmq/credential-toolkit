# Credential Toolkit

**OCA bundles, type metadata and issuer metadata for swiyu credentials.**

Credential Toolkit is a web app for developers and issuers who build SD-JWT VC credentials for
the swiyu wallets. You describe the credential once: its attributes, labels, colours, logo and
translations. The toolkit writes the files the wallet and the swiyu generic issuer need, and
computes the digests and `#integrity` values for you. A preview shows roughly how the iOS and
Android wallets draw the card and its details while you type, so you catch layout and
translation problems before you issue anything.

Your project stays in your browser. Only these requests leave it: I14Y searches and concept
lookups (api.i14y.admin.ch), a check for the latest release (api.github.com), anonymous page-view
statistics (Vercel Web Analytics) and, when you ask for it, a download of your published bundle
from its hosting URL.

https://github.com/user-attachments/assets/31c12a22-7d8e-4fd8-afde-3625e1862d69

**[Open Credential Toolkit](https://credential-toolkit.vercel.app)**

Credential Toolkit is a community project. It is not an official swiyu or Swiss federal product.

## What it builds

From one project you get:

- the **OCA bundle** (swiyu "Visualisation of Verifiable Credential with OCA 1.0"), with its
  `uri#integrity` value;
- the **SD-JWT VC Type Metadata** (`vct.json`), which points the wallet to that bundle;
- the credential's part of the **Issuer Metadata** (`issuer_metadata.json`) for the swiyu
  generic issuer: its configuration, issuer name and logo.

The wallet previews follow the released iOS and Android wallets v1.19.0. The issuer files follow
swiyu-issuer 5.0.1.

## Features

### Start from what you already have

- **A sample credential.** Paste the decoded claims of an issued credential. Attributes, types,
  nesting and source paths are filled in for you.
- **An existing OCA bundle.** Edit it, add a language or fix its digests.
- **OID4VCI Issuer Metadata.** Convert the display and claims of a credential configuration.
- **A real example.** Open the electronic learner-driver permit (elfa) bundle from the swiyu
  program: nested attributes, images, five languages.
- **A blank project.** Add attributes one by one.

### Edit the structure

- An attribute tree with groups and lists of objects, in the order the wallet lists them.
- Drag and drop to reorder, or drop onto a group to move items inside it. Drag a multi-selection
  to move all of it at once.
- Rename in place, duplicate, cut, copy and paste, group and ungroup, collapse and expand.
- Select several items to group, move or delete them together.
- Filter the tree by key or label.
- Undo and redo for every change.
- Keyboard shortcuts for the common actions: add, delete, group, move up and down, duplicate,
  rename, filter, undo and redo.
- Templates follow renamed and moved attributes: type `{{` in the primary field or a list
  headline to insert an attribute value.

### Write every text in every language

- Each text field lists every project language, with the editing language first. Empty
  translations are highlighted.
- A Translations view puts every text in one table: one row per text, one column per language.
- Value translations show coded values as text, for example `M` → Male or `true` → Yes.
- **On-device translation.** In browsers with a built-in translator, fill missing languages from
  the editing language. The text never leaves your device.
- **I14Y.** Search the Swiss interoperability platform (I14Y) for standard data elements and add
  them as attributes, with their type, labels and value lists in every language I14Y has. The
  toolkit spots attributes that look like I14Y concepts, links them, and can fill missing
  languages from the linked concepts.
- Texts filled in by I14Y or the translator are marked for review until you confirm or edit them.

### Branding

- Credential name, description, logo, background colour and primary field.
- An optional dark-mode variant.
- Logo checks for format and size, with a one-click shrink to 512 px.

### Wallet previews

- iOS and Android previews of the card, the offer card, the home list row and the details screen.
- The details screen formats values the way the wallets do, shows the card status and the
  "Issued by" row, and draws Android's fallback pattern on default-colour cards.
- Each preview lists where the other platform differs: row order, labels, values, hidden or
  empty groups, sensitive pills and rejected images.
- Click a row in the details preview to open its attribute. Select an attribute and the preview
  scrolls to its row.
- Attach a sample credential to see real values and to check that every source path exists. The
  sample is never exported.

### Checks and fixes

- An Issues panel checks the project as you edit and lists errors and warnings.
- Click an issue to jump to its field.
- **Fix** and **Fix all** repair the issues that don't need your own text, with undo.
- Errors block the download. The top bar shows the error and warning counts.

### Compare with the published bundle

- Load the bundle you published, from its hosting URL or from a file.
- The Changes tab lists what changed since then: attributes, labels, branding and languages.
  Click a change to jump to it.
- It warns when `uri#integrity` changed, so you know to update the type metadata.

### Export the OCA bundle

- Host the bundle at your own URL, or embed it as a data URL.
- The Output pane has two tabs: Bundle and Changes.
- Copy the JSON, the data URL and its `uri#integrity` value, or download the bundle.
- Each capture base gets a Data Source overlay for both `vc+sd-jwt` and `dc+sd-jwt`, with the
  same paths. The swiyu wallets look the paths up by format: iOS up to 1.18 only reads
  `vc+sd-jwt`, and Android only reads the format named in the issuer metadata.

### Metadata page and issuer files

- A Metadata page, next to the OCA in the top bar, holds the issuer settings: issuer name in
  every language, issuer logo, issuer URL, and the configuration id and type key the generic
  issuer uses.
- Its right-hand column has three tabs: Preview, Type metadata and Issuer metadata. Preview shows
  the details screen with the "Issued by" row.
- Type metadata gives the full `vct.json`. Issuer metadata gives the credential's
  `issuer_metadata.json` for the swiyu generic issuer.
- Each file tab has a download button named after the file, a Copy button and the file size.
- A "Replace before use" list names the placeholders left in the file, such as
  `${external-url}`, and explains each one. The file shows them highlighted. When none are left,
  the tab shows "Ready".
- With an Issuer URL set, the toolkit computes `vct_metadata_uri#integrity` from the `vct.json`
  the issuer will serve. Without one, the tab gives the `curl` and `openssl` command to compute it
  after deploying.
- Errors in the project block the metadata downloads. Issuer errors don't block the bundle
  download.
- The [npm package](#npm-package) builds both files too.

### Projects and drafts

- Drafts save in your browser as you type. Keep several, and pick one from Recent projects on the
  start screen. Rename, download or delete them there.
- Save and open project files (`*.credential-project.json`) to share a project or keep it in
  version control. A project file keeps its published baseline for comparison.

### Getting around

- A command palette (⌘K or Ctrl+K) searches attributes and commands.
- A guided tour of the workspace, which you can replay from the menu.
- The app shows its latest release next to its name, linked to the release notes.

### In your own tools

The same logic ships as the npm package `@bryanrmq/credential-toolkit`, with a
`credential-toolkit` command (or `ctk` for short) to build and check bundles in scripts and CI.
See [npm package](#npm-package).

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit and component tests (Vitest)
npm run e2e        # browser smoke test (Playwright; run `npx playwright install chromium` once)
npm run lint       # oxlint
npm run typecheck  # tsc -b
npm run build      # static site in dist/
npm run build:lib  # the npm package in packages/credential-toolkit/dist
```

### Stack

A static single-page app: React 19, TypeScript, Vite, zustand for state, dnd-kit for drag and
drop, and IndexedDB for drafts. Tests use Vitest, Testing Library and Playwright. Linting uses
oxlint.

### Layout

- `src/core`: the OCA, metadata, import, export and validation logic. It has no UI dependencies
  and is what the npm package publishes.
- `src/state`: the store, drafts and persistence.
- `src/ui`: the start screen, the workspace and the wallet previews.
- `src/strings.ts`: every piece of interface copy.
- `packages/credential-toolkit`: the npm package and its CLI.

Test fixtures in `src/test/fixtures` come from the swiyu wallet and issuer repositories.

## npm package

The core is also published as [`@bryanrmq/credential-toolkit`](packages/credential-toolkit), to
build and check bundles from project files in your own tools and in CI. It runs in Node 20 or later.

```bash
npm install @bryanrmq/credential-toolkit
```

```js
import { exportProject, parseProjectFile } from '@bryanrmq/credential-toolkit';

const file = parseProjectFile(text); // a *.credential-project.json saved by the app
const result = file.ok && (await exportProject(file.project));
// result.issues, and when there is no error: result.outputs.json, result.outputs.integrity,
// result.vct (vct.json) and result.issuerMetadata (issuer_metadata.json)
```

Its entry point is `src/core/index.ts`, which lists the public API; the
[package README](packages/credential-toolkit/README.md) documents it. `packages/credential-toolkit`
compiles `src/core` with `tsc` (`npm run build:lib`) against Node's types only, so browser globals
can't slip in. That's also why relative imports in `src/core` name their `.ts` file.

The package also has a `credential-toolkit` command, with the short alias `ctk`, for scripts and
CI (`packages/credential-toolkit/src/cli.ts`, compiled after the library and importing it by its
package name, so it only uses the public API):

```bash
npx -p @bryanrmq/credential-toolkit credential-toolkit check pet-permit.credential-project.json
npx -p @bryanrmq/credential-toolkit ctk build pet-permit.credential-project.json -o oca-bundle.json --vct vct.json
```

Both commands exit with 0 when there are no errors, 1 when there are validation errors and 2 for
anything else, such as an unreadable file or bad arguments.

To release it, set `version` in `packages/credential-toolkit/package.json`, merge, then push a
`lib-v<version>` tag (`git tag lib-v0.1.0 && git push origin lib-v0.1.0`).
`.github/workflows/publish-lib.yml` checks the tag against the version, runs the tests and
publishes with npm provenance, using the `NPM_TOKEN` repository secret. It can also run by hand,
with a dry-run option. App releases (`v*` tags) are separate.

## Deployment

Vercel's GitHub integration deploys `main` to production and gives every pull request a
preview URL. `vercel.json` runs the unit tests before the build, so a failing test stops the
deploy. `.github/workflows/ci.yml` also lints, type-checks and runs the unit tests on every
push and pull request.

The site uses Vercel Web Analytics for page view counts. Project content is never sent.

The site runs on Vercel's Hobby plan, which is for personal, non-commercial use. If an
organisation takes the project over, move it to that organisation's account or a paid plan.

## Releases

Every push to `main` that passes the Test workflow can publish a GitHub Release.
`.github/workflows/release.yml` reads the Conventional Commit titles of the PRs merged since
the last `v*` tag: `feat` bumps the minor version, `fix`, `perf` and `refactor` bump the patch
version, and a `!` or `BREAKING CHANGE` bumps the major version (the minor version while still
on `0.x`). Merges that only contain `chore`, `docs`, `ci` and similar commits do not release on
their own; they appear in the next release's notes. The first release uses the version in
`package.json`. To release anyway, run the Release workflow by hand with "force" ticked.
Preview the next release locally with `DRY_RUN=true .github/scripts/release.sh`.

The app shows the latest release next to its name, linked to the release notes. It reads it from
the GitHub API in the browser and caches it for an hour, so a new release shows without a rebuild.

## License

[MIT](LICENSE) © 2026 Bryan Reymonenq.

The test fixtures in `src/test/fixtures` and the digest check ported in `src/test/walletCesr.ts`
come from the [swiyu](https://github.com/swiyu-admin-ch) wallet and issuer repositories,
© 2024 Swiss Confederation, MIT License.
