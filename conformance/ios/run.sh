#!/usr/bin/env bash
# Runs WalletConformanceTests.swift inside eidch-ios-wallet at the tag pinned in conformance/versions.json, on an
# iOS simulator (the wallet's packages are iOS-only).
# Usage: conformance/ios/run.sh [out] (default conformance/out, from conformance/generate.ts).
# Needs Xcode with Swift 6.3 or later (the packages' tools version) and an iOS simulator runtime.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="$(cd "${1:-$root/conformance/out}" && pwd)"
repository="$(jq -r .ios.repository "$root/conformance/versions.json")"
tag="$(jq -r .ios.tag "$root/conformance/versions.json")"
commit="$(jq -r .ios.commit "$root/conformance/versions.json")"
wallet="${WALLET_DIR:-$root/conformance/.wallets/ios}"

if [ ! -d "$wallet/.git" ]; then
  git clone --quiet --depth 1 --branch "$tag" "$repository" "$wallet"
fi
actual="$(git -C "$wallet" rev-parse HEAD)"
if [ "$actual" != "$commit" ]; then
  echo "$wallet is at $actual, but $tag is pinned to $commit in conformance/versions.json." >&2
  exit 2
fi

# The test is added next to the wallet's own BITOpenID tests; no wallet file is changed.
package="$wallet/Modules/Features/BITOpenID"
mkdir -p "$package/Tests/BITOpenIDTests/Conformance"
cp "$here/WalletConformanceTests.swift" "$package/Tests/BITOpenIDTests/Conformance/"
if [ -n "$(git -C "$wallet" status --porcelain --untracked-files=no)" ]; then
  echo "$wallet has changes to tracked files; the run needs the tag unmodified." >&2
  exit 2
fi

simulator="${SIMULATOR_ID:-$(xcrun simctl list devices available --json \
  | jq -r '[.devices | to_entries[] | select(.key | test("iOS")) | .value[] | select(.name | test("^iPhone"))] | last | .udid')}"
if [ -z "$simulator" ] || [ "$simulator" = "null" ]; then
  echo "No iPhone simulator available." >&2
  exit 2
fi

# Xcode names the package's test scheme after the package, or `<package>-Package` when it has several products.
scheme="$(cd "$package" && xcodebuild -list -json | jq -r '(.workspace // .project).schemes as $s | if ($s | index("BITOpenID-Package")) then "BITOpenID-Package" else "BITOpenID" end')"

find "$out" -name ios.json -delete
# xcodebuild passes TEST_RUNNER_* variables to the test process without the prefix.
(cd "$package" && TEST_RUNNER_CONFORMANCE_OUT="$out" xcodebuild test \
  -scheme "$scheme" \
  -destination "platform=iOS Simulator,id=$simulator" \
  -only-testing:BITOpenIDTests/WalletConformanceTests \
  -skipMacroValidation -skipPackagePluginValidation \
  -derivedDataPath "$root/conformance/.wallets/ios-derived-data")
echo "iOS $tag ($commit): results written to $out/*/ios.json"
