# Programmable Notes implementation status

Development branch: `feat/mdx-react-engine`; PR #1 remains draft. No public release
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
Changing modes preserves React state. Changing executable source restarts the
isolated runtime. Literal paragraphs with punctuation/soft line breaks, ATX and
Setext headings, and simple list items support in-place editing. Enter applies,
Shift+Enter inserts a soft break and Escape cancels. Arbitrary JSX, imports,
comments, fences, formatted/nested Markdown and mapping-style metadata stay opaque.

Patches validate the full captured source revision, parser-owned spans, text and
block context, then reparse the candidate. Unchanged source bytes, BOM, CRLF,
Unicode, markers and whitespace are preserved. CodeMirror provides per-document
undo/redo and selection histories. Preview messages cannot choose spans, change
source or authorize saves. One bounded exact-source AST avoids repeated analysis;
all validators still run. See [ADR-005](decisions/ADR-005-paragraph-editing.md),
[ADR-007](decisions/ADR-007-unified-workspace.md) and the mapping benchmark.

## Documents and recovery

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
Actual SIGKILL and ENOSPC evidence is linked below. The recovery guard explicitly
unlocks on drop so a forked child retaining a descriptor cannot cause a false busy
error. See [ADR-008](decisions/ADR-008-versioned-recovery.md).

## Verified checks and evidence

| Layer                              | Executed evidence                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current local application checks   | Formatting, ESLint, strict TypeScript, 45 unit and 23 Chromium tests passed.                                                                                                                                                             |
| Native document backend            | 35 normal Rust tests; 15 snapshot tests repeated ten times. Real tmpfs ENOSPC and four real writer SIGKILL stages passed separately.                                                                                                     |
| Mixed MDX browser behavior         | Exact import/export/reopen, stale revision rejection, opaque JSX/metadata/fences, multiline edits, undo/redo and React interaction; desktop/tablet/mobile viewports.                                                                     |
| Installed source fidelity          | Optimized Ubuntu/WebKitGTK package passed BOM/CRLF no-op save, heading/paragraph/list edits, undo/redo, mode 0640, reopen, actual React interaction and recovery. [Exact scope](security-evidence/2026-11-19-source-fidelity/README.md). |
| Automatic native recovery          | Real independent histories, retention, restart, discovery, explicit restore/save, GUI ENOSPC/pause/Resume and original Save while recovery storage was full. [Evidence](security-evidence/2026-11-19-automatic-recovery/README.md).      |
| Process crashes and lock fix       | Actual writer SIGKILL at write/fsync/rename/directory-fsync, red/green inherited-lock test, rebuilt installed-app SIGKILL/restart and exact restoration. [Evidence and hashes](security-evidence/2026-11-19-process-crashes/README.md).  |
| Native IPC and filesystem boundary | Production registered-command denial, recovery-action denial, parent DOM/storage isolation, HTTP/file denial, private profile/network and Stop. [Recovery UI evidence](security-evidence/2026-11-19-recovery-ui/README.md).              |
| Production resource stress         | CPU throttling, whole-group Stop, 512 MiB OOM, 60-second expiry, parent-death backstop and exact disk saves under attack. [Original package scope](security-evidence/2026-11-18/README.md); not rerun for every frontend commit.         |
| Hosted GitHub CI                   | Both jobs passed for `438f4b4`, run 44430453610. Run 44436506110 for `83d1e4a` was refused before jobs started: account payment/spending-limit annotation. Owner billing action is required before CI can execute again.                 |

Compilation/package inspection is not native runtime evidence. CI builds and
uploads the Debian testing package and browser demo but does not execute the
full-system desktop matrix. Each dated record retains exact package/source hashes,
failed attempts and limitations; earlier results do not certify later binaries.
The cloud's artifact re-download is blocked by HTTP 403, even for verified uploads.

New native preview windows now start unfocused. Actual packaged testing proved
continued source keyboard input and normal explicit preview keyboard interaction,
with native IPC/policy denials repeated. [Red/green evidence](security-evidence/2026-11-19-native-focus/README.md).
This is an input-focus fix, not a claim that startup reliability is resolved.

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
and rename. Actual process-kill tests do not prove storage power-loss durability.
Directory-fsync failure reporting after publication has not been fault-injected.
Snapshot capacity exhaustion requires explicit cleanup. These constrain durability
claims, not permission to continue editor-side source-preserving work.

Current-package revalidation retained a repeated blank/startup failure after
editor crash on QEMU TCG/Xvfb. CPU/Stop, memory/OOM, expiry and window-close have
individual executed successes; the whole fresh matrix is not passing. A procfs
ESRCH observer race was corrected without inferring empty groups. Strict Stop/close
checks now exclude natural-expiry attribution; both passed. Native IPC/HTTP/file
denial also passed. See [exact results and failures](security-evidence/2026-11-19-resource-repeat/README.md).

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
linked in PR #1; new hosted uploads are blocked until account billing is resolved.

Next: investigate the repeated blank/startup failures in the current native
resource matrix, retain separate containment and interactive-recovery results,
and continue core document reliability. Bounded mapping reuse and original-source
compiler navigation passed installed acceptance. Hosted runners need owner billing
action; physical GPU/Wayland compatibility can proceed independently.
