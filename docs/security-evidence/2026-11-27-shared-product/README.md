# Shared editor/local-vault integration — 27 November 2026

This chronological record begins with the shared ProductRoot/controller packet
on top of ad0ffca. Later sections record guarded native entry activation and
subsequent hosted attempts; the initial packet was inactive. Current installed
editing/chooser/filesystem acceptance and the full native React security matrix
remain unverified. The latest fixed diagnostic helper pass is a separate scope.

## Executed checks

- Full `npm run check`, matching downloaded Chromium: exit0. Formatting, ESLint,
  strict TypeScript,864 unit tests,133 tooling tests,153 Chromium cases,9 Pages
  cases and4 disposable local cloud-storage cases passed. Two scanner controls
  were skipped because that process lacked PN_GITLEAKS_BIN. They subsequently ran
  explicitly with the pinned scanner:2 passed,0 skipped. The combined tooling
  coverage is135 controls; the full command alone is not labelled zero-skip.
- First full-check attempt stopped at a formatting error in native-product.test.ts.
  Formatting was corrected before the successful full rerun. A separate tooling
  rerun also lacked the scanner variable and had the same two skips; it provides
  no extra security coverage beyond the successful targeted scanner controls.
- `cargo test --manifest-path native-documents/Cargo.toml --locked`:91 passed,
  0 failed,7 ignored. One is a worker invoked by its owning process-contention
  test. Four require own-child ptrace/crash injection, and two require dedicated
  disposable small tmpfs fixtures. Those six specialized cases were not executed
  in this run. Backend tests are separate from Tauri GUI/runtime acceptance.
- Independent source review found no Important/Critical issue in the inactive
  frontend packet. It confirmed real shared UI consumption, canonical session
  publication, stale callback retirement, exact recovery receipts and deliberate
  aggregate-close refusal. This is a code review, not a native runtime test.

Local logs are ignored because raw tool output is not a public evidence format.
The named commands and source-controlled tests reproduce the checks.

## Controlled real-browser witness

The trusted fixture in tests/fixtures/product-browser mounts the actual
ProductRoot, nativeProduct and NativeWorkspace with synthetic OS ports. Its
revision-checked storage is in memory. Run from the repository root:

```sh
npm ci
npm run prepare:runtime
npx playwright install chromium
node scripts/test-product-browser.mjs .cache/product-browser.png
```

Use PLAYWRIGHT_BROWSERS_PATH when the matching browser is installed outside its
default cache. The runner owns an ephemeral loopback Vite server and isolated
optimizer cache; it never mounts the product through an application route or
changes an entry point. Its screenshots and JSON results stay in ignored .cache.
The frozen runner exited0 with nine checkpoints: Source and Preview caret edits,
undo/redo in both modes, session-preserving switching, untouched mixed-MDX bytes,
fresh-session close/reopen, blocked-write retention and external-writer CAS refusal.
It also checks no literal numeric entity is visible after typing, a mode roundtrip
and fresh reopen. Normal Preview and blocked-write screenshots were captured.
Native filesystem and native runtime results remain marked not-tested.

Development observations are preserved in the task log: an initial cold/shared
optimizer caused startup/input timeouts; the runner now isolates its cache and
waits for actual UI. A save-label assertion and expanded mode-picker helper were
corrected to match actual controls. These failures were not application fixes.

A literal-byte assertion also exposed existing deliberate Markdown serialization:
a newly typed trailing space becomes a numeric whitespace reference so reparsing
does not trim it. Subsequent text currently retains that reference. This does not
alone establish visible corruption. The witness requires ordinary visible space,
no literal entity in Preview, exact surrounding source and correct reopen. Never
globally decode original user-authored entities to normalize generated ones;
any future normalization requires provenance and its own history/source tests.

## Remaining gates

The existing native boolean close command cannot safely release protection against
late draft reports. Aggregate controller admission now blocks publication and
captures late reports, but nativeProduct.prepareClose intentionally refuses final
release. The reviewed native-editor-close-handshake plan requires synchronous
clean editor detachment and a fixed editor-only native request/commit protocol.
No close-success or corrected-installer claim follows from this packet.

Native React still has intermittent startup/keyboard failures and lacks the full
repeatable interaction/containment matrix. See the separate native-inline fixture
evidence, including failed run45964414560. Rename/move/Trash, continuous external
observation, signed updates and installed shared-root acceptance remain separate.

## Later prerequisite and viewport verification

The next full check passed873 unit,140 tooling with zero skips,153 Chromium,
9 Pages and4 local cloud cases. Eleven pure Rust close-state cases passed. Hosted
run46003547608 on97d3aab passed native-check, including actual Tauri headless
Documents/close/update tests and optimized package build. This is not actual
native IPC, OS-close input or installed local-vault acceptance.

Expanding the controlled browser journey to768px and390px reproduced a genuine
pointer failure: the mode picker's invisible hit area intercepted the drawer's
Close button. Open drawer controls now stack above that hit area. The same
ordinary-click regression passed at all three widths with ten total checkpoints;
no force click or event bypass is used. Screenshots wait for the drawer to leave
the viewport and are whitelisted individually in CI artifacts. These are viewport
checks in Chromium, not mobile hardware/touch or Linux WebKitGTK acceptance.
An initial final-check attempt stopped at a missing browser-global qualification
in the new Node test runner; that test-only lint error was corrected before rerun.

## Frontend close integration

A later frontend check passed956 unit,140 tooling/zero skips,153 Chromium,
9 Pages and4 local cloud cases with format/lint/types/build. Independent source
review found no Important/Critical issue in the bounded close integration.
The expanded browser runner passed13 checkpoints: active DOM composition refuses
close without replacing the owner; commit refusal plus exact cancel remounts the
same session/history; a fresh isolated page's held commit retires real editor DOM
input and cannot publish/write or reopen after its validated acknowledgement.
The latter page is a fresh synthetic-memory fixture, not a native restart test.

The fixture uses the real negotiated transport decoder, model, controller and
React editor under StrictMode. Native close records/OS requests and revision-CAS
storage are injected. Physical IME, native IPC, actual window destruction and
native-file durability remain not-tested in this browser record. The packaged
entry remains unchanged until bootstrap/fatal lifecycle and installed acceptance.

## Combined close/bootstrap and child-guard foundation

After the fixed close transport, model, Root and window-lifetime bootstrap were
frozen, `npm run check` exited0:966 unit,143 tooling with zero skips,153 Chromium,
9 Pages and4 disposable local cloud cases, plus formatting/lint/types/build.
`npm run test:product:browser` separately exited0 with13 checkpoints. The new
close checkpoints dispatch DOM composition events and synthetic native replies;
they establish neither physical IME behavior nor actual native IPC/window close.

The inactive bootstrap captures bindings before awaits, preloads presentation,
negotiates once and retains one model. A permanent fatal latch prevents new close
resolutions and survives React retry; already dispatched commits remain uncertain.
There is no reload, legacy fallback or fabricated clean-close action. The default
native entry has not been switched by this foundation packet.

Native child WebKit guards now precede authored iframe assignment, including
security probes without a payload. File chooser, permission, print, fullscreen
and script-dialog handling are denied/suppressed by native handlers. Publication
checks exact trusted location and sandbox again at actual JavaScript execution.
Three Node tests execute the fixed publication template, and six direct Rust
tests exercise one-shot activation. Rust formatting passed. These do not execute
GTK signals. Hosted compilation and real Linux chooser/dialog/Stop/expiry tests
remain separate requirements; no observed exploit or native readiness is claimed.
The inline Wry host is a separate path and is not validated by this child change.

Hosted CI [run46016023081](https://github.com/TomasDelon/programmable-notes/actions/runs/46016023081)
on41091f3 subsequently passed both required jobs: real GTK compilation, optimized
package inspection, native headless tests, real Store autosave harness and the
shared Chromium witness. Browser screenshots/results are downloadable as
[playwright-results](https://github.com/TomasDelon/programmable-notes/actions/runs/46016023081/artifacts/15205968992).
That package still predates the shared native entry candidate; do not present it
as the corrected installed UI. No actual GTK signal or installed journey follows
from these successful build/headless jobs.

## Shared native entry candidate and regression feedback

The first candidate `npm run check` exited1 after973 unit and143 tooling cases
passed:150 Chromium cases passed and3 old native-entry cases failed. Those cases
still mocked the rejected manual-save shell and omitted guard/vault negotiation.
Pages/cloud gates were not reached in that failed command. The fixtures were
migrated to the actual entry and scoped grant/revision autosave rather than
restoring the rejected shell or deleting fidelity/security coverage.

The migrated browser cases then exposed a real chrome-focus history regression:
Ctrl/Shift/Z outside an editor relied on browser contenteditable history. A trusted
app-only fallback now invokes the existing canonical editor commands, excludes
forms/editors/dialogs and refuses stale selection, pending or closing state.
Synthetic key events cannot authorize source changes. The same targeted three
cases then passed, including exact BOM/CRLF/JSX bytes, scoped revisions, document
switch/close/reopen, no browser database or preview iframe, React unavailability
and responsive two-mode navigation. Independent source review found no Important
issue. These remain Chromium tests with simulated IPC, not actual native I/O.

The optional-hosting tooling run first failed its APT regression control because
the expected-job inventory omitted the new job. That inventory now includes the
job, so removing its source setup is detected. The complete tooling suite then
passed150 cases with zero skips. The real Store/controller autosave harness also
exited0 locally: exact bytes/permissions, coalescing, history, restart, external
conflict and lost acknowledgement. Its chooser is synthetic; no GUI/create or
physical input acceptance follows from that harness.

The final frozen candidate `npm run check` exited0:973 unit,150 tooling with zero
skips,153 Chromium,9 Pages and4 disposable local cloud cases passed, together with
format/lint/types/build. The separate shared-root browser journey again exited0
with13 checkpoints. These local gates apply to the shared-entry/hosted-witness
packet; native GUI and React containment remain unexecuted by these commands.

The reviewed hosted witness verifies successful check/native-check jobs for the
exact same repository/branch/head, then checks the package source tree, hash and
production inspector before installation. A fresh ordinary desktop account cannot
sudo and receives a clean environment, authenticated X display and existing WebKit
sandbox. Fixed receipts/screenshots are collected; missing evidence, forced app
cleanup or residual app/WebKit actors fail. No private provisioner, credential
share, paid runner, release or isolation bypass is introduced.

## First actual hosted-editor dispatch: pre-install refusal

Candidate CI [run46020089543](https://github.com/TomasDelon/programmable-notes/actions/runs/46020089543)
on8ee2d60 passed both required jobs, including the new entry browser regressions
and optimized production package. The subsequent optional hosted attempt
[run46021513886](https://github.com/TomasDelon/programmable-notes/actions/runs/46021513886)
failed its mandatory-CI provenance check before downloading/installing the package.
No desktop account, application process, real chooser or native file journey ran.
There was no witness artifact because execution stopped before observation.

The verifier's test fixture assumed Actions run.name was the static workflow name.
The actual public API returns the dynamic run title there. Read-only real API
responses reproduced that exact assertion failure. The correction authenticates
the run's canonical workflow_id against the fixed CI workflow API record, retaining
exact repository, branch, head, path, successful required jobs, source tree, package
hash and production inspection. It does not accept a title prefix or loosen
package provenance. Runtime acceptance remains pending a corrected dispatch.

## Native React keyboard diagnostic: next discriminating probe

The previous sealed Debian run45964414560 failed inside the trusted subprocess
pipe wait, before React text acknowledgement. Focus acknowledgement had passed.
Readiness can use44 seconds while pointer/focus/typing share a49-second deadline,
and each command is also capped at2 seconds. The retained receipt cannot tell
whether the typing command had its full budget. This is an unproven driver/startup
hypothesis, not proof that native keyboard interaction works.

The diagnostic adds one optional closed timing record for the fixed literal hello
command: available milliseconds, limiting clock, elapsed time, timeout branch and
helper outcome. Actual commands, minimum deadlines, cleanup and isolation remain
unchanged. Elapsed time includes existing kill/reap cleanup. A returned helper
never substitutes for the existing native text acknowledgement or case outcome.
Reporter validation binds the record to the frozen observer hash and excludes raw
arguments/output/exceptions. Old receipts without it remain valid.

39 observer,17 sanitizer and23 driver tests passed, plus their three tooling
wrappers and the complete150-case tooling suite at that diagnostic checkpoint.
Independent review found no Important issue. No new guest/native probe has run.
Next perform one reviewed sealed-fixture run: a truncated unit budget supports
the headroom hypothesis; a full2-second pipe timeout directs investigation toward
the X11/xdotool command. Neither result authorizes native React activation without
the remaining interaction, expiry, containment and cleanup witnesses.

After the workflow-ID correction and bounded diagnostics froze, the final
`npm run check` exited0:973 unit,152 tooling with zero skips,153 Chromium,9 Pages
and4 disposable local cloud cases, plus formatting/lint/types/build. Actual API
responses for run46020089543/workflow421740247 reproduced the original failure
and passed the corrected verifier unchanged. Independent review found no Important
issue. The next hosted retry remains unexecuted at this checkpoint.

## Executed native attempts on6c92742

Required CI [run46023414579](https://github.com/TomasDelon/programmable-notes/actions/runs/46023414579)
passed both jobs. Packaged-editor retry
[run46025070639](https://github.com/TomasDelon/programmable-notes/actions/runs/46025070639)
passed provenance, source-tree/hash checks, production inspection and installation
on the standard Ubuntu runner, then failed the desktop-session launcher step. Its
344-byte [evidence artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/46025070639/artifacts/15211852106)
was uploaded but this cloud environment received HTTP403 from artifact storage.
An escalation was cancelled. The exact launcher substage is unknown; neither app
launch nor any actual editing/chooser/close journey is claimed. No blocked download
was repeated after cancellation.

The separate sealed Debian React diagnostic
[run46025078225](https://github.com/TomasDelon/programmable-notes/actions/runs/46025078225)
passed OS admission (Debian13, WebKitGTK2.54.3) but failed document readiness.
[Validated check-annotation results](react-46025078225.json) retain the exact source,
case outcomes and limitations. Bridge observation, termination, trusted host input
and session cleanup passed; pointer/typing and expiry were not run. No keyboard
timing record was generated because typing was never reached. Readiness failure
remains a failure; this does not validate native React or resource containment.

The observed native flags were built=true with no observed commit/finish/failure
or termination. Existing raw hooks attach after construction, so missing flags do
not exclude earlier events. The next probe uses the pinned Wry pre-build page-load
callback for the existing sticky commit/finish flags, preserving the original HTML
load, schema, deadlines and readiness oracle. On this Linux backend Wry Started
means WebKit Committed. Late failure/termination hooks retain their limitation.
This repairs observation, not a demonstrated cause of the startup failure.

The next editor-harness packet removes brittle checkout-access assumptions by
using five immutable public observer helpers and a verified snapshot of the
executing pinned Node tool under the fresh UID boundary.
It does not establish checkout permissions as the previous failure's cause. Safe
fixed stage annotations make later failures diagnosable through the API without
raw logs, source, credentials or signed artifact URLs. No filesystem grant,
namespace policy, timeout, cleanup requirement or success predicate is weakened.

The final application check exited0:973 unit,163 tooling with zero skips,153
Chromium,9 Pages and4 disposable local cloud cases. The final Node-tool snapshot
changed after that command's tooling phase; the entire163-case tooling suite and
format/lint/types were rerun successfully on the frozen version. Five direct
production Snapshot Rust tests and Rust formatting passed. Actual GTK compilation
and a new installed/native attempt remain separate hosted gates.

The copied Node tool is read from the preparer's own kernel executable handle,
not an arbitrary file or process memory, and checked by bounded ELF validation,
source/readback hashes and a clean-environment version check before the fresh UID
exists. The role cannot modify the payload or tool. Cleanup runs the immutable
copy, removes its own Linux payload and treats deletion failure as a failed run.
Checkout ancestors must be unwritable to the fresh UID; failed permission queries
refuse launch. No host cache, credentials or node_modules are copied or uploaded.

## New-document focus regression discovered in CI

Onab6d3d4, required run46053038535 passed native-check, including the new early
callback's actual GTK compilation. Its check job rejected one flaky Recent
navigation case: after creating Gamma, the Source editor remained inactive.
The retry passed, but the flaky-test policy correctly kept the job failed. No
unchanged rerun or relaxed timeout/retry policy was used to claim green.

A controlled click-frame hold reproduced the lost-focus behavior. WebApp relied
on one animation frame while keyed SourceEditor creates CodeMirror in a passive
effect. The shared interaction hook now consumes an owned focus request after
mount; the controlled probe does not establish the exact scheduling of the CI
failure. Explicit creation-dialog handoff prevents old focus restoration from
overriding the new editor. Scope, selection, navigation and active-control checks
retire stale work. Native creation additionally verifies its confirmed new session
and captures the initiator before awaiting, so a newer focused control wins.

The amended patch passed26 targeted unit cases and9 Chromium navigation cases
with zero retries/flakes, including immediate typing, dialog cancellation, rejected
creation and replacement application. A held native create first reproduced the
newer-focus recapture edge and then passed after submission-time capture. Source,
history, filesystem and runtime permissions are unchanged. Independent review
found no Important issue.

One intermediate broad browser run was invalidated because a parallel worker
rebuilt its shared dist directory. It was interrupted (exit130), not reported as
an application failure or a pass. The final run owns a frozen build exclusively;
AGENT_WORKFLOW now records build-directory ownership as well as port ownership.

The final frozen focus patch `npm run check` exited0:984 unit,163 tooling with
zero skips,155 Chromium,9 Pages and4 disposable local cloud cases passed, plus
format/lint/types/build. No worker changed source or dist during that run. The
next required CI and native attempts must validate this amended application.

## Actual attempts on2ad5910 and driver correction

Required [CI46056673446](https://github.com/TomasDelon/programmable-notes/actions/runs/46056673446)
passed both jobs. Installed-editor [run46057748343](https://github.com/TomasDelon/programmable-notes/actions/runs/46057748343)
passed package provenance, tree/hash verification, production inspection and
installation, then failed at driver_start with exit1. Cleanup passed, no forced
cleanup or residual processes were reported, and denialClasses was none. The
application was not launched; no chooser/editing/disk/restart acceptance is claimed.
The fixed check annotation supplies this observation without artifact downloads.

Published tauri-driver2.1.0 source identifies a deterministic CLI mismatch: its
parser rejects `--host`; `--native-host` is supported. The intermediary already
binds to127.0.0.1, and the native driver remains on loopback. The one-argument
correction preserves permissions, timeouts, cleanup and acceptance predicates.
The regression failed with the original launch line and passed after correction.
Three new controls validate actual Bash-expanded arguments against an attributed
exact upstream HELP fixture, reject unsafe/unsupported values and bind the CI
version. All17 scoped CLI/hosted controls and static checks passed; independent
review found no Important issue. This does not replace an actual installed retry.

The sealed Debian13 [run46057753337](https://github.com/TomasDelon/programmable-notes/actions/runs/46057753337)
passed OS admission on WebKitGTK2.54.3 and the fixed native React diagnostic.
[Strictly validated annotation evidence](react-46057753337.json) records:

- Stop case: bridge, pointer, actual keyboard acknowledgement, termination and
  trusted host input passed.
- Expiry case: bridge and termination passed; pointer, keyboard and host input
  were not run by that case's design.
- Session cleanup passed. The keyboard helper had its full2000ms local budget,
  returned after91ms without a timeout; actual acknowledgement is a separate
  passing case outcome, not inferred from helper return.
- Early committed/finished flags were not published on success and remain
  unknown. Hook placement and prerequisite compilation are separate evidence.

This single fixed helper pass does not establish a causal startup repair,
repeatability, application geometry, document IPC/filesystem denial or hostile
CPU/memory containment. Prior failures remain retained. No unchanged retry,
artifact/raw-log download or escalation was performed. Arbitrary native document
React remains disabled until the full acceptance matrix passes.

The final frozen driver-correction `npm run check` exited0:984 unit,166 tooling
with zero skips,155 Chromium,9 Pages and4 disposable local cloud cases passed,
plus formatting/lint/types/build. No source or build inputs changed during browser
verification. Only documentation was updated afterward; its formatting was
rechecked. Staged, complete-history and archived-content secret scans found zero
findings. The next current-source required CI and actual packaged retry remain
separate gates.

## Corrected driver, actual installed attempt on10cb8e4

Required [CI46059491223](https://github.com/TomasDelon/programmable-notes/actions/runs/46059491223)
passed both jobs. The corrected installed [run46060542545](https://github.com/TomasDelon/programmable-notes/actions/runs/46060542545)
passed provenance, package inspection/installation and driver startup, then failed
inside the journey. Its fixed annotation reports stage=journey, exitCode=1,
cleanup=true, forced=false, residual=false and
denials=operation_not_permitted. This class does not establish an AppArmor or
namespace cause, and the inner action is not exposed by that reporter. No actual
editing, chooser, close or restart acceptance is inferred from the outer stage.

The next observation adds only closed journey/startup/failure categories to the
existing bounded reporter. It preserves application launch, sandbox policy,
permissions, timeouts, cleanup and every success predicate. Missing or malformed
receipts remain failed/unknown; raw logs, framework responses, source, paths and
signed URLs remain excluded. The previous failure is retained rather than repaired
by a retry or by disabling the WebKit sandbox.

## Independent WebKit mathematical editing regression

[Run46061719333](https://github.com/TomasDelon/programmable-notes/actions/runs/46061719333)
on10cb8e4 passed the existing optional Playwright WebKit mathematics selection
with three repetitions and zero retries. The build and selected regression step
succeeded with zero failure annotations. [Validated metadata](webkit-math-46061719333.json)
retains the precise scope; the exact executed test count was not available from
inspected metadata and is not inferred. The [QA artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/46061719333/artifacts/15229122955)
is available through GitHub. This is browser-engine evidence, not actual GTK,
installed-application, IPC or resource-containment acceptance. No artifact or raw
log was downloaded, and no unchanged retry was performed.

The observational packet's full `npm run check` exited0:984 unit,171 tooling
with zero skips,155 Chromium,9 Pages and4 local cloud cases, plus static checks
and production build. Afterward, only the harness diagnostics gained two finer
process-identity stages and four strict OS errno classes. The entire final tooling
suite reran:173 passed,0 failed,0 skipped; format/lint/types also passed.
Application source/build inputs did not change, so the browser evidence remains
applicable. These diagnostic fields carry no new authority and do not repair the
previous runtime failure. Independent final review found no Important issue.

## Actual packaged startup and remaining chooser failure

[Run46064143844](https://github.com/TomasDelon/programmable-notes/actions/runs/46064143844)
onacbec3a used successful required CI46062811208 and the inspected production
package. Fixed annotations now locate the failed journey: startupPhase=complete,
journeyStage=authorized_vault_chooser, failureKind=other. Thus WebDriver startup,
installed process identity and shared ProductRoot readiness actually passed.
Cleanup passed without forced termination or residual application processes.
The generic operation_not_permitted substring remains advisory; it is not a
namespace diagnosis. No file editing/save/close/restart acceptance is inferred.
The exact chooser/helper failure remains unknown without another bounded
observation; no artifact/raw-log download or unchanged retry was performed.

## Explicit recovery copies, candidate followingacbec3a

The shared product now discovers retained native versions and creates an explicit
new copy inside the authorized vault through existing exclusive file creation.
[ADR042](../../decisions/ADR-042-read-only-recovery-copies.md) records authority,
cancellation, lossless source and uncertainty semantics. Reading recovery no
longer initializes or prunes the store; writer retention policy is unchanged.

A clean eight-sequential-version filesystem fixture demonstrates the former
maintenance behavior: writer opening prunes it to five. Read-only discovery and
version reading preserve the same valid files and bytes. Corrupt siblings and
unsafe/missing stores have separate controls. Frontend tests cover receipt
correlation, exact BOM/CRLF/Unicode/JSX, collision/path refusal, selection ABA,
cancelled reads, close protection and unknown-ack retention/retry lock. An extreme
timestamp crash and a successful-copy selection self-abort were corrected with
regressions. Reopening an uncertain attempt preserves the visible path/version.

The frozen full `npm run check` exited0:1004 unit,173 tooling with zero skips,
157 Chromium,9 Pages and4 disposable local cloud cases, plus format/lint/types
and build. Full native-documents tests and Rust formatting exited0:93 passed,
seven explicitly ignored. One is the parent-controlled worker; four require
own-child ptrace and two require disposable small tmpfs filesystems. Those six
specialized cases were not executed locally for this candidate. The earlier
hosted native job runs them on its own source; it is not copied onto this change.

Independent product/security review found no remaining Important issue. Native
GTK command compilation and actual installed recovery/restart remain separate
pending gates. The packaged observation above predates this recovery candidate;
controlled-IPC browser journeys and real backend files do not replace it.

The next hosted observer projects only fixed terminal helper signatures from its
existing bounded private diagnostic input, gated to a validated failed chooser or
reopen journey after complete startup. These advisory categories do not prove
that the application omitted a dialog, identify a namespace cause, or change the
failed result. Python helper actions and all PID/title/path/acknowledgement checks
are unchanged. A new fixed startup PNG is captured once, before vault selection,
using existing size/signature bounds and explicit artifact whitelists. It proves
startup presentation only, not editing or filesystem acceptance.

After that harness-only addition, the entire tooling suite passed177 cases with
zero skips, and format/lint/types passed. Application inputs remain those of the
fully checked recovery candidate. Independent source review found no Important
issue. A new required CI build and actual changed observation are still needed;
the helper signatures and startup image have not yet been observed natively.

## Observed chooser refusal and changed guarded profile

Required [CI46066421522](https://github.com/TomasDelon/programmable-notes/actions/runs/46066421522)
passed both jobs on d733ae2, including actual GTK SDK compilation of the recovery
commands and the optimized package. Actual installed
[run46067552665](https://github.com/TomasDelon/programmable-notes/actions/runs/46067552665)
on that source failed with startupPhase=complete,
journeyStage=authorized_vault_chooser, failureKind=other and
dialogClasses=dialog_location_echo_mismatch. The owned dialog/focus was reached;
exact location echo failed before acceptance. Cleanup passed without force or
residual processes. The advisory permission substring does not diagnose a
namespace failure. Editing, disk, close, restart and recovery did not pass.

The [bounded installed artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/46067552665/artifacts/15231427625)
retains the fixed startup PNG captured before chooser entry. Its capture succeeded;
the image was not downloaded or visually inspected in this cloud workspace.
Raw logs and signed artifact URLs were not exposed.

The changed helper types an explicit trailing folder separator while retaining
both exact echo comparisons, owned PID/title/focus, deadlines and dismissal
acknowledgement. Its closed shape marker never includes a path or raw value.
The pinned GTK3/rfd SELECT_FOLDER default acceptance label is Open, also corrected
with an upstream-source-bound regression. That label was not reached in the
previous refusal. These changes need a new actual journey, not an unchanged retry.

ADR043's guard foundation shares the canonical native denial handlers with the
experimental inline host before one-shot authored publication. Profile identity
is strictly inline-react-guarded-v2; earlier v1 passes remain historical. Empty
construction/publication ordering and mutation controls passed, plus six shared
Activation tests. GTK compilation and actual handler/navigation denial still
require separate proof. General native React stays disabled.

Recovery-copy dialogs now reuse existing form styling and return typing to the
created copy. Controlled-port browser journeys capture desktop/tablet/mobile
screenshots and verify lossless immediate typing. These are shared UI evidence,
not actual native restart evidence.

The frozen combined local full check exited0:1006 unit,184 tooling/zero skips,
157 Chromium,9 Pages and4 disposable local cloud cases, plus static checks and
production build. The final helper-only acceptance-label correction was followed
by the entire185-case tooling suite with zero failures/skips and static checks.
Application/browser source inputs were unchanged after the full run. Rustfmt
passed for Tauri and the experimental host. Independent guard, picker/privacy
and recovery product reviews found no remaining blocking source issue. Current
source CI and the changed packaged/guarded-v2 observations remain pending.

## Required CI and actual later chooser boundary

Required [CI46072131165](https://github.com/TomasDelon/programmable-notes/actions/runs/46072131165)
passed both jobs on25041e7, including actual GTK SDK compilation of the canonical
guards, backend checks and production packaging. Its downloadable
[browser/screenshots artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/46072131165/artifacts/15233651655)
and [Linux engineering package](https://github.com/TomasDelon/programmable-notes/actions/runs/46072131165/artifacts/15233366552)
are source-bound; the package is not promoted as accepted.

The changed [installed run46072986581](https://github.com/TomasDelon/programmable-notes/actions/runs/46072986581)
reached complete startup and passed the helper's exact path echo, then failed final
chooser dismissal. Cleanup passed without force or residual processes. See
[the fixed receipt](installed-46072986581.json). Acceptance-action state was not
available: missing button, refused/error action, acknowledged action without
completion and deadline exhaustion remain distinct unknowns. No disk editing,
close, restart or recovery pass is inferred. The generic permission substring
is advisory. Its [bounded startup artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/46072986581/artifacts/15234585492)
was retained but not downloaded or visually inspected here.

The next observation records one closed acceptance state using only existing
traversal/action results, gated to failed chooser dismissal. It changes no action, label, exact echo, acknowledgement or deadline predicate.
This is diagnostic work, not a claimed runtime correction.

## Recovery discovery and modal regressions

Initial discriminating tests reproduced false empty status on loading/failure,
disabled initial focus and an actual CtrlK palette over the recovery modal.
The shared dialog now has app-bound pending/ready/failed states, explicit retry,
cached-version restoration during failure and stale-completion protection.
A strict replay test also found and fixed a retired discovery reservation before
the existing application port is invoked. Native field undo remains available;
background palette/mode/history dispatch is suppressed only while recovery renders.

The frozen full local check exited0:1014 unit,159 Chromium,9 Pages,4 disposable
local cloud cases, static checks and production build. Tooling had183 passes and
two scanner-dependent skips from an omitted scanner path. The subsequent entire
tooling rerun with the pinned scanner and final helper diagnostics passed189
cases with zero failures/skips; format/lint/types also passed. Application source
inputs were unchanged after the full browser run.
Targeted44 units and7 controlled-port Chromium journeys also passed, including
cached restoration while refresh remains failed, late resolution/rejection after
app replacement, strict replay and responsive screenshots. Independent source
review found no blocking issue. These are shared browser interactions, not GTK or
actual application restart/recovery evidence.

## Actual guarded-v2 readiness failure

[Run46072990136](https://github.com/TomasDelon/programmable-notes/actions/runs/46072990136)
on25041e7 compiled the changed fixed host and passed headless lifecycle tests and
sealed Debian13 OS admission (GTK3.24.49/WebKitGTK2.54.3). The actual Stop case
failed ready/readiness_deadline; bridge, termination, trusted host input and
cleanup passed. Pointer/keyboard and expiry did not run. The existing readiness
clock and all policy/resource limits were unchanged.

The strictly validated [fixed receipt](react-46072990136.json) retains an advisory
native_only/built snapshot without observed commit/finish, denied navigation,
load failure or renderer termination. Built is published before guard installation;
there is no separate guard-installation or publication-completion witness.
Consequently this does not identify a guard bug, startup cause or renderer crash.
No unchanged retry follows. General native React remains disabled and historical
v1 success is not relabelled as guarded-v2 acceptance.

Only fixed annotations and API metadata were inspected, not raw logs or artifacts.
Downloadable [diagnostic](https://github.com/TomasDelon/programmable-notes/actions/runs/46072990136/artifacts/15233114208)
and [OS admission](https://github.com/TomasDelon/programmable-notes/actions/runs/46072990136/artifacts/15233517801)
artifacts remain separately scoped. Next inspect empty construction versus later
load_html and define a discriminating first-load observation; do not delay guards,
loosen CSP/network/isolation or increase deadlines to obtain a pass.

## Source-bound follow-up, not yet observed natively

The action selector now searches only the unique exact-title chooser under the
owned PID, rather than every same-PID window. Negative controls reject another
window's Open button and duplicate owned roots before any action. This is a real
selector correctness fix; its relationship to the observed dismissal failure
remains unproven. Closed acceptance-state reporting remains separate and carries
no path, button contents or exception text.

The next guarded-v2 native snapshot uses exact schema2 and four additional passive
milestones: all guards/hooks installed, fixed publication requested/returned, and
actual GTK provisional Started. Existing Committed/Finished meanings, all runtime
limits and readiness/input requirements stay unchanged. Both old and new load
paths invoke the same pinned WebKit API with no base URI; no base-URL cause was
found. Tests reject old/missing/extra/mistyped fields and all-native-flags success
without actual authored readiness. Exhaustive native serialization stays within
the existing256-byte bound. These source controls do not establish GTK runtime
behavior; the next observation is still required, with no unchanged retry.

After title-scoped selection and schema2 inputs froze, the entire final tooling
suite passed191 tests with zero failures or skips using the pinned scanner.
Format/lint/types also passed. The native snapshot's six pure-std Rust tests
passed, including all512 boolean combinations across five termination labels;
Rustfmt passed. Independent source review found no blocking issue. Application
source inputs remain those of the1014-unit/159-Chromium/9-Pages/4-cloud full run;
these helper-only changes do not claim new native execution or handler denial.

## Current CI and guarded-v2 fixed helper pass

Both mandatory jobs in [CI46074514226](https://github.com/TomasDelon/programmable-notes/actions/runs/46074514226)
passed on3b92912, including schema2 host SDK compilation, native failure injection
and production packaging. Download [browser screenshots](https://github.com/TomasDelon/programmable-notes/actions/runs/46074514226/artifacts/15234598581)
and [the inspected engineering package](https://github.com/TomasDelon/programmable-notes/actions/runs/46074514226/artifacts/15234418499).
Neither artifact is promoted as an accepted product.

Actual sealed [Debian guarded-v2 run46075399735](https://github.com/TomasDelon/programmable-notes/actions/runs/46075399735)
passed fixed input/Stop and natural expiry, with cleanup. The
[validated receipt](react-46075399735.json) records actual pointer input and
keyboard acknowledgement, bridge, termination and trusted host input for Stop.
Keyboard returned in93ms within its2000ms local budget; command return is not
substituted for acknowledgement. Expiry exercises bridge and termination only.
The stack was Debian13/GTK3.24.49/WebKitGTK2.54.3. This is one changed fixed-helper
success, not repeatability, arbitrary native React, handler denial, hostile
workloads or packaged application acceptance. The previous readiness failure is
retained and its cause remains unknown. Schema2 snapshots are emitted only on
failed readiness, so no actual new flag values were inspected on this pass.

Only source-pinned fixed annotations/API metadata were inspected. The
[diagnostic artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/46075399735/artifacts/15235490053)
and [OS admission artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/46075399735/artifacts/15235145624)
were not downloaded; no raw logs, unchanged retry or policy relaxation occurred.

## Installed selector still does not find an eligible button

[Installed run46075394392](https://github.com/TomasDelon/programmable-notes/actions/runs/46075394392)
on3b92912 reached shared startup and exact path echo, then failed final chooser
dismissal with dialogAcceptState=not_found. Cleanup passed without force or
residuals. The [fixed receipt](installed-46075394392.json) does not identify
whether the owned title/button was absent, an expected native state was false,
or an accessibility read failed. No filesystem or namespace cause is inferred.
Editing/disk/close/restart/recovery still did not execute. The retained
[startup artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/46075394392/artifacts/15234638211)
was not downloaded or visually inspected in this cloud workspace.

Pinned plugin/rfd source still selects GTK SELECT_FOLDER with null acceptance
labels. Upstream GTK uses Open, and widget accessibility publishes the four
required eligibility states. Source review does not justify an alternative label
or weaker state check. The next probe records only already-observed owned-root,
button-match and native-state categories, without another walk, action or deadline.

After the paired lookup probe froze, the entire tooling suite passed194 cases
with zero failures/skips, and formatting/lint/types passed. Producer tests execute
the actual finder for all16 eligibility combinations and state-read failures;
consumer tests reject malformed/ambiguous paired frames and impossible context
combinations. Independent source review found no blocking issue. Application and
fixed React helper inputs did not change: no new full browser or guarded native
retry is implied. The next installed observation will exercise this changed
measurement; the current not-found result remains a failure.
