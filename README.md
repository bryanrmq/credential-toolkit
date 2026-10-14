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
deploy. `.github/workflows/ci.yml` also lints, type-checks and runs the unit and e2e tests on
every push and pull request.

The site runs on Vercel's Hobby plan, which is for personal, non-commercial use. If an
organisation takes the project over, move it to that organisation's account or a paid plan.
