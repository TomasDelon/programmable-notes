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
