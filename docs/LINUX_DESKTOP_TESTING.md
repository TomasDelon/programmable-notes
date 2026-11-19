# Linux desktop testing package

Build with Node from `.nvmrc`, Rust stable and the native development packages listed in [NATIVE_SECURITY.md](NATIVE_SECURITY.md). No test feature is included:

```sh
npm ci
npm run native:package
node scripts/verify-linux-package.mjs 'src-tauri/target/release/bundle/deb/Programmable Notes_0.1.0_amd64.deb'
sudo apt install './src-tauri/target/release/bundle/deb/Programmable Notes_0.1.0_amd64.deb'
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

Use the installed .deb in a disposable Ubuntu desktop profile with a working user systemd manager and the prerequisites in [NATIVE_SECURITY.md](NATIVE_SECURITY.md). Start the external WebKit driver and source a fresh fixture environment from `scripts/native-test-setup.mjs`. Run:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-acceptance.mjs
```

The runner requires an empty recovery slot and a fresh fixture directory. It edits a CRLF MDX file through the desktop editor, checks undo and redo, verifies exact saved bytes, cancels a dirty close, and relaunches the application. It then checks explicit recovery, collision refusal, invalid UTF-8 rejection and deletion of its own draft. Run the separate native IPC suite to verify the preview cannot call the recovery command. The browser demo is available as `playable-editor-demo` under Artifacts on successful PR workflow runs.

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
