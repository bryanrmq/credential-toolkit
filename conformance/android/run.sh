#!/usr/bin/env bash
# Runs WalletConformanceTest.kt inside eidch-android-wallet at the tag pinned in conformance/versions.json.
# Usage: conformance/android/run.sh [out] (default conformance/out, from conformance/generate.ts).
# Needs JDK 21 and an Android SDK (ANDROID_HOME); the wallet's Gradle wrapper fetches the rest.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="$(cd "${1:-$root/conformance/out}" && pwd)"
repository="$(jq -r .android.repository "$root/conformance/versions.json")"
tag="$(jq -r .android.tag "$root/conformance/versions.json")"
commit="$(jq -r .android.commit "$root/conformance/versions.json")"
wallet="${WALLET_DIR:-$root/conformance/.wallets/android}"

if [ ! -d "$wallet/.git" ]; then
  git clone --quiet --depth 1 --branch "$tag" "$repository" "$wallet"
fi
actual="$(git -C "$wallet" rev-parse HEAD)"
if [ "$actual" != "$commit" ]; then
  echo "$wallet is at $actual, but $tag is pinned to $commit in conformance/versions.json." >&2
  exit 2
fi

# The test is added next to the wallet's own unit tests; no wallet file is changed.
target="$wallet/app/src/test/java/ch/admin/foitt/wallet/conformance"
mkdir -p "$target"
cp "$here/WalletConformanceTest.kt" "$target/"
if [ -n "$(git -C "$wallet" status --porcelain --untracked-files=no)" ]; then
  echo "$wallet has changes to tracked files; the run needs the tag unmodified." >&2
  exit 2
fi

find "$out" -name android.json -delete
(cd "$wallet" && CONFORMANCE_OUT="$out" ./gradlew --no-daemon --stacktrace :app:testDevDebugUnitTest \
  --tests 'ch.admin.foitt.wallet.conformance.WalletConformanceTest')
echo "Android $tag ($commit): results written to $out/*/android.json"
