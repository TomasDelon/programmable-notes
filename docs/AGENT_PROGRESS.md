# Agent progress

Latest checkpoint: see the final dated entry below. Earlier milestone sections
are chronological history, not the current task.

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

Resource checkpoint: fixed a concrete ESRCH race reading proc stat during task
exit; retained group membership and all known-identity checks. Timed window-close
then passed twice; the stricter version proved complete cleanup at 52.2 seconds
from the request, before any 60-second expiry was possible. Strict CPU Stop also
passed on the source-navigation package (real quota, whole group, before-expiry
assertion and interactive recovery). The earlier blank startup and editor-crash
recovery failures remain recorded/reproducible; no full fresh matrix pass claimed.
Source-navigation native IPC regression and final check now running.

Next safe core task after this checkpoint: a New note action creating a uniquely
named empty unsaved buffer with no native grant. Reuse workspace groups, source
histories, existing Save/Save As and recovery. Keep the 32-document bound and all
other source bytes; empty creation adds no source bytes. Use a pure functional
workspace update so queued editor changes cannot be replaced by a stale snapshot.
Test browser creation/switch/save/reopen/undo and native cancel/explicit Save As.
No aesthetics, new permissions, automatic original writes or grammar work.

Final resource checkpoint: current-package native IPC suite passed all registered
commands and recovery-action denials, actual network namespace/cgroup policy,
private profile, real Counter 2 and HTTP/file CSP denial. Full repository check
passed 42 unit / 22 Chromium tests. Strict CPU Stop and window-close before-expiry
checks passed. Commit/push this test/evidence milestone, keep draft PR updated,
then implement the pure empty New note action and its source-preservation tests.
CI for c9570ee (44442555752) was refused before startup with the same billing
annotation; no tests ran there. Last fully green hosted head remains 438f4b4.

New note validated: pure functional empty-buffer creation retains queued input,
all sibling bytes/grants/histories and the 32-file bound; starts dirty without
filesystem authorization. Source mode receives focus through the existing checked
selection mechanism. Full checks passed 45 unit / 23 Chromium tests. The optimized
installed package passed native create, picker cancellation, explicit exact save,
reopen and unchanged original; normal process exit verified. Evidence retained in
2026-11-19-new-notes. One initial formatting failure was fixed before final check.

Next: commit/push New note, update draft PR, then reproduce whether automatically
created unprivileged preview windows steal keyboard focus from source editing.
Tao's focused(false) restores accept-focus after drawing, so it may prevent only
initial focus theft without disabling later user interaction; verify real red/green
focus and keyboard tests before changing production behavior. Do not relax any
resource, namespace, CSP or IPC check.

New note is committed/pushed as 8e7a6f7; PR remains draft and description updated.
Native focus probe then reproduced automatic source-focus theft on that package.
A three-line builder change initializes only child windows unfocused. The rebuilt
production package passed retained source keyboard input, explicit preview focus
and Space-key React state update, then source textbox Undo. Full check passed
45 unit / 23 Chromium, Rust app test passed, and native IPC/policy regression
passed again. Evidence: 2026-11-19-native-focus. Initial focus is fixed; slow/blank
startup and editor-crash recovery remain separate unresolved failures.

The refreshed browser demonstration now also creates/saves a new note and verifies
the prior lesson remains exact. Local recording succeeded after selecting the
already installed Playwright encoder cache (the first default-cache attempt failed).
Port 4188 was occupied, so this task owns a preview on 4189 (exec session 99540).
Next: commit focus correction, package a current PR-accessible review demo because
hosted Actions cannot start due account billing, then test automatic restart
recovery for entirely unbound new notes. Do not include stale cache files or claim
a new hosted artifact exists. Keep the PR draft and all isolation unchanged.

Native focus correction is committed/pushed as d955aae. Refreshed browser delivery
now has a current PR-accessible ZIP plus screenshots/video/saved source, complete
asset/capture receipts, portable-path guards and explicit baseline/negative tests.
Review found and reproduced index-only stale-asset and backslash-path gaps; both
were fixed before publishing any ZIP. Final check passed 45 unit / 23 Chromium;
eight artifact negatives and clean-extracted React/new-note/download/offline tests
passed. Source is unchanged by the delivery tools. CI runs the same procedure but
hosted startup is still billing-blocked. Raw evidence: 2026-11-19-review-demo.

A final repetition caught a fixture issue, not a source-preservation change:
contenteditable CRLF input was sometimes normalized before note creation. Exact
before/after bytes were always preserved. The test now imports raw CRLF, checks
its baseline and adds unsaved text; five repeats and full check passed.

Next: commit/push the review attachment and CI tooling, update draft PR download
links, then validate automatic recovery across real restart for entirely unbound
new notes. Existing native-auto-recovery.mjs can gain a --new-notes variant using
New note instead of picker opening; retain original-case behavior, handle optional
empty initial snapshots, verify full saved content/baseline null, dynamic retained
counts, actual SIGKILL and explicit unsaved restore/Save As without touching a
sentinel original. No new application filesystem permission is needed.

## 2026-11-19 — unbound-note restart recovery

Base c93968b is pushed; the portable review ZIP was re-downloaded through GitHub's
source Blob API and matched its published SHA-256. PR #1 stays draft. Hosted run
44453697227 was refused before both jobs started, with the same payment/spending
limit annotation; no hosted execution is claimed.

The installed d955aae production package passed automatic recovery of two never
saved notes: actual typing, null baselines, independent identities, five-version B
retention, exact initial A/B and latest B restoration, actual root SIGKILL,
new-process discovery, explicit unsaved restore, cancelled Save As and exact saving
to a new chosen target. The synthetic sentinel original stayed byte-identical.
Only owned versions were removed, followed by verified clean process exit. The
original-file BOM/CRLF variant also passed the final strengthened runner. Evidence
and hashes: 2026-11-19-unbound-recovery. No app/native permission changed. Read-only
review found no concrete issue. Full checks passed 45 unit / 23 Chromium tests.

Next executable action: commit/push this acceptance milestone and update draft PR.
Then close the documented directory-fsync error-reporting coverage gap using an
external own-child ptrace failure test in the disposable Ubuntu VM. Verify the
pre-publication file-sync error retains all prior records, and a post-publication
directory-sync error reports uncertainty without pruning prior valid snapshots.
Keep production code free of failpoints; explicitly distinguish syscall fault
injection from physical filesystem/power-loss evidence. Native blank-preview
startup remains unresolved and hosted CI remains account-billing blocked.

## 2026-11-19 — recovery fsync error paths

Unbound-note acceptance is committed/pushed as d47f30d; PR #1 remains draft. The
next milestone adds tests only, with no production behavior/permission change.
External own-child ptrace skips the selected fsync and returns EIO at file sync,
publication directory sync and retention directory sync. All three Ubuntu cases
passed, validating prior raw bytes before repair, correct durable/warning state,
exact restoration, no original writes and a successful explicit retry. The four
existing real writer SIGKILL stages passed again on the final test binary. Normal
backend suite passed 35 tests; fault/crash tests are executed separately.

Three UI transport-boundary cases cover warnings and null-warning uncertainty:
visible health, automatic pause, no implicit restoration, exact source and explicit
restore remain. A React act fixture initially prevented its own DOM commit; await
transport completion before asserting the DOM. No application change was needed.
Read-only review found no concrete issue. Evidence: 2026-11-19-sync-errors. CI has
an explicit three-stage gated command, but hosted startup remains billing-blocked.

Next: commit/push verified error-path coverage, update draft PR, then reproduce
potential loss of uncommitted inline text on document switching/close/save. Keep
source patches explicit, and never let preview messages authorize edits. If the
loss is reproducible, add the smallest trusted-editor guard and dirty-close
protection, preserving mode switching and current source/recovery semantics.

## 2026-11-19 — guard unapplied visual input

Error-path tests are committed/pushed as 3db7805 and PR #1 stays draft. A real
browser reproduction then showed unapplied inline typing silently disappeared
on document switch, while status stayed Source unchanged and Save exported older
source. A browser guard assertion and dirty-state unit test failed before fixes.
Trusted pending state now blocks document replacement/save/selection, participates
in browser/native dirty-close, and cannot be supplied by preview messages. Mode
and source editing remain available; a disappearing mapping keeps exact pending
text accessible and still rejects stale Enter. Its unit test failed before the
fallback. Busy file operations lock inline input, without pausing committed-source
recovery for unrelated buffers. Pending text remains memory-only until applied.

The optimized installed package passed real native close/Cancel with unchanged
pending value and original, Escape, Enter, exact BOM/CRLF/Unicode/JSX Save,
Undo/Redo, Reopen, mode 0640 and clean exit. Package/ELF hashes and raw evidence:
2026-11-19-pending-inline. Initial red browser fixtures exposed a separate ordinary
BOM parser-offset mapping gap; proper guard fixture uses existing supported BOM
metadata and retains full byte checks. Read-only review found no important issue.

Next: complete full checks/current-package IPC regression, retain results, commit/
push guard and update draft PR. Then fix ordinary leading-BOM visual mapping using
private parser input that preserves UTF-16 offsets and never modifies source;
write red fixtures first. Refresh the portable review download once these editor
correctness changes are validated. Native blank-startup remains unresolved and
hosted CI still cannot start because of account billing.

Final guard checks passed formatting/lint/types, 50 unit and 24 Chromium tests.
The new optimized installed package also passed native IPC/recovery-action denial,
actual private-network/cgroup policy, Stop, Counter 2 and parent DOM/storage plus
HTTP/file denial. This is not a complete fresh stress-matrix pass. Raw successful
checks and native screenshots are retained. Commit/push the guard now, then fix
the separate leading-BOM mapping offset with red/green exact-source fixtures.

## 2026-11-19 — leading-BOM mapping

The pending-input guard is committed/pushed as 5578131; draft PR #1 was updated.
Six red fixtures proved ordinary BOM documents lost all safe visual spans because
the parser strips the first character. Private parser input now uses one blank
line in place of that unit, keeping exact offsets without indenting imports or
JSX. Source/cache/compiler inputs remain original; stale/shifted spans still fail.
Read-only review found no important issue. Full check passed 56 unit / 25 Chromium;
actual Counter interaction, exact BOM/CRLF saving, Undo/Redo/reopen passed.

The optimized installed package passed --leading-bom pending/close/Cancel,
Escape/Enter, exact source/mode 0640, Undo/Redo/reopen and clean exit. Final builder
source hash matched; an initial pre-format copy was resynchronized/rebuilt before
installation. Exact hashes/raw logs: 2026-11-19-leading-bom. Hosted run 44458530794
for 5578131 still has zero steps and actual account-billing annotations.

Next: commit/push this source-correctness fix, update draft PR, then add trusted
editor Ctrl/Cmd+S and native Shift+Save As shortcuts. Use actual key events, refuse
synthetic/untrusted, composing or repeated events, retain pending/busy guards, and
never relay preview keyboard messages into privileged actions. Validate exact
browser download and real native keyboard save/cancel/Save As. Then refresh the
current portable review ZIP/screenshots/video and verify its GitHub re-download.
