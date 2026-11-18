# Agent progress

## Starting checkpoint — 2026-11-19 (Europe/Paris)

- Revision inspected: `ebb2a2551fc13b0b4af6c6c0dc55869350936123`.
- Branch: `feat/mdx-react-engine`; one worktree; clean at inspection.
- PR #1 is draft. Both jobs passed for this exact revision in Actions run
  `44364343322`. Historical native evidence is scoped to its recorded binaries.
- Existing recovery is one explicit private `recovered.mdx`, with no versions,
  checksums, automatic snapshots or discovery. Browser opt-in drafts are separate.
- Existing source patches, isolated React runtime, file grants and atomic saves
  remain the foundation. No UI redesign is authorized by the design reference.

## Current milestone — P0 versioned recovery store

Implement bounded immutable records with document identity, baseline digest,
parent revision, schema version and integrity hash. Publish via fsync + atomic
no-replace rename, serialize cooperating writers, reject stale heads, retain
older versions only after durable publication, and expose corruption separately
from valid recoverable records. Preserve legacy recovery bytes during migration.
Original source files and reusable grants are outside the recovery format.

Next executable action: add failing Rust tests for successive versions, stale
writers and integrity failures, then implement the native store. Connect it to
the editor only after backend failure-path tests pass. P1 will add debounced
snapshots and restart discovery after P0 validation.

## Boundaries

Never merge, force-push, publish a release, change PR readiness, broaden preview
capabilities, or test on personal files. Keep each verified milestone reviewable.
Record exact tests/revisions and infrastructure failures here before handoff.

Baseline executed on `ebb2a25`: `npm run check` passed (26 unit, 18 Chromium),
and locked native-documents tests passed (2 legacy recovery, 18 file-store tests).
The reference ZIP SHA-256 is
`2f19880457645e25633f30766711992a561d1476663ac8ab5a5c662a04c0e328`.

## P0 backend checkpoint

Immutable snapshot store implemented in `native-documents/src/snapshots.rs`.
Tests: 14 new normal snapshot tests, 2 legacy recovery tests and 18 file-store
tests pass; the additional ignored ENOSPC test passed separately on an actual
2 MiB disposable Ubuntu tmpfs. `npm run check` passed (26 unit, 18 Chromium).
Independent review findings on crash headroom and legacy temporary files were
reproduced/fixed and regression-tested. Exact evidence is under
`docs/security-evidence/2026-11-19-recovery-store`.

The backend is not yet exposed to the editor. Next action: extend the existing
editor-only `recovery_draft` command with typed version operations, retain legacy
operations, add discovery/manual restore UI and tests, then implement debounced
native recovery without coupling it to original-file saves. Keep PR #1 draft.

## P0 integration in verification

Backend checkpoint pushed as `b776d57` after design/progress checkpoint `45d3c95`.
The existing editor-only recovery command now supports typed version operations
without a new capability. Discovery/manual snapshots and explicit restore are
implemented; restore creates a new dirty buffer without inheriting a grant.
Legacy operations share the new advisory lock. CI adds a real ENOSPC tmpfs gate.

The optimized installed package passed `scripts/native-recovery.mjs` in the VM:
exact BOM/CRLF versions, actual process restart/discovery, Save As cancellation,
separate exact save, corruption refusal, older recovery, explicit deletion and
unchanged original bytes. Evidence and exact runtime-source hashes are in
`docs/security-evidence/2026-11-19-recovery-ui`. Native denial of the new actions
and the final repository check are running. Next action after they pass: commit
P0 integration, update draft PR #1, then begin P1 debounced automatic snapshots
for all modified buffers with single-flight writes and visible failure handling.

P0 integration verification completed: repository check passed 30 unit and 18
Chromium tests; locked native-documents passed 34 normal tests (plus the
separately proven ENOSPC case). Native IPC denial passed for all new recovery
actions. Source review found no remaining important issue. P0 integration is
ready to commit. Next executable milestone remains P1 automatic recovery.
