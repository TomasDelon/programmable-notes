# Embedded esbuild WASM runtime notices

The npm package root supplied esbuild MIT text but omitted the embedded Go
runtime notice. The exact WASM reports go1.26.5, GOOS js/GOARCH wasm and no external
dependency module entries. The historical review archive's actual compiler SHA256
matched the pinned installed asset. This is a binary match, not an inference only
from the lockfile.

Eleven official Go root and standard-library vendor/Boring LICENSE/PATENTS files
were fetched from the release tag and verified against their Git blob hashes.
The retained [inventory and texts](../../../licenses/README.md) are explicitly a
source-license superset, not a linked-component claim or an app license grant.
Generator checks installed version, exact asset SHA256, Go marker and notice SHA.
Canonical Git attributes preserve pinned notice/raw evidence bytes across CRLF
checkout conversion. Native Rust redistribution attribution remains incomplete.

The new control failed before the embedded-notice function existed, then passed
positive text preservation and asset/version/truncated-notice refusal. The full
check passed114unit/37Chromium/seven tooling controls with no skips. Fresh capture
and real extracted browser interactions passed, plus manifest/CRC and eleven
malformed-artifact refusals, including removal of just the full Go notice text.
No runtime functionality, isolation or resource setting changed.

No old review archive was deleted/replaced; its accompanying notice sidecar is
updated. New captures remain local testing output until an explicitly requested
workflow artifact capture; this is not a public release or native GUI claim.
