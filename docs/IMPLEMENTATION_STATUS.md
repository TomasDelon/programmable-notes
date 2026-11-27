# Programmable Notes implementation status

## Owner acceptance correction — 26 November 2026

The owner rejected the separate native interface delivered in 0.1.2 as different
from the existing web application. Its passing tests and screenshots establish
the behavior implemented, not acceptance of that product change. ADR024 is now
marked rejected. [PRODUCT_CONTRACT](PRODUCT_CONTRACT.md) records the current
requirements and the deferred Split/X/hover report. Setup answers subsequently
confirmed architecture quality first, conditional code reuse, a fully local vault
with automatic writes to real files, real rename/move/Trash, Linux first and
unprivileged React inline in the same document/window. Existing web code is a
reference to assess, not something to preserve unchanged at all costs. At rejection, the
manual-save/separate-window native behavior did not satisfy that target.

The [target architecture](ARCHITECTURE_TARGET.md),
[acceptance gates](PRODUCT_ACCEPTANCE.md) and
[living migration plan](plans/unified-local-vault.md) govern subsequent work.
The read-only `npm run product:audit` reports current direct-entry divergence;
its informational exit zero is not product readiness. Setup changes documentation,
agent instructions and audit/packaging diagnostics, not application behavior.

## Experimental inline guard foundation — 27 November 2026

A candidate shares ADR040's canonical GTK denial handlers with the inline Wry
host. Empty construction, native guard/failure-hook installation and consumed
one-shot publication precede its first authored HTML load. Popup denial and
immediate download cancellation stay on the child's incognito context. Existing
Tauri publication checks, Supervisor and resource/input limits are unchanged.

The successor profile is strictly inline-react-guarded-v2, including source hashes
and compiler/driver/session/observer identities. Historical v1 results do not
establish this profile. Targeted controls and six shared Activation tests passed;
independent source review found no blocker. GTK compilation and native handler
witnesses remain unexecuted for this candidate. The about:blank navigation
exception remains explicit. See [ADR043](decisions/ADR-043-inline-native-browser-guards.md).
General native React remains disabled; no new renderer/application acceptance is
claimed.

## Explicit native recovery copies — 27 November 2026

The shared native workspace has a candidate recovery dialog for choosing a
retained version and an explicit new vault-relative filename. It reuses scoped
exclusive creation and the canonical source/history owner. Original-file autosave
remains the main saving model; no original path is inferred or overwritten with
snapshot text. Cancellation and structural-generation checks reject stale reads;
uncertain creation retains version/path/source and blocks retry.

Recovery discovery/read no longer invokes writer initialization or retention
cleanup. Existing ownership, symlink, lock and integrity checks remain. Invalid
catalog records warn without hiding valid siblings; verified read receipts bind
the exact selected version. [ADR042](decisions/ADR-042-read-only-recovery-copies.md)
records the decision and limits.

Targeted validation passed61 unit,5 controlled-native-IPC Chromium journeys and
27 Rust snapshot/vault-create cases, with one preexisting ENOSPC case not executed.
A clean eight-version test confirms reader preservation and demonstrates that
writer opening prunes the same valid inventory to five. Independent review found
no remaining Important issue. The final full check passed1004 unit,173 tooling/zero skips,157 Chromium,9 Pages
and4 local cloud cases. The full native document crate passed93 tests with seven
explicitly ignored infrastructure/worker cases, and Rust formatting passed.
Native command compilation and actual packaged recovery/restart acceptance remain
separate CI/runtime gates at this checkpoint. The older native
witness predates this candidate; arbitrary native React stays disabled.

## Current installed acceptance — 27 November 2026

Required CI on10cb8e4 passed both jobs. The corrected installed Ubuntu test passed
driver startup but failed inside the journey with a fixed operation_not_permitted
classification. Cleanup passed without force or residual processes. Its inner
action and the denial's cause remain unknown; no installed editing/close/restart
acceptance is claimed. The next measurement exposes bounded closed categories
without changing application behavior, policy, deadlines or success predicates.
The full local application suite passed984 unit,155 Chromium,9 Pages and4 local
cloud cases; after the final harness-only refinement all173 tooling controls
(zero skips) and format/lint/types reran successfully. App inputs are unchanged.
See the [chronological evidence](security-evidence/2026-11-27-shared-product/README.md).

Independent Playwright WebKit mathematics QA on10cb8e4 passed its selected suite
with three repetitions and zero retries. Exact test count was not available in
inspected job metadata. This improves browser-engine coverage without claiming
actual GTK or native-security acceptance.

## Latest native validation — 27 November 2026

Required CI on2ad5910 passed both jobs. The packaged Ubuntu run46057748343
verified and installed the production package but stopped at driver_start before
application launch. The launcher passed unsupported `--host` to tauri-driver2.1.0;
the published parser requires `--native-host`. The correction changes only that
flag. An attributed upstream HELP fixture checks the actual Bash-expanded launch
arguments and the installed version; independent review confirms loopback binding
and unchanged isolation. Installed editing and close acceptance remain pending. The frozen local full
check passed984 unit,166 tooling/zero skips,155 Chromium,9 Pages and4 local cloud
cases, plus static checks/build. Current-source CI and the installed retry remain
separate gates.

The separate sealed Debian13 run46057753337 passed fixed React pointer input,
actual keyboard acknowledgement, Stop, expiry, host input and session cleanup.
Expiry does not exercise pointer/keyboard input. This is one successful fixed
helper run, not packaged-application acceptance, repeatability or hostile resource
containment. Previous failed observations remain failures; early commit/finish
values were not published on the successful run. Native arbitrary-document React
remains disabled pending the complete product/security matrix. See the
[validated evidence](security-evidence/2026-11-27-shared-product/react-46057753337.json).

## New-document focus correction — 27 November 2026

CI onab6d3d4 passed native-check but rejected one flaky new-note focus case. A
controlled delayed-frame probe reproduced the source editor remaining inactive.
Creation now uses shared mount-owned focus with explicit dialog handoff; native
completion retains its submission-time initiator and confirmed session ownership.
Cancellation, newer controls and replacement applications retain their focus.
Source/history and all privilege boundaries remain unchanged. Targeted26 unit
and9 Chromium navigation cases passed. The final frozen full check passed984 unit,
163 tooling/zero skips,155 Chromium,9 Pages and4 local cloud cases, plus static
checks/build. The next CI/native attempts are tracked in the dated evidence.
No unchanged CI retry claims green.

## Native validation and observer corrections — 27 November 2026

Required CI on6c92742 passed both jobs. The packaged Ubuntu attempt installed the
verified production package but failed in the desktop-session launcher; the exact
substage is unknown because artifact storage returned HTTP403 and the escalation
was cancelled. No actual app editing/close journey is claimed.

The sealed Debian React attempt passed OS admission but failed readiness. Pointer,
typing and expiry were not run. Termination, trusted host input and session cleanup
passed. The new probe observes commit/finish before the unchanged initial load;
it repairs a measurement blind spot without claiming a startup fix.

The observer now prepares five fixed public helpers plus a verified immutable
copy of its executing Node tool. A fresh ordinary UID cannot traverse the checkout,
replace any checkout ancestor or write its observer/tool payload. Safe fixed
failure annotations support diagnosis without raw logs or artifact downloads.

Local application checks passed973 unit/163 tooling,153 Chromium/9 Pages/4 local
cloud cases. Final affected tooling and static checks reran after the tool-copy
change; five direct Snapshot Rust cases and Rust formatting passed. Actual GTK
compilation and corrected hosted attempts remain pending. See the
[dated evidence](security-evidence/2026-11-27-shared-product/README.md).

## Frontend close orchestration — 27 November 2026

The shared application now joins its clean editor barrier to native close
requests through a fixed, validated transport. Guard negotiation completes before
host/model construction; bindings are captured before awaits, and the epoch stays
private. One serial observer retires old replies and reports quarantined timeouts
without spawning more RPCs or retrying a commit.

The model reserves its close flight before synchronous detachment, tracks product
operations awaiting protection, gates canonical publication with existing aggregate
admission and drains recovery/hint queue tails. Only an exact acknowledged cancel
returns to editing; a possible commit remains held/uncertain. A refused IME barrier
never unmounts the editor. Lost cancellation before any detachment issued no native
commit and has no aggregate admission; the native guard still vetoes OS close.

ProductRoot handles requests once through StrictMode replay, scopes completions to
the owning application/session and remounts the same source/history only after a
proved cancellation and actual clean detachment. No source or history registry is
replaced. The legacy unguarded composition still explicitly refuses whole-app close.

The final entry integration check passed973 unit,152 tooling/zero skips,153 Chromium,
9 Pages and4 local cloud cases, plus format/lint/types/build. Expanded actual
Chromium input passed13 checkpoints, including composition refusal, cancellation
with exact undo/redo and held-commit input retirement. Close transport and storage
in this browser witness are synthetic; physical IME, actual IPC, OS window close
and native filesystem durability are not established by it.

The native development entry now selects the shared ProductRoot through a single
window-lifetime bootstrap and permanent fatal boundary. Startup preloads the
presentation, negotiates the guard and constructs exactly one model. Failure is
sticky; it cannot offer browser Reload, recreate authority or authorize a clean
close. Already dispatched commits remain uncertain. The browser reference and /engine fixture retain their routes; native cannot
fall back to either. The installer instructions now describe scoped local vault
autosave and the unavailable native React/update integrations accurately.
Installed chooser/autosave/close/restart acceptance and native inline React/security
remain pending. No corrected installer is claimed. A reviewed optional hosted witness now reuses
the exact successful CI package under a fresh ordinary account. Its real GTK
chooser, Source/Preview edits, disk bytes, OS close and fresh-process reopening
remain an execution gate; adding the workflow does not establish a pass.

## Safe-close prerequisites and CI evidence — 27 November 2026

The owning SourceEditor/RenderedEditor now expose a synchronous clean-detachment
prerequisite. It refuses unprocessed DOM, composition/end finalization, drafts,
retained text and unresolved recovery/publication, preserves immutable history,
and retires captured commands. Repeated same-stack requests cannot drain the
observer and bypass refusal. Its timing reasoning is Linux-scoped, not a mobile
or arbitrary-browser guarantee.

Rust adds three fixed editor-only guard commands with private epoch/request
identity, shared operation/dialog reservation and a one-shot OS-close permit.
Legacy callers do not negotiate automatically. Preview/child checks precede state
access, and registration probes do not activate the guard in legacy tests. The
frontend integration described above now joins detachment, aggregate flush/recovery
and exact commit/cancel acknowledgement; the unguarded legacy composition still
refuses release.
No default-entry, installer or installed-close acceptance is claimed.

The full local check passed873 unit,140 tooling/zero skips,153 Chromium,9 Pages
and4 local cloud cases, with formatting/lint/types/build. The separate shared
product Chromium journey passed nine checkpoints again. Eleven pure Rust close-state
cases and Rust formatting passed. Hosted native-check in run46003547608 passed on97d3aab, including the optimized
Linux package and production-profile headless Tauri Documents/close/update tests.
These remain unexecuted locally because this host lacks the GTK/WebKitGTK
development stack. Compilation, headless guards, real native IPC
and installed application behavior remain separate claims.

The new browser journey runs in the existing standard-Linux check job; its exact
synthetic screenshots/JSON are whitelisted in playwright-results artifacts, not
the cache directory. No extra runner, paid service or public release is introduced.
See [ADR039](decisions/ADR-039-quiescent-editor-close.md) and the updated
[close plan](plans/native-editor-close-handshake.md) for remaining wiring/gates.

## Shared product/local-vault integration — 27 November 2026

The pending ProductRoot slice extracts actual document navigation, mode/history
interaction, header, settings and command UI from WebApp. Both callers consume
those implementations. The native product adapter composes the existing
NativeWorkspace, DocumentSessions and SourceSession; it does not create another
source or history store. Logical source paths are independent of opaque session
identities. Browser storage, backup and Trash remain in the existing browser
reference; no migration, clearing or default-entry change has occurred.

Targeted development tests exercise real editor transactions, switching,
undo/redo, exact BOM/CRLF writes with injected OS ports, retained-text recovery
acknowledgement and fresh sessions on reopening. These are controller/UI tests,
not installed Linux or real OS-dialog evidence. The full integration check exited0:864 unit,133 tooling (two scanner controls
skipped in that process),153 Chromium,9 Pages and4 local cloud-storage cases,
plus format/lint/types/build. Both scanner controls then passed explicitly with
the pinned scanner. The Rust document suite passed91 with7 ignored specialized/
helper cases. See the [packet evidence](security-evidence/2026-11-27-shared-product/README.md)
for commands, failures and limits.

Whole-application native close is a concrete activation blocker: the legacy
asynchronous dirty/busy booleans cannot safely release all-session protection
against a late unapplied draft. Aggregate controller admission now holds all
session publication and captures late reports. The product adapter deliberately
refuses final release instead of reporting a false safe close. The
[close handshake design](plans/native-editor-close-handshake.md) records the
remaining native/editor barrier work. ProductRoot is not the default entry, the
rejected installer is not corrected, and native React remains unavailable.

## GTK import correction — hosted compilation verified

On cac8399, required CI's check job passed but native-check and optional
run45947395962 failed host compilation, exit101, before any guest allocation.
Independent locked-source review found that WebKitGTK2.0.2 exports WebViewExt
at crate root, not under a prelude module. Commit ad0ffca corrects the import
and surfaces early compiler failures. Required run45964406075 passed both jobs,
including actual GTK host compilation. The complete local check passed814 unit,
133 tooling/zero skips,153 Chromium,9 Pages and4 local cloud-storage cases,
plus formatting, lint, types and production build.

Optional run45964414560 compiled the fixed GTK host, passed its four native
lifecycle tests and effective Debian containment admission, and observed React
readiness, pointer and field focus. The keyboard command timed out; Stop,
trusted-host input and session cleanup passed, and expiry was not executed.
This is a failed native interaction profile, not a startup/security acceptance.
The exact scope is retained in the
[dated evidence](security-evidence/2026-11-27-native-inline-fixture/README.md).
No unchanged native runtime retry is planned.

Local isolated SDK preparation verified authenticated package metadata but
package transfer stalled. The task was stopped after hosted compilation
succeeded; no SDK image or local GTK compile completed. This optional setup is
not a prerequisite for the shared editor's integrated tests.

## Shared navigation and native-load observation — local verification

The existing web document row is now the same stateless presentation leaf used
by the controlled NativeWorkspace/DocumentSurface host. Host-owned selection,
draft admission, drag callbacks, source/history and persistence remain. Three
row and ten surface controls passed independently; ten actual Chromium
navigation/tree-drag cases passed. No replacement shell or native boot is enabled.

The next native probe adds a separate fixed construction/load/termination
property, not a startup repair. Four actual std-only Rust state controls cover
all160 states; observer/sanitizer/driver controls passed36/15/22. The optional
fixed xprop child has bounded work/cleanup and preserves the original Stop
check. Post-build missed events remain unknown; Finished is not JS success.
Host compilation needs the hosted GTK dependencies and is not claimed locally.

The first combined check passed814 unit tests but failed one of133 tooling
controls: the workflow guard oracle omitted the new optional Rust-test step.
The oracle was strengthened with the new guarded step and omitted/unlocked
negative controls; all12 routing cases then passed. The complete rerun exited0:
**814 unit,133 tooling/zero skips,153 Chromium,9 Pages,4 local cloud cases**,
plus format/lint/types/build. All functional input hashes remained unchanged;
only the observation plan received separately formatted documentation during it.
No new native probe has executed, and the earlier2/3 startup result remains failed.

## Hosted dependency-source failure and correction

Required CI on fd6f7f2 passed the browser/check job but failed native dependency
installation: an unrelated Microsoft APT source on the disposable runner
returned403. The correction selects the runner's existing Ubuntu Deb822 source
for all six dependency-installing jobs. Its signer and authentication/expiry
checks remain intact; no source is deleted, mandatory test skipped, runner
upgraded or paid service introduced. Missing expected source/signature
configuration fails closed.

Real offline APT URI planning verifies Ubuntu-only selection and demonstrates
that omitting the filter exposes unrelated sources. Four targeted controls and
independent review passed. The complete local check exited0:808 unit,133
tooling/zero skips,153 Chromium,9 Pages and4 local cloud-storage cases, plus
formatting/lint/types/production build. History/archive and staged patch scans
found zero findings. Actual hosted required run45942471204 passed both jobs on3c59a50.
Required run45943437218 then passed both jobs on190dbf0, including production
packaging; the runner dependency failure is corrected.

## Native diagnostic correction — local checks complete

The fixed guest session now sends the desktop `WM_DELETE_WINDOW` protocol to
its PID/XID-verified owned host instead of destroying the window. Source review
confirmed that destruction bypassed the GTK close handler; its actual effect
on past failed runs remains unproven. Thirty-eight session controls include a
destructive negative control and foreign/noncanonical-window refusal.

A failed React-ready observation now retains only a bounded category from the
last already-read title state, bound to the frozen observer source hash. It
adds no read, evaluation, wait or authority. Independent observer/helper/driver
controls passed31/14/21. Core acceptance, cleanup and isolation remain unchanged.

The complete frozen-functional-input check exited0:808 unit,133 tooling/zero
skips,153 Chromium,9 Pages and4 local cloud-storage cases, plus formatting,
lint, types and production build. Documentation corrections were formatted
separately. Fresh Debian run45943438955 then passed the fixed diagnostic: actual React
pointer/keyboard, Stop, trusted-host input, expiry and session cleanup. This
exercises the close correction but does not explain the earlier readiness
timeout. The predefined three-run sequence finished2/3:45943438955 and45944086321
passed,45944129836 failed the original ready deadline with last state
`native_only`. Stop/host input/session cleanup passed in all three; the third
run did not execute React input or expiry. Startup reliability fails acceptance;
no unchanged retry is planned. The next probe must distinguish native building,
loading and process termination. The actual native product and all earlier
failures remain unaccepted.

## Captured-vault directory creation and sealed validation profile

The Rust Vault now creates one real directory through its retained parent
descriptor with no overwrite or implicit parent creation. Relative-path limits
and source-path behavior are preserved; existing payloads are not opened.
Acknowledged creation plus failed sync returns a durability warning; ambiguous
publication returns uncertainty without rollback. There is no new Store state,
grant, native IPC command or UI activation. Empty-folder inventory discovery
remains separate. [Plan and scope](plans/vault-directory-creation.md).

The full native-documents suite passed **91 tests, zero failures, seven existing
ignored tests**. Eight new filesystem cases also passed independently; two private
compile-time fault controls exercise injected replies after real publication.
These controls are not actual media-failure or installed-GUI acceptance.

A sealed Debian13 profile uses an official pinned amd64 image, a closed CLI and
v2 profile/base/context binding across preparation, packing and smoke validation.
The Ubuntu default, private authentication/layout, mount-free construction and
all isolation/deadline checks remain. Bounded receipts record actual distro,
kernel and fixed package versions without hostname, paths or raw errors.
Independent source controls/review passed. Actual Debian OS-only admission
passed on fd6f7f2 in run45939785719, including packaging, boot, identity negatives
and normal shutdown; actual kernel/package identities are retained. No helper
ran in that test. The separate fixed diagnostic then passed effective namespace
admission and the embedding bridge, but timed out waiting for React readiness;
its Stop termination and trusted-host input observations passed individually.
The case and session cleanup failed, React input and expiry remain unverified.
[Exact evidence](security-evidence/2026-11-27-native-inline-fixture/native-profile-45940249067.json)
and [validation plan](plans/debian-native-validation.md).

The complete frozen-source packet check exited **0**: **808 unit, 129 tooling /
zero skips, 153 Chromium, 9 Pages and 4 local cloud-storage browser cases**,
plus formatting, lint, strict types and production build. Rust formatting passed;
all functional input hashes stayed unchanged. This verifies code and existing
browser behavior; it does not establish native UI acceptance.

## Native namespace admission blocker — 27 November 2026

Actual [profile45935023462](https://github.com/TomasDelon/programmable-notes/actions/runs/45935023462)
at **f7d6853** failed the unchanged effective network-namespace gate before
sending document input. Validated diagnostics show host start failure
`network_not_isolated`, exit1 while the observer was running, followed by
parent-induced observer interruption. This explains this run's secondary
`observer_error`; it does not retroactively diagnose the earlier runs.

Application cleanup was not confirmed and remains failed. OS admission and
normal VM shutdown passed separately. No native React pointer/keyboard, Stop,
expiry or hostile-workload test passed. The underlying OS policy cause is not
established by the notices; Ubuntu AppArmor/systemd behavior in ADR004 is context.
No security check is relaxed. [Exact evidence](security-evidence/2026-11-27-native-inline-fixture/native-profile-45935023462.json).

## Live controller projection — 27 November 2026

`workspace/useDocumentSession.ts` now observes the existing controller with a
cached React snapshot per controller/session binding. It rereads after subscribe,
retires callbacks on switch/unmount and surfaces unknown controller errors. It
adds no canonical source, history, persistence or runtime authority. The controlled
DocumentSurface host separately observes structural selection and document state.

Eight hook tests and seven surface tests cover held save completion without a
manual rerender, rapid source receipts, stale callbacks, controller replacement,
StrictMode cleanup, fresh reopened identities and retained draft/failure text.
Independent review repeated all15; the implementer's related112 tests, strict
types, lint and formatting passed. Production boot composition and native GUI
acceptance remain pending; injected writers are not real Store or installed I/O.
See [the plan](plans/document-session-observation.md) and
[ADR038](decisions/ADR-038-shared-document-surface.md).

The complete frozen-source check for the observation and diagnostic packet exited
**0**: **808 unit, 126 tooling / zero skips, 153 Chromium, 9 Pages and 4 local
cloud-storage browser cases**, plus formatting, lint, strict types and production
build. Functional input identities stayed unchanged. Both earlier native runs
remain failed; the new bounded host/exception diagnostics have not yet executed
in a guest. Local GTK compilation remains unavailable without GLib development
metadata; the required hosted job compiles the fixed host before packaging.

## Shared document surface — 27 November 2026

The existing SourceEditor and full-document preview panels are extracted into
`workspace/DocumentSurface.tsx`; WebApp composes that same leaf with its existing
model, commands, history, focus ref and explicit runtime adapters. There is no
new wrapper DOM, source/history owner, storage dependency, native invoke or
browser-runtime fallback. Native session identity stays distinct from logical
path. [ADR038](decisions/ADR-038-shared-document-surface.md).

Six focused tests exercise the real editor with existing NativeWorkspace sessions
and injected writers: exact BOM/CRLF history, delayed save origin, switching,
retired commands, retained failures, draft blocking and runtime absence. These
are controller/DOM integration controls, not installed native GUI or real Store
I/O. Independent review found no remaining blocker. The shared product root,
native runtime integration and installed autosave remain pending;
the rejected shell is not activated or promoted by this extraction.

The complete frozen-source local check exited **0**: **799 unit, 125 tooling /
zero skips, 153 Chromium, 9 Pages and 4 local cloud-storage browser cases**,
plus formatting, lint, strict types and production build. Checked functional
inputs remained unchanged through completion. This includes the shared-surface
extraction and bounded desktop-probe correction; native execution of the latter
still requires a new completed profile run. No cloud backend is activated.

## Fixed native interaction profile — 27 November 2026

The second actual [profile45932957386](https://github.com/TomasDelon/programmable-notes/actions/runs/45932957386)
at **30daf57** completed desktop startup but failed host observation with
`observer_error`; session cleanup was unproven/failed and expiry was not run.
OS admission and normal shutdown passed separately. No React input, Stop or
expiry passed. The exact cause is unknown; controlled observer interruption can
produce the same receipt after early host failure. [Retained failure](security-evidence/2026-11-27-native-inline-fixture/native-profile-45932957386.json).

The first actual [native profile45931348826](https://github.com/TomasDelon/programmable-notes/actions/runs/45931348826)
at **aeff50b** failed during desktop startup with a deadline; both Stop and expiry
cases were **not run**. The helper compiled, OS admission and normal shutdown
passed, and the session reported cleanup passed. Its exact desktop substage and
cause remain unknown. [Retained evidence](security-evidence/2026-11-27-native-inline-fixture/native-profile-45931348826.json)
distinguishes this failure from browser/control tests. Investigation reproduced
an overly broad per-probe timeout abort locally; that is not an established cause
of the original VM failure. No native application acceptance is claimed.

Required [CI45928155833](https://github.com/TomasDelon/programmable-notes/actions/runs/45928155833)
at **37e45f4** passed both mandatory jobs, including the actual locked GTK host
compilation. The updated Gdk-enabled guest recipe passed fresh
[OS-only admission45928250450](https://github.com/TomasDelon/programmable-notes/actions/runs/45928250450),
including normal QMP shutdown. No native payload ran in that admission.

The next fixed diagnostic packet adds share-free authenticated transfer, an
owned authenticated X11 session, strict native input/Stop and separate expiry
observers, and an explicit optional CI mode. Its helper embeds the exact compile
manifest; source/package checks reject stale build inputs without executing the
binary on the controller. A persistent pre-WebKit bridge avoids a transient
sentinel race. Process identities, effective policy, historical cleanup and
trusted systemd timeout attribution remain independent of spoofable React title
data. Failed or missing observations cannot become successful cases.

This is engineering test infrastructure, **not the shared product UI or native
application acceptance**. The optional mode leaves normal PR jobs and the
OS-only default intact, uploads only bounded public summaries, and never stages
controller private keys or host shares. Native interaction observations remain
unexecuted until an actual completed profile run is recorded. See the
[fixed plan](plans/native-inline-react-v1.md) and
[fixture evidence](security-evidence/2026-11-27-native-inline-fixture/README.md).

The complete local packet check exited **0**: **793 unit, 125 tooling / zero
skips, 153 Chromium, 9 Pages and 4 local cloud-storage browser cases**, plus
formatting, lint, strict types and production build. The three new wrappers
exercise **14 driver, 28 observer and 23 session controls**; the smoke wrapper
exercises51 controls and the receipt reporter10. Independent review repeated the
native control cases and found no remaining blocker. These are source/control
and browser observations, not native runtime passes. Functional file identities
were checked unchanged after the complete run.

## Native host source and successful OS admission — 27 November 2026

Actual [OS admission45923910293](https://github.com/TomasDelon/programmable-notes/actions/runs/45923910293)
at **1396e48** passed the complete fixed gate, including strict identity/refusal
brackets, no-container/logind facts and acknowledged QMP followed by normal guard
exit. Required [CI45923844209](https://github.com/TomasDelon/programmable-notes/actions/runs/45923844209)
also passed both jobs. This validates the fixture environment, **not native React,
Stop/expiry or production application security**. No native payload ran.

The fixed native host source is now prepared: current Wry GtkSocket/Plug,
pre-WebKit native sentinel, byte-bounded own-window title diagnostics, exact
fixture UID/arguments and unchanged Supervisor gating before WebKit. A trusted
build script embeds only the fixed compiler output; all 235 registry lock records
are a subset of the application lock. No arbitrary payload/path API is added.
Its actual build script compiled and generated public artifacts; the GTK host
has **not been compiled or run locally** because GLib development metadata is
absent. The existing native CI job now has a locked release compile gate sharing
its target/cache; compilation is distinct from runtime acceptance.

The local complete check exited **0**: **793 unit, 119 tooling / zero skips,
153 Chromium, 9 Pages and 4 inactive-cloud cases**, plus format/lint/types/build.
The guest recipe explicitly includes the observer's GTK typelib dependency; its
changed source requires fresh OS admission before any native payload.

## Fixed React fixture and acknowledged VM lifecycle — 27 November 2026

The fixed MDX/React counter/input fixture compiles without host evaluation and
returns public artifact/hash metadata. Its sandboxed browser control passed real
Count 0→2 clicks, explicit field focus and ordinary keyboard typing without
locator focus repair. Bounded document-title data is diagnostic only and cannot
authorize source/native operations. No native host or payload driver is activated.
[Evidence](security-evidence/2026-11-27-native-inline-fixture/README.md).

Required CI for **d8119a7** passed both jobs. Its actual OS run progressed past
SSH, then-current facts and wrong-pin/key refusal brackets, but **failed normal
shutdown**. Writing HMP bytes did not acknowledge command acceptance. The fixture
now uses bounded fixed QMP greeting/capability/powerdown acknowledgements; normal
guard exit 0 within 60 seconds remains mandatory. Admission additionally requires
actual no-container detection and active logind through fixed bounded commands.
No image/isolation/SSH/resource policy is relaxed. The new controls still require
an actual guest run. [VM evidence](security-evidence/2026-11-27-vm-provisioning/README.md).

The complete local check exited **0**: **793 unit, 114 tooling / zero skips,
153 Chromium, 9 Pages and 4 inactive-cloud browser tests**, plus formatting,
lint, strict types and build. After a buffered-reply test precision correction,
tooling passed again **114 tests / zero skips**. Source reviews found no remaining
blocker; actual OS admission and native acceptance are still pending.

## Whole-document runtime seam — 27 November 2026

Both inline and whole-document rendering now have explicit trusted adapters.
WebApp selects WebDocumentRuntime; the generic boundary defaults to unavailable
and creates no browser compiler/frame fallback. A stable wrapper retains existing
runtime selection, file/image inputs and workspace source/history ownership.
The existing iframe, mode/theme continuity, error/location withdrawal, execution
policy, Stop/rebuild and React-disable behavior are preserved. This is a dependency
seam, not a new product interface or activated native renderer.
[ADR034](decisions/ADR-034-explicit-inline-runtime-renderer.md).

The new full check exited **0**: **793 unit, 110 tooling / zero skips, 152 Chromium,
9 local Pages and 4 inactive-cloud browser tests**, plus format/lint/types/build.
After the guest configuration mode correction, tooling passed again: **110 tests,
zero skips**. Independent review found no remaining blocker in the seam.
Actual browser tests preserve full-document React state across modes and theme,
source fidelity and sandbox restrictions. Native/installed interaction remains
unverified for this packet; the separate native product is still rejected.

## Native workspace use cases — 27 November 2026

A new framework-independent `createNativeWorkspace` composes the reviewed native
vault ports, private grant binding and DocumentSessions controller. It coordinates
selection, inventory, selective opening, creation and acknowledged close without
another source/history model, UI, browser database or runtime authority. Existing
accepted-source autosave stays independent of structural operations. Late responses
keep their originating vault/session; pending text and deliberate newer selection
are retained. [ADR037](decisions/ADR-037-native-workspace-use-cases.md).

Root's targeted validation passed **37 workspace tests, 108 combined targeted
tests**. These are controller/transport-boundary results, not installed Tauri or
GUI acceptance. An additional real Store workspace scenario passed with synthetic
chooser/inventory ports and actual Store open/save/close: accepted BOM/CRLF/JSX and
invalid MDX bytes appeared on disk **before flush**, close/reopen acquired a fresh
session, and external conflict retained local text without overwriting external
bytes or changing mode0640. This case does not demonstrate real creation or GUI
interaction. At source 1ab4bb4, the complete repository check exited 0: **788 unit, 110 tooling
(zero skips), 152 Chromium, 9 local Pages and 4 inactive-cloud browser tests**,
plus formatting, lint, strict types and production build. After the final
diagnostic-only deadline correction, tooling passed again: **110 tests, zero skips**.
The original no-scheduling negative control still failed as expected.
[Reproduction and scope](security-evidence/2026-11-27-native-workspace/README.md).
No VM success is claimed here.

Lost/rejected open or create replies conservatively block new acquisitions and
vault replacement: a native grant or created file may already exist. Error-message
strings cannot prove a no-side-effect refusal. The follow-up typed protocol accepts
only resolved, exact, originating-vault/path refusals with fixed codes. Confirmed
refusals permit another request without changing owned source or grants; malformed,
foreign and rejected replies remain uncertain. The targeted workspace/adapter
tests pass **52 cases**, with **123 combined targeted cases**. Four actual Tauri
outcome tests passed in hosted native-check at 1ab4bb4; local GLib packages remain absent.
Explicit reconciliation must still resolve uncertain acquisition and failed
cleanup. No silent retry, grant disposal or file deletion is introduced. Shared
product wiring, native dirty/busy acknowledgement, recovery and installed
lifecycle/security acceptance remain separate work.

Follow-up hardening distinguishes failed non-collision rename attempts as Rust
`PublicationUncertain` instead of ordinary pre-publication I/O. Successful writes,
collision refusal and sync-warning behavior are unchanged, including Save/Save As.
The locked file-store suite passed **81 tests / 7 existing ignored**; the real
workspace harness also passed native grant revocation and reopening. A controlled
no-op close failed that new assertion as expected. Local production Tauri checking
was blocked by missing `glib-2.0.pc` (exit 101); hosted native compilation and
installed behavior remain separate observations. No typed-refusal protocol or
automatic uncertainty clearance is enabled by this lower-level classification.

## Share-free image preparation and OS admission pipeline — 27 November 2026

New permanent development commands create a public-only Docker context, assemble
a private guest image without host mounts, pin a fresh guest identity and perform
fixed SSH OS admission through the existing owned launcher. No arbitrary command
or payload API is added. Independent review corrected incomplete probe reads,
source identity filtering, process cleanup, unsafe metadata and inherited proxy
handling before any guest run. [ADR036](decisions/ADR-036-private-guest-preparation-and-os-admission.md).

Root has executed **real Docker image preparation and launch-layout validation**.
Copied kernel/initrd/image/public host-key hashes are retained; the 6 GiB image
occupies about 1.64 GiB through lossless sparse extraction. Separate daemon queries
found zero remaining labelled containers or images. Host client location and
read-only BuildX state failures were reproduced and fixed without replacing HOME,
Docker trust settings or any sandbox restriction.

Required CI for source **3533fcc** actually passed:
[run 45913220787](https://github.com/TomasDelon/programmable-notes/actions/runs/45913220787).
The separate manual OS-admission
[run 45913264160](https://github.com/TomasDelon/programmable-notes/actions/runs/45913264160)
**failed after real image assembly and launch-layout validation**. Its exact
internal failure stage/category is unverified: downloading the sanitized artifact
returned Azure Blob `Forbidden`, including the approved retry. This retrieval
blocker does not explain the guest failure. The failed run/artifact remain retained.

A strict receipt reporter now exposes only validated OS stage/
error enums and bounded return codes as check annotations on a future run. It
reports fixed failed-probe field names without their values. It prints no raw SSH,
paths, hashes or key material and does not suppress the original
smoke-step failure. It is diagnostic delivery, not a fix for the unknown cause or
retroactive evidence about the failed run. **Successful guest boot, authenticated
OS admission, normal shutdown, native application behavior and full security
acceptance remain unclaimed.** The managed host still lacks host QEMU; no unchecked
container launch was substituted. [Evidence and reproduction](security-evidence/2026-11-27-vm-provisioning/README.md).

Local complete-check exit 0: **739 unit, 101 tooling/zero skips, 152 Chromium,
9 Pages and 4 inactive-cloud browser tests passed**, plus format/lint/types/build.
New preparation/packing/admission wrappers count 29/31/28 Python controls. Staged
source scanning found zero secrets. These earlier local results and green required
CI do not relabel the failed OS-admission run or certify the current workspace/
reporter additions, which have only their separately stated targeted evidence.

Required CI for **584631f** passed both jobs in
[45916875245](https://github.com/TomasDelon/programmable-notes/actions/runs/45916875245).
Its actual OS-admission [45916879926](https://github.com/TomasDelon/programmable-notes/actions/runs/45916879926)
failed at boot/SSH timeout before native payload. The fixed check annotation proves
that category, not the startup cause. A bounded private-serial diagnostic now
exposes only advisory literal marker names/counts; 42 Python controls and 9 reporter
CLI tests passed. The subsequent run recorded startup markers as described below.
Hosted native-check then compiled the production package and passed the Tauri
test command containing all four outcome cases for source 1ab4bb4.

## Explicit inline runtime and share-free fixture guard — 26 November 2026

The shared inline editor now receives an explicit trusted renderer. WebApp supplies
the existing browser implementation; without one, React is visibly unavailable
and no browser compiler/iframe fallback is instantiated. Source/history and web
island lifecycle remain unchanged. This removes one platform dependency; the
whole-document path and shared workspace/native lifecycle integration are still
pending. [ADR034](decisions/ADR-034-explicit-inline-runtime-renderer.md).

A new versioned Linux fixture launcher constructs a fixed share-free QEMU command
and refuses unsafe configuration, overlapping/aliased paths, key/boot aliases and
additional arguments. It pins boot descriptors, never reads/inherits the transport
key, caps serial output at 16 MiB and owns bounded child cleanup across spawn
signals, overflow and deadline. Independent review found and corrected those
alias, signal and output gaps. [ADR035](decisions/ADR-035-share-free-native-fixture-launch.md).

**No guest was launched.** The 29 synthetic Python controls exercise real CLI/file
layouts and local pipes with mocked QEMU dispatch. Image freshness, public-key-only
installation, pinned SSH transfer and actual mounts/cleanup still require reviewed
end-to-end provisioning before another native run. The fixture-deviation gate stays
in force, and the old failed evidence is unchanged. No corrected installer or
native security acceptance is claimed. [Results and reproduction](security-evidence/2026-11-26-runtime-boundaries/README.md).

The required full check exited 0: **739 unit, 152 Chromium, 9 Pages and 4
inactive-cloud browser tests passed**, plus format/lint/types/build. A separate
complete tooling run with the pinned scanner passed **97 tests, zero skips**;
the check's first tooling run had 95 passes/2 scanner skips. The first full check
failed two old browser fixtures lacking explicit adapters; their assertions were
preserved and the affected group then passed 33 tests before the corrected full
check. No native Rust or GUI test was rerun for this packet.

## Native React pointer result and infrastructure deviation — 26 November 2026

One fixed, actually compiled MDX/React component mounted inside the GtkSocket/Plug
host and reached Count 0→1→2 from real OS clicks. Hooks, state and the event handler
executed in the child, not in the privileged compiler. Mounted readiness was
observed at 39.39 seconds and Count 2 at 41.72. This is standalone functional
pointer evidence, not an integrated application or general keyboard/geometry pass.

**The diagnostic violated its no-host-share plan.** A writable 9p share included
a newly generated transport private key for this disposable guest. No owner
credentials, vault or home directory were copied; no key-read/access by authored
JS was established. The guest, endpoint, key copies and backing share were removed.
The key had no owner/host/other-service enrollment. This result is explicitly
excluded from VM isolation and full security acceptance. Future provisioning must
be corrected and reviewed before another native run; the existing production
application/security configuration was not changed by this diagnostic.

Trusted Stop was requested while the exact unit was live, but the cleanup observer
aborted with ESRCH before completing the bounded identity/group predicate. Stop
cleanup and host-input acceptance remain unproven for this artifact. Later empty
cgroup/PID observations and systemd stopped messages do not repair that failure.
The exact failing read was not recorded. Existing production observer semantics
already handle process-bound ESRCH; no source was changed or retry performed.

[Evidence, scope deviation and reproducible inputs](security-evidence/2026-11-26-wry-react-pointer/README.md)
preserve exact sources, errors, live counters and screenshots. Normal child
keyboard, source-document geometry/multiple islands, full containment and actual
registered-command/filesystem GUI acceptance remain open. The shared product
and corrected installer are still not delivered.

## Private native binding and real controller I/O — 26 November 2026

The shared controller now has a small injected native save/close binding. It
copies authorized baselines, keeps grant IDs private and distinct from editor
sessions/disk revisions, refuses identity reuse and preserves ownership on failed
attachment. Only native acknowledgement removes a binding; close uncertainty
still blocks source publication. Its typed surface is not a security facade.
No production caller, IPC permission or renderer authority is activated.
[ADR033](decisions/ADR-033-private-native-session-binding.md).

Root independently reran the expanded real Store harness: controller publication
reached exact real-file bytes before flush, close/reopen used a fresh grant, and
external conflicting bytes stayed intact while newest local text was retained.
All original cases remain; the original missing-scheduling control failed at its
required disk observation. The helper's new fixed-note open uses retained Vault
scope and rejects unexpected path fields, including the Serde unit-variant edge.

Final validation: **735 unit, 96 tooling/zero skips, 152 Chromium, 9 Pages and 4
inactive-cloud tests passed**, plus format/lint/types/build; complete-check exit 0.
Root also passed **79 native document tests, zero failed, 7 existing ignored slots**
and Rust formatting. Dedicated new binding tests are 9; independent structural and
helper review found no blocker. [Exact scope and reproduction](security-evidence/2026-11-26-native-session-binding/README.md).

Actual registered-command/OS-picker acceptance and the shared UI remain pending.
This is real backend controller/file I/O, not active installed autosave. Caller
cleanup for failed attachment, native dirty/busy acknowledgement, safe explicit
retry/reconciliation and installed close/recovery still need integration. The
separate native interface remains rejected; no corrected installer is promoted.

## Accepted-source receipts and shared sessions — 26 November 2026

The existing SourceEditor/Rendered Preview now has an optional session/revision
receipt protocol. CodeMirror keeps the single raw-source/history authority; all
three visual apply paths advance from the actual synchronous host receipt before
React props echo. Same-byte edit/undo intents, stale links/IME/navigation, retired
sessions, protocol mismatches and invalid provenance refuse safely. Publication
failure retains exact attempted bytes and latches pending/close; it cannot imply
rollback or durable recovery. Existing production callers remain unchanged;
legacy alternate live/form editors are excluded from the optional protocol.
[ADR031](decisions/ADR-031-source-session-receipts.md) and
[receipt evidence](security-evidence/2026-11-26-source-witness/README.md).

A new framework-independent DocumentSessions controller composes those receipts
with the existing autosave coordinator and injected writer/close ports. It keeps
session identity, editor revision and disk CAS separate; flushes before close;
retires only after close acknowledgement; and freezes publication after uncertain
native close. Unapplied/failed text remains separate from originals. Observers
cannot cause unchanged-state subscription loops, and custom budgets only tighten
fixed limits using exactly the values validated. No native-grant bridge, browser
DB, runtime service or second editing history is added.
[ADR032](decisions/ADR-032-document-session-controller.md) and
[controller evidence](security-evidence/2026-11-26-document-sessions/README.md).

Final joint-candidate `npm run check` exited **0**: **726 unit, 96 tooling/zero
skips, 152 Chromium, 9 Pages and 4 inactive-cloud tests passed**, plus formatting,
lint, strict types and build. New dedicated coverage is 23 receipt unit tests,
two actual Chromium receipt fixtures and 27 application-session tests. Independent
review reran all 23 receipt cases and 60 session/autosave cases; the last two
budget-copy cases were separately code-reviewed and included in the final 726.
Review findings were reproduced and corrected before this final check.

These are shared editor/application foundations, **not active desktop autosave or
an accepted unified application**. Private native-grant binding and a real-file
controller harness, one shared product tree, native dirty/busy acknowledgement,
explicit retry/conflict reconciliation, durable recovery and installed acceptance
remain work. Retained failures in this controller are memory only. The current
separate native interface is still rejected; no replacement installer is promoted.

The one-case [staged native focus diagnostic](security-evidence/2026-11-26-wry-normal-focus-spike/README.md)
missed its declared 44-second script-ready window. It sent no component input and
ran no React case or retry. Verified-live pre-expiry Stop cleared eight tracked
identities in 0.83 seconds, followed by working trusted host input. The cause is
unknown; post-case pressure data does not explain startup. Normal keyboard,
React/geometry and full native security remain unproven. New VM/runtime resources
were removed; original retained infrastructure was untouched.

Hosted CI at earlier public head `32b1cd4` passed both required jobs in run
`45882998330`; dispatch-only jobs were skipped. Later pushed heads require their
own observed CI results, recorded in draft PR #9. No merge, public release or
production security readiness is implied.

## Editor-only vault service — 26 November 2026

The native host now exposes OS-authorized vault selection, metadata inventory,
selective opening and collision-safe creation through four editor-only commands.
Opaque session tokens and captured roots keep admitted work scoped during vault
replacement; cancellation preserves state and existing document grants survive.
Existing operation/dialog guards and the single Store are retained. No generic
filesystem capability or preview permission was added. No product route/controller
is activated. [ADR030](decisions/ADR-030-editor-vault-service.md) records the boundary.

Independent review found no remaining code blocker. **8 app Rust tests, 79 native
document tests (7 existing ignored slots), 25 targeted TS tests, 4 probe tooling
regressions and the actual Store/autosave harness passed.** The final complete
check passed **676 unit, 96 tooling/zero skips, 150 Chromium, 9 Pages and 4
inactive-cloud tests**, plus format/lint/types/build. Source/test identities are
captured separately from subsequent editor work. The historical native ignored
slots and dedicated checks retain their documented scope.

Actual new-command Tauri ACL denial and chooser GUI journeys remain **unexecuted**.
The local native probe exited 2/NOT RUN at its missing debug executable; independent
probes confirmed no driver/display/user bus/KVM or outer WebKitGTK development
package. Clean-image compilation is not a native runtime pass. Updated native
probes require real editor registration controls before preview denial, and
[NATIVE_SECURITY](NATIVE_SECURITY.md) retains this pre-activation gate.
[Receipt and reproduction](security-evidence/2026-11-26-native-vault-adapter/README.md).

## Creation, observable autosave and input diagnosis — 26 November 2026

Collision-safe `Store::create_vault` now creates real files through the retained
root descriptor, using the existing atomic no-replace writer. Existing or racing
destinations stay untouched; bytes, limits and grant/CAS semantics are preserved.
The coordinator now reports asynchronous persistence status through guarded
subscriptions, including safe handling of rejecting asynchronous listeners.
Neither foundation is wired into the visible application yet.

Validation at `485de38`: **79 native document tests passed, 7 existing ignored
slots; 673 unit, 92 tooling/zero skips, 150 Chromium, 9 Pages and 4 inactive-cloud
tests passed** in the final complete check. The actual Store/autosave harness
passed after the async-callback correction. Independent reviews found no remaining
blocker within these narrow changes; see [the receipt](security-evidence/2026-11-26-vault-create-observation/README.md).

A subsequent actual-Wry diagnostic observed script readiness, ordinary pointer
interaction reaching Count 2 and trusted pre-expiry Stop clearing eight tracked
identities in 0.79 seconds, followed by working host input. **Normal keyboard
focus remains unproven; forced-focus typing is diagnostic, and React was not run.**
The earlier title-based readiness attempt is inconclusive, not a JavaScript failure.
[Exact sources and observations](security-evidence/2026-11-26-wry-input-spike/README.md)
retain both attempts. No product/runtime-policy change or complete security pass
is implied. The separate native interface is still unaccepted.

## Scoped vault opening and inline diagnostic — 26 November 2026

`Store::open_vault` now opens chosen notes/modules from the retained root descriptor
without reading sibling contents or trusting cached absolute paths. The complete
batch is validated before source I/O; existing size/count/encoding/CAS and atomic
grant publication remain. Root/ancestor replacement and Vault drop cannot redirect
already granted file access. Display paths are labels and can become stale.

Validation: **9 new lazy-open tests; 71 native crate tests passed, 7 existing ignored
slots**, with original tests unchanged. Independent review ran 30 relevant native
tests and found no blocking issue. Actual Store/autosave including lost-reply CAS
passed again. Frontend inputs are unchanged from inventory's full successful check
(663 unit, 92 tooling/zero skips, 150 Chromium, 9 Pages, 4 inactive-cloud); its
relevant evidence is retained rather than repeating identical browser runs.
See [ADR027](decisions/ADR-027-scoped-vault-opening.md) and
[scoped-opening evidence](security-evidence/2026-11-26-vault-lazy-open/README.md).
No IPC or application controller was activated.

A separate disposable VM tested the actual vendored Wry with unchanged Supervisor.
Raw X11 child variants stayed black; GTK Socket/Plug plus Wry's GTK builder rendered
the fixed HTML fixture inside the trusted host at 42 seconds. **Input, React,
scroll/clipping integration, Stop and full security remain unproven.** A late Stop
observer was invalid after expiry and is not counted. Exact sources, artifact
hashes, screenshots and failed observations are in
[the Wry receipt](security-evidence/2026-11-26-wry-inline-spike/README.md).
All new VMs/containers/heavy scratch/keys were removed after evidence retention;
original retained infrastructure was untouched. This is not another application
interface or a corrected installer. The visible application is still unaccepted.

## Native vault inventory foundation — 26 November 2026

The Rust host now has a retained-directory `Vault` capability and metadata-only
inventory, separate from loaded source/file grants. One shared descriptor walker
preserves no-follow pinning, exclusions and existing depth/entry/path budgets.
Indexing 100 notes consumes no file grants or source reads; explicit opening
still enforces 32 loaded files, 500 KB per file and 8 MiB total. Root/ancestor
renames and path replacements cannot redirect an existing capability. Inventory
is observational metadata, never an atomic snapshot or write authorization.

Local validation passed: **11 new inventory tests, 62 native document tests with
7 existing ignored slots, 663 unit, 92 tooling with zero skips, 150 Chromium,
9 Pages and 4 inactive-cloud tests**, plus formatting/lint/types/build and the
real Store/autosave integration after the refactor. The ignored contention helper
is explicitly invoked by its owning test; six dedicated ptrace/ENOSPC controls
remain separate CI steps. Independent review ran 11 inventory + 10 original vault
tests unprivileged and found no blocking issue. An inode inotify positive/negative
control verifies indexing does not open/access note payloads.

No new IPC, permission, dependency or UI route was added. The existing chooser
still uses eager loading; shared navigation/lazy opening, real lifecycle/Trash,
external observation/conflict resolution and application autosave integration are
not completed. See [ADR026](decisions/ADR-026-vault-inventory.md),
[packet plan](plans/vault-inventory.md) and
[evidence](security-evidence/2026-11-26-vault-inventory/README.md).

## Shared local-vault foundation — 26 November 2026

The next packet implements a platform-independent accepted-source autosave
coordinator, without wiring it into the rejected native interface. It separates
document session identity, editor revision and disk CAS; serializes each document's
writes; coalesces pending source; retains failed text; and refuses false durability
or closing unsaved sessions. Lost acknowledgements followed by undo must still
validate disk. Released session identities cannot be reused by a later opening.
[ADR025](decisions/ADR-025-shared-autosave-coordination.md) records the scope and
remaining application integration.

The real-file harness (`npm run native:autosave:test`) bundles this coordinator
and uses the actual Rust Store in a separate synthetic process, not mocked IPC.
It observes automatic disk writes before flush, exact BOM/CRLF/Unicode/opaque JSX
bytes, coalescing, undo/redo, original permissions, atomic replacement, restart,
unknown/stale grant denial and external-conflict retention. Omitting scheduling
in its negative control must fail the disk observation. Native CI runs this
backend integration separately from GUI acceptance.

Code-fit and native feasibility investigations are in
[the shared seam map](research/2026-11-26-shared-code-fit.md) and
[the inline runtime report](research/2026-11-26-native-inline-feasibility.md).
Both whole-document and inline-island execution need platform adapters. Current
separate-window/manual-save UI behavior is unchanged; A01–A12 are not complete.
Do not offer another installer as a corrected application from this foundation.

Local validation: **663 unit, 92 tooling (zero skips on scanner-enabled rerun),
150 Chromium, 9 Pages and 4 inactive-cloud tests passed**, plus format/lint/types/
build. Native Store ordinary tests: **51 passed, 7 existing ignored, zero failed**;
the actual autosave integration passed, including post-publication lost-reply/undo
CAS refusal. The omitted-scheduling negative control exited 1 at the intended
real-file assertion. See [the foundation receipt](security-evidence/2026-11-26-shared-autosave/README.md).

A fresh disposable Ubuntu VM ran two fixed GTK/WebKit X11 embedding diagnostics.
Neither rendered before the unchanged 60-second limit; interaction/clipping and
security acceptance remain unproven. Samples of resource controllers are not
attack/Stop/cleanup passes. The guest was shut down; original retained VM state
was untouched. [Failed observations and exact probe source](security-evidence/2026-11-26-native-inline-spike/README.md)
are preserved. The next native proof must use actual vendored Wry initialization,
without increasing budgets or treating this Python diagnostic as the app.

## Autonomous-development setup validation

The owner answered all six product questions; the current contract, architecture
boundaries, acceptance matrix and living plan are reconciled. Independent review
corrected vault-authorization wording and separated restart byte persistence from
unrequested persistent undo history. Routine engineering choices remain autonomous.

Local `npm run check` passed: **638 unit tests, 92 tooling tests with zero skips,
150 Chromium cases, 9 local Pages cases and 4 inactive-cloud cases**, plus all
format/lint/TypeScript/build checks. The new AST audit has eight fixture controls;
its informational run reports different direct native/browser entries, and strict
mode exits 1 as expected. Neither entry identity nor green CI establishes product
acceptance. Testing packages now carry an unverified product classification and
the limited route report instead of implying a completed unified product.

No production application, native authority or security policy changed during
setup. Current manual-save/separate-window behavior remains a known gap. Actual
local-vault autosave, inline native rendering and installed security acceptance
are future implementation gates. Final publication/run evidence is in draft PR #9.

## Native presentation correction — 26 November 2026

Owner installation feedback showed that the first local-folder testing package
opened the historical engine interface. Native launches now use the current
product presentation with the shared Markdown/math editor, native file grants,
recovery and guarded updates. Preview is the initial mode; a supervised React
window starts only after explicitly choosing Split. Browser storage, service
workers and iframe execution are not used as a native shortcut.

[ADR024](decisions/ADR-024-native-product-presentation.md) records the boundary and
the canonical-undo/render freshness correction found by the new adapter tests.
The replacement package is version 0.1.2. The complete local check passed:
637 unit tests, 84 tooling controls, 150 Chromium cases, 9 local Pages cases and
4 inactive-cloud cases. The keyboard follow-up also passed all 638 unit tests
and the three native-entry cases in Chromium and WebKit/WPE. The [dated correction receipt](security-evidence/2026-11-26-native-presentation/README.md)
distinguishes native-entry browser interaction from unexecuted installed WebKitGTK
acceptance. The draft PR records the verified replacement artifact and hosted
results; the previous package's results do not certify this UI.

## Linux local-editor candidate — 26 November 2026

The owner paused cloud activation and prioritized an installable Linux app using
real local source files. Development adds OS-authorized bounded folder loading,
native Settings, shared literal Markdown/math Visual editing, and signed Debian
update policy with GUI PackageKit installation. React remains in its supervised
native child; no browser workspace or iframe authority is adopted.

The update channel is inactive without a production public key and authorized
signed feed. No key, public release, account or deployment was created. Native
package upload is gated on verified Cargo/Wry/frontend/Rust-runtime notices.
See [local use](LINUX_LOCAL_EDITOR.md),
[ADR023](decisions/ADR-023-linux-local-folders-and-updates.md) and
[native notices](NATIVE_NOTICES.md). The corrected native CI job passed and
produced an [installable testing download](LINUX_LOCAL_EDITOR.md#download-and-install).
The [dated receipt](security-evidence/2026-11-26-linux-local/README.md) separates
package inspection, executed recovery controls and unexecuted installed GUI /
PackageKit acceptance. Earlier results below do not certify this package.

Literal-dollar corrections preserve neighboring formatting, deliberate escapes
and canonical undo. [ADR022](decisions/ADR-022-typed-dollar-provenance.md) records
conservative history/reopen limits. The inactive cloud code/research remain
reviewable; provisioning and token requests are paused.

## Current acceptance and stabilization

[The accepted daily-use receipt](DAILY_USE_STATUS.md#current-accepted-browser-delivery)
binds the live browser application to source `52c86c4`, its real interaction
results and downloadable media. It passed **543 unit tests, 71 tooling controls,
143 Chromium cases and 9 local Pages cases**, plus 21 focused WebKit repetitions.
Hosted Chromium/Firefox/WebKit acceptance passed **411 cases /18 intentional
skips**, zero flaky/retry acceptance, and 27 local Pages cases. Both immutable and
actual public-origin acceptance passed 27 cases with exact worker/entry bytes.

The source-preserving engine handles same-document math/prose, local invalid TeX,
ordinary Markdown authoring, recovery and conservative unprivileged React reuse.
New corrections align Trash fallback selection with execution, preserve entities
and wikilinks, edit quote/list continuations through parser-owned source spans,
and anchor repeated entity/EOL edits to their actual editor transaction. See
[ADR018](decisions/ADR-018-retained-edits-and-stabilization.md),
[ADR019](decisions/ADR-019-island-dependency-witnesses.md) and
[ADR020](decisions/ADR-020-container-and-text-edit-provenance.md).

Changes after `52c86c4` concern infrastructure observation, its tests and receipts;
application/browser/build/security inputs are unchanged. Both required CI jobs
passed at observer head `632c94e`; its full local check also passed. The separate
native preflight failed before payload delivery because effective private
networking was unavailable. Its read-only metadata additionally observed disabled
child controllers in the occupied original job cgroup; device policy is unverified.
No VM or weaker policy was used.

Native exact-package GUI/security/startup/Stop and installed editor parity remain
open. Native redistribution notices are now verified for the candidate above.
Hidden-prefix boundaries and unsupported structural/IME
rewrites stay conservative in Visual editing; Source remains available. Physical
GPU/Wayland/IME and browser CPU/memory quotas are not certified. Older results
below are historical, not later-package claims.

## Engineering feedback workflow

Repository-local development skills now define a short outcome/invariants/witness/done contract, affected-engine feedback loops, explicit worker/watch ownership and milestone evidence review. [The operating protocols](AGENT_WORKFLOW.md) and [primary-source research/evaluation](research/2026-11-25-agent-feedback.md) record their scope and limits. The dependency-free evidence checker validates record consistency only; actual execution and security still require observed results. No application behavior, native authority or sandbox policy changes are part of this workflow work. Same-ref CI mode separation is implemented; hosted overlap/supersession evidence is tracked separately. Shared build reuse remains deferred.

## Unified document text and mathematical editing

The current development change replaces Preview's nested math CodeMirror view
with editable child text inside the owning ProseMirror document. Complete valid
formulas render outside the selection; invalid closed TeX remains red source;
unfinished delimiters are ordinary paragraph text with unchanged focus geometry.
The metadata title is passive text, renamed with the existing explicit command.
Source provenance prevents generated whitespace entities leaking through literal
math reclassification and maps exact carets across merged spans.

One canonical history and source authority remain. A mathematical IME operation
keeps its same-view text through final native input; pending state synchronously
guards navigation. If editing becomes unavailable, only that existing operation
finishes its provisional DOM read, then its whole attempt is retained without a
canonical write and the surface becomes read-only. Source revisions, opaque JSX,
filesystem/IPC grants, disabled history and recovery guards remain mandatory.

The final complete fresh local `npm run check` passed: **428 unit tests /48 files,
14 tooling (zero skips), 128 Chromium browser cases and 8 Pages-policy cases**,
plus formatting, lint, strict TypeScript and production build. Pages fingerprint:
`ba3b18a42210f424`, 77 assets. The seven focused real-browser math/navigation
cases also passed with zero retries. Failed checkpoints and their causes remain
in the dated verification record.

The final gate used matching Playwright Chromium 1255 (Chrome for Testing
159.0.8154.6). A separate system-Chromium 156 run produced one absent security
probe report; it remains recorded, not accepted or silently retried. The unchanged
probe passed 20/20 matching-browser repetitions and the full matching gate.
An unchanged system-browser control also passed 20/20; neither control establishes
the cause of the earlier missing report.
The hosted candidate also exposed Firefox paragraph LF normalization and a real
Chromium stale-native-selection write into a heading; both have deterministic
regressions. The corrected browser scenario passed 20/20 repetitions, zero retries.

The broader repeated matrix caught a real WebKit internal-caret failure even
after the first candidate passed. Actual local WebKit reproduced the stationary
caret in all three runs; bounded observation ruled out a merely early assertion.
Selection-driven node decorations now reveal source before native caret
synchronization. The exact case then passed three runs with no retries; all seven WebKit cases
also passed three repetitions (**21/21**). Native diagnostics show immediately
correct caret positions. Collapsed/Shift ordering regressions pass. Full final-head acceptance remains
required; earlier successful runs do not substitute for it.

Hosted clean-checkout CI, repeated Chromium/Firefox/WebKit diagnostics and actual
Cloudflare candidate/principal-origin acceptance remain required before promotion.
Their final head, results and downloadable reports are tracked in
[draft PR #9](https://github.com/TomasDelon/programmable-notes/pull/9), avoiding
repeated documentation-only builds. A source push is not deployment proof.

See [ADR 017](decisions/ADR-017-unified-mathematical-text.md),
[design](superpowers/specs/2026-11-25-unified-math-text.md), and
[verification record](recovery/2026-11-25-unified-math-text.md).
The earlier nested-input approach and its independent math draft history below
are historical and superseded for the web Preview. Native `/engine` retains its
existing interface; no new packaged-native GUI or physical-keyboard evidence is
claimed by this web change.

## Incomplete mathematical delimiters: implementation and verification

Unpaired dollars now remain editable literal text, without red feedback, math
notices or a global editing barrier. Completed invalid TeX remains raw/red and
correctable. ADR 016 records the shared source/compiler/link-index parser, exact
raw-span patches, JSX preservation and editor-owned first-dollar mapping.

The initial implementation passed a clean-checkout mandatory CI and repeated
three-browser workflow at `eb03c8d`, plus actual Cloudflare candidate acceptance.
It was not promoted while a speculative-parser work-limit follow-up was completed.
That follow-up bounds repeated unfinished fences and possible JSX-tag lookahead;
exhaustion retains exact source and the existing Source fallback, with no write or
sandbox relaxation.

The final native-caret repair passed the complete fresh local gate: **385 unit
tests /46 files, 14 tooling (zero skips), 118 Chromium and 8 Pages-policy cases**,
including format/lint/typecheck/build. Pages fingerprint: `48651d19f9e47b91`, 77 assets.
Its two production source-navigation cases passed 40 matching-Chromium repetitions.

A deterministic real-editor regression reproduced CodeMirror holding the requested
position while the native caret stayed at zero. Source navigation now rechecks the
owned target after focus and explicitly synchronizes the native selection through
public DOM APIs. Source snapshots, history and filesystem authority remain intact.
Home/End similarly synchronizes only a proven single-visual-line text selection.
The adversarial analysis-budget regression verifies its genuine resource refusal
and exact recovery; ordinary unmatched/invalid mathematics still requires no notices.

The old product failed one of forty hosted source repetitions. Development-only
StrictMode replay focus loss was separately confirmed on its unchanged baseline;
layout experiments were reverted and that issue remains a follow-up. Details and
all genuine failed checkpoints are retained in the verification record.

The final head's clean-checkout, hosted acceptance and deployment state are
tracked in [draft PR #9](https://github.com/TomasDelon/programmable-notes/pull/9)
and its checks. Promotion requires mandatory CI, repeated browser diagnostics and
actual candidate/principal-origin acceptance; a pushed source commit is not proof
of deployment. Older deployment hashes below describe historical checkpoints.
Details, including genuine failed checkpoints and downloadable reports, are in the
[verification record](recovery/2026-11-25-core-plugins.md).

## Core plugins, hidden setup and recoverable LaTeX

The web workspace now has static bundled Mathematics and React core modules with
validated, persistent Settings toggles. No community loader or optional security
kernel is introduced. Imports/exports/comments are invisible by default; the
Workspace setting can show escaped ordinary code alongside live JSX. Setup labels
and source-edit buttons are removed. Hidden code is protected against visual
Backspace and selection replacement, including canonical undo/redo.

Invalid TeX within valid math delimiters saves as red raw source without notices
or blocking other text. Correction clears feedback and renders on exit. Unsafe
boundaries/stale revisions still retain explicit recovery. This supersedes the
older invalid-LaTeX refusal described below. The actual native `/engine` interface
is unchanged. See [ADR 015](decisions/ADR-015-core-plugins-and-preview-source.md)
and the [verification record](recovery/2026-11-25-core-plugins.md).
The final local full gate passed **359 unit /45 files, 14 tooling (zero skips),
116 Chromium and 6 Pages-policy cases**, including format/lint/type/build.
After cross-browser selection corrections, the full local gate passed again
with the same counts. Pages fingerprint: `2924a01765a41438`, 77 assets. CI now
refuses flaky acceptance even if a retry passes. The first hosted candidate
passed 18 actual-origin cases but failed repeated selection diagnostics and was
not promoted. A later repeat still found Firefox Undo and WebKit input-commit failures, so
promotion remains blocked. Explicit beforeinput/input-only ownership has now
passed a fresh local gate: **361 unit, 14 tooling, 116 Chromium and 7 Pages-policy**;
Pages fingerprint `2df713071e4a8c04`. Focused hosted diagnostics are pending and
the deployed app remains `7628521`. The next focused run isolated Firefox
composition Undo; forwarding host composition phases now passes **363 unit,
14 tooling, 116 Chromium and 7 Pages-policy cases** locally (Pages fingerprint
`a02f5abbd04aa496`). The focused hosted three-browser repeated workflow passed at `2cd021d`
([45658934348](https://github.com/TomasDelon/programmable-notes/actions/runs/45658934348));
mandatory check/native-check also passed ([45657518609](https://github.com/TomasDelon/programmable-notes/actions/runs/45657518609)).
The missing-delimiter follow-up still needs its own final acceptance. Full failed/passed checkpoints are in the verification record.

## Caret-based mathematics

Web Preview mathematical editing now uses an unframed source surface at the
caret, with no input/textarea or Done/Cancel controls. Arrow entry/exit, ordinary
display newlines, local draft undo/redo and canonical source history retain the
existing revision and lossless-patch guards. Hover does not activate equations.
The same original source reappears on entry, including dollar delimiters.
Multiline CRLF/CR comparison and composition completion/focus ordering were
corrected. Stale/unsafe-mapping drafts remain protected and memory-only until resolved;
ordinary TeX errors now follow ADR 015.
The native `/engine` interface and all preview authority boundaries are unchanged.
The corrected application commit `7628521` is deployed at
https://programmable-notes.pages.dev/. Local checks passed 346 unit, 14 tooling,
107 Chromium and 5 Pages-policy cases. Current check/native-check CI passed;
zero-retry repeated three-browser diagnostics passed 123 cases (30 explicit
Chrome-only IME skips), and actual candidate/principal-origin checks each passed
15/15. Downloadable desktop/mobile and source/rendered screenshots are linked
in the [verification record](recovery/2026-11-25-caret-math.md).
Physical Android keyboards and native GUI runtime were not tested here.

## Preview keyboard authoring repair

The corrected web beta is deployed at https://programmable-notes.pages.dev/
(application commit `854f304`, draft PR #9). Final local gates passed 343 unit,
14 tooling and 101 Chromium cases. Current zero-retry three-browser diagnostics
passed 63/63, including real app updates; actual production URL acceptance passed
12/12. Check/native-check CI passed. Downloadable screenshots and exact failed/
passed checkpoints are in the [verification log](recovery/2026-11-24-preview-markdown-input.md).
Native runtime acceptance remains separate.

The web Preview removes its formatting toolbar and uses Markdown input, keyboard
shortcuts and trusted palette commands. Prefix typing, empty nested lists,
trailing spaces and bold input are covered by regression tests. Compact animated
notifications replace inline editor errors. Explicit recovery retains the first
refused raw candidate, blocks later mutations, and offers an exact-byte download.
Source revision checks, semantic reparsing and JSX opacity remain mandatory.
Measured excessive horizontal whitespace uses the existing Source-only work
budget; refused visual candidates retain an explicit exact-source recovery path.
See the [verification log](recovery/2026-11-24-preview-markdown-input.md) and
[ADR 013](decisions/ADR-013-rendered-document-editing.md).

## Permanent web testing preparation

A separate Cloudflare preparation branch adds a static Pages build target,
transport/cache metadata and real browser acceptance under those headers.
See the [owner setup guide](CLOUDFLARE_PAGES.md). The owner has connected the
Pages testing project. The repository fixes its published directory to `dist`
through Pages configuration; no backend or privileged services are introduced.
Executed deployment results and failed checkpoints are recorded in the
[verification log](recovery/2026-11-24-cloudflare-preparation.md) and
[draft PR #8](https://github.com/TomasDelon/programmable-notes/pull/8).
Hosting adds no synchronization: each origin is a separate local browser
workspace. The custom domain's DNS/TLS still requires separate verification.
Local full checks passed 287 unit, 14 tooling and 90 Chromium cases, including
Pages canonical-redirect/offline regression coverage. See the
[verification record](recovery/2026-11-24-cloudflare-preparation.md).
Native package/runtime acceptance remains separate and is not certified by web
hosting. The app UI, document authority and native capabilities are unchanged.

## Current web application

The integrated browser beta remains on `main`. Draft PR #6 adds a two-mode
web selector: **Source** retains canonical CodeMirror transactions, while
**Preview** edits rendered Markdown directly, including formatting, lists,
tasks, tables, attachments and in-place dollar-delimited LaTeX. The separate
Live web mode is removed and old `live` preferences migrate to Preview.
The native `/engine` retains its separate existing interface.
See [ADR 013](decisions/ADR-013-rendered-document-editing.md) for the source
preservation contract, isolated React islands, full-document runtime and the
cross-tab persistence fix. This does not add cross-device synchronization or
change the native security model.

The resumed 23 November audit found and corrected unfinished equation loss through
document-wide deletion and stale Preview after equation cancellation. Nearby
document changes are now refused while a math field remains open; an existing
link URL is retained when submission is blocked. The canonical source guard and
React sandbox are unchanged. See the
[resumed audit and verification](recovery/2026-11-23-resumed-engineering-audit.md)
for actual results, infrastructure failures and the ordered continuation roadmap.

The independent continuation adds [opt-in hosted three-browser QA](BROWSER_QA.md)
and a real pending-field/focus-read race regression. A native startup diagnostic
also now reuses the bounded cleanup observer, correcting premature refusal and
late/repopulated-group acceptance in the test harness. See the
[startup observer review](recovery/2026-11-23-startup-observer-review.md).

Current-package disposable Linux testing then reproduced a source-input defect:
Tauri's style nonce blocked CodeMirror's unnonced runtime CSS, collapsing spaces.
SourceEditor now supplies the existing authorized nonce through CodeMirror's
supported facet; CSP directives and preview privileges remain unchanged. Browser
and installed native regression tests passed exact ASCII/NBSP, BOM/CRLF,
save/history/reopen and continued unauthorized-style refusal. The unchanged full
fidelity/recovery suite passed on a fresh retry; the preceding intermittent
React preview availability failure remains retained. Exact results are recorded in the [24 November package evidence](security-evidence/2026-11-24-current-package/README.md).
The installed production IPC, file persistence and separate versioned-recovery
suites also passed. The complete current resource run exited1: five cases passed,
CPU Stop attribution overlapped earliest expiry. Separate CPU and heap edit/save runs exceeded
the5s budget despite exact saved bytes. Missing OCR initially blocked heap
observation; existing workspace tools resolved it without a package download,
and the real marker then passed. The complete heap run still failed latency. No security/timing assertion was relaxed. These results
are not a renderer-crash fix or full native security acceptance.

## Historical native implementation record

The following record describes the earlier `feat/mdx-react-engine` work. PR #1
was subsequently included in the integrated browser beta. Historical evidence
and limitations below remain scoped to their original builds.

Original status: development branch `feat/mdx-react-engine`; PR #1 draft. No public release
or production security-readiness claim. The specifications/research in
`docs/handoff` are supporting material; executable evidence below defines verified
behavior. The provisional design ZIP is reference only and has not replaced the
application or its persistence model. See [progress log](AGENT_PROGRESS.md) for the
next executable action and individual commits.

## Current editing behavior

Real unsaved MDX/React runs from a memory-backed compiler with JSX, local imports,
hooks, state and events. Explicitly chosen TSX/JS modules and pinned clsx work;
inline TypeScript in MDX and runtime package installation do not. The preview is
untrusted execution, not a Markdown sanitizer.

Source mode shows CodeMirror; Split shows source and interactive React output;
Visual shows the editor-owned Markdown surface and collapsed opaque blocks.
Changing modes preserves React state. Modified inline text is guarded until
Enter applies or Escape cancels: document switching/replacement and saving cannot
discard it or claim it was saved. It participates in native/browser dirty-close
protection. If source editing invalidates its mapping, the pending value remains
accessible for copying/cancellation and stale patches still fail. It is memory-only
until applied; automatic recovery continues storing actual document source.
[Browser/native red-green evidence](security-evidence/2026-11-19-pending-inline/README.md).
Changing modes preserves React state. Applying source changes rebuilds the artifact and restarts the
isolated runtime. Literal paragraphs with punctuation/soft line breaks, ATX and
Setext headings, simple list items and literal quoted paragraphs support in-place editing. Enter applies,
Shift+Enter inserts a soft break and Escape cancels. Arbitrary JSX, imports,
comments, fences, formatted/nested Markdown and mapping-style metadata stay opaque. Quote markers,
indentation and endings are preserved byte-for-byte. Explicit multiline quoted
paragraphs keep their line count; lazy/nested/formatted/JSX quotes and structural
changes stay in Source. [Browser/installed quote, disk/history/restart and driver
red-green evidence](security-evidence/2026-11-19-literal-quotes/README.md).

Explicit multiline quote logical text excludes continuation markup while its raw
patch span retains every prefix. Exact context/candidate checks and no-op/history
preservation passed actual browser export/reopen and installed native disk/restart/
recovery acceptance. [ADR010](decisions/ADR-010-multiline-quote-editing.md) and
[exact scope, initial failure and driver regression controls](security-evidence/2026-11-19-multiline-quotes/README.md).

Expanded opaque blocks now offer **Show in Source** on the trusted surface. It
focuses the exact original offset without modifying source or restarting React.
Captured document/revision checks and pending/busy guards prevent stale navigation
or discarded inline text. Preview messages cannot authorize navigation or edits.
[Browser and installed acceptance](security-evidence/2026-11-19-opaque-source-navigation/README.md).

Patches validate the full captured source revision, parser-owned spans, text and
block context, then reparse the candidate. Ordinary leading-BOM documents now map at their original offsets without
indenting imports/JSX or changing compilation. [Red/green and installed validation](security-evidence/2026-11-19-leading-bom/README.md).
Untouched spans, BOM, Unicode, markers and whitespace are preserved.
Internal mixed LF/CRLF breaks are now retained for ordinary visual edits and
normalization-only input adds no undo step. Changed-count edits preserve raw equal
prefix/suffix; ambiguous mixed middles/repeated-line alignments are refused with
pending text retained for Source. Some safe periodic edits are conservatively
unsupported. [Real browser and installed disk red/green](security-evidence/2026-11-19-internal-eol/README.md). CodeMirror provides per-document
undo/redo and selection histories. Preview messages cannot choose spans, change
source or authorize saves. One bounded exact-source AST avoids repeated analysis;
all validators still run. See [ADR-005](decisions/ADR-005-paragraph-editing.md),
[ADR-007](decisions/ADR-007-unified-workspace.md) and the mapping benchmark.

Long literal inputs now use a bounded scrollable viewport without truncating text.
Actual Chromium typing/export/history passed. Installed native geometry/disk/history
and a debugger-observed strong reopen passed, but two other runs suffered WebKit
renderer SIGSEGV while entering Visual. This remains an unresolved native
reliability blocker; no parser/security change was guessed from the crashes.
[Exact failures, diagnostics and package scope](security-evidence/2026-11-19-long-inline/README.md).

A bounded installed-app diagnostic now records requested/completed long-document
mode transitions before its unchanged editing/disk/history/reopen gates. One
ordinary and one five-transition current-package run passed; an intentional
missing-observation control retained failure/phase/count and unchanged original
bytes after cleanup. These do not explain or fix earlier renderer crashes.
[Exact scope](security-evidence/2026-11-19-long-transition/README.md).

Visual analysis now conservatively falls back to one exact escaped read-only
source block above4096 raw square-bracket/greater-than markers or the existing
500000UTF16-unit bound. Source navigation remains trusted; patches/candidate growth
above the budget fail closed. This targets measured dense-syntax stalls: one actual
100KB browser probe improved5074ms→68ms transition/2944ms→24ms heartbeat gap. These
are single observations, not universal parser deadlines or native crash repairs.
Normal source/compiler/save limits still apply.86unit/34browser and the full
new installed editing/recovery suite passed. A real directory-write refusal
verified the new Save acknowledgment oracle cannot infer success from unchanged
bytes. [Budget, exact artifacts and limitations](security-evidence/2026-11-19-visual-analysis-budget/README.md).

## Native session feedback

Compilation feedback is separate from the native wait connection. The editor
reports starting, connected, ended/disconnected or unknown, with explicit manual
rebuild guidance. One editor-only argument-free read retains supervisor cleanup
ownership; preview capabilities remain empty. Serial polling is bounded across
rebuilds and never restarts execution automatically. A connected wait handle does
not prove renderer health or an empty cgroup. Installed actual counter/expiry/
manual rebuild/UI-only Stop and unchanged-file checks passed on the recorded
production binary. Startup/rebuild failures remain preserved and unresolved.
See [ADR009](decisions/ADR-009-native-session-feedback.md) and
[exact scope and failed controls](security-evidence/2026-11-19-session-status/README.md).

Native Stop now waits for native confirmation and reports failure. When an artifact
has already been removed, another trusted Stop click issues a fresh serialized
retry. Newer requests/rebuilds supersede old completion/error feedback; there are
no automatic retries or expanded permissions. Actual injected native exec failure
then UI retry/cgroup cleanup before expiry passed on the recorded production ELF.
[Stop recovery, race tests and retained failures](security-evidence/2026-11-19-stop-retry/README.md).

Same-named sources now have distinct numbered choices. Numbers are current list
positions; underlying keys, native grants and histories are unchanged. Selecting
a closed/unknown/inherited key is rejected against the latest workspace without
changing source/entry. Real browser and installed separate-directory file edits,
independent exact saves/history/reopen plus the full native recovery/IPC suites
passed. [90 unit /35 browser checks and exact package scope](security-evidence/2026-11-19-safe-source-selection/README.md).

## Original-document Save interruption

A production-library integration test now kills an owned native writer after
actual temporary write, file fsync, atomic publication and parent-directory
fsync. Ordinary Ubuntu UID1000 execution passed all four stages with exact
old/new BOM/Unicode/mixed-ending bytes, mode0640, untouched sibling, fresh Store
reopen and subsequent explicit Save. Writer identity/syscall/descriptor/name
receipts and the initial rename-observer failure are retained. A pre-publication
crash can leave an orphan temporary; the application neither promotes nor
arbitrarily scavenges it. This is process interruption, not power loss or a new
packaged-GUI restart test. CI adds a mandatory timeout and explicit stage checks;
public hosted CI was subsequently restored (see PUBLIC_READINESS.md).114unit/37browser and ordinary Rust39document/
7policy passed; the new ignored integration case was manually executed separately.
[Exact results and limits](security-evidence/2026-11-19-document-save-crashes/README.md).

## Browser import budgets

Browser Open preflights the existing workspace and selection metadata before
reading files:32 total files,500KB each,8MiB total UTF8 bytes. Strict UTF8/BOM and
latest-workspace validation still run after reads. Rejections preserve dirty
buffers/history; no partial import or native authority change. Exact-limit and
async growth regressions plus real zero-read/refusal/recovery/export passed.
[83unit/33browser full-check evidence and scope](security-evidence/2026-11-19-browser-import-budget/README.md).

## Documents and recovery

Selected dirty/save status is independent of other buffers. Dirty siblings have
a separate count; aggregate native/browser close protection still includes every
buffer and unapplied visual input. Notices capture the exact source and document
key, so delayed saves cannot label another or newer source saved. A selected
file's durability warning remains available with dirty siblings. Real native
picker/save/reopen/dirty-close and browser transport regressions passed
([results and screenshots](security-evidence/2026-11-19-document-status/README.md)).

Focus the editor workspace and use Ctrl/Cmd+S to save; Shift requests native
Save As. Synthetic/repeated/composing input and pending/busy states cannot save.
Browser exact-export/delayed-read and real Linux Ctrl/Shift chooser cases passed
([keyboard evidence](security-evidence/2026-11-19-keyboard-save/README.md)).

New note creates a separate empty unsaved MDX buffer in Source mode without a
file grant. It preserves queued input, sibling source and histories, and respects
the 32-document limit. Save As remains explicit. [Browser/native acceptance](security-evidence/2026-11-19-new-notes/README.md)
passed cancellation, exact saving and reopening without changing the original.

Native paths come only from editor-side OS pickers. Commands use unpredictable
grants and expected revisions, never renderer-supplied authorization paths.
Atomic saves preserve exact UTF-8, modes and POSIX ACLs. Save As cancellation,
read-only failures, conflicting external changes and edits during asynchronous
operations retain source. Unselected neighboring files are not imported.

Native recovery uses private immutable checksummed/schema-versioned records,
parent revisions and no original paths or reusable grants. Automatic snapshots
cover all dirty buffers after a two-second idle debounce, with one bounded batch
in flight. Independent buffer/session lineages prevent same-path buffers from
pruning one another. Errors visibly pause automatic recovery; Resume is explicit.
Limits are five versions per lineage, 64 records and 8 MiB globally. At capacity,
refuse writes rather than discard another lineage. Failed publication never
removes an earlier version. Corrupt records remain visible; valid older versions
can be restored. Legacy migration preserves the old source.

Restore always opens a separate dirty buffer without an original-file grant.
Saving to disk remains an explicit action. Browser drafts are separately opt-in.
The installed production app also passed automatic recovery of two entirely
unbound new notes across actual SIGKILL/restart: null baselines, independent
retention, exact source, explicit restoration, cancelled Save As and exact saving
without modifying the sentinel original. The original-file variant passed again.
[Package hashes, raw results and reproduction](security-evidence/2026-11-19-unbound-recovery/README.md).
Actual SIGKILL and ENOSPC evidence is linked below. The recovery guard explicitly
unlocks on drop so a forked child retaining a descriptor cannot cause a false busy
error. See [ADR-008](decisions/ADR-008-versioned-recovery.md).

## Verified checks and evidence

| Layer                              | Executed evidence                                                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current local application checks   | Formatting, ESLint, strict TypeScript, 98 unit and 37 Chromium tests passed, including extension-only import mismatch and simultaneous case-distinct TSX modules.                                                                            |
| Native document backend            | 39 ordinary Rust tests passed; four infrastructure-only cases are excluded from that count. Earlier 15 snapshot tests were repeated ten times. Real tmpfs ENOSPC and four real writer SIGKILL stages passed separately.                      |
| Mixed MDX browser behavior         | Exact import/export/reopen, stale revision rejection, opaque JSX/metadata/fences, multiline edits, undo/redo and React interaction; desktop/tablet/mobile viewports.                                                                         |
| Installed source fidelity          | Optimized Ubuntu/WebKitGTK package passed BOM/CRLF no-op save, heading/paragraph/list edits, undo/redo, mode 0640, reopen, actual React interaction and recovery. [Exact scope](security-evidence/2026-11-19-source-fidelity/README.md).     |
| Automatic native recovery          | Real independent histories, retention, restart, discovery, explicit restore/save, GUI ENOSPC/pause/Resume and original Save while recovery storage was full. [Evidence](security-evidence/2026-11-19-automatic-recovery/README.md).          |
| Process crashes and lock fix       | Actual writer SIGKILL at write/fsync/rename/directory-fsync, red/green inherited-lock test, rebuilt installed-app SIGKILL/restart and exact restoration. [Evidence and hashes](security-evidence/2026-11-19-process-crashes/README.md).      |
| Native IPC and filesystem boundary | Production registered-command denial, recovery-action denial, parent DOM/storage isolation, HTTP/file denial, private profile/network and Stop. [Recovery UI evidence](security-evidence/2026-11-19-recovery-ui/README.md).                  |
| Production resource stress         | CPU throttling, whole-group Stop, 512 MiB OOM, 60-second expiry, parent-death backstop and exact disk saves under attack. [Original package scope](security-evidence/2026-11-18/README.md); not rerun for every frontend commit.             |
| Hosted GitHub CI                   | Both jobs actually passed for public head `8a8e44c`, run 44694104501, including native package inspection. Earlier private-account billing refusals remain historical evidence. Revised workflow results are tracked in PUBLIC_READINESS.md. |

Compilation/package inspection is not native runtime evidence. CI builds and
uploads the Debian testing package and browser demo but does not execute the
full-system desktop matrix. Each dated record retains exact package/source hashes,
failed attempts and limitations; earlier results do not certify later binaries.
Historical Actions artifact re-download returned HTTP 403 in this cloud. The
PR-accessible [portable browser review ZIP](demo/README.md) has dated exact-hash
validation evidence, including source-blob download checks. It includes
a working offline-capable build, responsive screenshots and a recorded walkthrough;
no public release or site was published.

New native preview windows now start unfocused. Actual packaged testing proved
continued source keyboard input and normal explicit preview keyboard interaction,
with native IPC/policy denials repeated. [Red/green evidence](security-evidence/2026-11-19-native-focus/README.md).
This is an input-focus fix, not a claim that startup reliability is resolved.

## Native download boundary

The preview now explicitly rejects native WebKit downloads. Pinned Wry defaults
permit a filesystem destination independently of IPC capabilities. A separate
real native callback harness passed an exact-write default positive control and
cancellation with the shared production callback; omission of that callback was
correctly rejected by the test. The installed optimized package also passed
ordinary supervised MDX automatic/clicked data/Blob attempts with no canaries,
unchanged effective limits/private networking and automation disabled. Strict
Stop cleanup finished at 51.29 seconds, before earliest expiry; registered-command,
recovery, DOM/storage, HTTP/file and Counter regressions passed. This is defense
in depth, not a demonstrated iframe escape or a new full resource-matrix pass.
[Exact hashes, failed probes and reproduction](security-evidence/2026-11-19-native-downloads/README.md).

## Native editor termination feedback

Actual Linux editor-renderer death now produces a native recovery notice with
warned Quit / Keep actions. Only the trusted editor installs this callback;
preview capabilities and lifecycle remain unchanged. Renderer loss invalidates
stale frontend busy hints while actual Rust operations and dirty confirmation
remain. The notice uses the same native dialog guard as file pickers, waits for
them to finish and holds the guard through dismissal. No automatic reload,
restoration or document write is added.

The old blank/stale-close failure and an intermediate concurrent-modal bug were
reproduced with real owned-renderer kills. On the new optimized installed ELF
837d2ab9…, native Quit, crash during an open picker, Keep/dirty-close cancellation,
actual restart, explicit version restoration and exact separate Save As passed.
Independent IPC, filesystem hashes/modes and cleanup passed. Full packaged editing/fidelity acceptance with all seven flags also passed; this
is not an underlying engine-crash fix. Exact scope is recorded in the [dated evidence](security-evidence/2026-11-19-native-editor-failure/README.md), with an actual GTK screenshot.
[ADR011](decisions/ADR-011-native-editor-termination.md) explains the boundary.
This is recovery feedback, not a JSC fix or a live-hang watchdog.

## Security boundary and release blockers

The browser preview uses an opaque origin, sandbox and hash CSP. Linux uses a
separate capability-denied preview process, clean environment, verified private
networking, fixed cgroup limits and mandatory WebKit sandboxing via a small Wry
fork. Production child automation and inspection remain disabled. WebDriver probes
change WebKit networking, so normal production namespace/seccomp observations are
recorded separately. No security check was relaxed to pass tests.

The threat model covers untrusted document JavaScript, not arbitrary compromised
native code. Session DBus, authenticated X11, devices, same-user malicious native
writers and WebKit vulnerabilities remain risks. Before broad distribution,
establish a supported distribution-specific namespace policy, review/maintain the
Wry fork and repeat the production isolation matrix on each supported stack.
Hardened Ubuntu requires reviewed administrator namespace configuration; the
package installs only its own AppArmor profile and no global executor opt-in.
A confirmed capability/filesystem/network escape or missing enforced resource
limit is a security stop.

Recovery can lag within debounce or unfinished writes. Checksums detect corruption,
not hostile same-user rewriting. Advisory locks coordinate cooperating instances;
a noncooperating same-user writer can race the final original-file conflict check
and rename. Actual separate-process contention now also verifies busy denial, one successor,
stale conflicts, exact prior/winner bytes and valid retry in five-round cloud and
Ubuntu VM runs ([evidence](security-evidence/2026-11-19-process-contention/README.md)).
Actual process-kill tests do not prove storage power-loss durability.
External own-child syscall injection now verifies file-fsync failure,
publication-directory uncertainty and retention-directory warnings without
production failpoints. Prior bytes, exact restoration and explicit retry passed
in the disposable Ubuntu VM; this is error-path validation, not real disk failure
or power-loss evidence. [Executed scope](security-evidence/2026-11-19-sync-errors/README.md).
Snapshot capacity exhaustion requires explicit cleanup. These constrain durability
claims, not permission to continue editor-side source-preserving work.

The latest complete installed six-case matrix exited1: CPU/Stop, original full-fill
allocation OOM, expiry, editor SIGKILL/recovery and window-close passed. The added
resident-page workload expired with528297984-byte peak/zero swap before its required
OOM cause, so that case failed. Both memory cases now require trusted structured
systemd sender/unit/result evidence, not broad OOM text. Original OOM peaked at
512MiB with a manager kill notification59.339s after Started; all11recorded units
were empty/gone and known identities terminal. A preceding selected page workload
on the identical ELF/artifact did OOM and recover; it does not repair the failed
full run. Prior original-memory expiry and intermittent blank failures remain
retained, without an inferred timing fix. [Exact scope, failed gate and reproduction](security-evidence/2026-11-19-memory-pages/README.md).

A separate current-binary startup diagnostic measured a JavaScript-free static
button at 40.54 s and real React Counter at 43.88 s under identical production
limits. Both were heavily CPU-throttled; actual interaction and Stop before expiry
passed. This narrows common emulated startup cost but does not resolve the earlier
editor-crash blank case. [Raw comparison and failed harness attempt](security-evidence/2026-11-19-startup-probe/README.md).

The intermittent browser first-counter click has no established cause. A bounded
investigation passed100 warm-context and20 cold-browser clicks across system156
and matching Playwright159; a deliberate missing-input control retained failure
after a second real click worked. Read-only event/mutation/navigation diagnostics
are now reproducible, with exact probe versions and original failed traces retained.
This is not a production fix or evidence of a React reset.
[Executed scope](security-evidence/2026-11-19-counter-input/README.md).

Software rendering passed normal and stricter AppArmor desktop tests. Default
llvmpipe failed on QEMU/Xvfb; physical GPU, Wayland, IME and other distributions
remain untested compatibility targets. They do not block independent editor work.
Non-Linux native persistence/resource backends fail closed. Mixed line-ending bytes are preserved in tested transactions, but CodeMirror
gutter line counts can differ from physical lines. Full runtime exception
source-map composition remains deferred; compiler locations support explicit original-source navigation with captured
revision/offset validation ([executed evidence](security-evidence/2026-11-19-source-navigation/README.md)). The
fixed 60-second preview lifetime still requires explicit rebuilding for longer
sessions. No custom grammar, AI, marketplace, telemetry or synchronization work.

## Resume and reproduce

Run `npm ci`, then `npm run check` (runtime generation is an explicit prerequisite).
Use [Linux testing](LINUX_DESKTOP_TESTING.md) and [security contract](NATIVE_SECURITY.md)
for disposable native validation. Browser demo: build, start preview on loopback
port 4188, then `node scripts/demo-editor.mjs`; CI's `playable-editor-demo` contains
the runnable build, screenshots, WebM and exact saved MDX. An existing artifact is
linked in PR #1. Public hosted CI now executes successfully. New browser artifacts
are opt-in workflow dispatches with `review_artifacts`; native installer uploads
are paused pending complete native redistribution notices.

The current [downloadable review](demo/README.md) binds engine 54c41a7 and includes
Source navigation, dense read-only fallback, multiline quote edits, exact exports,
structural refusal, desktop/tablet/mobile screenshots and a paced 27.64-second walkthrough. Its archive and clean-extracted browser/media
checks are independent of native acceptance.

Native fidelity flags now fail closed on unknown options before prerequisites
or fixture creation ([live refusal evidence](security-evidence/2026-11-19-fidelity-options/README.md)).
ASCII case variants of the existing six source extensions now share consistent
entry, compiler-loader, visual/draft and native-file handling. Original paths,
module identities, filenames and source bytes retain exact case; wrong-case
imports still fail. Unsupported browser formats reject before reading. Native
snapshot names and picker filters follow the same narrow format policy.
[Verification and native failure evidence](security-evidence/2026-11-19-source-extension-case/README.md).

The new production package ff7d4bab… passed actual `.MdX` picker/React/unchanged
save/mode checks, then two fresh-fixture full fidelity commands failed at the same heading Undo.
WebKitWebProcess logged an internal DFG-to-FTL tier-up diagnostic and disappeared
while the Root survived. Original bytes/mode were independently preserved. The
bounded repeat retained the same internal diagnostic; no JIT or sandbox setting was changed,
and no general native crash fix is claimed. The same binary passed the full lowercase control and the shorter uppercase
editing/history/save/restart/recovery command. Both failed primed combinations
remain failures. The diagnostic code hash matches a CodeMirror gutter-loop
candidate; pure default-JSC calls did not reproduce it. No exclusive cause or
identity with the earlier SIGSEGV is established.

Independent IPC passed on this exact ELF; the complete malicious-pressure
matrix was not repeated. The same production ELF now also passed automatic versioned recovery for
mixed-case names across actual SIGKILL/restart: independent histories/retention,
exact metadata baselines and bytes, explicit unsaved restoration, cancelled Save As
and acknowledged exact saving to a new `.MdX` copy with mode0600. The original
retained mode0640 and its exact source. [Executed scope and strict option controls](security-evidence/2026-11-19-uppercase-auto-recovery/README.md).
A fresh local clone of a40ea74 passed offline locked npm installation and the
ordinary full check from an absent runtime:96 unit/37 Chromium tests, plus39
ordinary document Rust tests and7 policy tests in new targets. The frontend
bundle matches the production builder exactly and tracked state remained clean.
Wry verification passed with its explicit pinned offline archive after a DNS
failure; no online verification pass is claimed. [Clean-checkout evidence](security-evidence/2026-11-19-clean-recovery-checkout/README.md).
The namespace-correct debugger diagnostic did not reproduce the older failure;
its instrumented pass is not a crash fix. Native termination feedback and actual
restart recovery now passed on ELF837d2ab9… with the full fidelity suite.
Interactive preview-renderer loss exposed a native connection that outlived the
dead renderer. A Linux child-only native signal now exits its own preview process;
the editor retains Stop/manual rebuild authority and gains no child capability.
On optimized ELFa6d00cbb…, the bounded actual counter/kill/restart/Stop probe
passed with unchanged pre-expiry deadlines and Root responsiveness. The first
corrected attempt missed its conservative Stop reservation and remains a failure.
Native IPC denial and99unit/37browser checks passed. The unchanged full pressure
matrix on this ELF passed CPU Stop, memory-fill with trustedOOM, expiry and
window-close; it failed resident-page descendant-exit observation and editor-crash
startup before the kill point. The first has actual trustedOOM evidence but is
not a whole-case pass; its precise process teardown remains under investigation.
The original full-matrix result remains four passed/two failed. Separate fresh
targeted runs then passed resident-page strictOOM/recovery (the live-PID failure
was not reproduced) and actual editor-SIGKILL/independent expiry/new editor/Counter2.
These do not relabel the original failures or establish repeatability.
The external cleanup observer now requires both group emptiness and historical
identity termination within one original absolute monotonic deadline, with final
confirmation and retained live-location observations.15 controlled regressions
and114unit/37browser checks passed. A fresh current-ELF six-case native run then
passed all cases, including both strictOOM workloads, actual editorSIGKILL,
expiry/Stop/windowclose and real Counter2 recovery. Independent96-identity/Root/
unit cleanup passed. This changes the original instantaneous observer semantics;
no policy or application authority changed, and the earlier failed results stay
failed. No matching-live observation recurred in this run, so no original kernel
teardown cause or absence of temporary escape is inferred.
[Bounded observer evidence](security-evidence/2026-11-19-bounded-cleanup/README.md). Healthy connection
still does not prove arbitrary React responsiveness. [ADR012](decisions/ADR-012-preview-renderer-termination.md)
and [exact observations](security-evidence/2026-11-19-preview-renderer-loss/README.md).
Keep the unresolved engine/resource failures explicit. The portable review is remote-verified
and pinned to its earlier engine 54c41a7. A cancellable visual-analysis worker remains a future stronger bound.
At that checkpoint, native blank/startup, renderer SIGSEGV and the failed
memory-pressure matrix remained open. The later 24 November installed-package
run passed both memory workloads but failed CPU Stop attribution against the
fixed expiry; its complete command failed. See [the current native contract](NATIVE_SECURITY.md)
for exact binary scope. Public standard hosted CI has since passed; physical
GPU/Wayland compatibility can proceed independently.
No production security readiness is claimed.

## Public repository remediation (2026-11-20)

Public visibility is the intentional owner baseline. Current private-source pointer
withheld, future commits use GitHub noreply, complete browser/font notices added,
and redacted history/ZIP credential scanning is mandatory. Historical metadata,
project license and supplied-material rights remain owner decisions. See
[scope, actual hosted results and residual risks](PUBLIC_READINESS.md). Native
installer redistribution notices are incomplete, so automatic installer upload is
paused while mandatory production build/inspection continue. No runtime security
restriction or document behavior was changed for this remediation.

## Original Save sync-error gate (2026-11-20)

A new external own-child Linux tracer tests actual Store Save handling when a
successful file or post-publication directory fsync return is substituted with
EIO. Exact original/new bytes, mode0640, unchanged sibling, no handled-error orphan,
public error/new revision with durable=false, fresh reopen and explicit re-save
all passed. This tests error reporting after successful kernel fsync, not physical
media failure or power loss. The old helper's missing reporting mode failed first;
no production Store correction was necessary. Late-terminal cleanup now records
reaping before rejecting a missed deadline, with an ordinary regression. The
four-stage real SIGKILL gate passed again. [Evidence and reproduction](security-evidence/2026-11-20-document-save-sync-errors/README.md).

## Original Save real ENOSPC gate (2026-11-20)

On a dedicated2MB tmpfs in the restored disposable UbuntuVM, an unprivileged
standalone Store test verified real Save ENOSPC, exact original bytes/mode0640,
sibling preservation, temporary cleanup, reuse of the existing grant/revision
after freeing space, and fresh exact reopen. Explicit mountinfo guards refuse
shared subtree bind mounts; that refusal also passed in the actual VM. CI now
runs this alongside recovery ENOSPC. No production behavior changed. [Evidence](security-evidence/2026-11-20-document-save-enospc/README.md).

## Resumed production-desktop acceptance (2026-11-20)

The restored Ubuntu/WebKitGTK VM passed twenty Visual transitions and a separate
fresh-profile full seven-option fidelity command, including actual process
restart, explicit recovery, invalid draft refusal and original preservation.
Independent postcheck verified all four exact file hashes/modes, both Roots gone
and recovery cleanup. This used the recorded a6d00cbb production ELF, not a new
notice-bearing installer. [Scope, first harness prerequisite failure and results](security-evidence/2026-11-20-native-resume/README.md).
Both hosted jobs actually passed on367626f/run44699786688 including new original
Save EIO and real ENOSPC gates. Later documentation-only heads need their own
workflow result; consult PR #1. Historical intermittent crashes remain unresolved.

## Packaged original Save disk-full recovery (2026-11-20)

Actual optimized Ubuntu GUI acceptance now verifies visible real Save ENOSPC with
original bytes/mode/sibling unchanged, edited Visual text and dirty state retained,
working Undo/Redo, explicit retry after freeing space, exact reopen and clean exit.
A new external-only command reproduces this on a guarded tiny tmpfs; its bounded
filler and pidfd cleanup cannot grant authority to document code. The first input
observer failed before storage filling and is retained alongside the corrected
exact-value wait and successful command. [Evidence and screenshot](security-evidence/2026-11-20-native-save-enospc/README.md).
No application behavior, isolation, resource limit or UI design changed.
