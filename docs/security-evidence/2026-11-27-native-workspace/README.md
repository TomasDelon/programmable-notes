# Shared native workspace: real file-store evidence

27 November 2026. DATA-01/02, EDIT-01. This validates application use cases,
not the rejected desktop interface or an installed application journey.

`npm run native:autosave:test` exited **0** on Linux with Node 24.22.1 and
Rust 1.100.0. It builds the locked `autosave-writer` example and bundles the actual
application modules. The fixture is a fresh private `/tmp` directory with synthetic
MDX, deleted after the test. No owner vault is used.

The added workspace case supplies synthetic chooser/inventory ports around real
Rust Store open/save/close operations. It verifies:

- Selective open and automatic publication of accepted source to the real file
  **before an explicit flush**; BOM, mixed physical endings, Unicode, JSX and
  incomplete MDX remain exact bytes.
- Acknowledged close and fresh-session reopening of the persisted source.
- Revocation of the closed native grant: a write with its latest real disk
  revision is denied as unknown, while reopening acquires a different grant.
- An independent external edit causes persistence/close refusal while the latest
  local source stays owned and the external file remains unchanged, mode `0640`.

Existing coordinator/controller cases also passed: atomic inode replacement,
coalescing, undo/redo snapshots, grant/revision denial, restart, conflict retention
and lost-publication-reply CAS. The original automatic-write observation was
12 ms in this backend run; this is **not GUI latency** or a performance guarantee.

`npm run native:autosave:test -- --negative-control` exited **1**, as expected:
removing accepted-edit scheduling fails the real-file observation before flush.
The failure is evidence that this harness detects absent automatic persistence,
not a passing positive test.

A separate controlled mutation replaced only the workspace close port with a
no-op. The harness exited **1** at the native grant-retirement assertion. Source
was restored in `finally`; the unmodified positive harness exited **0**. This
prevents a host-session removal from masquerading as native revocation.

## Publication uncertainty foundation

The shared Rust writer now returns `PublicationUncertain` for a failed,
non-collision rename attempt. Pre-rename I/O and collisions keep their previous
classification; a successful rename with a directory-sync warning stays a
successful, non-durable publication. This also applies to Save and Save As.

Locked native-documents tests passed **81**, with **7 existing ignored** slots.
The added regression exercised a real `ENAMETOOLONG` rename failure and verified
temporary-file/descriptor/grant cleanup and continued original-grant use. It does
not reproduce publication followed by `EIO` or prove that this overlong target
was published. The conservative distinction enables later typed refusals; that
transport protocol and uncertainty reconciliation remain unimplemented.

Local production Tauri `cargo check --locked --features custom-protocol` exited
**101** because `glib-sys` could not find `glib-2.0 >= 2.70` via pkg-config
(`glib-2.0.pc` is absent). This host lacks GTK/WebKit development packages;
the failure does not establish a Rust source defect or a passing native build.
The standard Ubuntu `native-check` job installs those development dependencies.
On a disposable Ubuntu 24.04 host, use that workflow's install step, then:

```sh
cargo test --manifest-path native-documents/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked --features custom-protocol
```

## Scoped acquisition protocol follow-up

Resolved, exact `refused` outcomes echo the originating vault and requested
path(s), with fixed codes. They permit another acquisition without publishing
source or clearing unknown outcomes. Rejected promises, malformed/foreign receipts
and publication uncertainty remain blocked. The actual Store harness still passes
with acquired-tagged envelopes; no native dialogs or Tauri caller are simulated
as runtime acceptance.

The complete local check exited **0**: **788 unit, 110 tooling / zero skips,
152 Chromium, 9 local Pages and 4 cloud-storage browser tests**, plus formatting,
lint, strict types and production build. A final diagnostic-only deadline change
received another successful **110-test tooling run**. Four new contained Tauri
mapping tests subsequently passed in hosted native-check for source1ab4bb4
(run45919131636); they are not counted as local passes.
No cloud backend was activated by these disposable local browser tests.

Reproduce on Linux with the repository's Node/Rust toolchain and dependencies:

```sh
npm ci
npm run native:autosave:test
npm run native:autosave:test -- --negative-control # expected exit 1
```

Chooser cancellation, acquired-grant cleanup, stale/foreign acknowledgements,
selection races and lost acquisition replies have separate unit controls. Real
file creation, OS dialogs, native IPC caller authorization, installed startup,
inline React and packaged UI autosave are **not demonstrated by this harness**.
The workspace is not yet activated in the production UI. See
[ADR037](../../decisions/ADR-037-native-workspace-use-cases.md).
