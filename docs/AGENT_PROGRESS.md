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

## 2026-11-19 — trusted keyboard saving

Leading-BOM correction is committed/pushed as 181d2d4 and draft PR updated. A
browser real-key test first failed because Ctrl+S did not export source. The host
editor now delegates trusted Ctrl/Meta+S (Shift Save As) to existing guarded Save.
Synthetic/repeated/composing/Alt input cannot trigger it; no preview key relay or
new permission exists. Focused and full checks passed 56 unit / 26 Chromium,
including exact bytes, synthetic rejection, held repeat, pending input, and delayed
real File read with source typed meanwhile preserved across document switching.

The new optimized installed package passed real Ctrl+S, pending/dirty-close Cancel,
BOM/CRLF/JSX bytes, mode 0640, Undo/Redo/reopen, actual Ctrl+Shift+S cancellation
and explicit separate exact Save As without changing the original, then clean
exit. Evidence/hashes: 2026-11-19-keyboard-save. Read-only review found no important
issue. No fresh security stress-matrix or native IME/Cmd-hardware pass is claimed.

Next: commit/push shortcuts, update draft PR, then refresh the portable demo from
this frontend, assert protected inline input and keyboard export in the recording,
run manifest/negative/clean-extracted checks, commit the requested review artifact
and verify actual GitHub re-download. Keep hosted billing and native blank-startup
limits explicit; continue safe core reliability after the delivery checkpoint.

## 2026-11-19 — refreshed current review delivery

Keyboard saving is committed/pushed as 94e6b15, and draft PR updated. The current
portable browser demo was rebuilt/recorded from that frontend: protected pending
text and actual Ctrl+S now appear in the walkthrough. Clean-extracted browser
checks passed React, New note, trusted-key download, pending protection,
BOM/CRLF/opaque-span exact editing/export, and offline compilation after initial
load. All eight packaging negatives and manifest/CRC passed. Read-only review
found no important issue. The dated ZIP/screenshots were refreshed; source frontend
and dependencies were clean at assembly. Evidence: 2026-11-19-current-review.

Next: final repository check and artifact freshness verification, commit/push
review delivery, then re-download the GitHub blob and verify exact SHA-256 before
updating the draft PR link. Native investigation: cached Tauri/Wry sources prove
initialization_script is already TopFrame on Linux; per-frame reinjection is ruled
out, not a fix. Next useful experiment compares static-button and Counter srcdoc
under identical unchanged production limits, retaining failures and startup timing.
Do not retry until green or infer cleanup from a timer/empty accessibility tree.

Current delivery is committed/pushed as 405ebc4. The actual GitHub Blob response
was decoded and matched the 6,461,629-byte archive and SHA-256 f92c9930…cebe93e.
Receipt retained; no base64/credential committed. Full check passed 56 unit / 26
Chromium and the current extracted app passed all extended delivery checks after
the final build. Update PR to its immutable 405ebc4 download link, then execute the
static-versus-Counter startup diagnostic under unchanged production limits. Root
and child test processes from prior functional cases exited; retain the disposable
VM only while needed for this next experiment. Keep failure evidence and exact
binary hashes. The Linux init script is already TopFrame; do not change it based
on the disproven reinjection hypothesis.

## 2026-11-19 — current native startup diagnosis

Current review delivery and actual GitHub receipt are pushed as 405ebc4/431296b;
PR #1 remains draft and links the immutable current download. A new diagnostic
compares static/no-JS content against real MDX/React using the same unchanged
production Supervisor, with process/CPU/memory/journal observations and strict
before-expiry cleanup. Read-only safety review found no important issue.

First observer attempt: static ready 43.41 s, then Counter UI was NOT RUN because
Node rejects fractional execFile timeouts. The harness now floors the remaining
budget (no limit increase). Complete corrected pair passed: static ready 40.54 s,
Counter 43.88 s, real Count 1, Stop cleanup 41.59 / 48.51 s. Raw CPU samples show
400/400 and 424/428 throttled periods near readiness; the no-JS fixture is also
slow. Common emulated startup is implicated, not a proven cause/fix of old blanks.
Exact observer/binary hashes and both attempts: 2026-11-19-startup-probe.

Sources already enforce TopFrame Linux initialization; no speculative fix made.
No KVM or cloud-compute tool/AWS CLI/profile is available here; no physical CPU/GPU
comparison was run. Native security/resource policy and app code are unchanged.

Next: finish full repository checks, commit/push diagnostic and evidence, update
the draft PR with final behavior and scoped validation (avoid stale chronological
check-count lists). Then fix the concrete stress-report gap: it only records targets
when stopped(), losing failed readiness targets. Register a target immediately and
mark completion in place, preserving all assertions. Repeat only editor-crash on
the current package, retain failures/cgroup/journal data, and do not weaken limits
or declare a new full matrix pass. Continue safe editor reliability afterward.

Final diagnostic repository checks passed 56 unit / 26 Chromium; executed observer
hash still matches its retained report after formatting. Commit/push this milestone
now, then preserve active stress targets and run the single editor-crash case.

## 2026-11-19 — complete current native matrix and forensic retention

Startup diagnostic/evidence is committed/pushed as 2c7a2e5. PR description was
rewritten around final implemented behavior and scoped evidence; it stays draft.
The stress runner now registers targets before policy/readiness and retains case
outcomes/failures; no acceptance predicate, payload or resource limit changed.
Disposable-profile guard and documented commands prevent accidental personal use.
Only generated raw evidence is marked generated; summaries/source stay visible.
Read-only review found no important issue.

Actual current keyboard-save binary: focused editor-crash passed, then the full
matrix passed CPU/Stop, expiry, editor-crash/recovery and window-close. Memory
FAILED because runtime expiry happened before the required OOM journal cause;
peak sampled 515,461,120 bytes, journal 491.5 MiB. The whole command exited 1.
No weaker substitute was accepted. Raw all-case data and both focused/full crash
successes are preserved in 2026-11-19-current-stress; old blank failures are not
claimed fixed. Current core resource assertions include before-earliest-expiry
Stop/close and known-process identity removal.

Two negatives passed: unsafe profile flag rejected before launcher PID creation;
missing external AT-SPI helper retained its failed active unit and did not invent
cleanup success. An external verifier checked actual cleanup; CPU attack was not
armed in that harness negative. Local full check passed 56 unit / 26 Chromium.

Next: finish final formatting/lint after evidence additions, commit/push this
reviewable tooling/results milestone and update draft PR's latest matrix status.
Then address a source-backed native defense gap: Wry defaults downloads allowed
(and can choose a filesystem destination without a save prompt), while the child
has no explicit on_download denial. This is NOT yet a demonstrated MDX sandbox
bypass. Review found a minimal child-only on_download false hook. First build an
actual probe with a trusted-editor positive control, distinguish ordinary
supervised MDX from automation-attached outer-shell tests, and retain red/green
proof before hardening. Do not enable automation on production supervised children,
grant preview file APIs, or weaken CSP/navigation/resource checks.

## 2026-11-19 — explicit native preview download denial

Started from pushed dadf86e (PR #1 verified draft). Source review found Wry's
permissive default download callback can choose Downloads/current directory
independently of IPC. Production change is only a child-specific native
on_download rejection with a shared callback; editor file grants, iframe/CSP,
navigation, namespaces, automation and quotas are unchanged.

First WebDriver anchor experiment had no working positive control and is retained
as inconclusive. A separate real Tauri/WebKit native-API harness proved exact
79-byte default writes; old no-handler denial failed. Shared production callback
then passed actual request/cancellation/null-destination/no-file assertions.
Final deliberate omitted-handler negative exited 1, recorded its unexpected
exact write, and removed only verified owned/single-link synthetic canaries.
The helper is not linked into the application or exposed to document code.

New optimized package ed6dc732… / installed ELF 30d5f193… passed ordinary
production-supervised MDX automatic and clicked data/Blob attempts with no canary,
automation=false, private network and unchanged cgroup bounds. Revised observer
first failed an undeclared timing variable after Stop (retained); corrected run
passed cleanup 51,289.37 ms from request, strictly before earliest 60-second expiry.
IPC regression passed registered commands/recovery/plugin denials, actual Counter
2 and parent DOM/storage + HTTP/file denial. This does not demonstrate a prior
iframe bypass or repeat the entire resource-stress matrix on the new ELF.

Read-only review found correct production hardening and three harness issues;
all corrected (timestamp, pipe-draining close event, safe negative canary cleanup).
Initial/full local checks passed 56 unit / 26 Chromium, native app Rust test,
optimized build and package inspection. Final installed persistence/shortcut
regression passed pending/dirty-close Cancel, exact BOM/CRLF save/undo/redo/reopen,
mode 0640, actual Ctrl+S/Shift Save As cancellation/exact separate copy and clean
exit; screenshots retained. Evidence is 2026-11-19-native-downloads, including all
failures and source/executable hashes. CI dadf86e run 44469361168 was refused before
any runner/step due billing/spending-limit annotation, not tests failing.

Next executable action: finish persistence, retain its log/screens, rerun final
repository checks/format, commit/push this bounded defense and update draft PR.
Then add meaningful actual separate-process snapshot contention/CAS coverage
(current snapshot races use threads; lock test holds another descriptor in one
process). Do not weaken the memory/expiry or startup gates or claim them fixed.

Final full repository check passed (56 unit / 26 Chromium); final whole-tree
format/lint, Rust formatting and diff checks also passed after retaining evidence.
Final observer SHA checks match both actual callback runs/negative and corrected
packaged MDX report. Source hashes match the builder; installed package/ELF match
inspection. Commit/push now, then begin the cross-process recovery test above.

## 2026-11-19 — recovery contention in actual separate processes

4aa81f1 was pushed and PR #1 verified draft; body now includes download hardening,
scoped controls/limitations and the existing accessible browser ZIP. No merge,
release or readiness change. Hosted run 44473135599 was refused before runner
startup; the account billing blocker persists.

New normal Rust regression executes five rounds / 20 actual exec'd writers,
including held-lock busy refusal, three barrier-released contenders sharing one
expected parent, exactly one head, exact old/winning bytes, stale retry rejection,
explicit valid retry and unchanged synthetic original. Results bind actual Child
PIDs. All owned children have bounded waits and failure cleanup. Read-only review
caught fixture cleanup being registered before successful creation; fixed. Actual
pre-existing-fixture negative proves the failed test retains an unowned sentinel.

Final backend suite passed 36 normal tests. Source-matched Ubuntu build/test binary
also passed all 20 writers in the disposable full-system VM (1.37 s). Production
storage, installer and UI are unchanged. Evidence: 2026-11-19-process-contention.

Next: finish full repository checks, commit/push this P0 regression checkpoint,
update draft PR counts, then address the observed per-document status bug: a dirty
sibling makes a clean/saved selected source look unsaved, while global notices can
be attributed to the wrong selected buffer. Preserve aggregate dirty-close guards;
use a selected-document status and source/revision-bound notices with real browser
switch/save/delayed-operation regressions. This is behavior correctness, not a UI
redesign. Refresh the portable browser artifact if frontend behavior changes.

Final repository check passed 56 unit / 26 Chromium for this test-only milestone.
Commit/push the verified contention checkpoint, then reproduce selected-document
status in Chromium before changing notice ownership or aggregate dirty handling.

## 2026-11-19 — selected document status correctness (in progress)

9201a12 was pushed; PR #1 stays draft, backend count updated to 36 normal tests.
New Chromium regression reproduced a clean selected Beta wrongly labelled unsaved
because Alpha was dirty. New mocked-native transport regression reproduced a late
Alpha save message displayed on selected Beta. Both failures are retained in /tmp.

Implemented a bounded ownership fix: notices capture document key and exact source,
selected status uses selected-source dirtiness, and a separate live count identifies
other dirty sources. Aggregate browser/native dirty-close guards are unchanged.
Unchanged notice text and native APIs/grants; no visual redesign or preview authority.
Focused red/green browser and native transport tests passed. Added durability-warning
coverage with a dirty sibling to prevent hiding a committed-save warning.

Next executable actions: run full repository checks; build/install current optimized
package; test two native files with dirty sibling, actual saves/reopen and close
cancellation, capture evidence. Refresh portable browser walkthrough/build/ZIP and
verify exact extracted behavior/download hashes before push. Keep hosted billing
and existing full-resource memory/startup failures explicit; no new full-matrix pass.

Selected-status milestone final checks passed 58 unit / 27 Chromium. First full
run caught an ambiguous old Unsaved locator; strengthened it to exact named
document status, retained failure and reran full suite green. Installed package
8f54a264… / ELF 7ef9a9c7… passed actual two-file dirty/saved status, window-close
Cancel, exact BOM/CRLF/mode0640 save/reopen and clean exit; separate IPC and full
pending/keyboard native regressions also passed. No important review findings.
Evidence is 2026-11-19-document-status. Commit source/tests/evidence now, leaving
demo-tool changes for the following validated delivery commit. Then capture the
committed frontend, package/verify the fresh portable ZIP and push both coherent
commits; do not leave the prior archive described as the current frontend.

## 2026-11-19 — current source-status browser review delivery

Source/status tests/native evidence committed locally as f61163f. Fresh recording
and extracted-browser validation passed against that committed frontend. Capture
now also demonstrates clean selected lesson versus an unsaved sibling; exact
new/lesson exports and all desktop/tablet/mobile modes remain. Updated packaging
allowlist includes only that additional captured screenshot. Eight deliberate
negative cases still rejected invalid artifacts; CRC/full asset/capture hashes and
current recorder SHA verified. Archive source manifest points to f61163f.

Current ZIP: 6,626,776 bytes / 29 entries / SHA-256
82446e3f0cdf9fe0c6ae89a4dbeb2dd723dbae2d21c080985f6311fbe3c2d64d.
No installer/public site/release. Delivery evidence is 2026-11-19-status-review.
Next: finish repository checks, commit delivery tools/archive/screenshots, push
both coherent commits and update draft PR's immutable download + 58/27 counts.
Re-download the pushed Git blob and retain an exact-hash receipt.

Next independent P2 investigation: inline textareas normalize physical CRLF to LF.
patchMarkdown currently uses document-wide CRLF normalization for replacement text;
reproduce whether changing one word in a mixed-EOL multiline paragraph rewrites
other physical breaks inside that span. If confirmed, preserve unchanged internal
spans and reject ambiguous transformations without weakening mapping/context checks.
Do not claim this suspected source-fidelity issue fixed before red/green proof.

Final delivery check passed 58 unit / 27 Chromium. Read-only source probe now
CONFIRMS the next P2 bug: changing First→Edited in a paragraph containing both LF
and CRLF rewrites an unchanged internal LF to CRLF. No-op/source-mode saves are
unaffected. Reproduction is retained with delivery evidence; source-fidelity claims
are narrowed until the follow-up fix. Commit/push delivery, verify remote bytes,
then start failing unit/browser tests before changing patchMarkdown.

Source f61163f and delivery 164cb4e pushed; PR #1 head/draft verified. The current
GitHub Blob re-download matched all bytes/SHA and its receipt is retained. PR
body now links that immutable download, reports 58/27 +36 backend counts and the
confirmed pending internal mixed-EOL gap. Begin the P2 red tests now.

## 2026-11-19 — mixed internal line-ending fidelity (in progress)

Pushed 37c775c includes exact GitHub demo receipt; PR body/draft verified. New P2
unit and actual keyboard/export browser tests reproduced global CRLF normalization
rewriting internal LF. Four new unit cases failed before fix; real browser failed
exact exported bytes. Implemented bounded physical-break preservation: normalized
no-op returns original, equal-count edits retain ending sequence, changed-count
edits retain raw equal prefix/suffix and inherit unambiguous local endings.
All revision/range/context/size/candidate-parse guards remain.

Initial focused tests and full 62-unit / 28-browser check passed. A further repeated
line case exposed ambiguity in greedy alignment (Same/LF/Same/CRLF/Same deletion or
insertion). Added failing unit, then conservative overlap-window mixed-ending
rejection; final focused test running. Read-only review found no unsafe omission;
some periodic multi-line deletions can be safely but conservatively rejected,
requiring Source. This is an explicit limit, not permission to guess/source rewrite.
The failure message directs unsupported/ambiguous changes to Source.

Native fidelity harness now supports --mixed-eol fixture variation without skipping
its original gates; adds paragraph undo/save/redo exact-byte checks. Old installed
7ef9a9c7 package reproduction is running first. Next: retain its exact failure,
build/install final new package after source hashes match, run full native fidelity
including real Counter, byte saves/recovery/restart/invalid data, rerun full current
repository checks (now expected 63 / 28), document precise results and conservative
limits, commit/push fix, then refresh current browser delivery from committed code.
Do not call earlier intermediate package/check output the final guard version.

P2 final native results: first old-package attempt failed before service detection
(no cause established); added failure-only compiler/status/alerts observation,
without timing/payload/assertion changes. Second old-package attempt actually ran
React/modes then failed exact disk bytes (LF became CRLF). New source-matched
package f4921d0b… / ELF 7d315faa… passed complete mixed fidelity, exact paragraph
save/undo/redo, mode0640, real Counter, dirty-close, actual restart, explicit legacy
recovery, invalid UTF8 rejection/deletion and unchanged original. Separate IPC
regression passed. Executed observer hash d4967c80… matches host/guest.

Full 63-unit / 28-browser check passed. Added focused real browser refusal/retention/
Escape test after that run; rerun final full check before source commit. Evidence
is 2026-11-19-internal-eol. Document conservative Source fallback and retain old
startup failure; never call it fixed from a successful retry. Then commit/push
source/test/evidence, refresh/re-download current portable review and update PR.

Final full check after browser refusal/retention assertions passed 63 unit / 28
Chromium. Native IPC on current 7d315faa… passed; source/observer/builder SHA
parity and fixed actual disk bytes retained. Follow-up wildcard journal query for
first startup could not add its unit filter (exit1); retained as unavailable, not
proof of a cause or missing service. Commit source/tests now, refresh review from
that committed frontend, verify exact extracted mixed-break edits/refusal and
re-download the pushed blob. Do not silently reuse old archive frontend.

## 2026-11-19 — mixed-break fixed browser delivery

Source fix committed locally as 6f7d4c6. Fresh review now binds that exact committed
frontend; extracted static build passed real mixed internal-break editing plus
ambiguous repeated-line refusal, input retention/Save block/Escape exact restore,
as well as prior React/new-note/keyboard/pending/BOM/offline/status cases. All eight
packaging negatives, CRC and complete asset/capture hashes passed. First capture
failed on connection refused after environment restart stopped the owned server;
no artifact was assembled from that failed capture. Restarted server4189, verified
actual current index, recaptured successfully; failure log retained.

Current ZIP: 6,350,148 bytes /29 entries / SHA-256
c175fbe7c7cc250347512e90de668b9aa7b84392d7b60c8454c1c3a24f4d6dee.
Delivery evidence is 2026-11-19-eol-review. Next: finish required repository check,
commit/push source+delivery, verify remote blob, update draft PR to fixed source
and fresh immutable ZIP/counts63 / 28. Then investigate native cold-start failure
with bounded actual observations; preserve the15-second compiler and60-second
service deadlines. Independently measure long-paragraph editor usability before
choosing another implementation; avoid speculative refactoring or aesthetic work.

Delivery verification caught a one-off 390 px counter first-click failure (Count0
after click). No app source/test behavior changed to bypass it. Failed log, input
timeline and screenshot retained; fulltrace cached /tmp/eol-delivery-mobile-failure-trace.zip.
Ten serial +ten parallel targeted repeats passed, but cause is NOT resolved. Full
check rerunning alone now; preserve failure even if it passes. One probe formatter
second pass was needed before checks; no acceptance predicate changed.

Independent read-only real Chromium geometry measurement found a concrete next
usability issue: a legal31,927-byte / 1000-line paragraph opens a27,189.5 px textarea
in an 800 px viewport, though all input remains exact. After this checkpoint, bound
its editing viewport/retain internal scrolling, full text, focus/keyboard and
exact source/history; this is functional control sizing, not an aesthetic redesign.
Native cold-start and unexplained mobile click still need observations; no claimed
fix from successful repeats. Source/evidence P2 remains verified separately.

Final isolated full check passed 63 unit / 28 Chromium. Fresh extracted archive
validation rerun after probe formatting also passed all mixed/refusal/old behavior
and 8 negative controls. Mobile counter first-click cause remains unresolved despite
20 targeted passes; failure and latest pass both retained. Commit/push source 6f7d4c6
and delivery now, re-download exact remote Git blob, update draft PR fixedEOL/current
63 / 28counts plus remaining startup/memory/mobile limits. Then bounded long-field
viewport improvement, proven by real input geometry, keeping data/scroll/history.

Source 6f7d4c6 and delivery b45ffa6 are pushed. Current ZIP remote Git blob was
actually re-downloaded and matched exact bytes/SHA; receipt retained. PR #1 head
and draft verified, body now describes fixed mixed endings, conservative limits,
63/28 checks and the unresolved mobile click. Latest hosted run 44484287256 for
b45ffa6 was refused before runners/steps with the billing annotation. Continue
with the measured long-paragraph viewport defect; no approval needed for this
bounded editor-owned control improvement, and native/browser isolation stays intact.

## 2026-11-19 — bounded long-paragraph input, native crash investigation

Checkpoint on pushed2674707, uncommitted CSS/test/native observer. A1000-line
paragraph produced a27189.5px textarea in800px browser/600px native viewports.
Two CSS declarations cap the editor-owned input at60vh with internal scrolling;
full63-unit/29-Chromium check passed, including actual end typing/export/history.
Installed d37cf787… / deb ae7b10ad… measured360px/full exact text and passed actual
keyboard/save/undo/redo/mode0640/clean close in one run. That observer called
Reopen but did not positively check its UI acknowledgment. Strengthened observer
15faff92… now requires exact Reopened-from-disk status plus actual rendered text.

Native completion is NOT claimed: two other capped runs crashed WebKit's renderer
at switching to Visual, before activating the textarea. Kernel confirms SIGSEGV
(WebKit PIDs19918,20328). Driver sessions disappeared but owned Rust roots19887,
20297 survived; only those roots were terminated after verifying fixture PID,
UID, executable SHA and start time. No isolation/quotas/JIT settings changed.
Unicode regex narrow/wide probes passed50 calls each. Separate pure production
JSC mapping probes parsed two ranges/three blocks and patched successfully without
DOM rendering. These negative diagnostics narrow investigation but do not identify
the crash cause. Raw evidence is2026-11-19-long-inline; final strong native case
remains failing. Next: failure-safe observer cleanup, capture sanitized renderer
backtrace in disposable VM, retain failures and avoid speculative parser changes.

Final ordinary installed run (fixture TjAf5t) passed the strengthened observer:
360px input/full exact value, internal scroll, actual tail typing, pending-save
block, BOM/mixed-ending exact disk/undo/redo/mode0640, acknowledged Reopen plus
exact rendered paragraph, and actual clean process exit. Debugger diagnostic also
passed, ending at normal renderer SIGTERM; no SIGSEGV captured under debugger.
These passes do not resolve the two prior Visual-transition kernel SIGSEGVs.
Read-only review found no CSS source-fidelity issue and identified lifecycle
ESRCH cleanup races, now handled only as owned-process disappearance. Final
repository check pending before bounded milestone commit/push. Next work remains
actual renderer-crash narrowing; do not guess a parser change or weaken isolation.

Final full repository check passed 63 unit /29 Chromium after moving cleanup out
of finally's throw sites (lint failure fixed). Ordinary observer312af19b… actual
strong native pass/source retained. A planned20-cycle debugger diagnostic failed
on its FIRST Visual transition (0cycles), capturing actual unresolved SIGSEGV at
an indirect call; PID-namespace stack warning limits symbolic interpretation.
Observer5f3a25e9… used the new cleanup function and positively terminated its
verified surviving Rust root. No JIT flags/sandbox/resource changes. Preserve this
new failure; successful ordinary run is scoped evidence, not a crash fix.
Hosted2674707 run44484732035 again had0steps and the exact billing annotation.
Next: commit/push bounded input fix and complete evidence; update draft PR. Then
prepare a minimal renderer reproduction/control to narrow JSC versus app/native
without shipping speculative engine flags or changing production restrictions.

Bounded input source/evidence pushed as d919978, PR head/draft verified and body
updated. Delivery refresh now has31entries/6,810,878bytes/SHA c086cd27… from
frontendd919978. Actual capture adds06-long-input.png and exact long-note.mdx;
extracted build passed scrolling/tailtyping/exact export plus all preceding
controls and8 packaging negatives. Keep frontend scope distinct from native
crash evidence. Next: fullcheck, push delivery, remotely retrieve exactGitblob.

Further native diagnostics: attempted root-only DFG-off wrapper stalled BEFORE
Visual at File operation in progress; it never reached flag-report/cycle gates
and is inconclusive, not a workaround/pass. Cleanup found process already gone
between identity and /proc/exe; helper now treats disappearance at that exact
lifecycle read as gone. App/driver production config was not changed. A separate
MiniBrowser2.52.6 control with exact same31,935-byte source, current frontend and
no Tauri bridge completed20Visual/Source cycles. This does not rule out engine/
heap timing or establish Tauri as cause; five independent sessions now planned.

Delivery verification caught Node-script lint globals (innerHeight inside browser
callbacks); qualified through each element's ownerDocument.defaultView. Capture
script hash changed, so recording/archive were regenerated and extracted checks
repeated rather than editing receipts. Current ZIP is7,024,457bytes/31entries/
SHA08b7f34d80b000551b53046b3cda0996e685cb0a5295be7bac9803c1c85f59ae.
Full repository check running before commits.

Native MiniBrowser comparison retained two complete20-cycle sessions. Third
was interrupted at7cycles when owned server/driver hit their300-second limits;
journal confirms expiry. Do not call it a pass or renderer crash. Diagnostic
record is2026-11-19-renderer-controls. No production config/engine flags changed.
After delivery push/re-download, next safe work: expand literal Markdown block
coverage conservatively, starting single-line blockquotes with exact marker/
context/candidate validation and opaque nested/JSX/formatting fallback. Keep
existing native renderer/pressure blockers explicit; no security-readiness claim.

Final current repository check passed63unit/29Chromium (43.9s browser run).
Current extracted archive and all8integrity negatives also passed after the
qualified viewport globals and regenerated capture. Commit/push now, verify the
remote blob byte-for-byte, update draft PR's immutable download. Next executable
P2 work is test-first literal single-line blockquotes: leave marker/indentation/
line endings untouched, reject multiline/lazy/nested/formatted/JSX quotes and
stale/forged context. Native faults remain documented and unrelated work is safe
under the existing editor-owned authorization and sandbox boundaries.

Delivery01afe73 pushed. Exact7,024,457-byte Git blob a0265cf3… was downloaded
and equals local bytes/SHA08b7f34d… . Current immutable browser review source
isd919978, delivery01afe73. PR remains draft. No MiniBrowser or application
processes remained after owned diagnostics expired. Next: receipt commit/PRbody
update, then test-first single-line quote support under existing source contracts.

## 2026-11-19 — literal single-line quote editing in progress

On pushed c090a29. Added failing unit expectation (zero old mappings) before the
parser change. Capture quoteFrom root context, exact literal child spans, single
marker and single-line text; preserve indentation/marker/terminator. Nested,
formatted, lazy/multiline, JSX and entity/escape quotes stay opaque. Browser test
first failed on missing semantic blockquote, then passed actual editing, no-op,
Escape, exact BOM/CRLF/JSX exports, history, reopen, retained unsafe multiline
input and React interaction. All 65 unit tests passed. Native-fidelity --quotes
adds quote gates without skipping the mixed-EOL/React/save/history/close/restart/
recovery base; source-matched optimized package is building now. No security,
IPC or native backend change. Review pending. Next: install, run full native
--mixed-eol --quotes and independent IPC, retain failures and exact binary hashes,
full check, document/commit/push; unresolved long-document renderer fault remains.

Quote package e7456301… / ELF4a14f61b… built/inspected/installed. Full repository
65unit/30Chromium passed. FIRST native --quotes --mixed-eol attempt failed BEFORE
quote/preview checks at native Open/fileIdle, operation remained busy. Failure
and exact observer retained. No passing native quote acceptance claimed.

Review found no important quote/context/fidelity issues. Current investigation is
the external chooser driver: it ignores a failed Open click and reports success
without confirming dialog dismissal. Instrumented actual app chooser reported
clickTrue/windowStillVisibleTrue but loaded the requested file immediately; this
successful control does not establish the earlier stall's cause. A real GTK
negative fixture is being constructed to hold validation after Enter. Initial
fixture gate started too early and passed old driver; retain as ineffective
control rather than call it red. Updated fixture observes entry activation and
holds Open disabled until release. Do not change driver before genuine red proof;
then verify native acceptance and preserve all original gates/security policy.

Chooser regression is now real red/green: initial two GtkFileChooser fixtures
passed old driver (ineffective controls). A simpler real GTK dialog explicitly
held Open validation after entry activation; old driver exited0/reported success
before acceptance, failing the oracle. Fixed driver waits for a visible, enabled,
sensitive button and then for dismissal, never automatically confirms overwrite
or retries an acknowledged click. Ambiguous dialogs/X-server errors fail; only
no-match/BadWindow disappearance is ordinary. Final GTK regression passed actual
acceptance, unchanged bytes/mode0640, empty stderr; driver4b9297c0… . No app/native
permission change. Earlier original fileIdle stall cause remains unproven.

Native fidelity now logs actual root executable and observer hashes, filtered
JIT flags and failure-only UI diagnostics. Fresh strict native --mixed-eol
--quotes run started on the same installed4a14f61b… package. Do not claim a pass
until all React/fidelity/history/close/restart/recovery gates finish. Then separate
native IPC regression and final fullcheck/commit/push. No routine approval needed.

Strict native run still failed before file load: actual chooser did not dismiss
within30s, selected source stayed note.mdx. Default JIT flags[] and actual4a14f61b
binary recorded; no source save occurred. This is not quote/runtime acceptance.
Added input barriers in driver: wait for the modal's focused editable location
entry after Ctrl+L and exact full path echo before Return, then same30s deadline
and acknowledged dismissal. Final delayed-validator GTK regression passes with
empty stderr, driver eb12915a… . These checks strengthen selection, not weaken it.
An actual instrumented successful chooser read exact focused path before Return;
it does not prove the failed chooser's root cause. New full native quote/mixed run
started with the echo-verified driver. Preserve earlier failures regardless of
outcome. Native renderer SIGSEGV and memory/expiry gate remain unresolved.

Native full run reached actual React/counter, unchanged exact save and modes,
then failed the new quote no-op/history oracle. Actual input probe explains it:
WebDriver /value retypes 'Quoted café 😀.' as 'Quoted café .' (astral emoji
omitted); clear/retype was a real source change, so Undo correctly reverted that
before the title edit. Independent reviewer agrees no production history bug is
established. Even settled X11 key synthesis omitted the astral character; an
immediate partial-text snapshot alone was not classified as a typing failure.
All actual values/codepoints are retained. Do not relax expected source bytes or
skip the gate. Probe actual OS Unicode clipboard paste next; require exact input,
textarea dismissal/rendered text and original full-source/history before calling
native no-op acceptance a pass. Product IME/hardware behavior remains unverified.

Actual OS clipboard paste preserved the entire Unicode text, including emoji,
without DOM value setters. Native helper now pastes through a bounded synthetic
GTK clipboard owner, asserts intended textarea bytes before Enter and exact
rendered text/dismissal after valid apply. Shift+Enter still supplies actual soft
breaks. No-op gate also saves/compares full source before Undo and after Undo/Redo.
No security/byte/history criterion was relaxed to accommodate automation.

Full installed --mixed-eol --quotes now PASSED: Counter, unchanged BOM/CRLF save,
modes, literal quote exact disk/no-op/history/unsafe retention, paragraph mixed
break history, mode0640, list edit, dirty-close Cancel/OK, actual application
restart, explicit unsaved legacy recovery, invalid UTF8 rejection/deletion and
unchanged original. Root JIT flags[]; actual ELF4a14f61b… / observer4c6a02ab…
recorded for both processes. Host/builder and host/guest observer hashes match.
Final GTK delayed-validator regression and independent IPC suite now running.
Next: write exact dated scope/failures, final fullcheck65/30, commit/push draft PR,
then refresh review delivery and inspect next independently justified core task.

Final quote milestone: independent native IPC/security and final repository
65unit/30Chromium checks PASS. Native delayed-validator oracle also passed with
empty stderr. Scope/failures/exact package and observer hashes are retained under
2026-11-19-literal-quotes. Commit/push quote feature plus honest native input
drivers now; keep draft PR and current artifact source scope explicit.

Next measured reliability investigation: native preview currently shows a static
60-second expiry note, but NativePreview has no authoritative end/disconnection
feedback after successful start. Inspect actual expiry UI and supervisor handle
lifecycle before choosing a minimal change. Do not infer stopped enforcement from
a frontend timer, drop a retained unit handle, restart automatically, or relax
limits. App already prunes closed-document histories; do NOT duplicate that work.

Quote source f503644 pushed and PR draft/head verified; native actual results
reported in body. Hosted44505000119 had zero steps/billing, not a code/test result.
Fresh quote-capable review binds f503644: 7,075,909bytes/33entries/SHA
89c78c59b4728e137ee7a8f1a2df7ac58230c0f208fc9a4b294bd5cd2b155959. Actual quote screenshot/Unicode export, extracted browser all
core checks and8packaging negatives passed. Final repo check pending before
delivery commit/push/re-download; no unexecuted checks called green. Next native
session-end feedback needs plan and actual before/after expiry observation.

Quote delivery final fullcheck passed65unit/30Chromium. Archive33entries /
7,075,909bytes / SHA89c78c59b4728e137ee7a8f1a2df7ac58230c0f208fc9a4b294bd5cd2b155959
binds committed f503644. Commit/push and re-download exact Git blob next.
A read-only native baseline observer is now running on installed4a14f61b…:
actual Root UI compile/React interaction through natural60-second expiry, recording
compiler status and absent lifecycle feedback without changing any policy. Its
/tmp/native-session-baseline.mjs and /tmp/native-session-baseline.log identify
the pending observation; do not claim new status functionality yet.

Delivery7645952 pushed; exact7,075,909-byte Git blob24d2533d… remotely fetched
and matched SHA89c78c59… . New native baseline on4a14f61b… observed actual
Counter interaction and60-second systemd expiry, while Root UI still said
Compiled/requesting native preview and exposed no session status before or after.
Original source unchanged. Baseline /tmp/pn-native-1nECJ7/evidence/session-baseline.json
with observer3e46e816… establishes next concrete feedback improvement. Preserve
unit identity after connection exit; new UI must never claim empty cgroup or
auto-restart from a timer. Next: read-only connection-status design/tests, guarded
Root-only permission, serial UI polling, actual expiry/rebuild/IPC validation.

## 2026-11-19 — native session feedback implementation checkpoint

Quote source f503644, review delivery7645952, exact remote receipt34647ef pushed;
PR remains draft. New feature ADR009/plan is uncommitted, existing checkout.
Baseline4a14f61b… actual counter/60s journal expiry left UI requesting preview.
Added Root-only argument-free preview_connection_active, repeated authorize,
readonly owned systemd-run try_wait retaining unit/child for Stop. Native policy
missing-method RED then7tests GREEN; capability whitelist RED/GREEN. UI tests
missing status RED then5GREEN; full suite69unit/30Chromium passed.

Fresh read-only review found two important gaps. Cross-generation pending reads
could accumulate: strengthened test observed3calls vs1 RED, global shared gate
now passes; Stop/start remains independent and old replies ignored. Review also
found native observer masked missing UI Stop with direct RPC. Corrected observer
now independently bounds UI-caused cgroup removal to3s and checks inactive read;
direct Stop only final cleanup. An external suppressed-first-UI-Stop control is
being exercised to prove this oracle. Sentinel unit test moved before first child
exit so transition-time loss is covered. Build-generated new permission is copied
into tracked autogenerated folder. No execution/resource restriction changed.

Intermediate package859c6954… / ELF c26f9e56… first full negative attempt reached
expiry/ended feedback, then failed second counter startup BEFORE fault injection.
That remains an unclassified native rebuild/blank observation, not a Stop-oracle
pass. Fixed global-gate package79e1c51… / ELF d74850a5… installed. First isolated
Stop control failed a conservative request-to-Stop timing guard before injection;
compilation/queue time is not unit lifetime. Updated observer uses systemd's actual
ActiveEnterTimestampMonotonic + CLOCK_MONOTONIC, same60s limit,3s observation and
5s attribution margin. /tmp/native-session-stop-only-old-oracle-clock.log now
runs old observer with deliberate UI Stop suppression/direct-Stop flaw; need
inspect before claiming meaningful RED. Old fixture /tmp/pn-native-RWVam8.

Next: finish old-oracle fault proof, run corrected isolated Stop negative (must
FAIL with live group before cleanup), then full corrected session-status positive
(expiry/UI/manual rebuild/counter/UI Stop), native IPC including new deny, full
mixed-EOL/quotes fidelity, exact source/observer parity, final checks. Preserve
all failed/inconclusive controls. Native long-doc SIGSEGV and memory gate remain.

Full current repository check69unit/30Chromium passed after global read gate.
Native UI-Stop fault control remains unproven: old single-case request-age guard
failed before injection; a clock-corrected attempt then proved the Tauri internal
invoke method is immutable (replacement checkfalse), so that JS injection is
unsupported and was NOT counted as a negative success. Preserve both. Do not try
to bypass that property. Considering external kernel-level exec failure against
only the owned editor process to simulate a failed UI Stop, with unchanged benign
preview limits. Guest lacks strace; builder is downloading authenticated package
for disposable VM. Existing Root ptrace testing is authorized, but all PID/UID/exe
ownership must be verified. SDK immutability itself is not a production defect.

## 2026-11-19 — session native proof and Stop fault checkpoint

Final production package79e1c512… / installedELF d74850a5… passed the complete
session observer2ab790d2…: actual first counter, natural60s journal expiry,
ended/disconnected UI, no automatic restart, explicit rebuild/counter, UI-only
Stop removes group within3s before expiry at actualunitage46.728146s, exactsource
andmode0640 unchanged. Source parity sevenhost/builderfiles passed. Full local
check69unit/30Chromium and7native-policyRust passed; no fullpressurematrix claim.

External owned-editor strace EIO control proved oldobserverfalsePASS: UI NativeStop
failed but observer directStop masked it. Correctedobserver meaningfulRED(exit1):
UI EIO, livegroup/connectiontrue, UI-only3sgate fails before actualexpiry; direct
Stop onlyfinallycleanup after tracer detached. Both rawreports/traces/source
retained. First correctedattempt failed beforecounter/fault and remainsinconclusive.
TauriinvokeJSreplacement isimmutable/unsupported, nevercounted. Ordinarysuccess
is not a fix for priorblank/rebuildfailures, long-docSIGSEGV ormemorypressuregate.

Now independent nativeIPC run /tmp/native-session-ipc.log, then full
native-fidelity --mixed-eol --quotes serially on same installed binary. Needrecord
observerparity/currentlogs; finishdocs/check, commit/push/update draftPR. Hosted
head34647ef bothzero-step jobs refusedaccountbilling, exactannotationsretained.
Next usefulboundedmilestone: explicit Stop retry/error feedback. The actualfault
shows App labelsPreviewstopped before backendconfirmation; after cleanupfailed,
a secondStop setsalreadyemptyhtml and causes no new native request. Backend keeps
unitidentityand60sTTL; manualRebuild Stop-before-start remainsfailclosed. Fixwith
serialized trustedStop request and truthfulresult, no previewauthority/limitchange.

Final independent nativeIPC PASS (newreadonly denial plus allpriorboundaries), full
native-fidelity --mixed-eol --quotes PASS on d74850a5… includingactualrestart/explicit
unsavedrestore/invalidUTF8/delete/originalunchanged. Observerhost/guestparity3files
exact. Allrawlogsandordinary/faultreports retained. Finalstaticchecks pass after
docs/package-script edits; full69unit/30browser run remains sameapplication source.
Nativefeedback milestone readyforcommit/push; PRmuststaydraft. Next execute
/tmp/pn-stop-retry-design.md via bounded plan/tests, newoptimizedpackage/faultretry
acceptance, and preserveoldfailure. No automaticretry orresourcechange.

## 2026-11-19 — native Stop retry implementation checkpoint

Session milestone841e8a7 pushed and draftPR updated. CIrun44516472974 failed before
steps; priorbillingrefusal stillneedsowneraction, notpassingCI. Next boundedplan
2026-11-19-native-stop-retry implementsactualfaultfinding: toolbarpending/failed/
confirmedfeedback and explicitretrywhenartifactalreadyremoved. Sharedexisting
serializedqueue extractedinto native-operations.ts, no automaticretry/newnativeAPI.
Per-clickidentityguardssettlementacrossnewStopandRebuild; implicitcleanupstillreports
errors. FocusedinitialREDfalseStopped/missingretry, thenstalecompletionRED. Fresh
read-onlyreviewfoundunconditionalcleanup onErrorbypassedrequestguard. Deferred
oldrejection tests reproducedbothstalealertsRED; singlehandledcompletionownership
fixed10focusedtestsGREEN. Fullcurrentcheckrunning /tmp/native-stop-retry-final-check.log.

Initialfullcheck72unit/29browser passed but820px firstcounterclickstayedCount0;
knownrareinteractionfailureatadifferentviewport, notsilentlyignored. Complete
traceZIP210eaf0f… andscreenshotretained;20unchanged820pxrepeatsPASS. No speculative
runtimechangeortestretry/timeoutweakening. Causeunresolved. Needfinalcheckresult.

Finalreview-fixedoptimizedpackage1ee05d11… / ELF5318edc9… installed, nativefault/retry
observerrunning /tmp/native-stop-retry-native.log, fixture /tmp/pn-native-vCwgmC.
Rootexternalowned-processEIOcontroller /tmp/native-stop-retry-controller.log. Need
actualfailurethenUIretry/cgroupcleanupbeforeunchangedexpiry; noRootdirectStoporacle.
Afterpositive, runordinarysession/nativeIPC/fullmixed-EOLquotesfidelityserially,
recordsourcetestobserverparity, updateADR009/status/evidence,commit/push/draftPR.
Nativebackendpolicy unchanged; nofullmaliciouspressurematrixclaim. Newreviewbundle
stillbinds f503644, explicitlynotthisnativeonlyfeedbackmilestone.

## 2026-11-19 — Stop retry milestone verified

Base 841e8a7 is pushed; the current native Stop retry changes are ready to commit.
The installed production package is 1ee05d11… / ELF 5318edc9…. Actual injected
exec EIO produced failed feedback with a live cgroup; an explicit second UI click
at unit age 51.357028s removed that group within 3s before natural expiry and
cleared the error only after confirmation. Source and mode 0640 stayed unchanged.
Ordinary expiry/rebuild/counter/UI Stop and independent native IPC passed on the
same binary. First full fidelity run FAILED to find its counter before 60s expiry;
its journal recorded 14.403s CPU and 66.3MiB peak. Preserve this startup failure.
The repeated full fidelity run PASSED all mixed-EOL/quote/disk/history, close,
restart, explicit unsaved restore, invalid-UTF8/delete and original-file checks.
A read-only startup monitor was ineffective due to sampling activation timestamp0;
its data/source are retained as inconclusive, not cause or screenshot evidence.

Final checks passed 74 unit /30 Chromium with system156 AND matching Playwright
Headless Shell159.0.8154.6, plus format/lint/types. One earlier tablet first-click
failure and full trace remain;20 unchanged tablet repetitions passed without test
weakening. Fresh review's stale-error finding was reproduced and fixed, including
preserving a current compiler diagnostic after superseded Stop rejection. Native
source/builder and four observer copies match. No native policy/capability change.
No new pressure matrix, production readiness, or physical GPU/Wayland claim.

Next: commit/push this bounded fix, update draft PR and check exact new CI head.
Continue with first-counter-click diagnostics: distinguish delivered input from
reset/remount using read-only event/mutation observations and pinned/system browser
controls. Draft diagnostic /tmp/pn-counter-first-click.mjs; do not change runtime
or assertions without evidence. Current hosted head841e8a7 remains zero-step
billing-refused. Browser review ZIP still binds f503644, deliberately separate
from native-only session/Stop feedback changes. All owned test root PIDs exited.

## 2026-11-19 — bounded first-click investigation checkpoint

0975b35 is pushed and PR#1 is still draft. Its new CIrun44520354949 again refused
both zero-step jobs due billing; raw annotations are retained. No repository code
can fix the account setting, and no hosted success is claimed.

New read-only scripts/diagnose-counter-input.mjs passed30 instrumented +20 untouched
warm-context trials per browser (system156, matching159), then10 fresh Node/browser
one-round trials per version. No real miss reproduced:120 observations total,
plus one positive event-pipeline control. A deliberate omitted first input exited1
and remained failed after a real second click produced Count1. Actual trusted
pointer/click, mutation and stable srcdoc timeOrigin proved observability. Existing-
evidence collision failed at EEXIST before browser launch and did not change old
bytes. Source/probe version hashes, failed prior trace and exact control receipts
are retained. No production change or cause claim. Current full check74unit/
30Chromium plus formatting/lint/types passed. Commit/push this diagnostic milestone
and update draft PR, then continue the bounded multiline-quote mapping contract in
IMPLEMENTATION_STATUS. Keep snapshots, JSX opacity, source revision and native
limits unchanged. Do not rerun random clicks indefinitely or infer a fix from
absence of reproduction. Browser demo remains the exact remotely verified f503644
review ZIP; no native-only update is silently attributed to that older artifact.

## 2026-11-19 — multiline quote implementation checkpoint

Diagnostic milestone10cb2f3 pushed; PR#1 remains draft and includes its bounded
120-click investigation. Current uncommitted ADR010/plan extends explicit literal
multiline quote editing only with unchanged physical line count. Unit RED at absent
range and actual browser RED at absent editable blockquote, then25 focused unit
and actual full browser interaction GREEN. Full check75unit/31Chromium passed,
including prior single-quote multiline-input rejection and all sandbox cases.
Fresh read-only review found no Important/Critical issue; raw span integration in
SourceEditor is unchanged. No native authority or JSX editing contract added.

Optimized Debian287692f1… / installedELF fd151c78… built/inspected/installed. The
native-fidelity observer now has --multiline-quotes (requires --quotes) and retains
all old gates: new logical/raw quote fixture, exact no-op/history, rejected line
count with pending input, real Unicode clipboard edit, raw prefix/mixed-ending
save/undo/redo/mode0640, then old paragraph/list/close/restart/recovery checks.
Observer a3f431cf…; fixture /tmp/pn-native-RL6kRj; actual native run is in progress
at /tmp/pn-multiquote-native.log. Do not claim native support until the complete
result. Source/builder and observer parity/evidence still need recording.

Next: inspect native result, preserve any startup/render failure; run independent
IPC regression on exact installed binary. Update ADR010/README/status/Linux testing,
retain TDD/full/native logs and hashes, commit/push/update draft PR. Then refresh
the downloadable review demonstration to include this current editing feature;
the existing verified ZIP still binds f503644 and must not be relabelled as new.
No pressure/hardware/security-readiness claim; prior SIGSEGV/blank/memory failures
remain. Do not change fixed native limits or parser fallback to force acceptance.

## 2026-11-19 — multiline quoted editing verified

Full75unit/31Chromium check passed. Installed fd151c78… full expanded fidelity
passed with --mixed-eol --quotes --multiline-quotes, including both quotes, exact
mixed-ending disk/history, source mode0640, dirty-close cancellation, real restart,
explicit unsaved recovery, invalid UTF8/delete and final shutdown. Independent
native IPC passed on the same ELF. Host/builder seven files and host/guest three
observers match; actual saved MDX host/guest SHA agrees.

First full run failed only at final close query BadDrawable/X_GetGeometry, retained
as a failed command. Actual GTK delayed-acceptance + recorded transport error made
old driver RED after real acceptance; fixed once-only query retry GREEN. Persistent
query error still refused at original deadline (innerdriver exit1; runner verified
that refusal). No query error is absence, no acknowledged action is repeated and
no app/security limit changed. External driver9fb7305b…; fidelity observera3f431cf….
All failures/receipts and exact package287692f1… / ELFfd151c78… retained.

Next commit/push this bounded feature, update draft PR/check exact CI head, then
refresh recorded browser demonstration/download (source commit must be the newly
pushed feature). Current review ZIP still binds f503644. Keep source fidelity,
opaque JSX and unprivileged preview; old SIGSEGV/startup/memory blockers remain.

## 2026-11-19 — current multiline review delivery verified

Engine34dc906 is pushed; PR#1 remains draft. New actual recording/extracted build
checks passed all old cases plus multiline quote edit/Undo/Redo/exact export and
unsafe line-count retention. Full matching-browser check75unit/31browser passed;
recording-only pacing then passed format/lint, capture and complete artifact checks.
Producer formatting drift was correctly refused; re-recorded output and a ninth
checksum-drift negative now preserve that guard.150 tracked shipping/config/vendor/
lock/default-fixture files and build metadata match the native builder exactly.

Final archive 8,540,754bytes /36entries, SHA256
ccc780298173df68c25612d56989f0560889c1f0ee58e8dc1bd6c0995cd3febb. Actual extracted local HTML media playback passed:
21.32s,1440×1000,decoded frames,all18images,no error. Old6.44s receipt
is labelled prepace; producer-preformat receipts are separate historical controls.
Native scope remains package287692f1… / ELFfd151c78…; no new native claim from demo.

Next commit/push delivery, then download remote Git blob and compare every byte;
record receipt/update draft PR. Current source34dc906 hosted CIrun44527525920 again
refused both zero-step jobs for billing. Then begin bounded opaque-block Source
navigation using existing revealSource snapshot/offset guards. No JSX reverse
editing, privilege expansion, merge, public release or production-readiness claim.

## 2026-11-19 — remote delivery receipt

Delivery247ee9a pushed. Actual GitHub GitBlob download af59a6f2… matched all
8,540,754bytes, SHA256ccc78029…, engine34dc906. Immutable README download now pins
that delivery.21.32s video decoded in matching159;18images and standalone extracted
app passed.75unit/31browser, nine artifact negatives and150 shipping-source parity
checks retained. PR remains draft; no merge/release/readiness change.

Next: update the PR around final implemented state and this verified download,
then bounded opaque-block Source navigation via existing revealSource offset/full
snapshot checks. Native fd151c78…/package287692f1… remains exact recorded baseline.
Latest checked hosted34dc906 zero-step CI refusal is account billing; verify latest
head again, never label local success hosted-green. Keep all known native failures.

## 2026-11-19 — opaque block Source navigation verified

Baseca99097; trusted expanded blocks now focus their exact original Source caret.
Full snapshot/document identity and CodeMirror guards, pending/busy refusal, no
source/history/grant change and no preview message authority. Unit/browser RED
then GREEN; read-only review no Important/Critical issues. Full check77unit/32
Chromium passed; Rust7policy/36ordinarydocuments/1Tauri boundary passed,4ignored
fault tests not rerun,3Rustfmt checks passed.

Optimized package2002734b… / installed ELF46f65e87… passed full native fidelity
--mixed-eol --quotes --multiline-quotes --source-navigation: actual counter, old
editing gates, pending refusal/Escape/Sourcejump/real keyboard exact disk caret,
Undo/Redo/mode0640, dirty-close Cancel/OK, real restart, explicit unsaved recovery,
invalid-data/delete and original unchanged. Independent IPC passed sameELF with
separate production policy/effective-limit/Stop and automated ACL/Counter/CSP scopes.
All150 tracked shipping sources/config/vendor/locks/defaults match builder.
Evidence2026-11-19-opaque-source-navigation includes raw logs/hashes/syntheticMDX.

Next: commit/push/update draftPR, check exact hosted result, then investigate
large-document reliability in bounded steps. Existing downloadable ZIP remains
engine34dc906, not this new action. Baseca99097 hosted run44532919827 refused both
zero-step jobs for billing. Preserve earlier native SIGSEGV/startup/blank/memory
acceptance failures; no security readiness or complete new pressure-matrix claim.

## 2026-11-19 — bounded native long-document diagnostic

705caee pushed; PR head/draft verified. Hosted run44537378889 refused both zero-step
jobs with same billing annotation. Native Source navigation/fidelity/recovery/IPC
results already retained on installed46f65e87….

Ordinary actual long-input acceptance passed currentELF. New bounded
--visual-cycles1..20 observer recorded5Visual/4Source transitions, then exact
keyboard/save/Undo/Redo/reopen/mode0640/cleanexit passed. Phase JSON is ordinary
writeFile, not fsynced crash/power-loss durability. No production/security changes.
Full check78unit/32Chromium passed; guard RED/GREEN and read-only review clear.
External second-observation=false control exited1 at original deadline, retained
completed1/visual2requested/fail, no editing-success flag; independent exact original
bytes/mode and ownedRootgone verification passed. Actual DOM still had paragraph,
so this is reporter refusal, not SIGSEGV reproduction. Kernel window no entries;
old nativecrashes remain unresolved. Evidence2026-11-19-long-transition.

Next: commit/push this diagnostic, update draftPR/check hostedhead. Browser-import
budget follow-up already has3failing-then-passing focused hook tests: current Open
reads all files before aggregate32/8MiB rejection. Preflight metadata/currentbudget
while preserving strictUTF8/BOM/finallatestworkspacechecks. Implement accepted and
asyncgrowth tests, browser regression, fullcheck/review/evidence, then commit.
No design replacement, permission expansion, merge/release or readiness claim.

## 2026-11-19 — browser import read budgets verified

Baseb9a2b73 pushed; its hosted44538616415 again refused both zero-step jobs for
billing. Browser Open now preflights current workspace + real selection metadata
before any read, retaining shared32file/500KB/8MiB bounds, strictUTF8/BOM and
final latest-workspace validation.3hookRED→GREEN and2further tests passed: exact
8MiB accepted, source growth+1byte during stalled read rejected without data loss.
RealChromium zero-read rejection, dirtyUndo/Redo, following validimport/exactexport/
dirtysibling passed. Initial wrong innerText-vs-textContent matcher failure retained
and corrected to same-propertycomparison; exact bytechecks remain. Read-onlyreview
no Important/Critical. Fullcheck83unit/33browser passed. This browser-onlypath is
not used by installed native Open; no new native build/runtime claim.

Next: commit/push/update draftPR/check exactCI head. Then investigate visual AST
parsing cost with bounded isolated synthetic inputs before proposing any change;
source-size bounds alone may not establish a time bound. Keep known native
SIGSEGV/startup/memory failures and old reviewZIP34dc906 scope. No inferred
vulnerability or security-readiness claim without executed evidence.

## 2026-11-19 — conservative visual analysis budget verified

Base144da10 pushed; PRdraft/head verified, hosted44539390455 again refused both
zero-step jobs for billing. Measured Node densequote/bracket3s deadlines and real
100KB Chromium Visual5073ms/heartbeat2944ms. Firstvirtualizedtextreadinessprobe
failed beforetransition; retained separate. Sameproducer afterguard measured68ms/
24ms(single observations, no portable/universal guarantee). Above4096 raw[]/>
markers or existing500000UTF16bound, no mappings/patches, one exact escaped whole
source fallback/explicitSourceaction. Source/compiler/save limits remain.

TDDunitRED→GREEN; exactbudget/growth/quote/size fallback, browser exactexport then
normalediting/Undo and all86unit/34Chromium fullchecks passed. Read-onlyreview
caught ImportantnewSaveoracle weakness: unchangedbytes+fileIdle insufficient.
FixedexplicitcurrentSaved.+no-file-error, follow-upclear, observereslintpassed.

New optimizedpackage6878294f… / installedELF6e301bce… passed full expandednative
--mixed-eol --quotes --multiline-quotes --source-navigation --visual-budget, all
priorcounter/editing/history/restart/explicitunsavedrecovery/invalid/delete gates.
IndependentIPC passed sameELF;150shippingfiles matchbuilder, helperhashes match
guest. No newRustbackend/fullpressure claim. Externalparentdirectory0550(control
file0640) causedrealPermissionDenied: weakoraclepreconditions alltrue, corrected
observerexited1/noPASSmarker; independentall100026originalbytes/mode/parentrestored/
ownedRootgone verification passed. Evidence2026-11-19-visual-analysis-budget.

Next: commit/push/update draftPR/check exactCI. Then add a distinct resident-page
memory-pressure workload to native stress tests, retaining original16MiBfillcase
and itsfailedOOM-before-expiry record. Enforced512MiB/0swap/25%CPU/60s, required
actualOOMcause/cleanup/recovery must remain. Run in same disposableVM, no sandbox
or productionlimit changes. OriginalrendererSIGSEGV/startup/blank failures remain;
no nativecrash/all-parserDoS/security-readiness claim. ReviewZIP still34dc906.

## 2026-11-19 — resident-page pressure / strict OOM oracle in progress

368dd95 pushed; PRdraft/head verified. Hosted44542637950 refused zero-step jobs
forbilling. Added distinct memory-pages workload (retained128MiBblocks, dirtyeach
4096Bpage), original16MiBfullfill retained. Unknowncasefirstrefusedbeforelaunch.
First selectedrun(a830aca… observer) exited0, actualkernel/systemdOOM512MiB/0swap
thenCounter0→1→2/cleanup; labelledpre-strict. Independent structuredposthoccheck
confirmed actualsystemdEXE/UID1000/unitresultoom-kill/536870912peak/0swappeak.

ReviewcaughtbroadOOMregexcouldacceptallocationdiagnostic. Bothmemorycases now
require trustedstructuredjournal metadata via scripts/native-journal.ts; reject
wrongauthor/sender/unit/UID/result/transport/messageid, malformedrecords and
RangeError/OOMtext. Broadpredicateadaptersemanticallyfailed2tests, strictpassed.
Retainrawjournalbeforeparse; helper/observer/HTMLSHAidentitiesrecorded. Fullcheck
88unit/34Chromiumpassed, laterrawretentionlinepassedtargetedlint.

ACTIVE full6case actualproductionmatrix: guestfixture /tmp/pn-native-X7wiYM,
loghost /tmp/pn-memory-pages-full-native.log, guestoutput
/tmp/pn-native-X7wiYM/evidence/webkit-stress.json (writtenoncompletion).
Execsession71200; guestRoot38461. InstalledELF6e301bce… unchangedfrom368dd95;
observere7013cc2… / oracle637db391…. No concurrentGUI/heavyhostchecks. CPUquota
observed775854us/3041ms,31throttledperiods,395mseditorresponse; recoverypending
atlastsample. Letall6casesfinish; preservefailures, don'tclaimwholepassyet.

Next: inspectfinalcommandexit/percaseJSON/journals, retainfullraw and exact
helperparity; verifyemptyownedgroups. UpdateNATIVE_SECURITY/status/evidence/
progress/PR withactualoutcomes, runfinalformat/lint asneeded, commit/push.
Originalmemoryfailure/rendererSIGSEGV/startup/blankrecordsstillstand; selected
newworkloadsuccessisnotcomplete6casepass. No productionpermissions changed.

## 2026-11-19 — strict OOM oracle / complete native repeat recorded

Full6case actualproductionmatrix finished exit1:5passed, memory-pagesfailed.
CPUStop775854us/3041ms/31throttles/395msRootresponse +Counter recovery; original
16MiBfullfill now actualtrustedOOM536870912peak/0swap+Counter; expiry/editorSIGKILL/
windowclose+recoverypassed. Additionalpages timedout528297984peak/0swap; itsimmediate
Countergate notexecuted aftermissingcause. All11unitgroups/knownidentities and
Root38461/39308 termination independentlyverified. OriginalOOM notification59.339s
afterStarted, finalfailurecleanup60.603s; no runtime-expirymessage for thatunit.
Samepageartifactf397704e…/ELF6e301bce… had precedingselectedOOM+Counterpass, finalfull
timeout; actualdifference retained, no exclusiveTCG/timingfixclaim.

Structuredoracle637db391…/observere7013cc2… fixesreviewImportantbroadtextfalsepositive.
88unit/34Chromium fullcheckpassed; rawretentionline subsequentlint/nativeexecuted.
Evidence2026-11-19-memory-pages has2.2MBfullJSON,percase,journals,semanticRED/GREEN,
prestrictscope/independentposthocproof, cleanupreceipt, CIbillingannotation.
Nativepackage remains6878294f…/ELF6e301bce…; no productioncode/limit changes.

Next: finalformat/diffcheck, commit/push/update draftPR/checkCI. Thenrefresh
portable reviewZIP for latesttrustedSourcejump/densefallback. Existingdownload
247ee9a stillengine34dc906; don'trelabel. Formatproducerbeforecapture, require
servedbuildhash, actualvideo/media/extractedapp/exactexports and remoteGitblob
bytecomparison. Preservefailednativepagegate/RootSIGSEGV/startup/blankhistory and
accountbillingblocker. No publicrelease/merge/readiness change.

## 2026-11-19 — current browser review verified before delivery

Engine54c41a7 is pushed and PRdraft verified; latest hosted44547920235 again failed
before steps (check exact annotation after delivery). Production app unchanged.
Capture/packager/extracted browser checker now include trusted opaque Sourcefocus/
unchanged export and100KBdense read-only/exact export, retaining all older cases.
Read-only review caught hidden-details count before capture; expand beforecount.
DOMcallback lint and second-pass formatting fixed without disabling rules. Focus
uses explicit retrying wait. Exactcaret remains full e2e scope, not new verifier.

Full88unit/34systemChromium check passed; capture/extracted checks used pinned159.
Strict manifest/CRC+9malformed controls passed; actual extracted local HTML played
27.64s1440x1000/decodedframes/noerror/all20embeddedimages. Archive40entries,23PNG,
7actualMDXexports (navigation copy intentionally unchanged),10,984,209bytes, SHA256
0d802c849718fa6ab5e36c3a1e8af69ffe42ab0d58743e54061bc8404e1cea26. Evidence directory
2026-11-19-engine54-review; earlier current-review trackedreceipt restored exactly
and kept historical. Old generated .cache capture preserved separately.

Next: commit/push delivery, remoteGitBlobdownload→actualbytecomparison→receipt/
immutable README URL; update draftPR/check exactCI. Then investigate duplicate
visible Sourcefile labels across separate openedgroups (current options strip
opened-N prefix / native binding name). Preserve source/grants/history; no design
replacement. Latest native full6case remains5pass/1pageOOMfailure; oldJSC/startup
issues/billing remain, no release/readiness or native claim from browser media.

## 2026-11-19 — current review remote receipt

Delivery16e8a3a pushed, PRhead/draft verified. Actual remote GitBlob34ce65cf…
matched10,984,209bytes/SHA2560d802c84…/objectSHA; immutable URL and receipt now
pin source54c41a7,27.64s video/23PNGs/20displayedimages/7actualexports. Native
5pass/1pageOOMfailure scope unchanged. Hosted16e8 run44550796321 failed; fetch
exactannotations, then updatePR/currenthead. No publicrelease/readiness change.

Next boundedcoretask: Source dropdown currently has identical visible names for
separateopenedgroups withsamefilename; use presentation ordinals while preserving
actual source keys/grants. Also useDocuments.select currently accepts closed/
unknown/prototype keys, violating selected/entry membership if a stale event is
delivered. Reproduce with unit/browser tests before fixing; reject unknownkeys in
functional latest-workspace updater, preserve per-doc bytes/history, validate
actualnative pair selection/saves. No aesthetic redesign or new permissions.

## 2026-11-19 — safe source selection verified

Basebc9a21d. Hook delayedclosed/unknown/prototype keys reproduced invalidstate;
latestfunctional Object.hasOwn guard nowretainsstate. Realbrowserduplicate same-
name choicesRED→presentationordinalsGREEN; values/grants unchanged, ordinalsnotIDs.
Browser exactBOM/mixedEOL/Unicode/edit/save/independentUndoRedo/close/reopen passed.
Full90unit/35Chromium check passed. Read-only review no Important/Critical.

Optimizedpackage63c795d7… / installedELF4c0ab980… passed fullnative fidelity
--mixed-eol --quotes --multiline-quotes --source-navigation --visual-budget
--same-names. ActualOSpickers forfirst/repeat.mdx +second/repeat.mdx,2dirtybuffers,
actualEOFspacekeys, independentacknowledgedSave/exactdisk/mode0640/UndoRedo/Reopen;
thenalloldcounter/modes/quotes/fidelity/dirtyclose/restart/recovery/invaliddelete
gates passed. Native selection usesRootDOMdriver; unchangedreopennotexternalreload
proof. IndependentIPC passedsameELF;150shippingfilesmatchbuilder, observer2399a54d…
+GTK9fb7305b… hostguestparity. Evidence2026-11-19-safe-source-selection.

Next: commit/push/update draftPR/check exactCI. Thenadd strict native-fidelity
CLIflagvalidation beforepreflight/fixturecreation: unknownflags currentlyignored
andcouldsilentlyskiprequestedoptionalcoverage. Testbothnegative+validpositive
prerequisitecontrols, noapp/permissionschange. Existingreviewdownload16e8a3a is
verifiedengine54c41a7, notthisnewlabelchange. Fullresource6case onolderELF6e301bce
still5pass/1pageOOMfailure; RootJSC/startup/blank/billing limitationsremain.

## 2026-11-19 — native fidelity CLI coverage guard verified

Base77dedad pushed. Sixallowedflags centralized beforepreflight/files; unknown
flags andmissingquotesdependency fail1, validfullset reachesmissingprereq2.
UnitREDoldignoredflags→GREEN3diagnosticstests. LiveUbuntu prerequisitespositively
confirmed, --same-name intentionallyrefusedbeforelauncherPID/fidelityfixture;
outerverifierpassedonlyafterinnerexit1+absencechecks. No newGUI acceptanceclaim.
Fullcheck92unit/35Chromium passed; read-onlyreview no Important/Critical.
Evidence2026-11-19-fidelity-options includes observerhash/logs. ProductionELF4c0
and coreacceptanceobserver2399…retainseparatescope; resource5/1older6e301 unchanged.

Next: commit/push/update draftPR/check exactCI. Then investigate case handling
forMDX/source extensions: browserpicker canaccept uppercase names whileworkspace/
compiler/nativewhitelists currentlytestlowercase only. Reproduceactualbehavior,
choose boundedcorrection preserving exact paths/bytes and narrow file formats;
no wholepathcasefold or new filesystemauthority. Ifunsupported bydesign, make
rejectionexplicit ratherthanrenderinganotherdocument. Keep currentreviewengine54
immutable and all nativeJSC/startup/memory/billing limitationsvisible.

## 2026-11-19 — source extension consistency, verification in progress

Base40e253c. Reproduced real uppercase MDX retaining another entry. Shared frontend
extension classifiers and native ASCII spelling policy now preserve exact full
paths/module keys, source bytes and existing six formats. Native filters include
those spellings; unsupported browser files reject before reading. Workspace,
browser, native store/snapshot regressions added; no capabilities or path IPC.
First fullcheck94unit/36Chromium and39ordinary documentRust+7policy tests passed.
Read-onlyreview no Critical/Important; additional extension-only wrong-case and
simultaneous case-distinct TSX browser controls added, final fullcheck pending.

OptimizedDebian3c0b8347…/ELFff7d4bab… built/inspected/installed,151shipping files
matchbuilder. Fullnative first attempt failed during headingUndo after actual
.MdXpicker/React/unchangedsave/modes, repeated-name anddense gates passed. Trusted
WebKitWebProcess41070 logged internal DFG->FTL tier-up diagnostic then vanished;
Root41039 survived. Independently originaltitle/bytes/mode0640 preserved. Owned
Root cleaned with verifiedPID/start/exehash SIGTERM. No JIT/policy changes; not
proven same cause as earlierSIGSEGV. Rawfailure +journal/cleanup retained in
2026-11-19-source-extension-case. Same-command bounded fresh-fixture repeat running
Root41563, /tmp/pn-extension-native-fidelity-repeat.log, exec20929. Allfailure
outcomes remain failures even if repeat succeeds. Installed source remains frozen.

Next exact action: finish repeat, independentIPC on exactELF; finalfullcheck
(aftertest-onlyreviewcontrols anddocformatting), retain source/helper parity and
native results, commit/push/update draftPR. BaseCI44557795559 bothjobs0steps same
billingannotation. Currentdownloadreview immutableengine54, resource6e3015/1,
JSC/startup/blank/GPU limitations remain. Do not claim production readiness.

## 2026-11-19 — source extension verification checkpoint

Finalfullcheck94unit/37matchingChromium passed, including wrong extension-only
import case and simultaneous Widget.TSX/Widget.tsx compiler identities.39ordinary
RustDocument and7policy passed. Optimized3c0b8347…/ELFff7d4bab… installed;151shipping
inputs and fullbundleSHA matchbuilder. IndependentnativeIPC exited0 exactELF.
Samebinary complete lowercase --all-earlier-flags command exited0 all disk/history/
mode/quotes/navigation/dirtyclose/restart/legacyrecovery/invaliddelete gates.
Short uppercase --extension-case command exited0 all ordinaryfidelity/restart/
recovery gates. The two fulluppercase primed commands remain exit1 atheadingUndo,
with trustedJSCDFG->FTL diagnostics. Static32bit sourcehash matches CodeMirror
advanceCursor guttercandidate; puredefaultJSC200000calls exited0, notrootcausefix.
AllownedfailureRoots cleanedwithidentitychecks, successfulRoots exitednormally.
No JIT/security/deadline/limits changes. Currentevidence distinguishes allscopes.

Next: commit/push/update draftPR/check exacthostCI. Thenextend existing native
automatic-recovery observer with strict --extension-case mode (mutuallyexclusive
with --new-notes so coveragecannot silentlydiffer), failunknownargsbeforepreflight/
fixturewrites; assert mixedcase snapshotmetadata, originalpreservation, real
SIGKILL/restart/explicitunsavedrestore/cancelledandactualSaveAs tocase-preserving
filename. Productionapp/binaryunchanged. AddrealnegativeCLItests, preserveoldgates,
runfullcheck andactualordinaryUIDnativeacceptance. ContinueJSC investigationas
separateunresolvedreleaseblocker; no speculativeproductionengineworkaround.

## 2026-11-19 — uppercase automatic-recovery acceptance running

3a8a036 pushed and draftPR updated. ExactCI44566378334 bothjobs0steps billing;
no hostedgreen. Newobserver only: strict at-most-one --new-notes/--extension-case
beforepreflight, preservealloldgates, uppercase file/snapshotmetadata/baseline
checks, dirtyunsavedrestore, acknowledgedSaveAs exactbytes/modes, ownedRoot
PID/start/exehash continuity beforeSIGKILL. GuardREDoldexit2→GREEN5diagnostictests;
livepositiveprereq theninvalidcombinedmode refused1/noPID/noautomaticfixtures.
Read-onlyreview noCritical/Important; fixtureumaskminorfixedexplicitchmod.
Finalfullcheck96unit/37matchingChromium passed, no app/nativebuildchange.

ActualordinaryUbuntu run now active: /tmp/pn-uppercase-auto-native.log,
exec85221. Uses exactinstalledELFff7d4bab…, observerc4895d47…, umask0077,
NATIVE_CRASH_RESTART=1 --extension-case. Do not claim successful GUI recovery
beforeexit0/allgates. Evidence2026-11-19-uppercase-auto-recovery retainsnegative
and fullcheck receipts. First recordPID/start/hash is continuity fromtrusted
wrapper, not independent hostile-process ownership proof. Previous two native
primed failures remainfailures; no JIT/resource/security settingchanged.

Next: finishactualrun, independentlycheckoriginal/copy/hash/modes +Rootabsence/
recoverycleanup; retainrawoutcomes. Formatupdateddocs/checkdiff; commit/push/update
PR/checkexactCI. Thenverify fresh local clone/npmci/fullcheck with no generated
runtime/node_modules present initially, without creating a worktree or modifying
unrelatedrepos. Keep nativeJSC/crash/resource/billing blockers explicit.

## 2026-11-19 — mixed-case automatic recovery verified

Source base: `3a8a036b8e01769e8daa5c6c1fedc60ed3edc48d`. Only the external
acceptance observer/tests/docs changed. Final full check passed96 unit and37
matching Chromium tests, formatting, lint, strict types and a fresh production
build. The ordinary installed ELF remains ff7d4bab…; observer c4895d47… matched
host, guest and both real Root launch records.

The ordinary Ubuntu/WebKitGTK run exited0 with umask0077 and --extension-case.
Two picker-authorized mixed-case file buffers retained independent bounded
snapshot histories and exact baselines/content. Root43681 was identity-checked
before actual SIGKILL; Root43817 discovered recovery after restart. Explicit
restoration remained unsaved/unbound, Save As cancellation retained the original,
and acknowledged Save As created exact automatic-restored.MdX with mode0600.
The original stayed exact with mode0640. All owned versions were deleted and the
second Root exited. Independent post-run checks compare literal expected bytes,
permissions, both Root absences and the recovery collection. Evidence:
2026-11-19-uppercase-auto-recovery. Review reported no Critical/Important issue;
its umask fixture concern was corrected before the successful run.

Next executable action: finish docs formatting, commit/push this verified observer
milestone and update draftPR/CI status. Then use a new local clone (not a worktree)
to verify npm ci and the full check without existing node_modules, dist or runtime.
Retain exact commit/tool versions and generation/clean-status receipts. No new
application package is needed for this observer-only milestone. Earlier primed
renderer failures and resource5/1 remain unresolved, as does hosted billing.

## 2026-11-19 — clean committed checkout verified

Verified exact pushed source `a40ea74cdaa2fe97c889b552e188062402b8b75c` in
`/tmp/pn-clean-a40ea74`, a separate local clone with no initial dependencies,
build output or generated runtime. Offline npm ci installed372 locked packages;
runtime remained absent until the ordinary full check's pretest hook. Full check
passed96 unit/37 matching Chromium tests, formatting/lint/types and fresh build.
Clean Rust targets passed39 ordinary document tests (four excluded infrastructure
cases) and7 policy tests. Runtime and full frontend bundle hashes are recorded;
the latter matches production builder c41526e5… exactly. Tracked state stayed clean.
Evidence: 2026-11-19-clean-recovery-checkout.

Default Wry upstream fetch failed DNS. An elevated retry had no execution receipt
after a tool runtime reset, so it is not counted. The existing offline archive
input passed against the cached crate with mandatory a4901191… hash and all file
comparisons: only the two declared sandbox patches differ. No network access
restriction or checksum was bypassed. The reset affected tool orchestration;
source/workspace and the completed test evidence remained present.

Exact hosted run44568476206 on a40ea74 refused both jobs with zero steps for
account billing. No claim of hosted CI green or fresh native GUI/package rerun.
The installed production ELF remains ff7d4bab… with prior successful ordinary
uppercase/full lowercase/IPC/actual automatic recovery and two primed failures.

Next: commit/push the verification documentation and update draftPR/current CI.
Then investigate the reproducible native JSC gutter-loop failure with a bounded
external debugger on the unchanged production binary; retain diagnostic scope,
owned PID/start/executable checks and every failure. Do not ship speculative JIT
or policy changes. Keep ordinary source/persistence functionality progressing
independently when native engine/hardware infrastructure blocks an investigation.

## 2026-11-19 — bounded namespace-correct debugger diagnostic

Base510e37f, unchanged ELFff7d4bab…. Temporary full-fidelity variant25d6cab4…
adds only a readiness barrier after the actual counter/Stop and before mainVisual.
The administrator verified Root44116 start/hash/UID and exactly one descendant
renderer44147. GDB44463 entered the renderer's PID namespace with its own private
mount/proc view; assertions checked identical PID namespace, different debugger
mount and unchanged application mount. No app/JIT/policy/deadline changes.

The instrumented observer exited0 through every requested gate and real restart.
The previous heading-Undo failure did not reproduce. GDB recorded normal-shutdown
SIGTERM then exited-9, with no fatal backtrace. Namespace teardown is a plausible
cause of its kill, not independently established. Controller exit0 is orchestration
completion, not a fatal-capture pass or ordinary acceptance. Raw sources/logs and
independent final fixture/hash/mode/identity/recovery cleanup checks are preserved
under2026-11-19-gutter-debugger. Original two full primed failures remain failures.

Next: commit/push these diagnostic docs and update draftPR/CI. Then address a
concrete consequence of actual native renderer death: the Root survives with a
blank editing window, and stale client_busy can prevent normal close. Add a native
trusted-editor termination notification with an explicit warned Quit action,
without automatic reload/restoration or document writes. First reproduce missing
feedback against old ELF with a real owned-renderer kill. Keep preview failures
separate; no new child capability or document-controlled authorization. Validate
new package, recovery and IPC before pushing implementation.

## 2026-11-19 — native editor failure handling, verification pending

Pushed baseline:0fedae6. Uncommitted native feature now connects GTK termination
only for !child, with warned native Quit/Keep guidance and no new IPC/capability.
The old installed ELFff7d4bab… probe positively exercised native dialogs, killed
owned renderer45071, then failed at missing Editor stopped notice; Root45039
survived and stale client_busy prevented normal close. Owned cleanup is logged.

Root-private renderer_stopped invalidates frontend busy hints, while actual Rust
operations and dirty confirmation remain. Already-pinned GTK2.0.2 dependency moved
from dev to ordinary Linux target dependency; lock graph/caps/Wry remain intact.
Rust App tests2 passed, including real Operation guard lifecycle with healthy
busy, native operation surviving renderer loss, late busy hint and dirty retention.

Review's Important modal gap was reproduced on intermediate ELF6e26da64…:
actual crash while picker open showed both picker and failure notice. Initial
BadWindow/undefined-helper attempts were diagnostic errors, not semantic proof;
corrected/linted permanent native-renderer-failure.mjs reproduced the actual
concurrent-modal assertion. Final renderer_failure now waits for the existing
Documents::Dialog guard in one background task, checks window existence, displays
on main thread and retains the guard through dismissal. New production package
built in /accept-build; not installed/accepted yet. Underlying JSC bug is not fixed.

NativeAuto --renderer-restart extends mixed-case committed-snapshot/restart gates:
external verified renderer kill, native Keep, ordinary dirty Close Cancel/OK,
recovery discovery, explicit unsaved restore and exact Save As. Strict arg and
mechanism conflict tests RED→GREEN; receipt checks Root hash and renderer metadata.
External administrator kill helper: /tmp/pn-editor-renderer-kill.py. Permanent
Root probe has default/--picker modes and GTK screenshot (Pillow absent). Latest
helper copied to guest scripts, but perform checks before GUI execution.

Environment/tool service resumed at18:45UTC. Files/Docker VM survived; old exec
session IDs were lost. /tmp/pn-editor-failure-fullcheck.log eventually reports
98unit/37browser passes, but the old exit receipt is unavailable and screenshot
helper changed afterward: rerun final fullcheck. Cargo package log:
/tmp/pn-editor-failure-final-native-build.log. Current installed package remains
intermediate6e26da64 until final artifact install; do not conflate its results.

Next exact action: run final npmcheck, inspect/install final .deb, obtain exactELF
hash. Execute default+picker native probes with fresh fixtures and paired owned-
renderer kill actor; then --renderer-restart automatic recovery and independent
IPC on that exactELF. Keep live GUI tests serial/no host test load. Capture actual
PNG and independent original/copy/modes/Root/recovery checks. Finish read-only
re-review, ADR/status/evidence/format, commit/push/update draftPR. All old primed
JSC/SIGSEGV/startup/resource/billing limits remain. Never publish/merge/mark ready.

## 2026-11-19 — native notice package acceptance checkpoint

Base0fedae6; implementation not committed yet. Final Node check exited0 with98
unit/37 matching Chromium, format/lint/types/fresh build. Current Rust App tests2
passed. Final optimized Debian7ad9debe… (6,835,996 bytes), installedELF837d2ab9…;
152 shipping inputs match builder. No security-test API/JIT/cap/limit changes.

Actual default probe Root46249 and picker probe Root46459 exited0. Owned renderer
kills produced the native notice; healthy busy-close positives passed. Picker
remained alone after the trusted native crash signal; only after explicit Cancel
did the queued notice appear, then Quit exited. Actual GTK screenshot retained.
Renderer-restart recovery Root46705→46863 passed independent snapshot retention,
Keep, native dirty Close Cancel/OK, actual restart/discovery/unsaved restore,
cancelled/exact Save As and original0640/new0600. Independent literal bytes/hash/
mode/Root-absence/recovery-empty verification passed. New exact-binary IPC suite
exited0 including real Counter2 and all native/CSP/policy denials.

Current final full fidelity process is still running: /tmp/pn-editor-final-fidelity.log,
exec12354, Root47277, fixture/tmp/pn-native-Fnt70E. All seven flags requested.
It has passed real counter, previous heading-Undo point, modes, quotes, repeated
files and dense fallback. Do not claim whole-command pass until completed.
Underlying JSC/SIGSEGV/startup/OOM and hosted billing limits remain unchanged.

Next: finish that command and independent final file/identity checks; retain raw
results, finalize ADR011/status/evidence/format. Re-review reported no Important/
Critical after serialized-dialog fix; final minor receipt validation applied.
Commit/push verified feature, update draftPR/current exactCI. Keep no merge/release/
readiness change. Then choose a bounded preview-renderer-health or core document
reliability task; do not add speculative architecture or engine workarounds.

## 2026-11-19 — native editor failure feature verified

Source base0fedae6; feature ready to commit. Production Debian7ad9debe… /
ELF837d2ab9… passed inspection/install and152-input source parity. Full check98
unit/37 matching Chromium and application Rust2 passed. Root-only native GTK
termination handling now gives warned Quit/Keep guidance, invalidates stale
frontend hints while retaining actual operations/dirty protection, and serializes
the notice through the existing dialog guard. No child capability/JIT/limit change.

Actual default and picker probes passed on this ELF, with native positive controls
and verified owned-renderer kills. Automatic recovery --renderer-restart passed
committed independent histories, native Keep/Close Cancel+OK, actual restart,
explicit unsaved restoration, cancelled/exact Save As, original640/copy600 and
cleanup. Independent IPC passed. Final ordinary full fidelity also exited0 with
all seven flags, all source/disk/history/modes/React/restart/legacy-invalid gates.
Independent post-check verifies four fixture hashes/modes and Roots47277/47882
gone. The two old ff7 primed failures remain failures and no JSC fix is claimed.

Evidence2026-11-19-native-editor-failure includes actual GTK PNG, original missing-
notice RED, intermediate concurrent-modal RED, observation/compile errors, final
logs and exact identities. Review: no Critical/Important after fix; receipt minor
was strengthened. Latest known hosted0fedae run44584710973 bothjobs0steps billing.

Next exact action: finish docs formatting/diff review, commit/push this verified
feature and update draftPR/exactCI. Then independently test unprivileged preview
WebProcess death: a live native connection is not renderer health. Use owned
identities and preserve Root responsiveness, Stop/cgroup/rebuild and no-editor-
notice guarantees. Only implement a lifecycle correction after a real failing
baseline; never add author privileges or relax resource/expiry checks. Keep
JSC/startup/blank/OOM/distribution and physical hardware scopes explicit.

## 2026-11-19 — preview-only renderer loss baseline

HEADc798791 pushed and draftPRhead verified. Hosted run44595997317 again failed
bothjobs before any steps: account payment/spending-limit annotation, not an
executed test failure. No billing change or CI bypass is authorized.

On current production ELF837d2ab9…/Debian7ad9debe…, actual external identity-bound
SIGKILL of unprivileged WebKit48324 left editorRoot48205 responsive and without
Editor stopped. The owned connection became false at18.939s from explicit start,
well before60s expiry, after four live observations. Explicit Stop acknowledged,
owned cgroup empty, both probe/helper exited0. No native lifecycle correction is
justified by this baseline. Preserve connection-vs-renderer semantics.

Next concrete test is running now: freshfixture/tmp/pn-native-N21dV9,
/tmp/pn-preview-health-final.log (exec1395), paired identity helper
/tmp/pn-preview-health-final-kill.log (exec61986). Permanent probe additionally
requires actual counter before kill, explicit fresh preview/counter after it,
Stop/group cleanup before expiry and original Root identity. No production code
changes; first new unit guard RED missing script, thenGREEN8 diagnostic tests.
Do not claim final native command pass until it completes. Retain initial raw
baseline separately; finish read-only review, evidence, fullcheck, commit/push and
PR update. All prior JSC/startup/resource/matrix and hardware limits remain.

## 2026-11-19 — interactive preview renderer loss exposes lifecycle gap

The stronger counter probe completed with a real failure on ELF837d2ab9…:
Root48436, previewMain48514, WebKit48572. Count0→1 passed, then external verified
SIGKILL killed only that WebKit process. Ten connection samples remained true
from51.1–56.1s after explicit start; strict pre-expiry assertion failed. Stop
emptied the group and Root subsequently disappeared. Earlier startup-only pass
is retained but cannot justify the loaded/interactive case.

Added minimal Linux child-only native termination callback: unexpected WebKit
loss exits its own unprivileged Rust app, allowing existing systemd cleanup and
connection status to work. Ignore TerminatedByApi, no dialog/plugin/IPC/capability,
JIT or resource change. New production build inspected/installed: Debian9796ff84…
(6,837,126bytes), ELFa6d00cbb…. Stronger final test now exec71832/helper72080,
fixture/tmp/pn-native-Zij7Hr, /tmp/pn-preview-loss-green.log; do not claim success
until receipt. New helper measures actual kernel-kill CLOCK_MONOTONIC, requires
connection false<5s since kill AND<55s since start. Read-only review no remaining
Critical/Important; identity-bound Root/group cleanup strengthened. OOM must still
meet original trusted oom-kill oracle; callback exit1 is never OOM evidence.
Next: finish installed counter/kill/restart/Stop, exact-binary IPC and unchanged
resource matrix, retain every failure, fullcheck/currentRust, docs/parity/commit/
push/draftPR. No merge/release/readiness change.

## 2026-11-19 — preview failure correction acceptance checkpoint

Basec798791, not yet committed. Corrected production ELFa6d00cbb… actual
interactive kill/restart probe: first attempt failed conservative Stop-reservation
at53.400s after fresh counter; retain as failure. Bounded repeat with identical
helper/deadlines passed: Root49129, preview49205/WebKit49246, false connection
1.025s after verified kill and49.017s after start, Root responsive/no Editor
stopped, old group empty, new preview49302 Count0→1, Stop requested47.181s and
completed before55s, bothgroups empty/Rootgone. No test threshold relaxation.

Rust formatting finalized before final package. Formatted rebuild Debian2a6aa569…
(6,837,126bytes) retains exact same tested ELFa6d00cbb… as prior Debian9796ff84…;
finalarchive reinstalled and inspected. All153shippinginputs match builder.
Full Node check exited0:99unit/37matchingChromium, types/lint/format/fresh build.
HostofflineRust couldnotstart (missing cached bytes1.12.2), retained. CachedUbuntu
builder Rust exited0:2app/39ordinarydocuments/7policy;4infraonlyignorednotpasses.
NativeIPC on finalinstalledELF exited0 with Rootpositive, denied child commands/
recovery/privilegedplugins, realCounter2, CSP/DOM/storage isolation, normal
privnet/automationoff/NoNewPrivs/effectivefixedlimits/fullgroupStop.

Current exact next action: finish fullsixcase unchanged native-stress on this
ELF, exec25305, /tmp/pn-preview-failure-stress.log,
fixture/tmp/pn-native-bRcw6e, Root49808. CPUlooprealquota/throttle/Root115ms and
Stopbeforeexpiry observed; recoverycounter still running, so not wholecase pass
yet. NativeGUItasksserial/nohostheavychecks. Preserve stricttrustedOOMoracle;
exit1 is notoom. Evidence2026-11-19-preview-renderer-loss has baseline/interactive
RED/firstcorrectedlateStop/finalrepeat+sourceparity/build/check/Rust. Need retain
final resource JSON/journals/independent cleanup; updateADR012/status/README;
format/diff/review/commit/push/update draftPR/exactCI. Latesthostedrun44595997317
bothjobs0stepsbilling. No merge/release/readiness claim. Prior engine/startup/
blank/resource/distribution/hardware risks remain even after this lifecycle fix.

## 2026-11-19 — current resource matrix failures retained

Fullsixcaseexec25305 still running, Root49808, fixture/tmp/pn-native-bRcw6e.
CPU-stop, memory(stricttrustedOOM+512MiB+freshCounter2) and expiry passed.
Resident-pages failed original stopped() historicalPIDnonZombie assertion for
50295(bwrap) afteremptycgroup; trustedjournal independentlypasses unchangedOOM
oracle, includesSIGKILL/Invalidargumentkillgroupwarning. LaterPIDabsent doesnot
establishwithindeadlinecleanup. Keep failure, not yetescapeprooforharmlessrace.
Editor-crash casefailedbeforeRootkill: ArmCPUloop inaccessible55s; unit then
fixed60sexpiry. No currenteditorSIGKILLrecoverypass inferred. Lastwindowclose
casecurrentlyrunning. Currentrawstdout /tmp/pn-preview-failure-stress.log.

Next: finishfullcommand/JSON/independentcleanup. Then copied diagnostic
.cache/native-stress-diagnostic.mjs (syntax+ESlintchecked) retains exactoffending
stat/start/state/flags/PF_EXITING/cgroup/status/wchan/cmdline, monotonic time and
1sfolllowups BEFORE original frozen-stat assertion (failurestillfails; noTestStop
runsduringcapture). Runonlymemory-pages freshfixture/sameELF afterfullmatrix;
retaincopyhash, completejournal, allresults. Atmostboundedrepeat forstartup-
blockededitor-crash. Do notweakenchecksorclaimmatrixgreen. Finalfeaturecommit/
push/draftPR/statusstillpendingthisvalidation. No furtherdevelopmentdelegation.

## 2026-11-19 — preview lifecycle correction ready for commit

Basec798791. FinalproductionDebian2a6aa569…/ELFa6d00cbb…,153-inputparity,
99unit/37Chromium/fullNodecheck, Rust2app/39doc/7policy andnativeIPC passed.
Nativecounter→ownedWebKitkill→connectionfalse1.025s→Rootresponsive→freshcounter→
Stop47.181s beforedeadline/groupempty/Rootgone passed; firstlateStopfailurekept.

Fullunchangedresourceexec25305exited1:4passed(cpuStop,memoryfillstrictOOM,
expiry,windowclose),2failed(memorypagesinstantPIDobservation,editorcrashstartup).
IndependentcleanupRoot49808/allunits/PID50295gone/recovery.lockonly passed;
firstfindreadcwdobservationerrorcorrectedwithcd/tmp. FullJSON/stdout/strictOOM
journals andkillgroupEINVALwarningretained. No6/6claim.

Afterenvironmenttoolreconnection, targeteddiagnosticmemorypages completed
CASE_PASS/WEBKIT_STRESS_PASS andstrictOOM+freshCounter2 inreport; exactsource74ea…,
originalassert/deadlinesunchanged. NoPIDfailure reproduced. Root50983/observer50961
absent. Wrapperexecid65912lostonreconnect; noexitreceiptinvented. Separatetargeted
ordinaryeditorcrashrepeat actualexec21268/exitfile0 passed:Root51356SIGKILL,
independentpreviewexpiry,newRoot51517/Counter2,bothRootsabsent. Originalfullmatrix
failuresstillfailures. Source/runtimecallbackreviewnoCritical/Important.

Nextimmediate:finaldocsformat/diff,commit/pushcurrentcorrection/update draftPR/
exacthostedCI. Then execute2026-11-19-bounded-cleanup-observation plan:both empty
cgroup AND historicalidentitiesdead within one original5s/75smonotonicdeadline,
noPF_EXITINGshortcut/unexpected-errorignore/timeoutgrowth. Explicitlydocument
changedinstantaneoussemantics; retainliveidentity/cgroup/timingobservations and
anypossiblemigrationfinding. Deterministicnegativecontrolsfirst, thenactualnative
matrix. Afterwardindependentoriginal-SaveprocesscrashP0plan isprepared. Keepall
JSC/startup/distribution/physicalhardware/billinglimitations. No merge/release/
readyforrevieworproductionsecurityclaim.

## 2026-11-19 — bounded cleanup observer implementation checkpoint

Committed/pushed9dffcd08a9555906b216f53fff88e30c5d67abf8, PRheadverified/drafttrue,
bodyRESTupdated. Exacthostedrun44603154321 bothjobs0steps:billing/spending-limit
annotation confirmed, notexecutedCI. ProductnativeELFa6d00cbb unchanged.

Newuncommittedscripts/native-cleanup.ts andnative-stressstoppedadapter require
BOTH empty/removedgroup andseeded+subsequentPID/startidentitiesgone/reused/Z
within one original5s/75sabsoluteMONOTONICdeadline. Finiteboundedoptions, lateIO
checks; noPF_EXITINGshortcut/ignoredunexpectederrors/timeoutgrowth. Rawprocparser
failsclosedonmalformedidentity. Nativepolicies/strictOOMoracle unchanged.

InitialhelperimportRED; basiccontrolsGREEN. Reviewfoundstaleemptyconfirmation
hole; actualempty→repopulatecontrolREDthenfixedwithconfirmation/newIDmerge/
deadlinecheck.15newunitcontrols/typecheck/lintpassed. Liveadapterretainsfirst+
latestperidentity andlogs state/cgroup/errorlocationchanges on everymatchinglive
observation. Read-onlyre-review noCritical/Important. Original4/2matrix+warning
remain; eventualcleanupdoesnotproveabsenceoftemporaryescape.

Currentexec91711 /tmp/pn-cleanup-frozen-check.log is the finalfullNodecheck after
sourcefreeze; don'tclaimpassuntilreceipt. Earlierexec40056/fullcheck passedon
intermediatehelper, notfinalsource. Next: copyfinal scripts/native-cleanup.ts +
native-stress.mjs toUbuntuacceptance, freshfixture, serialactualsixcasematrix
onunchangedinstalledELFa6d00cbb. NoheavyhostcheckswhileGUItest. Retain sourcehashes,
rawJSON/stdout andalllive/migrationobservations, actualOOM/CPU/expiry/Stop/recovery.
Do notinferoriginalfailurefixed/allgreen. Evidence2026-11-19-bounded-cleanup isnew
andhasRED/hostedbaseannotations. Then docs/securitycontractprocedure/read-only
review/format/commit/push/update draftPR. Original-SaveSIGKILLP0plan follows.

## 2026-11-19 — revised observer native matrix running

Base9dffcd0 pushed/draftPRverified; latestCI44603154321 jobs0stepsbillingconfirmed.
Finalhelper+adapter15controls pass; fullfrozenNodecheckexec91711 exited0:
114unit/37Chromium, format/lint/types/freshbuild. Sourcefreezehash helper47b2f0a6…,
stressbc735431…, strictOOMoracleunchanged637db391…. Host+guestverifiedsame;
installednativeELFunchangeda6d00cbb…. No application/Rust/policychanges.

Now actualfullsixcasematrixexec32953 running serial inVM:
/tmp/pn-cleanup-native-matrix.log, exitreceiptoncompletion
/tmp/pn-cleanup-native-matrix.exit, freshfixture/tmp/pn-native-DKukPE.
NodecommandordinaryUID1000, samefixedlimits/JIT/defaultproductionautomationoff.
Do notclaimresultuntilfinished. NoheavyhostcheckswhileliveGUI. Retainliveidentity
first/latest/changedlocation evidence, structuredJSON/fullstdout/actualOOMjournal
andfinalindependentRoot/unit/processcleanup. Alloriginal4/2failuresstillretained.

Docssecuritycontractexplainschangedinstantaneous→boundedsemantics, confirmation,
original5s/75sdeadlines andnoPFshortcut/ignorederrors. Evidencefolder
2026-11-19-bounded-cleanup READMEpendingactualrun. CurrentdocsneedfinalPrettier
beforecommit (post-testonlydocsupdated). Nextfinishactualmatrix/investigateany
live/outsidegroupobservations; reviewresults/format/diff/commit/push/update draftPR.
Then original-Saveprocess-crashP0plan2026-11-19-original-save-crash-validation.md.
No merge/publicrelease/readiness/securitycertification. Neverrelabeloldfailures.

## 2026-11-19 — independent next P0 test drafted while GUI remains serial

Currentobservermatrixexec32953 /tmp/pn-cleanup-native-matrix.log ongoing:
CPU-stop+freshCounter2 passed. Do notrunheavyhost/buildcheckswhileGUIlive.
Independenttest-onlysource native-documents/tests/save_crash.rs drafted from
publicStore/realown-childptracepattern:SIGKILLafterwrite/fsync/rename/dirsync,
exactBOM+Unicode+mixedendingold/newbytes, mode640, untouchedsibling, freshStore
openandsubsequentSave, orphan-temporarylimitationexplicit. Noexamplewriter yet:
TDDnextstepistheactualignoredREDwithmissingwriter in cachedbuilder AFTERcurrent
nativeGUImatrixfinishes, beforeimplementingwriter. No passing/crashclaimyet.
KeepP0testseparatefromobservercommit; no productioncode/permissionchange.

## 2026-11-19 — observer matrix five cases passed, final case running

Exec32953 /tmp/pn-cleanup-native-matrix.log onunchangedELFa6d00cbb:
CPU-stop, memoryfill(strictOOM), resident-pages(strictOOM), expiry andactual
editorSIGKILL/independentexpiry/newRootCounter2 allpassed. Root51824 deliberately
killed; newRoot52713 currentlyowns finalwindowclosecase. NoCLEANUP_MATCHING_LIVE
observationseen sofar; donotclaimoriginalinstantassertcauseexplained. Lastcase
stillrunning; requireexitreceipt/fullJSON/independentcleanupbeforereportingwhole
matrix. Preservefirst4/2matrixandallwarningsunchanged. Sourcehelper47b2…/driverbc735…
remainfrozen. CurrentfullNode114/37previouslypassed. NoheavyhostcheckswhileGUI.

NextP0draftsave_crash.rs nowincludesactualPID/startTick/exepath+SHA256, syscall
return+matchedFD, explicitx86entryconvention, ptraceprereqNOTRUNhandling andstrong
exactbyte/mode/sibling/freshStoreassertions. Read-onlyreviewnoCritical/Important;
stillNOTcompiledorrun; noexamplewriterexistsyet. Mandatoryoutertimeoutbecause
OwnedChild.waitcleanupcanblock. NextTDDREDmissingwriter onlyAFTERGUIends, then
writehelper. KeepdraftP0fileOUT ofobservercommit. Noappcode/permissionchange.

## 2026-11-19 — observer matrix verified, ready to commit separately

Actualserialfullmatrixexec32953 completedexit0 (receiptretained):6casespassed,
12targets, stricttrustedOOMforbothmemoryfill/pages,536870912peak0swap, CPU774393us/
3046ms/31throttled/Root529ms, Stop/expiry/editorSIGKILL/windowclose+Counter2recovery.
NoMatchingLiveobservationemitted: donotclaimoriginalPID50295causeexplained.
Independent96historicalidentitiesalloriginalsgone/reused/Z, Roots51824/52713gone,
noownedunits/recovery.lockonly/installedELFa6d00cbbunchanged. RawJSON/stdout/exit/
independentreceiptsin2026-11-19-bounded-cleanup. Alloriginal4/2failuresretained.

Nextimmediate: docsfinalformat/diff/read-onlyevidencereview,stageONLYobserver
files/docs/evidence (exclude untrackednative-documents/tests/save_crash.rs),
commit/push/draftPRupdate/exactCI. Node114/37frozenpass source47b2…/bc735…already
verified; noproductRustchange. Neverclaimhostedgreenwhilebilling0steps.

IndependentP0save_crash.rs compiledsuccessfullyin cachedUbuntu. Initialartifact
lookupassumedoldCargo/depslayout andfailed; subsequentattemptcouldnotfindtest
binary(exit127), NOTatestreproduction. CorrectstructuredCargoartifactpathunder
build/.../outthenused. Actualordinaryguestmissing-writerREDexecutedexit101,
/tmp/pn-document-save-crash-missing-writer-red.log/.exit. Testfixturecleaned.
Noexamplewriterimplementedyet; nextP0stepwriteexternalrestrictedmain-thread
writerfromplan, compile/runrealSIGKILL4stageswithmandatoryoutertimeout, preserve
allreceipts/compile+artifactsetupfailures, runremainingtestsandCIprocedure. Keep
P0sourceOUT ofobservercommit. No merge/release/readiness/securitycertification.

## 2026-11-19 — original Save crash gate verified; final checks pending

Observercommit2e0a9b5625b0ec64f45b078a51ecebffe3c3a7d3 pushed, PRheadverified/drafttrue,
bodyupdated6/6scopeandretained4/2failures. ExactCI44607665007 bothjobs0steps with
billing/spending-limitannotation; noexecutedCIorownerbillingchange.

P0originalSaveexternalwriter+ignoredtestimplemented (noStore/productchange).
ActualmissingwriterRED101first. EarlybinarycopyassumedCargo/depslayout, failed
setupandexit127NOTRUN; correctedstructuredartifactmetadata. Firstrunpassedwrite/
fsyncthenmissedpubsyscall. Actualunchangedpredicate diagnosticprovedrenameat264,
notrenameat2. Observernowvalidatesbothatomicforms,bothFDs,exacttemp32hex/newname,
flags, priorpublicationfordirsync. Ownchildmemoryreadsbounded. Noassertion skip.

Finalsourceafterreviewtimingcorrection passedactualordinaryUbuntuUID1000 test:
/tmp/pn-document-save-frozen-native.log/.exit0,1integrationtest4SIGKILLstages17.01s,
writers53401–53404. Exactold/newBOM/UnicodeMixedEOL224067B,mode640,siblingbytes,
freshStoreopenandsubsequentexplicitSavepassed. Prepuborphans1/published0recorded,
neverautopromoted/removedbyapp. Source/binaryhashesinnew evidencefolder
2026-11-19-document-save-crashes. Testbinary35a5a527…,writer45a07e98….
Invalidrootactualwriterrefusal101expected; independentallwriterPIDs/ownedfixture
folders/invalidrootpathabsent. NopowerlossornewpackagedGUIrestartclaim.

CIstepaddedexplicitBash/mandatorytimeout90s/pipelinefailure+all4stagegrepchecks.
Linuxprocedure/documentedABI/prerequisitesandorphanlimits. Read-onlyreviewno
Critical/Important;lateStopminorresolvedandfrozenrealtestrerunpassed. Next:
finaldocsformat+frozenfullNodecheck,ordinarycachedRust39doc/7policy(format+compile
newignoredtest), retainlogs, README/statusfinalupdate/review/commit/push/draftPR/
exactCI. P0filesuntrackeduntilcoherentverifiedcommit. Currentallothersecurity/
JSC/startup/distribution/hardware/billinglimitationsremain. Thenhighestvalue
nextdata-integritygate:originalSavefsync-errororrealENOSPC handling; inspecttests
beforechoosing. No merge/release/readiness/securitycertification.

## 2026-11-19 — original Save interruption ready to commit

Base2e0a9b5, finalfrozenP0source/bin hashesretained. RealordinaryUID1000 guest
integration1test4SIGKILLstages passed17.01s/exit0 afterminorlate-waitcorrection.
BothFDs+source/destnames identifyactualglibcrenameat264atomicpublication. Every
stage exactold/new224067Bsource/640/sibling/freshStore+subsequentSavepassed.
Prepuborphans1/postpub0explicitlimit; noappscavenging/promoting, no powerlossclaim.
Ownwriters53401–53404/fixturesallgone. InvalidRootrefusal101expected.

FinalNodeexec88869 exited0:114unit/37Chromium+format/lint/types/freshbuild.
FinalcachedordinaryRustexec18273 exited0:39doc/7policy,5infraonlyignored;
newSaveCrashintegrationexecutedseparately; other4notrerunorclaimed. Finalreview
noCritical/Important; Timingminorcorrectedthenrealtestrerun. Evidencefolder
2026-11-19-document-save-crashes retainsrealRED/failingrenameassumption/diagnostic/
frozenpass/checks/hashes/cleanup. Finaldocsnowupdatedandneedformatcheckbefore
commit. CIstepBash90stimeout+fourpasslinechecks, nohostedexecutionclaim.

Nextimmediate:format/diff/finalevidencereview,commit/pushP0files+CI/docs/evidence,
update draftPRhead/exactCI. Latestbase2eCI44607665007 jobs0stepsbillingconfirmed.
Thenexecute2026-11-19-original-save-sync-errors.md: publicSavefile-fsyncErrvs
postpubdirsyncdurable=false underexternalEIOinjection, NOTrealstoragefailure.
Firstfailingtest thenminimalwriterreportmode, no productchangeunlessprovenbug.
AfterwardinspectrealENOSPCcoverage. KeepallnativeJSC/startup/instantPIDoldfailure/
distribution/hardware/billinglimits. No merge/release/readiness/securityclaim.

## 2026-11-19 — user priority: public-visibility preparation audit

Usernowauthorizesrepositorypublic-readinessaudit/preparation ONLY, NOTvisibility
change/historyrewrite/evidence deletion/merge/release. Preserveallpriorwork.
HEADb8402d18b9a09bf4b2173e42da82133e327acc27 pushed/draftPRverified. Newpublictask
supersedesimmediateP0continuationbutallowsindependenttechnicalworkafteraudit.

Currentuncommittednative-documents/tests/save_crash.rs addsignoredsyncEIOtest.
ActualREDexecuted /tmp/pn-save-sync-missing-report-red.log/.exit101: filefsync
EIOinjectedbutoldwriterdoesnotreportJSON; helperreportmodeNOTimplementedyet.
NoactiveGUI/tracerworkleft; onlyordinarycachedbinaries/VMremain. KeepthisWIP
separatefrompublicauditcommit anddon'tclaimsyncerrorgatepassed.

Publicauditstarting: local87reachablecommits, branchesmain+feat/mdx-react-engine,
GitHubprivateconfirmed, rootlicenseabsent(APIlicense null). Needfetchauditrefs,
allreachablehistory/objectinventory, redactedsecretscanner, archives+mediaOCR/
manualreview, commitmetadata privacy, workflowpermissions/freepublicLinuxrunner
authoritativesources/billingrestriction assessment. Donotprintsecretvalues.
Auditoutputstoolcachesinignored.cache/public-audit; no personalcredentialstore
reading. PreparePUBLIC_READINESS.md withGO/NO-GO/limits, preservehistory andevidence.
Workflowhardening+ignore/prevention+cleancloneverification thenreviewablecommit/
push/draftPRupdate. License/IP/historyissuesrequiringapprovalreportwithout
choosinglicenseorrewritingautomatically. No paidinfrastructureorvisibilitychange.

## 2026-11-20 — public baseline resumed, immediate privacy remediation

OwnerintentionallymadeRepoPUBLIC;confirmedAPIvisibilitypublic. DoNOTreverseor
requestpublicationpermission. HEADb8402d1/draftPR1verified;workspacepreserved
AGENTlog+syncEIOtestWIP. FreshCIrerun44610581513 nowexecutesactualstepsinboth
standardUbuntu jobs; oldbillingpre-runblockNOTblockingthisattempt. Awaitresults.

Recoveredcacheaudit:88reachablecommits/bothremoteheads/PRrefs,1812blobs92MB,
10ZIPs/288logical115uniquemembers/noarchivefailures. Gitleaks8.30.1 officialSHA
verified:history+allblobscans4matches each, allpublicX509kernelcertfingerprints.
Personalprovideremail86commitswithheld, currentlocalGitidentitywaspersonal:
setONLYfuturelocalemailtoownerverifiedGitHubnoreply(nohistoryrewrite). Current
privateDrivepointerwithheldinRESEARCH_PROVENANCE; bodies/publiccitationspreserved.
Oldhistorystillpublic. NoLiveCredentialconfirmed; dontclaimallmediaclear.

PUBLIC_READINESS interimcreated;ignoreguardsadded. Needquickverifiedprivacy
commit/pushthencontinuemediaOCR/manualreview, fullthirdpartynotices/license/IP
ownerdecisions, futureartifactpackager/CIhardening+freepolicy docs, cleanclone
checks, finalreport/draftPR. KeepfailingignoredsyncEIOtestuncommitted/separate;
oldwriterreportmodeNOTyetimplemented (actualRED101). NativeDockerpscurrentlyempty
followingrecovery; don'tclaimnewnativeexecutionwithoutrebuildinginfra.
No visibility/historyrewrite/evidencedeletion/merge/release/paidservices.

## 2026-11-20 — immediate privacy patch verified

Current-pointerredaction+futureGitnoreply+ignoreguards+interimPUBLIC_READINESS
verifiedbyfullNodecheck114unit/37Chromium/format/lint/types/freshbuild(exit0).
Historicalpersonaladdress86/88commitsremains; nopublicvalueorfingerprintprinted
orcommitted. No historyrewrite. Freshpublichostedrerunb840 checkjobSUCCESS13steps;
nativejobstillrunning18completedsteps, notyetclaimwholeCIgreen.

Next:pushsmallprivacycommitexcludingnative-documents/tests/save_crash.rs WIP,
thenfinishallmediaOCR/manualreview,addfullredistributionnoticesandfuturepackaging
checks,CIcredentialpersistence/actionpin/optional-democostoptimization,official
publicrunnerpolicyreference,cleancloneverification, finalPUBLIC_READINESSreport.
Originalresearchbodies/evidencearchivespreserved; ownerlicense/IP/historychoices
remainexplicit. Continuetechnicalroadmapafterpublicremediation. No visibility/
merge/release/historyrewrite/promotion/costchanges.

## 2026-11-20 — public safeguards and notices, hosted execution restored

Actual public CI run44694104501/head8a8e44c executed BOTH jobs SUCCESS. The former
private pre-start billing restriction did not block that run. No paid settings
changed. New workflow pins actions/disables persisted credentials/full-history
checkout, adds mandatory redacted history+ZIP scan and unused-key canaries,
makes recording opt-in7days and builds production package before release-profile
security tests. Native installer upload paused pending full native notices;
mandatory build/inspection/security gates retained. Must verify new hosted head.

Gitleaks8.30.1 verifiedSHA: original4findings all independently publicX509certs;
exacthistoricalfingerprints only ignored. Content-based archive discovery fixed
reviewed path-alias false negative: sameZIP as a.bin/b.zip REDfalse0, GREENrefusal.
PlainGit and ZIP synthetickey canaries2pass, no keydata output. Actualhistory/archive
summary0additionalfindings. Fullmedia2096frames/8videos,2095distinctOCRcontents,
196imagemetadatarecords and59originalimagecontactsheetchecks: no configured
privacycandidate; no exhaustive human frame-review claim. Originals/reportsignored.

167fullnpmupstreamnotices generated; legacy54c41a7lockidentical. Browsernotice
sidecar + actualfontOFLtext additive, originalZIPs preserved. Packager rejects
missingnotice; freshcapture/extractedChromium/CRC+10negativecontrolsPASS. Rootlicense,
research/designrights and historical86commitpersonalemail/privatepointer remain
ownerdecisions; NO-GOunqualifiedremediation/generalredistribution, not visibility
reversal. FuturelocalGitnoreply. PUBLIC_READINESS/SECURITY/READMEupdated.

FullNodecheck114unit+37Chromium and4toolingcontrols passed (scanner supplied),
format/lint/types/buildpassed. Publicanonymousclone8a succeeded; candidate exact
committed-source npmci/check still to run before push. Keep native-documents Save
syncEIOwork separate: resumedactualRED101 writerunwrap, externalreportmode now
GREENbothfile/dir EIO cases, mode0640/bytes/sibling/reopen+save. Notcommittedyet.
No productionStorechange required. Host own-childptrace available; no runningGUIVM.
Next:commit publicpatch, cleanclonecheck+push, observe hostedCI/update draftPR;
thenaddmandatorySaveEIOgate/docs/evidence andcontinue native reliability roadmap.
No merge/release/historyrewrite/visibility/promotion/budgetchange.

## 2026-11-20 — clean public checkout and original Save EIO gate

Publicsafeguardcommit7226bcc pushed. Anonymouspublicclone then exact7226bcc
checkout/npmci/fullcheckPASS114unit37Chromium4tooling/no skips; generatedruntime
andbuildstartedabsent. Sharedbrowserbinaryonly. Fullhistory/archivescan0additional.
NewworkflowCIstarted; actualresultmuststillbeobserved (8a8e44c bothgreenbaseline).

Continuedtechnicalwork: resumedhostownchildptraceworks. OriginalSaveEIORED101
provedmissingexternalhelperJSONreportmode (not productionStorebug). Reportmode
implementedexternalexampleonly; bothfile andpublished-dir EIOcasesPASS. Exactbytes/
mode0640/sibling/noorphan/publicEIOornewrevisiondurablefalse/reopen+saveverified.
ExistingrealSIGKILL4stagegatePASSagain. Reviewedtestcleanupfoundreapingbefore
deadlineassert risk; helpernowrecordsreap/ECHILDbeforeunwind, late-terminal
regressionPASS(waitidWNOWAIT+expireddeadline). Fullignoredgate2pass. Needfinal
Rustsuite/fullNodecheck/reviewthencommitpushsyncgate, observe latesthostedhead.
No prodStore/failpoint/authority/UIchange. NextinspectrealENOSPCSavecoverage and
restartnativeVMforreproducibleJSC/startupinvestigationifavailable. Rootlicensing/
rights/historyremediationownerdecisionsremain; don'tpauseordinaryengineering.

SyncEIOverificationcheckpoint: fullNodecheck114unit37Chromium4toolingPASS; ordinary
Rust40document/7policyPASS (ignoredgatesexcluded); finalexplicitSaveSIGKILL+EIO
gates2PASS/fourcrashstages+twoEIOstages. Late-reapregressionPASS. Reviewfoundno
otheroracleflaw. FullsystemVMdisksurvivedworkspacepause; originaldisposable
pn-m3-buildcontainer restarted andguestbootinprogress, no newGUIclaim. Public
7226bccCIinprogress. Next add isolated realENOSPC originalSavegate (recovery-only
ENOSPCCIpresent), run in2MBdisposabletmpfs, thenverifyfinalhostedhead/updatePR.

## 2026-11-20 — real original Save ENOSPC and public workflow green

Actual7226bccpublicworkflow44697972078 BOTH jobsSUCCESS, including pinnedactions,
credentialguard/canaries, productionpackagebuild/inspection and releaseTauri tests.
7fd8ee2syncEIOcommittedlocally(not yetpushed, batchingcoherentverifiedgates toavoid
cancellingnativebuilds). NewSaveENOSPCstandalonebinaryactualUbuntuVM2MBtmpfs
unprivilegedPASS:realerrno,exactoriginal/mode/sibling/noorphan,samegrantretry,
freshreopen. Reviewedmount-subtreehazardfixedusingmountinfowholefs/uniqueentry
guard; realbindrefusalPASS/sentinelunchanged/nonmountrefusalPASS/no filescreated.
No prodStorechange. FinalfullNode/Rustchecks andread-onlyreviewbeforecommit/push.

VMrestoredpn-m3-build/guestboot/systemd/AppArmor/desktop+externaldriverready.
InstalledELFa6d00cbb…unchanged. Firstlongparagraphdiagnostic did NOT launch app:
newobserverdirectorylacked@mdx-js/mdx dependency (ERR_MODULE_NOT_FOUND), no new
crashclaim. Resolveharnessdeps thenrepeat bounded20cycles andcaptureactualresults;
retain oldJSC/startup/PIDfailures. No isolation/JIT/quota/graphicssettingchange.

RealENOSPCfinalverification: fullcheck114unit37Chromium4toolingPASS, ordinary
Rust41documentPASS (ptrace/ENOSPCignoredexcluded), realUbuntu2MBENOSPCPASS,
actualsubtreebindrefusalPASS/sentinelunchanged/no writes, nonmountrefusalPASS.
Read-onlyreviewno remainingconcretefindings. Futurehistory/archive summary0.
CommitandpushENOSPC+previous7fd8ee2batch; awaitactualhostedhead beforeclaiming
newCIgatesgreen. RestoredexternalWebDriverlong20cyclesobservercurrentlyrunning
oninstalleda6d00cbb…withsamecacheddependencylock; firstmissingmoduleattempt
retained separately (appnotlaunched). No inheritednativefailuredeclaredfixed.

Native-resumeactualresult: firstmodule-prerequisitefailure retained, nextindependent
long20cyclescommandPASS20Visual/19Source,geometry360px/exactfull1000lines, actual
endtyping/diskSave/UndoRedo/reopen/mode0640/cleanexit. ELFa6d00cbb…unchanged,
observer787d0a5e…. No priorJSC/startupcausefixedclaim. Retainedin2026-11-20-native-resume.

## 2026-11-20 — final hosted Save gates and fresh-profile native acceptance

367626f pushed; run44699786688 BOTH jobs actually SUCCESS, including mandatory
originalSave realENOSPC/EIO/fourSIGKILLstages plusrecoverygates, pinnedsecretguard
andproductionpackaging/releaseTauritests. PRbodyupdatedviaREST/drafttrueverified.

Freshprofile full7flag native-fidelity commandPASS on samea6d00cbb productionELF,
ordinarynoGDB/noJITenvoverrides. ActualReact/modes/inlineedits/disk/history/dirty
cancel/restart/explicitrecovery/invaliddraftrefusal/deletepassed. Independent4file
hashes/mode0640, bothRoots1290/1864gone/recoveryonly.lock passed. Currentbootkernel
query0matchingWebKitfault/OOMentries. Priorintermittentcrashesstillunresolved.
Allnewdata/profile/fixturesprivate/disposable; precedingtestdataunchanged.

Finaldocpatchremoves2stalebillingclaims, retainsactualhostedsteps+freshnative
evidence. Runfullcheckbeforecommit/push, thenobserveexactfinalheadCI andupdate
PRbodywithactualrunresult (avoid extraevidence-onlycommitloop). KeepPRdraft.
Nextsafe milestone: nativeoriginal-Save ENOSPC GUI error/buffer-preservation/retry
acceptance usingfreshdedicatedguardedtmpfs; preservecurrentstandalonegates. Then
continueboundedJSC/startupreproduction/symbolicdiagnosticswithoutJIT/sandbox/quota
changes. Ownerhistory/license/IPdecisionsremain, not a reason topauseengineering.
No visibility/historyrewrite/evidencedeletion/merge/release/paidsettings.

## 2026-11-20 — continued packaged original Save ENOSPC GUI milestone

7a5c103pushed and actualrun44701581169 BOTHjobsSUCCESS (publicscan+allSavegates
andproductionpackage). Continuednextsafe milestoneinstead ofstopping. Newexternal
`native-save-enospc.mjs` +readonly`native-disposable-filesystem.mjs` guard actual
UbuntuUI2MBtmpfsPASS onexistinga6d00cbb ELF:realvisibleENOSPC/Source retained,
unchangedoriginalBOMUTF8CRLF/mode0640/sibling, Visualbuffer+dirtyflag+UndoRedo,
freeonlyfiller, explicitSave/reopenexact, cleanRootexit. Actualscreenshot+source
exports+hashedreportretained. No prodStore/app/UI/authority/JIT/quota changes.

Firstobserver666288…failedbeforeapply/fill (immediatexdotoolreadC); rawfailure
andexactsourceSHA-verifiedreconstruction retained. Nextobserver30de85…added
boundedcomplete-exact-inputwait, sameassertion, PASS. Failedrunstaysfailed.
Safety:canonicalprivateownedemptywhole1–4MBtmpfs, kernelmountinfo unique root,
no subtree/stackedmount; boundedfiller; externalpidfdthenidentitycheck, no PID-only
signal fallback. Actualescapedspacemountpositive+subtreebindrefusal/sentinel
unchanged PASS; ordinary/symlinkrefusal2testsPASS. Read-onlyreviewnoCritical/
Importantfindings. NeedfullNodecheck6tooling/control+cleanclonelatest+secretscan,
commit/push, actualhostedheadCI andPRbodyupdate. ExistingGUIprofile/VMstillrunning
onlyexternaldriver; verifiedRoots2097/2269shouldbegone; preserveallrawtestdata.
Next: audit/reuse destructive-test filesystem guards in older recovery tests,
thenboundedrenderer/startupdiagnostics; no speculativeJIT workaround. Rootlicense/
history/IPownerdecisionsremain. No merge/release/visibility/historyrewrite/cost.

### Native Save GUI verification checkpoint

The full local check passed: 114 unit, 37 Chromium and six tooling tests, with
formatting, lint, strict types and a fresh build. Exported final MDX independently
matched the fixture's exact BOM/UTF8/CRLF bytes and report hash; sibling bytes
matched. Both failed/passing test Roots were independently absent afterward.
All GUI evidence is under `2026-11-20-native-save-enospc`. The first observer source
was reconstructed byte-for-byte and matched its original recorded SHA256.

Next: commit the verified external observer/guard and documentation, run a fresh
anonymous-checkout install/full check against that exact commit, scan committed
history, then push. Wait for the actual final hosted jobs and update draft PR #1
with their result. The VM remains disposable; preserve evidence and stop it
gracefully when finished. No important test data or shared history is to be deleted.

### Embedded compiler attribution follow-up

Before pushing the locally verified 988aa47 GUI gate, identified one further
public-attribution gap: esbuild-wasm npm MIT omits its embedded Go runtime text.
Actual binary reports go1.26.5 and no external dependency modules. Historical
review WASM exactly matches current SHA256. Fetched eleven official Go root and
standard-library vendor/Boring LICENSE/PATENTS files, verified Git blob hashes,
and retained actual combined texts plus asset/version/notice pins in `licenses/`.
The inventory clearly states it is a source-license superset, not a linked-code
or app-license claim. Root project license and native Rust completeness remain
unresolved. Read-only review found no substantive issue; trailing blank normalized.

Generator now appends the embedded text and refuses version/asset/text mismatch.
Synthetic positive and three negative controls passed; packager now refuses full
Go-notice omission (new eleventh malformed-artifact case). Need fresh full check,
fresh capture/package/eleven negatives/extracted browser verification, committed
history scan and final push/actual hosted CI. 988aa47 exact fresh anonymous-clone
install/check already passed 114 unit/37 Chromium/six tooling with absent runtime
and build; next Go-notice revision has one additional tooling test. No app/runtime
behavior or sandbox changed. No public release/visibility/history/ready change.

Embedded-notice verification passed: 114 unit, 37 Chromium and seven tooling
controls (no skips), fresh notice-bearing demo capture, clean-extracted real
browser verification, manifest/CRC and eleven malformed-artifact refusals. The
Go-only notice omission was rejected specifically by the embedded-text guard.
Eleven source files and actual legacy WASM match are retained without changing
old archives. Git attributes pin license/raw evidence bytes across CRLF checkout
conversion; verify this in the final clone. Commit this additive attribution
change, scan committed history, push it with local988aa47, then observe actual
final CI and update draft PR #1. No new production/native security claim.

## 2026-11-20 — confirmed development-server private-cache exposure

The Go-attribution and GUI-gate batch e9a3694 was pushed. Actual run44706837109
executed both jobs SUCCESS. Continued config review then found ignored private
audit/scanner files were still allowed by Vite, with scripts binding0.0.0.0. A
real loopback-only probe exposed only our unused synthetic cache fixture, never
actual private file bodies. Gitignore and mode0700 do not block a same-user server.

Uncommitted fix: dev/preview defaults127.0.0.1; server.fs.deny adds public-audit
and .cache/security-scan-* while preserving exact installed Vite8.3.8 defaults.
Initial proposed defaults were incomplete; review caught missing key/p12/pfx/cer/
der/npmrc/yarnrc protections before commit. Expanded actual synthetic-file tests
failed first, then passed with the complete defaults restored. Future-default
set inclusion is checked through public resolveConfig(configFile:false,envFile:false).
Bare/direct/raw/encoded-dot/@fs probes require403/no marker. Runtime?raw remains200.
No actual config/credential bodies are fetched; exclusive fixture cleanup leaves
private audit parent intact. pretest:tooling now explicitly generates runtime.

Dev real-browser React count interaction and unsaved MDX compilation passed.
Need final full check with expanded eight tooling controls, retain red/green+
browser evidence, read-only re-review, commit/push and observe exact final CI.
Root project license/history/IP decisions remain; no visibility/history/merge/
release/readiness change. Production permissions/resource limits unchanged.

## 2026-11-23 — recovered actual PR #6 and corrected equation draft loss

The clean old `fff0e7e` workspace/branch is preserved. Actual main is `8516af3`;
current draft PR #6 recovery branch was `c3906da`. API verified both jobs in
run45281294302 SUCCESS at that exact head. Full reinstall/baseline production
check passed270unit/84Chromium. Existing web Source + editable Preview,
in-place math, isolated React islands and absent Favorites retained.

Independent persistence/sourceBridge review found no established new blocker.
Actual RED browser reproduced invalid equation field lost by nearby SelectAll/
Delete; unit reproduced programmatic insertion allowed during that draft. Minimal
transaction/command guards now retain it and reconcile DOM. Another RED proved
cancel did not flush source revisions deferred during the field; effect now
reconciles on close. Read-only fix review found existing link URL could clear
on blocked dispatch; RED regression reproduced, early guard retains URL.

Full corrected npmcheck PASS273unit/85Chromium plus8tooling/2scanner-skips.
Separately all10tooling PASS/no skips with pinned scanner; history/archive
scanner zero additional findings. Git noreply author+committer verified without
printing addresses. Full report/roadmap: recovery/2026-11-23-resumed-engineering-audit.md.

Firefox download succeeded but focused17 tests all FAILED AT LAUNCH (profile
folder unavailable); workspaceTMPDIR one-case retry same. WebKit native libraries
missing; dependency-install approval cancelled. No sandbox bypass or passing
cross-browser claim. Preserve these failures. Next safe task: opt-in hosted Ubuntu
cross-browser validation on a separate branch, avoiding duplicate native build.
No fresh native GUI claim; intermittent JSC/startup, current-package acceptance,
distribution attributions/root licensing remain. Do not merge/deploy/release.

## 2026-11-23 — independent hosted browser QA continuation

PR6 correction `909efe3` pushed; API verified BOTH check/native-check SUCCESS
in run45287285963. PR6 body updated with exact result and remains Draft.
Continued separately on test/hosted-browser-recovery-qa-20261123.

Added opt-in browser_qa dispatch to existing CI: all3 browser projects, standard
Ubuntu runner, actual dependency install, complete production check; retain HTML
report on success/failure. Normal PR/push gates unchanged, including native-check.
Only explicit browser-only dispatch avoids duplicate native build. No paid service
or permission change. Added real in-place equation during held real IndexedDB
open regression, preserves original results/checksums and actual CAS conflict.
Read-only review found potential false pass on delayed-open watchdog; final test
also verifies saved status after read closes, before applying local source.

Local fullcheck273unit/86Chromium/10tooling(no skips) PASS. Focused regression
passed again after final review assertion. New workflow must still execute hosted
before claiming Firefox/WebKit results. BROWSER_QA.md records commands/artifacts.
Independent native review found obsolete cleanup observer in native-startup.mjs:
immediate known-live failure, no final membership confirmation, late-read success.
Production startup/security diff unchanged since current main; no newly proven
escape/crash cause. Next safe native task: reuse existing bounded native-cleanup
helper without changing5second/60second attribution bounds, then real package run.

## 2026-11-23 — startup diagnostic cleanup correction, no native runtime claim

Continued validation branch after20a7b94. Extracted obsolete startup cleanup
algorithm under controlled IO:4RED/3PASS, reproducing immediate-live failure,
missing final membership confirmation and late-read success. Startup now calls
shared waitForStartupCleanup/native-cleanup, retains5second and pre60second bounds,
rejects unknown/ENODEV membership and uses strict process identity parser. Report
also hashes shared cleanup module; no production policy, timeout or sandbox change.
Independent read-only review no blocking finding; added remaining-lifetime case.

Final fullcheck PASS281unit/86Chromium/10tooling; new actual owned-child/proc Linux
integration PASS, then all11tooling PASS/no skips. Group emptiness remainsfixture
in that integration; no actual Tauri/cgroup/installed GUI/security pass claimed.
Startup CLI node--check and direct Node24 helper import passed; final ESLint passed.
See recovery/2026-11-23-startup-observer-review.md. Actual current-package disposable
desktop startup/security/recovery matrix still next; historical crashes unchanged.

Hosted optional3browser run45288551129 at20a7b94 is executing; install-dependencies
step remains active, native-check correctly skipped only for this dispatch.
No cross-browser success claimed before it completes. PR6 staysDraft909efe3 with
both hosted jobs green; this validation branch will be a separate stacked DraftPR.

## Hosted QA checkpoint — resumed session

Validation continuation is now draft PR7, base recovery branch, commits20a7b94
(optional3browser CI + real refresh race) andf601c8f (native observer correction).
PR6 remainsDraft909efe3 and both jobs passed run45287285963.

First optional run45288551129 at20a7b94 spent over10minutes in browser-dependency
installation. Cancelled/superseded explicitly before testing under the unsuitable
original15minute ceiling; this is NOT a browser pass. Run logs retained by GitHub;
CLI log-download endpoint returnedForbidden, so no lower-level cause is claimed.
Raised only explicit browser_qa dispatch ceiling to30minutes; normal PR checks15,
native build45 and actual native resource/expiry limits unchanged. No paid runner.
Dispatch the corrected workflow; observe exact run/head and artifact before any
Firefox/WebKit claim. PR7 ordinary hosted run45289950404 atf601c8f was in progress.
Final hosted outcomes belong in PR7 description/checks; do not infer them here.

Native follow-up remains a fresh current-package disposable desktop run using
corrected startup observer and full IPC/resource/file/recovery gates, then concrete
WebKit/JSC crash diagnosis. No unexecuted GUI/cgroup test may be called passing.

## 2026-11-24 — current package exposed a real Source CSP/fidelity defect

Both jobs at21b3a48 run45290649176 SUCCESS; optional all3browser check45290660173
SUCCESS, artifact14874553610/playwright-results retained7days. Download API403,
direct owner-accessible artifact link inPR7. Local matchingMCR pull also403;
workspace-only Debian libs cannot satisfy Playwright's ldconfig cache check;
no validation override used. Hosted results supply real browser coverage.

Restored original disposable Ubuntu/QEMU guest (kernel6.8.0-149, WebKit2.52.6,
AppArmorY, cpu/memory/pids delegated). Current21 package built offline3m14 after
container registry fetch failed and host fetched430archives verified againstlock.
PackageSHA9f59b9085888b9da25e04688ad12520a303bfa86a91a910699bd756559463312;
installedELFe26aeaf828b90c404856582563a4b5ea941e0ff139cdc2b955a88802e43f51bb.
Olda6d00cbb binary preserved. Package inspection/install PASS. Fresh-profile
production startup Static/Counter+Stop PASS, real sandboxed WebKit and Count2;
ready36.54s/45.35s, cleanup37.30s/50.59s before60s. NoJSC or sandbox-disable env.

Full seven-option native fidelity FAILED early: physical ASCII Space savedNBSP
in second same-named document. Failure retained, not a current fidelity pass.
Input trace proved key/data ASCII, modifiers false; CM computedwhitespaceNORMAL.
Readonly probe: nonced trusted boot stylesheet active, unnonced CM stylesheet
blocked. Tauri nonce makes unsafe-inline ignored. No Unicode normalization fix.

Actual browser nonced-CSP regression RED normalwhitespace; minimal SourceEditor
official cspNonce facet using existing ownerDocument style.nonce GREEN. Unauthorized
style still denied; BOM/CRLF/explicitNBSP+ASCIIspace/history/export/reopen PASS.
Full localcheck281unit/87Chromium/11tooling PASS. New focused native whitespace
harness RED on still-installed olde26a (normalwhitespace); actual corrected-package
rebuild/retest pending. No native policy/CSP directive change. Read-only review
no blocking finding. ADR014 records design. All actual logs, oldpackage and source
archives in ignored .cache/native-current-21b3a48; CONTINUATION.md has exact VM
driver/profile markers and next command. Root driver whitespace-red-1 currently
must be stopped before installing corrected package/fresh profile2. Do not drop
old failures. Next run corrected targeted whitespace then unchanged fullfidelity,
recovery and production IPC/resource gates; never claim crash/security readiness.

## 2026-11-24 — installed acceptance, strict failures and resumable diagnostics

Corrected package3cf7f28 installed and runningELF verified9c527058610b66d6293282ff0681476f60e7cc9050cbcb89fb05e92e8d4fa7dd;
DebianSHA4a126dc47748fdfabc01673a373278f9f3151badd3a0ce27fbe0c100d2d59409.
Offline cached build45.84s, inspection/install PASS. Focused physical-keyboard
whitespace/history/positive-disk-reopen test PASS, unauthorizedCSS still denied.
The earlier Source style failure is fixed without normalization or CSP changes.

Full unchanged seven-option fidelity attempt2 failed React availability at fixed
expiry; exact fixture then worked in a private diagnostic. Fresh attempt3 EXIT0:
same-name independent keys/history/save/reopen, dense read-only fallback, actual
WASM-MDX/React interaction, existing native modes, heading/quote/multiline edits,
exact mixedEOL/BOM/Unicode disk bytes, mode0640, unsafe pending-input retention,
opaque JSX navigation guards, dirty-close cancellation, actual restart, explicit
legacy recovery and invalidUTF8 refusal/delete. Prior failed run retained.
Separate versioned recovery EXIT0: two exact versions, actual restart/discovery,
older explicit restore as unsaved, cancelled SaveAs, exact newfile save, corrupt
newest refusal, valid older retention and explicit deletion; originals unchanged.
Production IPC EXIT0: positive editor control,17denied preview/recovery calls,
absent generic privileged plugins, realCounter2, parentDOM/storage and file/network
fetch denial. Actual supervised namespace/cgroup/automationfalse/Stop checked;
direct automated preview ACL probe remains outside that resource supervisor.
Production persistence EXIT0: exact writes, inode replacement, mode+POSIX ACL,
forgedgrant refusal, read-only retry, conflicts/cancellation/SaveAs/reopen and
interactive rebuilt Counter/X. Screenshots and sanitized hash-bound evidence in
security-evidence/2026-11-24-current-package; raw logs remain ignored.

First full stress controller660s interrupted final recovery:5CASE_PASS and actual
windowclosepreexpiry46.17s retained, no final JSON/complete pass, exitunavailable
following cloud reattachment. Confirmed finally-only evidence loss fixed with
atomic per-case checkpoints and nested cleanup even if reporting fails. Actual
Linux racing1MiB replacements +SIGKILL test REDnaivepartialJSON, GREENatomic;
requires observed generation advancement, not deterministic boundary/powerloss
proof. Independent read-only review found no blocker. All security assertions
and actual application limits remain unchanged.

Fresh checkpoint-enabled full stress controller1000s completed EXIT1:5passes,
CPU Stop attribution FAILED because armed52.51s left insufficient time before
60s expiry (earlier run armed43.90s and passed). Both original and resident-page
memory cases passed trusted systemd oom-kill, peaks536870912, empty groups/no
known live descendants and interactive Counter2 recovery. Expiry/editorSIGKILL/
windowclose+recovery passed. Separate structured journal reads independently
confirmed trusted timeout records for expiry and editor-death cases. Do not call
this complete matrix green or attribute prior failures to the source-style fix.

CPU edit/native-save test EXIT1: exact disk comparison passed, but5133ms exceeded
unchanged5000ms latency gate. Later CPU-delta/rebuild assertions not reached.
Heap edit/save failed before editing: marker was visibly captured, but Tesseract
was missing. Observer attempts and screenshot retained. VM package installation
failed DNS for archive.ubuntu.com; escalated retry had no execution result after
cloud runtime replacement. No heap/disk pass claimed. New CLI pressure preflight
checks Tesseract+English data before native launch; missing-tool control NOT RUN
EXIT2. No OCR or pressure assertion waived. All driver units stopped; guest was
normally powered off, disk/source/package/raw evidence preserved.

Ordinary CI3cf7f28 run45299830820 BOTH SUCCESS. Optional three-engine45300006229
attempt1 timed out30m after26m18sdependencysetup; attempt2 timed out duringsetup
(01:23:36–01:53:27UTC), no check executed. GitHub annotations confirm30mceiling;
logs/artifact download API remainsForbidden. Earlier21b3a48 three-engine run
45290660173 passed and retained report14874553610for7days. Only future explicit
browser QA gets45m; ordinary PR15m/native45m and all test/security bounds unchanged.
No paid runner, permission, billing, license, deployment or release change.

Final npm ci installed 429 packages in 6 seconds. Full local check exited 0:
281 unit, 12 tooling (zero skips), 87 Chromium tests, production build, formatting,
lint and strict TypeScript. Final OCR preflight lint/format and missing-tool
exit2 control passed; independent read-only review found no blocker. The dated
package evidence retains the failed native gates. Publication and hosted results
are linked from draft PR #7; verify its exact head/run instead of inferring a
hosted pass from local checks.
Next independent task: plans/2026-11-24-native-hosted-acceptance.md, direct standard
Ubuntu hosted native validation to investigate TCG startup margins; this job is
NOT implemented/verified yet. Add phase-level latency evidence and improve expiry
journal automation; preserve known renderer/JSC failures. Physical GPU/Wayland is
separate compatibility work. Root/native redistribution rights remain owner gates.
Keep PR6 focused/draft909efe3; continuation PR7 stacked/draft. No merge/readiness.

### Follow-up — portable OCR and explicit heap latency failure

Existing host Tesseract 5.5.0/Leptonica 1.84.1, loader/libraries and English data
were copied to ignored workspace storage, with a SHA256 manifest. A private
wrapper sets its own loader/library path only for the external OCR process.
The driver/native application uses its original environment and libraries; ELF
9c527058610b66d6293282ff0681476f60e7cc9050cbcb89fb05e92e8d4fa7dd verified before/after.
No package/network installation or public binary upload was needed.

Fresh heap attempt 2 verified the real PID-bound OCR marker at 52.161s within the
unchanged 55s deadline. Exact saved disk bytes also passed independent comparison.
The complete command exited 1: 6528ms exceeded the unchanged below5000ms edit/save
budget; later growth/rebuild gates were not reached. Keep the first missing-tool
failure and both latency failures. Evidence includes the verified screenshot,
sanitized partial result, tool manifest and log hash. Driver stopped and guest
shut down normally again; all prior disk/evidence retained.

Source/diagnostic corrections and prior evidence were pushed at 525b70b. Its
ordinary CI 45318116068 and new45minute browser-only dispatch45318464348 were
running at this checkpoint; check terminal results before any hosted pass claim.
This follow-up changes documentation/evidence only. Previous full local check
281 unit /12 tooling /87 Chromium remains valid for unchanged application/code;
scoped formatting and publication credential scan are repeated for new evidence.

### Follow-up — trusted expiry oracle

A diagnostic false-positive risk remained: formatted journal text alone could
match author stdout. The expiry helper now requires trusted manager fields on
both exact same-unit runtime-limit cause and structured timeout failure result.
The existing OOM predicate and all elapsed/Stop/resource limits are preserved.
Four new regressions RED against naive phrase matching, all six journal cases
GREEN. Actual captured expiry/editor-death journals accepted, forged stdout
rejected, actual OOM records still accepted only as OOM. Fresh production-ELF
expiry-only run EXIT0 with real loop, cause/result, descendants gone and Count2
recovery. Sanitized result and review under 2026-11-24 evidence. Independent
read-only review found no blocker. Full six-case CPU attribution failure remains.

Hosted525b70b ordinary run45318116068 BOTH SUCCESS; three-engine run45318464348
SUCCESS, native skipped only for explicit browser QA. Report14886669317 retained
seven days. Updated local checks for the new oracle are recorded on completion;
no future commit inherits those hosted outcomes without checking its own run.

Final stricter-oracle local check EXIT0: 285 unit, 12 tooling with zero skips,
87 Chromium tests, types/lint/format and fresh production build. The dedicated
native expiry case passed with its stricter trusted cause/result requirement;
the earlier complete six-case CPU-attribution failure and both5s edit/save
failures remain unchanged. No full security-readiness claim. VM shut down normally.

### Publication scan correction

The scan after49fb85b flagged two generic-key candidates in the portable OCR
manifest. Both were recomputed against existing libkeyutils/libgssapi ELF bytes:
SHA256 metadata, not credentials. No values printed. A sequencing mistake let
push run before the failed scan was inspected, so the manifest was already
public. No shared history rewrite or evidence deletion. Added only two immutable
commit/path/rule/line false-positive fingerprints; no rule/path bypass. Independent
read-only review found no blocker. Full history/archive scan and Git/ZIP synthetic
credential controls are rerun and must complete successfully before the next push.

Audited-digest correction checks completed successfully: full history and archive
scan zero additional findings; all12tooling tests passed with zero skips, including
synthetic Git/ZIP credential-refusal controls. The exact six known historical
false-positive fingerprints do not waive any credential rule or future finding.
The next push waits for the new postcommit scan to finish before publication.

## Resume — hosted dependency correction and Debian diagnostic

On fd6f7f2 the required check job passed; native-check failed before compilation
because an unrelated Microsoft runner APT source returned403. A reviewed fixed
helper now selects the runner's existing Ubuntu source, preserving archive
signing, authentication and expiry checks. All six dependency-installing jobs
invoke it. Real offline APT URI planning includes an omitted-filter negative
control. No paid runner or mandatory-test change. Full local check exited0:
808 unit,133 tooling/zero skips,153 Chromium,9 Pages and4 local cloud-storage
cases; format/lint/types/build passed. Hosted rerun remains required.

Debian OS-only run45939785719 passed actual assembly/boot/identity negatives and
normal shutdown. Native run45940249067 passed effective isolation admission and
the native bridge, but React readiness timed out. Stop termination and host
input passed individually; pointer/key/expiry did not run and session cleanup
failed. Dated bounded evidence preserves this failure. A concrete test-driver
shutdown defect was identified independently: XDestroyWindow bypasses the GTK
delete-event handler. Its separate correction and discriminating readiness
diagnostic are prepared, not yet native-verified. No product installer accepted.

### Native shutdown correction and readiness probe

Source-reviewed WM_DELETE_WINDOW correction and advisory cached readiness
category are complete locally. Independent controls passed38session,31observer,
14helper,21driver. Full check exited0 with808 unit,133 tooling/zero skips,
153 Chromium,9 Pages,4 local cloud-storage cases; format/lint/types/build pass.
Functional input hashes stayed fixed; only separately reviewed/formatted README
changed during the run. Native execution remains pending. No deadline, resource
limit, cleanup or title acceptance was relaxed. Historical failure evidence stays.

README/Linux guide now accurately mark the rejected legacy installer, existing
notice-bearing artifact and explicit demo-dispatch condition. Independent
contract/workflow review cleared those documentation corrections.
