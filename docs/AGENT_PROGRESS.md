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

## P0 complete; P1 implementation in progress

P0 integration is committed/pushed as `99b4955`, with installed restart and new
action IPC-denial evidence. CI browser checks passed; native CI stopped in the
new ENOSPC step with exit 127. The verification guard used `rg`; detailed log
download is blocked here. Replacing only that guard with portable `grep` retains
the actual ENOSPC test and proves the named test ran. Local ENOSPC output matches
the unchanged literal guard; no assertion or permission was relaxed.

P1 code is under validation: two-second global idle debounce for all dirty
buffers, one in-flight batch, queued-source coalescing, explicit pause/resume and
error-induced pause. Recovery identity is now per open buffer/session, so two
buffers/app instances for the same path cannot prune each other's unsaved
history. Old records remain readable and are not rewritten. Six controller tests
and the complete repository check pass (34 unit, 18 Chromium). The optimized
P1 package is installed; actual automatic snapshot/restart/retention testing is
running. Next action: inspect that log, run native disk-full pause/resume, then
commit P1 with evidence and update draft PR #1.

## P1 ready for checkpoint

CI correction `b7f29e0` passed both jobs in run `44424517094`, including real
ENOSPC. P1 installed automatic recovery passed: two same-file dirty buffers,
independent histories/five-version retention, unchanged original, actual restart,
explicit unsaved restore and exact Save As. GUI ENOSPC passed visible failure,
auto pause, previous-version preservation, explicit Save while full, and explicit
Resume after space was freed. Manual and native IPC regressions passed again.
All executed observations and failed harness attempts are in
`docs/security-evidence/2026-11-19-automatic-recovery`. No sandbox was relaxed.

Next executable action: commit/push P1 and update draft PR #1, then start P2
source-fidelity regressions for front matter, fences, Unicode and unchanged
save/reopen. In particular, verify that YAML-style front matter is kept opaque
rather than offered as editable Setext headings. Keep generated artifacts and
synthetic recovery records out of Git; only evidence/logs and source belong here.

## P2 source-fidelity checkpoint

P1 is committed/pushed as `124a413`; both CI jobs passed in run `44427094638`.
P2 now protects mapping-style metadata from visual heading edits. Review fixes
for ordinary horizontal rules and Unicode separator lines are regression-tested.
Full repository checks passed 39 unit and 19 Chromium tests. The installed P2
package passed actual React preview interaction, no-op BOM/CRLF save, opaque
metadata/fences, visual patches, undo/redo, exact source/mode preservation,
restart/reopen and legacy recovery. Exact hashes and failed harness observations
are in `docs/security-evidence/2026-11-19-source-fidelity`.

Next action: commit P2, then complete real SIGKILL publication-stage recovery
validation. An uncommitted `native-documents/tests/process_crash.rs` is a test
prototype: its first libtest-child ptrace attempt timed out because tracing a
libtest worker is not a main-process syscall trace. Do not claim that test passes.
Move the traced writer to a separate main-thread validation executable, retain
an external timeout/owned-child cleanup, and run only in the disposable VM before
enabling a CI gate. No production recovery code needs modification yet.

## Actual crash checkpoint

P2 is committed/pushed as `438f4b4`. New external writer tests passed actual
SIGKILL at write, file-fsync, publication and directory-fsync syscall boundaries
in the ordinary-user VM. The prior durable version survived all four cases;
new readers removed incomplete temporaries and repaired retention safely.
The installed P2 desktop also passed actual main-process SIGKILL, restart,
discovery, explicit unsaved restore, cancellation and exact separate saving.
Evidence: `docs/security-evidence/2026-11-19-process-crashes`.

The timed-out libtest-worker prototype was replaced by a separate main-thread
writer. Review caught/fixed stale Child reaping and missing explicit pipefail in
CI. The negative CI-shell probe now fails with status 7 even after printing the
success marker. The ENOSPC gate is also explicitly Bash. No production recovery
or isolation code changed. Next action: commit this validation milestone, verify
its CI, then measure repeated large-document AST parsing before optimizing it.
Keep draft PR #1 unchanged in readiness and preserve every source validator.

## Fork-inherited lock correction

The full parallel backend run caught an intermittent busy error, reproduced by a
deterministic fork retaining the lock descriptor. The red regression is retained.
Recovery now explicitly unlocks at guard drop, including while a forked child is
alive; failed acquisitions cannot unlock another owner. Read-only review found no
remaining important issue. Full backend tests passed (35), ten snapshot-suite
repetitions passed, actual writer SIGKILL at all four boundaries and real ENOSPC
passed again. Full npm check passed 39 unit / 19 Chromium tests. The optimized
package was rebuilt and installed; its SIGKILL/restart suite is in progress.
P2 CI run 44430453610 passed both jobs. No sandbox restriction changed.

Next action: finish installed restart validation, retain exact evidence, commit
and push this crash/locking milestone; then measure repeated large-document AST
parsing and choose a small bounded optimization only if the measurement warrants
it. PR #1 stays draft. Do not claim fresh CPU/OOM/expiry stress or power-loss tests.

Installed lock-fix package acceptance completed successfully: actual root SIGKILL,
fresh-process discovery, explicit restore, cancelled Save As, exact separate save,
unchanged original and final clean exit. All evidence is retained. A first timing
probe of 5,000 CRLF paragraphs (193,888 UTF-16 units) measured 735–1,610 ms for
mapping/no-op/patch/remapping. Next: a bounded exact-source AST reuse optimization
with all validation preserved, then full regressions and a reproducible benchmark.

Crash/lock milestone committed and pushed as `83d1e4a`. Its hosted CI run
44436506110 was refused before either job started: GitHub annotations cite account
payments/spending limit (no runner/steps). Owner billing action is required; do
not present this as failed application tests or make speculative workflow fixes.
Continue local/VM validation. Exact annotation is in crash evidence.

## Bounded mapping reuse

The reproducible 198,888-byte / 5,000-paragraph benchmark measured a warm median
786.64 ms before and 328.15 ms after one-entry exact-source AST reuse. All source,
context, revision and candidate checks remain. Fresh return objects isolate
caller mutation; regression covers changed same-length revisions, invalid parses
and rejected candidates. Read-only review found no important issue. Full check
passed 40 unit / 19 Chromium tests. The optimized package is rebuilt and installed
for actual WebKitGTK fidelity acceptance. Timing is not a native frame-time claim.

`IMPLEMENTATION_STATUS.md` now describes current behavior rather than interleaving
obsolete statements that recovery/visual editing/undo were still unimplemented.
The historical records and package-specific security scope remain linked. Hosted
CI remains blocked before startup by account billing, not application test failure.
Next: finish native fidelity acceptance, retain evidence, commit/push and update
PR #1 while preserving draft status; then inspect concrete source diagnostic gaps.

Bounded-mapping optimized package completed real WebKitGTK acceptance: React,
no-op BOM/CRLF save, three modes, inline patches, exact disk/mode, undo/redo,
restart/reopen and explicit/invalid recovery. Six policy tests passed. Fresh Wry
upstream fetch failed DNS and network escalation was cancelled; do not count it
as a pass. Fork unchanged, last hosted verification passed at `438f4b4`.
Evidence: `docs/performance-evidence/2026-11-19`. Next: commit/push checkpoint,
update draft PR, then characterize mixed physical line endings before any change.

Mixed LF/CRLF regression passed actual checked multiline patch, exact undo/redo,
source insertion and exports; full check passed 40 unit / 20 Chromium tests.
CodeMirror retains mixed bytes but its gutter logical-line model differs; do not
silently normalize source to fix presentation. Current-package native stress is
running: CPU quota/host response passed, first recovery Counter did not become
accessible before expiry (real blank window captured); memory OOM and subsequent
Counter recovery passed. Keep the failed CPU case, finish other cases and repeat
CPU independently before claiming fresh complete resource acceptance. No limits
or observers were relaxed.

## Compiler source navigation in progress

The new editor-owned diagnostic actions open an existing original source at the
compiler's physical line, using structured worker locations and captured source
revisions. Generated MDX JS locations are excluded; preview messages cannot
supply targets. Caret moves do not change bytes/history. The physical-line utility
covers BOM, emoji, CR/LF/CRLF and invalid bounds. A red browser test reproduced the
missing action; focused imported TSX and MDX navigation tests now pass, including
exact cursor insertion/export, undo, repeated navigation and preview recovery.
An intermediate full run failed because the old preview assertion did not switch
back from the intentionally revealed Source mode; corrected focused tests pass.
Next: a final full check, optimized build and installed diagnostics acceptance.
Do not claim current uncommitted diagnostics native-tested yet.

Current-package resource repeat retained its failed combined run: memory/OOM and
expiry plus interactive recovery passed; CPU-stop recovery, editor-crash arming
and window-close arming failed to find their expected accessible controls before
service lifetime. Real blank preview screenshot and raw cgroup data retained.
Independent CPU repeat is running unchanged. Do not increase limits or call the
whole fresh matrix passing. Investigate startup/observation failures separately
from verified containment; no capability escape was observed.

Independent CPU/Stop repeat passed unchanged, with actual counter recovery. The
independent editor-crash repeat verified SIGKILL/backstop expiry and group cleanup,
but fresh counter startup failed again. Preserve this as a current native
reliability blocker on QEMU TCG/Xvfb, not a passing full case or a proven security
escape. Root cause unresolved; do not inflate lifetime or CPU allowance.

Diagnostics audit caught actual esbuild handling of U+2028/U+2029 as JS line
terminators. A red regression reproduced the mismatch. The compiler now computes
original UTF-16 offsets with language-specific line rules; SourceEditor validates
the captured bytes and bounded offset before selecting. No source modification
or preview-message authority. Full final check and optimized build now running.

Original-offset navigation final full check passed 42 unit / 22 Chromium tests.
Optimized production package passed real native original-line caret, exact disk
save/mode 0640, undo/save and clean close. Harness fixes explicitly rebuilt after
Stop and waited for all X input before Save; both failures are retained. Review
found no important issue. Evidence: 2026-11-19-source-navigation. Next: commit
feature, retain the separate partial resource matrix and finish startup timing
probes before deciding the next reliability fix. Do not claim full native security
readiness or green hosted CI.
