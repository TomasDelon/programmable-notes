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
