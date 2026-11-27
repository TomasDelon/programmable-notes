# Linux desktop testing package

## Shared local-vault development candidate

The current native entry mounts the shared Source/Preview workspace through its
guarded window-lifetime owner. Authorize a disposable folder using **Choose local
vault**. Edits target original files automatically; there is no manual Save
workflow in this candidate. Reselect the vault after restarting. React execution,
file lifecycle/Trash, recovery discovery and update integration remain incomplete.
Do not treat this as the accepted application or production security readiness.

Actual installed validation must use a fresh ordinary account and synthetic files:
open through the real OS folder picker; type in Source and Preview; independently
compare original-file bytes and permissions; undo/redo; close/reopen the document;
send a real desktop close request; wait for process exit and launch a fresh process;
re-authorize the vault and compare the exact file. Preserve BOM, physical line
endings, Unicode, comments and opaque JSX. Cancelled/failed writes must not silently
overwrite originals. Compilation and injected-port tests do not satisfy this gate.

The dedicated `scripts/native-shared-editor.mjs` witness targets that shared UI
using the existing external WebKit driver and PID-bound GTK picker helper. It is
not a document API or security-test feature. Its fixed receipt records executable
hash, checkpoints and cleanup, with synthetic Source/Preview screenshots. Actual
execution results are recorded separately; adding a runner is not a passing test.

After both mandatory jobs pass for the current branch head, the optional hosted
witness reuses that exact package without rebuilding the application:

```sh
gh workflow run ci.yml --ref fix/preview-markdown-input -f native_shared_run=SUCCESSFUL_CI_RUN_ID
```

Use a completed required CI run from this repository and exact branch head. The
job rejects mismatched head/tree/digest, fork runs, missing required jobs and mixed
dispatch modes before installation. It uses a fresh ordinary account on the
standard ubuntu-24.04 runner and uploads only two fixed JSON receipts and synthetic
Source/Preview PNGs as `native-shared-editor-witness`. Missing receipts, forced
app cleanup and residual app/WebKit processes are failures. Ordinary display/driver
service cleanup is separate. This is a free standard public-repository runner;
there are no paid services, public releases or update feed changes.

An editor-only hosted attempt does not require the separate preview's systemd
PrivateNetwork/cgroup admission because the shared native React adapter is disabled.
It still requires the production package policy and working WebKit sandbox, DBus,
X display and accessibility. Never bypass sandboxing or report this limited journey
as native React/network/resource-containment acceptance.

## Historical manual-save application procedures

The controls and legacy security journeys below describe the previous App/engine
regression path. They cannot be reused unchanged as acceptance of the shared UI.

Historical implementation testing guide: the owner rejected the separate native
interface in version0.1.2. These procedures reproduce that implementation; they
do not install an accepted replacement. Read the [current product contract](PRODUCT_CONTRACT.md)
and [implementation status](IMPLEMENTATION_STATUS.md) first. Preserve personal
notes and recovery data; run acceptance procedures only in disposable profiles.

Build with Node from `.nvmrc`, Rust stable and the native development packages listed in [NATIVE_SECURITY.md](NATIVE_SECURITY.md). No test feature is included:

```sh
npm ci
npm run native:package
node scripts/verify-linux-package.mjs 'src-tauri/target/release/bundle/deb/Programmable Notes_0.1.2_amd64.deb'
sudo apt install './src-tauri/target/release/bundle/deb/Programmable Notes_0.1.2_amd64.deb'
programmable-notes
```

The optimized Debian package is a testing artifact, not a public release. Installation requires AppArmor 4, bubblewrap, xdg-dbus-proxy, systemd >=252 and its desktop/runtime dependencies. Installation loads only the application's own namespace profile. Preview requires cgroup v2 delegation, a systemd user manager, functioning unprivileged namespaces and actual PrivateNetwork enforcement. Refusal is expected when those prerequisites are absent; do not disable sandboxing to make it launch.

On Ubuntu with restricted user namespaces, review the [production boundary decision](decisions/ADR-004-linux-persistence-and-production.md) and dated infrastructure procedure. A systemd executor namespace opt-in is an administrator decision outside the package. Never set a global namespace-restriction sysctl to zero to satisfy this test.

Use Open files to authorize `.mdx` and its explicitly selected source modules together. Save writes only that grant; Save As opens another native chooser. External changes cause a conflict. Preserve local edits with Save As, or explicitly Reopen source to discard them after confirmation. Files are UTF-8 and preserve CRLF bytes. Recovery draft offers bounded versioned snapshots and explicit unsaved-buffer restoration after restart. Modified buffers receive debounced automatic recovery versions; failures pause recovery with a visible message and explicit Resume. Save and Save As still control original-file writes. Read-only files remain unchanged on error.

In a disposable desktop account, test normal launch and two Counter clicks, edit/rebuild, native file open/save/reopen, cancelled pickers, external modification conflict, read-only retry, dirty window-close cancellation, clean shutdown and a fresh launch. Verify exact disk bytes, not only a UI toast. Preview expires after 60 seconds by policy; rebuild explicitly.

For headless software rendering, these supported WebKit options can be used without disabling its sandbox:

```sh
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
programmable-notes
```

They must be available to the editor process. Run an additional test without them on physical GPU/display hardware. A QEMU TCG/Xvfb pass establishes only software-rendering compatibility on the recorded stack.

Production security automation and exact evidence are linked from [NATIVE_SECURITY.md](NATIVE_SECURITY.md). Package inspection, cargo check and a successful install are not runtime security passes.

On the recorded QEMU TCG/Xvfb stack, launch without those rendering variables failed with Mesa llvmpipe thread segfaults before the editor could create a preview. The same installed binary passed the complete normal-desktop Counter/shutdown check with both variables set to 1. This is a documented compatibility limit of the tested virtual display/graphics stack; physical GPU and Wayland behavior has not been validated. Keep sandboxing enabled when reproducing or investigating it.

## Visual editing smoke test

In a disposable account, create a UTF-8 MDX fixture with CRLF line endings, a plain heading and paragraph, a simple list and adjacent JSX. Keep a byte copy of the original. Open the fixture through the installed application's file picker and choose **Visual** mode. Edit one list item. Open another source and return to the fixture, then undo and redo the edit with the source editor focused.

Save through the native editor, verify the disk bytes against a copy of the fixture with only the expected item text changed, and use **Reopen source**. Rebuild the preview and verify the edited list and continued React interactivity. Check that the preview has no editor capabilities using the production procedure in [NATIVE_SECURITY.md](NATIVE_SECURITY.md). Record the package hash, WebKitGTK version, session type and result. The Chromium export and import tests cover this source path in the browser. The native graphical round trip requires its own run.

## Packaged acceptance runner

Before the longer acceptance matrix, use a fresh disposable profile and generated
fixture environment to run `NATIVE_DISPOSABLE_PROFILE=1 npm run native:source-whitespace:test`.
It checks actual Source styles under Tauri's CSP, continued rejection of
unauthorized CSS, physical trailing ASCII space, explicit NBSP/BOM/CRLF bytes,
mode0640, native Save, Undo/Redo and a positive external-disk change/Reopen.
Its source-whitespace.json binds the executable and observer. Never normalize
source characters or relax CSP to pass it. See
[ADR 014](decisions/ADR-014-editor-style-authority.md).

Use the installed .deb in a disposable Ubuntu desktop profile with a working user systemd manager and the prerequisites in [NATIVE_SECURITY.md](NATIVE_SECURITY.md). Start the external WebKit driver and source a fresh fixture environment from `scripts/native-test-setup.mjs`. Run:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-acceptance.mjs
```

The runner requires an empty recovery slot and a fresh fixture directory. It edits a CRLF MDX file through the desktop editor, checks undo and redo, verifies exact saved bytes, cancels a dirty close, and relaunches the application. It then checks explicit recovery, collision refusal, invalid UTF-8 rejection and deletion of its own draft. Run the separate native IPC suite to verify the preview cannot call the recovery command. The browser demo is generated only by an explicit workflow dispatch with
`review_artifacts=true`; after that run succeeds, download `playable-editor-demo`
from its Artifacts section. Ordinary PR runs do not produce this demo.

## Automatic recovery after process death

Use an initially empty recovery collection in a disposable desktop profile, the
installed production package, external WebKit driver, and a fresh fixture
environment as above. No security-test build is needed. Run each case separately
with a newly generated fixture environment:

```sh
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_CRASH_RESTART=1 \
  node scripts/native-auto-recovery.mjs
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_CRASH_RESTART=1 \
  node scripts/native-auto-recovery.mjs --new-notes
```

The first case opens the same synthetic original twice. The second creates two
entirely unbound notes without selecting an original; their recovery baselines
must be null. Both type through CodeMirror, verify independent bounded histories
and complete retained source, SIGKILL the actual editor, discover versions in a
new process, explicitly restore into an unsaved buffer, cancel Save As, and then
save exact bytes to a separate chosen path. A synthetic sentinel original must
remain unchanged. Only the test-created versions are deleted, followed by a
verified clean process exit. The harness refuses a nonempty initial collection;
never run it in a personal profile. These tests verify durable completed writes,
not changes still within the debounce window or storage power loss.

## Multiple-source status and close protection

With a fresh fixture environment and empty recovery collection in a disposable
profile, run `NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-document-status.mjs`.
It opens two synthetic files through OS pickers, edits Alpha and saves/reopens Beta,
checks selected versus aggregate status, cancels an actual dirty-window close,
saves exact Alpha bytes, checks modes and exits cleanly. Its actual native
screenshots/results are in [the dated record](security-evidence/2026-11-19-document-status/README.md).
Delayed save-message races have separate mocked-transport regressions; do not call
those native security proof.

## Internal mixed physical breaks

Run `NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol`
with a fresh fixture environment and empty legacy recovery slot. It retains all
existing fidelity/recovery gates and adds actual disk/history checks for a
paragraph containing both LF and CRLF. The old installed app reproduced a real
byte change; the source-matched fixed package passed the complete run.
[Exact versions, failed startup attempt, disk diff and results](security-evidence/2026-11-19-internal-eol/README.md).

## Long-paragraph input and native renderer reliability

With a fresh fixture env, run
`NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-long-paragraph.mjs`. It checks
bounded native input geometry, internal scrolling, actual keyboard tail edits,
exact BOM/mixed-ending disk bytes, undo/redo, mode 0640, positively acknowledged
reopening and clean exit. Failures record diagnostics and clean up only the
captured owned root process. Native renderer crashes remain unresolved;
[all observations and exact package hashes](security-evidence/2026-11-19-long-inline/README.md)
distinguish those from passing browser behavior.

## Literal quotes and native input fidelity

Run `NATIVE_DISPOSABLE_PROFILE=1 python3 scripts/native-dialog-regression.py` in
the authenticated disposable desktop to verify that refused Open actions cannot
be reported as success. Then use a fresh fixture env for
`NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes`.
It retains the full existing runtime/fidelity/recovery suite and adds literal
quote no-op/full-source history and unsafe-input retention. The helper uses real
OS Unicode clipboard paste with exact input checks; WebKitWebDriver and X11 key
synthesis omitted astral characters in retained probes. No direct DOM value
setter substitutes for native editing, and no IME certification is implied.
[Failures, controls, exact package and results](security-evidence/2026-11-19-literal-quotes/README.md).

## Native connection feedback

With fresh disposable fixtures, run
`NATIVE_DISPOSABLE_PROFILE=1 npm run native:session:test`. This requires actual
counter interaction, unchanged 60-second expiry with its journal, ended/disconnected
feedback, manual rebuilding and interaction, then UI-only Stop/cgroup removal
within three seconds before natural expiry. Original bytes and mode must remain
unchanged. Direct native Stop is cleanup only, never the success oracle.
The editor's connection status measures its owned wait handle, not renderer health
or empty cgroups. See [exact results and failed controls](security-evidence/2026-11-19-session-status/README.md).

For ordinary UI Stop and explicit-retry regression use a fresh fixture with
`NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-stop-retry.mjs`. Its optional
external EIO mode requires a second administrator terminal in a disposable VM;
[exact instructions and evidence](security-evidence/2026-11-19-stop-retry/README.md)
record the first failed Stop, live group, detachment and second UI click. Never
substitute a direct cleanup RPC for successful UI Stop.

## Explicit multiline quoted paragraphs

Run `NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes --multiline-quotes`
with a fresh fixture. It retains all older gates and adds marker-free logical input,
no-op/history, rejected line-count changes, Unicode clipboard/Shift+Enter, exact
prefix/mixed-ending disk bytes and Undo/Redo. Source remains required for structure.
The external GTK driver now re-queries a transient X_GetGeometry BadDrawable race
within its original deadline. Test `native-dialog-regression.py --query-fault-once`
and `--query-fault-persistent`: one recovers; persistent query errors must still
refuse dismissal. [Actual native results and failed first final-close observation](security-evidence/2026-11-19-multiline-quotes/README.md).

## Opaque block Source navigation

Use a fresh disposable fixture and run
`NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes --multiline-quotes --source-navigation`.
This retains the complete editing/recovery suite. A rejected pending inline edit
must disable Show in Source; after Escape the trusted action focuses the opaque
JSX's original source offset. An actual keyboard space, Save, Undo/Redo and exact
disk comparison verify the caret and unchanged unrelated bytes/mode0640. No
preview message or document JSX may authorize this action or file operations.
[Exact production package, results and limits](security-evidence/2026-11-19-opaque-source-navigation/README.md).

The long-paragraph observer also accepts `--visual-cycles 5` (bounded1..20,
default1) to record repeated exact Visual/Source transitions before the same
keyboard/disk/history/reopen checks. Requested and verified phases remain distinct;
its ordinary JSON progress writes are not fsynced crash-durable storage.
[Actual five-cycle result, refusal control and unresolved crash scope](security-evidence/2026-11-19-long-transition/README.md).

## Dense visual mapping fallback

Append `--visual-budget` to the full fresh-fixture native fidelity command. Its
additional100KB bracket-heavy document must show one exact read-only source block,
no in-place edit controls, trusted Source navigation and an explicitly acknowledged
unchanged native Save with mode0640. It then runs every earlier counter/editing/
history/restart/recovery gate. The conservative visual-only structure budget is
specified in ADR005; Source/save/compiler limits remain in force. This is not a
universal parser deadline or a repair of the recorded native renderer SIGSEGV.

## Repeated filenames and independent buffers

Append `--same-names` to the full fresh-fixture fidelity command. It opens
same-named files in separate synthetic directories through actual OS choosers,
checks unique visible choices, types end/space keys in each buffer, and verifies
independent exact disk bytes/mode0640 through Save, Undo/Redo and acknowledged
Reopen. The Root DOM driver operates selection; unchanged reopen alone does not
prove external modification reloading. All prior fidelity/recovery gates follow.
[Exact package and observed results](security-evidence/2026-11-19-safe-source-selection/README.md).

The fidelity runner rejects unknown options and `--multiline-quotes` without
`--quotes` before prerequisite checks or fixture creation. A typo is an error,
never an implicit omission of the optional gate. [Live-infrastructure refusal
control and unit checks](security-evidence/2026-11-19-fidelity-options/README.md).

## Mixed-case source extensions

Append `--extension-case` to the fresh-fixture fidelity command to run the core
MDX/runtime, visual patches, exact saves, history, restart and explicit recovery
checks against `fidelity-acceptance.MdX`. This exercises the real picker filter and
entry eligibility. Auxiliary repeated-name, dense and legacy recovery fixtures
retain their existing lowercase names; this flag does not claim native multi-file
TSX import or versioned uppercase-record GUI coverage. Rust tests separately
exercise distinct `Note.MdX`/`Note.mdx` paths and mixed-case snapshot metadata;
Chromium exercises exact `Widget.TSX` imports and wrong-case import refusal.

## Mixed-case versioned automatic recovery

Run the existing automatic-recovery observer with `--extension-case` in a fresh
fixture and empty recovery collection. `NATIVE_CRASH_RESTART=1` intentionally
SIGKILLs its identity-checked owned Root after snapshots are verified, then starts
a new application process and requires explicit unsaved restoration, cancelled
Save As and exact saving to `automatic-restored.MdX`. The original
`automatic-original.MdX` must retain its bytes/mode0640; the new copy is mode0600.
Running the observer shell with `umask 0077` additionally checks that the synthetic
original's explicit chmod establishes its intended permission fixture.

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_CRASH_RESTART=1 node scripts/native-auto-recovery.mjs --extension-case
```

Use either `--extension-case`, `--new-notes` or no mode. Unknown, duplicate and
combined modes fail before driver/fixture access so an intended uppercase run
cannot silently exercise untitled notes. This observer change does not alter the
production binary or resolve the recorded primed renderer crashes.

## Native editor renderer failure

The Linux editor now reports actual WebKit renderer termination through a native
notice. Quit editor is an explicit warned force-quit; Keep window open retains
the normal native operation/dirty-close protection. Completed drafts remain
available for explicit restoration after reopening. The engine crash itself is
not fixed by this notice. A live hung renderer does not emit this termination
signal, and preview failure is a separate lifecycle.

The production regression probe requires the existing ordinary X11/WebDriver
session plus an administrator in the disposable VM to terminate only the verified
owned renderer. Copy the retained `owned-renderer-kill.py.txt` from the dated
native-editor-failure evidence to a temporary `.py` file. It currently targets
the documented Ubuntu user `ubuntu`/UID1000, checks the expected installed ELF
hash and exact Root/descendant identities, and writes a receipt as that user.
Never use personal documents or a nondisposable profile.

Create/source a fresh fixture in the ordinary user terminal. In a second VM
administrator terminal run the helper with that exact fixture directory and the
reviewed installed binary hash. Do not source a user-writable shell file as root:

```sh
sudo python3 /tmp/owned-renderer-kill.py /tmp/pn-native-REPLACE EXPECTED_ELF_SHA256
```

Then in the ordinary terminal run one case per fresh fixture:

```sh
NATIVE_DISPOSABLE_PROFILE=1 npm run native:renderer:test
# Or: crash with a real picker open; no overlapping error modal is allowed.
NATIVE_DISPOSABLE_PROFILE=1 npm run native:renderer:test -- --picker
# Or: committed mixed-case snapshots, renderer loss, Keep/dirty-close and restart.
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-auto-recovery.mjs --renderer-restart
```

The last mode is mutually exclusive with other modes and `NATIVE_CRASH_RESTART=1`;
it must not silently substitute a whole-process kill. GTK screenshot capture uses
the existing GI/Gdk X11 stack. Native code/renderer ownership, explicit operations,
actual package hashes and failed attempts are retained in the dated evidence.

## Preview-renderer death after real interaction

On a disposable full-system Ubuntu X11 profile, use a fresh fixture from
`native-test-setup.mjs`. Start the paired external administrator helper retained
in the [dated evidence](security-evidence/2026-11-19-preview-renderer-loss/README.md)
with that fixture and the exact installed ELF SHA256, then run as the ordinary
GUI user:

```sh
NATIVE_DISPOSABLE_PROFILE=1 npm run native:preview-renderer:test
```

The helper requires the owned editor/preview PID, start tick, executable/hash,
preview argv/cgroup and exactly one descendant WebKit process before SIGKILL.
It never selects a process by name alone. Both sides must run in the same guest
monotonic clock domain. This is external test administration, never an application
capability. The probe requires real Count0→1 before the kill, connection loss
within five seconds of the verified kill and before55s preview age, editor
responsiveness/no editor-failure notice, Stop/group cleanup, explicit restart,
a working fresh counter and Stop before expiry. A slow observation fails rather
than counting lifetime expiry as crash propagation. Retain the report, helper
receipt, unit journals and cleanup checks. Repeat native IPC and unchanged strict
CPU/OOM/expiry regressions after changing this lifecycle; renderer disappearance
or exit1 is not OOM proof. See ADR012 for the authority boundary.

## Actual original-document Save interruption

The standalone ordinary-user gate exercises the same production Store library
without adding application failpoints or native permissions. Use disposable
Linux x86_64 with own-child ptrace permitted and synthetic temporary files only:

```sh
cargo build --manifest-path native-documents/Cargo.toml --locked --example document-save-crash-writer
PN_SAVE_CRASH_WRITER_BINARY="$PWD/native-documents/target/debug/examples/document-save-crash-writer" timeout -k 5s 90s cargo test --manifest-path native-documents/Cargo.toml --locked --test save_crash -- --ignored --exact actual_save_crashes_preserve_complete_document_and_permissions --nocapture
```

The outer timeout is mandatory because final OS child reaping can block. Missing
ptrace is explicitly NOT RUN and cannot satisfy acceptance. Require all four
REAL_DOCUMENT_SAVE_CRASH_PASS stage lines and a successful command. The writer
accepts only an owned private synthetic directory under the configured temporary
directory. The parent checks writer PID/start/executable/hash, successful syscall
exits, actual source/destination directory descriptors and publication names.
On this glibc, renameat2(flags0) becomes renameat; both atomic operations are
recognized with the same exact fixture checks.

The gate SIGKILLs only its own traced writer after temporary write, file fsync,
publication and directory fsync. It requires complete old/new BOM/Unicode/mixed
ending bytes, mode0640, unchanged sibling and fresh Store reopen/subsequent Save.
An early write interruption need not complete write_all. Pre-publication crashes
can leave an orphan temporary in the chosen directory; it is never promoted or
arbitrarily removed by the application. Synthetic fixture cleanup is test-owned.
This is library process-interruption evidence, not packaged-GUI restart or
power-loss evidence. [Exact executed results and failed observer assumption](security-evidence/2026-11-19-document-save-crashes/README.md).

## Original Save when its filesystem is full

`npm run native:save-enospc:test` is a separate actual packaged-editor acceptance
command. It needs the external driver/disposable profile above plus an explicit
empty owned private1–4MB whole tmpfs mount in `NATIVE_SAVE_ENOSPC_DIR`. It refuses
ordinary directories, symlinks, shared subtrees and ambiguous mounts before
creating files. It checks visible real ENOSPC, retained visual input/dirty state,
exact original bytes/mode/sibling, Undo/Redo, then explicit retry/reopen after
freeing the bounded synthetic filler. Failure cleanup uses an identity-checked
pidfd; no production failure API is added. See [actual results, screenshot and
complete commands](security-evidence/2026-11-20-native-save-enospc/README.md).

Hosted compilation or a normal `npm run check` does not execute this GUI command.
It was actually executed on the recorded disposable Ubuntu/WebKitGTK desktop
against the existing optimized production ELF. Keep that binary scope distinct
from newer CI-generated packages.

## Current nonced Source editor regression

Tauri's nonced boot stylesheet can cause browsers to ignore style unsafe-inline.
CodeMirror must use the host's existing nonce for its runtime CSS; otherwise its
whitespace rules are blocked and a physical ASCII Space can become NBSP. Do not
normalize NBSP or loosen CSP to hide this failure.

On a fresh fixture/profile with the installed production package, run
`NATIVE_DISPOSABLE_PROFILE=1 npm run native:source-whitespace:test`. It requires
actual preformatted whitespace, continued denial of unauthorized CSS, physical
OS key input, exact BOM/CRLF/explicit NBSP disk bytes, Undo/Redo, mode0640, and a
positive reopen after an external change to the owned fixture. The JSON binds
observer and executable hashes. Follow with the unchanged complete fidelity,
versioned recovery, persistence and resource suites, each on a separate fresh
fixture. Allow1000s for the outer six-case controller on TCG; keep all security
and per-case deadlines unchanged. Record controller exit status as well as JSON.

[24 November exact installed candidates, screenshot, RED/GREEN source tests,
completed acceptance, retained resource/latency failures and reproducible limits](security-evidence/2026-11-24-current-package/README.md).
The [next hosted acceptance plan](plans/2026-11-24-native-hosted-acceptance.md)
is a handoff, not an already-executed GitHub native GUI job.

## Packaged shared-editor chooser observation

The current hosted editor-only journey is `scripts/native-shared-editor.mjs`,
launched by the closed standard-Ubuntu runner in `run-native-shared-editor.sh`.
Use the manual CI input native_shared_run with the successful required CI run ID
at the same repository/branch head. It verifies the production package before
installation and runs under a fresh ordinary account. This is not renderer
security acceptance, and native arbitrary React remains disabled.

The journey captures screenshot-startup.png once after actual shared-workspace
readiness and before vault authorization. The native-shared-editor-witness
artifact retains it even if a later chooser step fails. Capturing an image is not
visual inspection or proof of editing, saving or recovery.

For a folder chooser the external driver types an explicit trailing directory
separator and requires that exact field echo. GTK3 folder inline completion
appends directory separators; the unchanged file-chooser mode keeps its original
input bytes. PID/title/focus checks, actual Return/Open acknowledgement,1ms key
delay and30s deadline remain intact. This is a supported directory spelling, not
proof that a previous echo failure had that exact cause. No prefix acceptance or
native filesystem grant shortcut is permitted.

If echo still differs, the driver emits only a closed shape category from its
existing final read. The reporter projects it only for a validated failed chooser
journey and one unambiguous known marker. Do not publish paths, values, raw logs or
signed artifact URLs. Retain each failed run and distinguish a helper signature
from an application or namespace diagnosis.

The pinned rfd GTK backend passes null accept labels. GTK3.24.41 therefore uses
Open for folder selection, and Save only for its save action. The helper now uses
that exact default label rather than Select; it does not try alternative buttons.
This independently verified SDK mismatch was after the previous failed echo
stage, so it is not claimed as the cause of that earlier failure.
