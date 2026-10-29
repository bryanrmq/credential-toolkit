"""Recomputes every hash in the generated files with tools other than ours, and writes `<out>/hashes.json`.

- `#integrity` (`sha256-<base64>` of the exact bytes served): `openssl dgst -sha256 -binary`, then `openssl base64 -A`.
  The bundle is hashed as a file when it is hosted, and as the whole data URL when it is embedded; `vct_metadata_uri`
  over `vct.served.json`, the file the issuer serves.
- OCA digests of the capture bases (the swiyu profile: `digest` set to 44 `#`, JCS, SHA-256, CESR code `I`): JCS by
  Trail of Bits' `rfc8785`, the digest and its CESR encoding by WebOfTrust's keripy (`Diger`). Overlays carry no
  digest in this profile; each overlay's `capture_base` must name a capture base of the bundle.

Usage: python3 -I conformance/hashes/check.py <out>. Exits 1 when a value doesn't match.
"""

import base64
import json
import subprocess
import sys
from pathlib import Path

import rfc8785
from keri.core.coring import DigDex, Diger

DIGEST_PLACEHOLDER = "#" * 44


def openssl_sri(data: bytes) -> str:
    digest = subprocess.run(["openssl", "dgst", "-sha256", "-binary"], input=data, capture_output=True, check=True).stdout
    encoded = subprocess.run(["openssl", "base64", "-A"], input=digest, capture_output=True, check=True).stdout
    return "sha256-" + encoded.decode().strip()


def said(obj: dict) -> str:
    canonical = rfc8785.dumps({**obj, "digest": DIGEST_PLACEHOLDER})
    return Diger(ser=canonical, code=DigDex.SHA2_256).qb64


def check(results: list, sample: str, what: str, expected: str, actual: str) -> None:
    results.append({"sample": sample, "check": what, "expected": expected, "actual": actual, "ok": expected == actual})


def check_sample(directory: Path) -> list:
    sample = directory.name
    manifest = json.loads((directory / "manifest.json").read_text())
    bundle_bytes = (directory / "oca-bundle.json").read_bytes()
    vct_served = (directory / "vct.served.json").read_bytes()
    vct = json.loads(vct_served)
    issuer_metadata = json.loads((directory / "issuer_metadata.served.json").read_text())
    configuration = issuer_metadata["credential_configurations_supported"][manifest["configurationId"]]
    results: list = []

    served = bundle_bytes if manifest["bundleUrl"] else manifest["ocaUri"].encode()
    if not manifest["bundleUrl"]:
        prefix = "data:application/json;base64,"
        decoded = base64.b64decode(manifest["ocaUri"][len(prefix):]) if manifest["ocaUri"].startswith(prefix) else b""
        check(results, sample, "data URL holds oca-bundle.json", "equal", "equal" if decoded == bundle_bytes else "different")
    bundle_sri = openssl_sri(served)
    for display in vct["display"]:
        oca = display["rendering"]["oca"]
        check(results, sample, f"vct.json display[{display['lang']}] oca uri", manifest["ocaUri"], oca["uri"])
        check(results, sample, f"vct.json display[{display['lang']}] oca uri#integrity", bundle_sri, oca["uri#integrity"])
    check(results, sample, "issuer_metadata vct_metadata_uri", manifest["vctUrl"], configuration["vct_metadata_uri"])
    check(results, sample, "issuer_metadata vct_metadata_uri#integrity", openssl_sri(vct_served), configuration["vct_metadata_uri#integrity"])

    bundle = json.loads(bundle_bytes)
    digests = {capture_base["digest"] for capture_base in bundle["capture_bases"]}
    for capture_base in bundle["capture_bases"]:
        check(results, sample, f"capture base {capture_base['digest']} digest", said(capture_base), capture_base["digest"])
    for index, overlay in enumerate(bundle["overlays"]):
        check(results, sample, f"overlay {index} ({overlay['type']}) capture_base", "a capture base of the bundle",
              "a capture base of the bundle" if overlay["capture_base"] in digests else overlay["capture_base"])
    return results


def main() -> int:
    out = Path(sys.argv[1])
    samples = json.loads((out / "samples.json").read_text())
    results = [result for sample in samples for result in check_sample(out / sample["id"])]
    (out / "hashes.json").write_text(json.dumps(results, indent=2))
    failed = [result for result in results if not result["ok"]]
    for result in failed:
        print(f"{result['sample']}: {result['check']}: expected {result['expected']}, got {result['actual']}", file=sys.stderr)
    print(f"Hash checks: {len(results) - len(failed)} of {len(results)} match.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
