# Private native session binding — 26 November 2026

Scope: trusted private-grant adapter and actual backend I/O; production UI and
registered Tauri GUI/ACL acceptance are not enabled. See
[ADR033](../../decisions/ADR-033-private-native-session-binding.md) and
[packet plan](../../plans/native-session-binding.md).

Executed results:

- 9 new binding tests plus 27 existing controller tests passed; independent review
  reran the then-current 8 binding + 27 controller cases and found no blocker.
  The final durability-warning case is included in root's full check.
- Root reran **79 native document tests: zero failed, 7 existing ignored slots**,
  and Rust formatting. The helper compiles; its actual protocol/lifecycle runs
  through the separate subprocess harness, not invented Rust unit coverage.
- Root's expanded actual Store/autosave harness passed all original cases and
  the added binding/controller scenario. Accepted controller publication appeared
  as exact real-file bytes **before flush**; close retired the old grant, a new
  grant reopened exact bytes, external conflicting bytes stayed untouched and
  the newest local text stayed blocked/retained. Mode 0640 remained.
- Root reran the original missing-scheduling negative control: expected exit 1
  at `Accepted source must automatically reach the real file`. Failure from a
  missing command, compile problem or unrelated assertion would not qualify.
- Final `npm run check` exited **0**: **735 unit, 96 tooling/zero skips, 152 Chromium,
  9 Pages and 4 inactive-cloud tests passed**, plus format/lint/types/build.

The new adapter copies baseline/ports, separates session/grant/disk identities,
rejects duplicate or cross-aliased identities and keeps grants out of observations.
Failed attachment leaves the grant with its caller; it never silently closes or
releases it. Close removes the active binding only after backend acknowledgement;
controller uncertainty continues to block publication. The Omit-based public
controller type is an API convention for trusted host code, not runtime hardening.

The test helper adds only bounded close and fixed-note opening. A Serde unit Open
variant initially ignored an unexpected path field, while still using only its
fixed note. The corrected empty-struct variant rejects it; a real subprocess
regression checks rejection before a valid fixed open. Opening uses the retained
Vault and literal `note.mdx`. No arbitrary path or application IPC was introduced,
and original requests, limits, deadlines and cleanup remain unchanged.

Reproduce from the pinned development toolchain:

```sh
npm ci
npm test -- tests/unit/native-sessions.test.ts tests/unit/document-sessions.test.ts
cargo test --manifest-path native-documents/Cargo.toml --locked
cargo fmt --manifest-path native-documents/Cargo.toml -- --check
npm run native:autosave:test
npm run native:autosave:test -- --negative-control # must fail at the named disk observation
npm run check
```

Local Rust commands explicitly used the approved writable Cargo/rustup homes and
`RUSTUP_TOOLCHAIN=stable`; both tools report 1.100.0. CI uses the repository toolchain.
All filesystem data is synthetic and owned temporary fixtures. The measured
12 ms observation belongs to the original backend segment, not GUI latency or a
timing guarantee for the controller. No OS picker, native IPC permission denial,
installed UI autosave or full runtime security result follows from this harness.
The shared product and actual native command validation remain separate gates.
