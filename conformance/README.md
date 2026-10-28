# Wallet conformance

Our own checks (`src/core/validate`, the golden files, the unit tests) compare the output with our reading of the
wallet code. This harness runs the **released wallets' own code** on what Credential Toolkit generates, and recomputes
every hash with tools other than ours. The workflow is `.github/workflows/conformance.yml`. It runs on pull requests
that touch `src/core`, `packages`, `src/examples` or `conformance`, every Monday, and on demand.

## Pinned wallets

`versions.json` pins the wallets to their release tags. The run never uses `main`.

| Wallet | Tag | Commit |
|---|---|---|
| [eidch-android-wallet](https://github.com/swiyu-admin-ch/eidch-android-wallet/tree/v1.19.0) | v1.19.0 | `c29a6f3` |
| [eidch-ios-wallet](https://github.com/swiyu-admin-ch/eidch-ios-wallet/tree/v1.19.0) | v1.19.0 (App Store 1.19.0; the tag has no GitHub Release) | `42e746c` |

To move to a new release, change the tag and the commit in `versions.json` and run the workflow. Both `run.sh`
scripts refuse a checkout whose commit differs from the pin.

## Steps

1. **`generate.ts`** exports every sample with `exportProject`, the path the app and `ctk build` take, and writes
   `out/<sample>/`. Files:
   - `oca-bundle.json`
   - `vct.json` and `issuer_metadata.json`, as generated
   - `vct.served.json` and `issuer_metadata.served.json`, with `${external-url}` filled in as the generic issuer
     serves them
   - `credential.json`, the claims
   - `preview.json`, what our preview shows
   - `manifest.json`, the URLs and `#integrity` values
   - `project.credential-project.json`, to open the sample in the app

   Samples without an Issuer URL get `https://issuer.conformance.example`. Samples without a hosting URL get one under
   it.
2. **`hashes/check.py`** recomputes the hashes with separate implementations, pinned in `hashes/requirements.txt`:
   - Every `#integrity` (`sha256-<base64>` of the exact bytes served), with `openssl dgst -sha256 -binary | openssl
     base64 -A`. That covers the bundle as a file or as the whole data URL, and `vct_metadata_uri` over
     `vct.served.json`.
   - Every capture base digest, with [rfc8785](https://pypi.org/project/rfc8785/) (Trail of Bits) for JCS and
     WebOfTrust [keripy](https://github.com/WebOfTrust/keripy) `Diger` for the SHA-256 digest and its CESR encoding
     (code `I`).
   - No maintained OCA library implements the swiyu profile's digest (the `digest` field set to 44 `#`, then JCS),
     so the check composes these two libraries rather than reusing our `src/core/cesr.ts`. Overlays carry no digest
     in this profile. The check confirms that each overlay's `capture_base` names a capture base of the bundle.
3. **`android/run.sh`** clones the Android wallet at the pin and adds `WalletConformanceTest.kt` next to its unit
   tests. It then runs the test with the wallet's own Gradle build (`:app:testDevDebugUnitTest`). For each sample,
   the test runs:
   - `FetchDeferredVcMetadataByFormatImpl`, the deferred-issuance path from a credential configuration of the
     Issuer Metadata. It calls `ResolveMetaDataIntegrityImpl`, `FetchTypeMetadataImpl` (parses `TypeMetadata` and
     checks `vct_metadata_uri#integrity`), and `FetchOcaBundleImpl` (data URL or URL, checks `uri#integrity`).
   - `OcaBundlerImpl` with the real `OcaCesrHashValidatorImpl`, `OcaCaptureBaseValidatorImpl`,
     `OcaOverlayValidatorImpl`, `TransformOcaOverlaysImpl`, `GenerateOcaClaimDataImpl` and
     `GenerateOcaCredentialDataImpl`.
   - `GenerateOcaDisplaysImpl` on `credential.json`, with `GenerateOcaClaimDisplaysImpl` and `ValidateImageImpl`.

   It writes `android.json`: whether the wallet accepted the files (or its error and the step), the credential
   displays, the cluster tree, and the parsed attributes (`OcaClaimData`).
4. **`ios/run.sh`** clones the iOS wallet at the pin and adds `WalletConformanceTests.swift` to the
   `BITOpenIDTests` target, which already imports `BITOca`. It then runs the test with `xcodebuild test` on an iOS
   simulator, because the packages are iOS-only. For each sample, the test runs:
   - `FetchVcMetadataForVcSdJwtUseCase.execute(metadata:)` on the credential configuration (`typeMetadataUri`), with
     the real `TypeMetadataService` (checks `vct_metadata_uri#integrity` and `vct`), `VcSchemaService` and
     `OCABundleService` (data URL or URL, `SRIValidator`).
   - `OcaBundler` (CESR digests, capture bases, overlays).
   - `CaptureBaseDisplayGenerator` and `OverlayBundleAttributesGenerator`.

   It writes `ios.json`.
5. **`compare.ts`** compares each wallet's display with `preview.json`. It writes `out/report.md` and
   `out/report.json`, and adds the summary to the job summary. The run fails when:
   - a wallet rejects a sample;
   - a hash doesn't match;
   - a wallet result is missing (`--require android,ios`);
   - a display difference is not listed in `known-differences.json`.

## Samples

`samples.ts` defines the samples:

- Every start screen example: `src/examples/oca-bundle-*.json`.
- `packages/credential-toolkit/test/fixtures/sample.credential-project.json`.
- The imported bundle fixtures: `src/test/fixtures/oca-bundle-{elfa,chasseral,nested,simple-sample}.json`.
- Two edge cases built with the model's helpers:
  - `edge-structures`: four languages, a nested group, a list of groups, a list of values, entry codes, sensitive
    attributes, an image claim (Binary, base64, `image/png`), a data URL image, dates with Format overlays, and
    light and dark branding with a logo and a summary template. The bundle is embedded as a data URL.
  - `edge-hosted`: the same project, with the bundle hosted at a URL.

Imported bundles have no sample credential. For those, `claims.ts` makes one value per attribute, of its type, at its
source path, with two items per list.

## What is compared

The wallet code the harnesses run stops before the screens. Where a screen then sorts, filters or picks a language,
`compare.ts` applies that wallet rule to the wallet's output, then compares it with the preview.

| | Android | iOS |
|---|---|---|
| Card, per language and theme | Name, description: the primary field, else the meta description (`GenerateOcaCredentialDataImpl`). Also the logo and the background colour. | Name, description, primary field, logo and background colour of the root capture base (`CaptureBaseDisplayGenerator`). |
| Details, per project language | The cluster tree, compared row by row: section and group paths, titles, claim paths, labels, value types, and entry labels or values for text, numbers and booleans. | For each claim the preview shows: the attribute whose data source is the claim path, with its label, entry label, type, format, standard and character encoding. The attribute `order` must not decrease down a group. |

Rules `compare.ts` applies to the wallet output:

- **Android order:** a negative order goes last, and ties keep their order. That's
  `CredentialElementCollectionExt.elementComparator`, used by `MapToCredentialClaimClusterImpl` and `sortByOrder`.
  Rows come in the order the wallet produces them: claims, then sub-clusters.
- **Android empty clusters:** clusters with no claim below them are dropped, as in
  `MapToCredentialClaimClusterImpl.filterEmptyItems`.
- **Android language:** the harness takes the display whose locale is the language, else the `fallback` display.
  It doesn't run `GetLocalizedDisplayImpl`.
- **Android values:** a display's entry label wins over the value, as in `MapToCredentialClaimDataImpl`. Dates and
  images are formatted or decoded by the screen, so only their value type is compared.
- **Titles with templates:** the screen fills in titles that contain `{{…}}`. The harness doesn't run that code, so
  those titles aren't compared.
- **iOS order:** an attribute without an order counts as `Int16.max`, as in `OcaClaimGenerator`. iOS sorts ties in
  no defined order.

Not covered: date, number and image formatting; the "Sensitive" pill; the iOS cluster tree (built in `BITCredential`,
outside `BITOca`); and issuer displays from the Issuer Metadata.

## Shims

The harnesses add test files only. Each runs the wallet's classes unchanged. The only code that is not the wallet's
is the plumbing below.

**Android (`android/WalletConformanceTest.kt`)**

| Shim | Reason |
|---|---|
| Classes are built with their constructors, not Hilt. | Hilt needs the Android app. The arguments are the production implementations. |
| `SafeJson(UtilModule().provideJsonSerializer())` and `OpenId4VcModule.provideJsonSerializer()` (by reflection) | These are the Json instances Hilt provides. The openid4vc provider is `internal`. |
| `FetchTypeMetadataImpl` and openid4vc's `SafeJson` are built by reflection. | They are `internal` to the openid4vc module. Hilt builds them the same way. |
| `credential_configurations_supported` is decoded with openid4vc's `AnyCredentialConfigurationListSerializer` (by reflection). | It's the serializer `IssuerCredentialInfo` uses. The whole `IssuerCredentialInfo` isn't decoded: the generic issuer adds the encryption fields it requires when it serves the file. |
| `TypeMetadataRepository` and `OcaRepository` serve the generated files at their URLs. | They replace the network. |
| `FetchVcSchema` fails if it's called. | The generated Type Metadata has no `schema_uri`, so the wallet never calls it. |

**iOS (`ios/WalletConformanceTests.swift`)**

| Shim | Reason |
|---|---|
| `OpenIDRepositoryProtocolSpy` (the wallet's own `@Spyable` spy) serves `vct.served.json` for `fetchTypeMetadata`. | It replaces the network. It decodes the body with `NetworkContainer.shared.decoder()`, as `NetworkService.request` does. |
| `OCARepositoryProtocol` serves `oca-bundle.json` at the hosting URL. | It replaces the network. |
| The credential configuration is decoded with `JSONDecoder` from the served `issuer_metadata.json`. | The wallet gets the Issuer Metadata as a JWT signed by the generic issuer, which adds the signature and its own fields. The default `JSONDecoder` matches `NetworkContainer`'s key strategy. |

## Known differences

`known-differences.json` lists accepted differences between a wallet and our preview. Each entry has:

- `id`
- `platform`: `android`, `ios` or `both`
- `sample`: a sample id or `*`
- `check`: `card`, `details`, `attribute` or `order`
- `where`: optional, a substring of the difference's location
- `reason`
- `walletCode`: a link to the wallet code at the pinned tag

A difference that no entry explains fails the run.

## Running it locally

```bash
npm ci
node conformance/generate.ts
python3 -m venv .venv && .venv/bin/pip install -r conformance/hashes/requirements.txt
.venv/bin/python -I conformance/hashes/check.py conformance/out
conformance/android/run.sh   # JDK 21 and ANDROID_HOME
conformance/ios/run.sh       # macOS, Xcode with Swift 6.3+, an iPhone simulator
node conformance/compare.ts conformance/out --require android,ios
```

keripy needs libsodium (`apt install libsodium23`, `brew install libsodium`). The wallet checkouts go to
`conformance/.wallets/`, or to `WALLET_DIR`. Generated files go to `conformance/out/`. Both are git-ignored.
