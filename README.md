# OCA Generator

A web app for swiyu issuers to build the OCA bundle of an SD-JWT credential (swiyu
"Visualisation of Verifiable Credential with OCA 1.0") without writing JSON or computing
digests by hand. Everything runs in the browser; nothing is uploaded.

Start from a sample credential, an existing OCA bundle, OID4VCI Credential Issuer Metadata,
or a blank project. Edit names, labels, branding, order, clustering and value translations in
every language, then download the bundle with its `uri#integrity` value and the
`display` snippet for your SD-JWT VC Type Metadata.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit and component tests (Vitest)
npm run e2e        # browser smoke test (Playwright; run `npx playwright install chromium` once)
npm run build      # static site in dist/
```

The OCA logic lives in `src/core` and has no UI dependencies. Test fixtures in
`src/test/fixtures` come from the swiyu wallet and issuer repositories.

## Deployment

Vercel's GitHub integration deploys `main` to production and gives every pull request a
preview URL. `vercel.json` runs the unit tests before the build, so a failing test stops the
deploy. `.github/workflows/ci.yml` also lints, type-checks and runs the unit tests on every
push and pull request.

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
