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

`.github/workflows/deploy.yml` tests every push and pull request and publishes `main` to
GitHub Pages. Enable Pages with "GitHub Actions" as the source in the repository settings.
