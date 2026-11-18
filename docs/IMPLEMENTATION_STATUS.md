# Programmable Notes implementation status

Development branch: `feat/mdx-react-engine`, draft PR #1. Milestone 3 builds on `0275bdc`. The original handoff under `docs/handoff` remains supporting specifications/research, not proof that every proposed technique works. The unified Source/Split/Visual workspace supports literal paragraphs (including soft multiline text), ATX and Setext headings, and simple lists. Custom Markdown grammar, AI, marketplace and Git synchronization remain deferred.

## Working foundation

Users edit real unsaved MDX in CodeMirror, including JSX, React imports, hooks, state and events. A browser worker compiles memory-backed files; the preview executes the result in an opaque-origin sandbox with a hash CSP. Explicitly selected TSX/JS modules and pinned clsx are supported without runtime package installation. Inline TypeScript syntax in MDX is unsupported; use imported TSX.

The Linux desktop uses a separate unprivileged preview process, not another privileged editor webview. The editor alone can authorize local source files through native pickers, save atomically, Save As, reopen, close sources and confirm dirty-window closure. File commands accept unpredictable grants/revisions, never renderer-supplied authorization paths. Unselected neighbors are not imported automatically. Conflicts, read-only errors, cancellation and edits during asynchronous operations preserve source. UTF-8, Unicode, CRLF, mode and POSIX ACL preservation have real disk evidence.

Milestone 3 adds an optimized Debian testing package without test features. Actual Ubuntu/WebKitGTK testing targets the installed production executable. [Desktop installation](LINUX_DESKTOP_TESTING.md), [production boundary and persistence decision](decisions/ADR-004-linux-persistence-and-production.md), and [exact dated evidence](security-evidence/2026-11-18/README.md) record artifact hashes, source inputs, failures, successful repeats and precise scope. The earlier [2026-11-17 record](security-evidence/2026-11-17/README.md) remains historical debug/test-feature evidence.

## Security findings addressed

- systemd can silently skip PrivateNetwork yet start successfully. The supervisor now verifies the actual network namespace, same non-root UID and NoNewPrivs before delivering author HTML, alongside effective cgroup files. Strict namespace and missing-CPU-controller negative controls reject before payload delivery.
- WebKitGTK normal and ephemeral contexts defaulted to process sandbox disabled. The documented two-file Wry fork now explicitly requires sandboxing before creating a view and rejects a sandbox-disable environment. Original upstream source/hash comparison and actual WebProcess namespace/seccomp checks are retained.
- Inherited manager environment could enable inspection, injection or weaker sandbox behavior. Services use a clean graphical/locale allowlist, explicit pre-exec injection-variable removal, automation false, core limit zero and umask 0077. A real preload-constructor/secret/inspector poison test passed.
- Late compiler initialization and stale editor/close callbacks could start outdated work or discard later input. Demonstrated failing regressions now pass; newer source is retained independently of saved snapshots and released grants.

WebDriver itself deliberately enables inspector networking in WebKit. Automated direct IPC probes therefore do not prove ordinary production network sandboxing. Actual supervised children have inspector absent/automation false and pass the unchanged strict observer; non-automated desktop results are recorded separately.

## Executed checks

| Layer                                   | Result                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, ESLint, strict TypeScript       | Passed in `npm run check`                                                                                                                                                                    |
| Vitest                                  | 20 tests passed across 8 files                                                                                                                                                               |
| Chromium production browser integration | 5 tests passed: real MDX/TSX/hooks, unsaved editing, errors, source fidelity, Stop and negative security probes                                                                              |
| Additional bounded Chromium gates       | Navigation blocked; host responsive during observed iframe loop; no portable browser quota claim                                                                                             |
| Rust policy                             | 6 tests passed                                                                                                                                                                               |
| Rust native documents                   | 18 real-filesystem tests passed, also repeated as guest UID 1000                                                                                                                             |
| Rust native app                         | Embedded-root/navigation regression passed                                                                                                                                                   |
| Production native IPC/WebKit            | Registered-command denial, profile separation, Counter at `Count: 2`, parent DOM/storage denial, actual network/file connect-src violations passed                                           |
| Production native filesystem/lifecycle  | Real dialogs, atomic bytes/metadata, permission/conflict recovery, dirty-close cancellation, clean shutdown and fresh-process reopen passed                                                  |
| Production resource cases               | CPU throttling, whole-group Stop, 512 MiB OOM, fixed 60-second expiry, editor SIGKILL backstop and window-close recovery passed individually with known-PID cleanup and interactive rebuilds |
| Native edit/save under attacks          | Exact actual disk save passed during CPU loop (3,502 ms) and confirmed growing heap (4,675 ms, 239→382 MiB), followed by unsaved interactive rebuilds                                        |
| Optimized package                       | Built, inspected and installed; exact runtime/compatibility scope in dated evidence                                                                                                          |
| Hosted GitHub CI                        | Latest status unavailable: REST/GraphQL API calls return Forbidden; no pass inferred from local checks                                                                                       |

The initial combined resource invocation failed its observer during cgroup removal after three cases passed. ENODEV now causes an indeterminate-sample retry, never an empty-group inference; the crash and close cases passed targeted repeats. The growing-heap accessibility marker was visibly rendered but unavailable to the busy AX bridge. A PID-bound exact screenshot/OCR observer passed without changing the fixture or resource policy. Failed attempts remain retained.

CI now checks the native file store and app tests, Wry source provenance and optimized package inspection, and uploads a temporary Debian testing artifact. It does not run or claim the full-system desktop matrix. Reproduce native checks with [NATIVE_SECURITY.md](NATIVE_SECURITY.md); ordinary cargo check is compilation evidence only.

## Limits and next milestone

The current security scope is untrusted document JavaScript inside the recorded browser/OS boundaries, not arbitrary compromised-native-code containment. Session DBus, authenticated X11, browser/native vulnerabilities, devices and deliberate cgroup escape after native compromise remain risks. Hardened Ubuntu requires an explicitly reviewed administrator namespace policy for systemd; the package installs only its own application profile and never changes global restrictions or installs the executor opt-in.

Physical GPU, Wayland and other distributions remain untested. Software rendering passed normal desktop checks, also with the additional AppArmor unconfined restriction enabled. Default rendering failed on the headless QEMU/Xvfb Mesa stack with llvmpipe segfaults; use the documented supported rendering variables. Exact outcomes and coverage are in the dated record. Non-Linux resource/persistence backends fail closed. The fixed 60-second preview lifetime is prototype policy and requires explicit rebuild for longer sessions.

There is no autosave/crash draft journal. A noncooperating same-user filesystem writer can race the final conflict check/rename; directory-fsync uncertainty is reported after commit but that failure branch has not been fault-injected. Full source-map composition, source-located runtime diagnostics and independent per-file undo histories remain deferred.

Recommended next milestone: target Ubuntu desktop acceptance on physical GPU and Wayland, tighter distribution-specific namespace integration, and reproducible native runtime CI. Keep PR #1 draft; no merge/public release/readiness change. Visual editing remains deferred.

## Visual editing and release gates

Once the latest PR checks pass, begin Spike C as an editor-side prototype on the validated configurations. Physical GPU and Wayland coverage can proceed independently. Start with a uniquely mapped plain Markdown paragraph in a mixed MDX fixture. Derive the range from the current source, validate the document revision before applying a patch, and require explicit editor interaction. Preview messages cannot authorize source edits or saves. Keep JSX opaque and require tests for byte-identical no-ops, unchanged adjacent source, stale or ambiguous range rejection, and exact undo/redo.

Before broad distribution with untrusted preview enabled, establish a supported deployment policy for the systemd namespace prerequisite and repeat the production isolation tests on the packaged build for each supported configuration. Treat any confirmed capability escape, unauthorized disk access, network escape, or loss of enforced resource limits as a security stop. The recorded matrix demonstrated denial and containment on the tested stack. Session DBus, X11 and native WebKit compromise remain limits of the threat model. The current browser probes do not establish hard browser CPU or memory bounds.

Default graphics crashing in QEMU/Xvfb is a compatibility failure. Affected configurations need a validated rendering option before they are supported. Physical GPU and Wayland coverage affects desktop support claims. Missing draft recovery, untested directory-fsync failure reporting and the documented concurrent-writer race affect durability claims. These limits do not gate a source-patching prototype within the editor.

## Development log

- Verified that draft PR #1 pointed to `35ff1f9` at the start of this turn. Both GitHub GraphQL and the commit-specific REST check-runs endpoint returned Forbidden, including after an approved retry. The hosted gate for Spike C remains unverified.
- Advanced the independent source fidelity work. A Chromium regression reproduced silent UTF-8 BOM loss on browser import and download. The browser now retains the BOM and rejects malformed UTF-8 before updating the workspace, matching the native store's encoding policy.
- Resume by checking Actions for `35ff1f9` and the current PR head. Once verified green, implement the paragraph-only editor patch transaction and its mixed-source, stale-revision, and undo/redo tests before widening the supported syntax. For crash recovery, investigate separate draft snapshots that can be inspected and explicitly restored without writing through existing file grants.

### First visual editing slice

Both GitHub Actions jobs passed for `5ecd906`. The earlier run for `35ff1f9` was cancelled. The editor now offers a separate rendered paragraph panel with source-checked CodeMirror patches. Chromium verified editing, exact downloaded bytes, undo/redo and stale-source rejection alongside the existing runtime and security tests. A focused unit test additionally checks no-op edits and rejection of unsupported syntax.

Next, extend the browser regression to reopen a downloaded mixed document and add narrowly mapped ATX heading support. Lists need separate handling for indentation and continuation lines. See [ADR-005](decisions/ADR-005-paragraph-editing.md).

### ATX headings and browser round trip

Both hosted checks passed at `47206c1`. The Markdown panel now supports plain ATX heading text. The browser regression saves the edited bytes, reloads the app, imports the downloaded file and checks the rendered heading. The unit tests cover marker preservation, Setext exclusion and rejection of stale ranges.

### Simple list items

The Markdown panel now renders and edits simple ordered and unordered list items while preserving their markers, spacing and original numbering. The Chromium test checks the rebuilt preview and exact downloaded bytes. The unit test also checks nested-list exclusion and rejects a replacement that would introduce nested syntax. Local verification passed 23 unit and nine Chromium tests.

### Compiler diagnostics and recovery design

Compiler failures now report the imported source file and its line and column when the compiler provides a location. Chromium verified a TSX error on the second line of an imported module and successful preview recovery after correcting the module. The full check passed 23 unit and ten Chromium tests. Runtime exception source mapping is still pending.

[ADR-006](decisions/ADR-006-draft-recovery.md) proposes separating recoverable drafts from source writes, with explicit restoration and no persisted native grants.

### Undo history across source switches

The editor keeps a separate in-memory history and selection for each open source. On switching back, it restores the cached history only when its document bytes match the active buffer. Closed documents are removed from the cache. The mixed MDX Chromium test now switches to a different document before undoing and redoing the visual patch, and asserts exact exported bytes both times. Local verification passed 23 unit and ten Chromium tests.

The next runtime verification is the native visual edit, save and reopen path on the packaged app. Native draft recovery remains a proposed follow-up.

### Preview recovery and edit authority

A failed compiler WASM download used to leave a rejected promise cached until reload. A Chromium regression reproduced this by aborting the request, then clearing the fault and asking the editor to rebuild. The editor now drops failed initialization and clears its obsolete timeout, allowing a rebuild without discarding editor state. The security regression also sends a forged edit from the real preview frame and compares the subsequently exported source byte-for-byte.

### Explicit browser draft recovery

The browser can keep one local copy of a Markdown source and restore it into a new unsaved buffer after reload. Existing documents and native grants are untouched. The controls explain where the bytes are stored and provide explicit deletion. This is a manual snapshot. Native recovery and automatic snapshots remain open under ADR-006.

### Opt-in browser draft updates

Automatic updates can be enabled for one open Markdown document. They write a separate browser snapshot after a short pause in typing, and pause while another source is selected. Recovery still requires an explicit action and creates an unsaved buffer. Native draft persistence remains open.

### Usable editor milestone

The document chooser marks dirty sources, and the workspace uses responsive source and preview panes. Select rendered Markdown text to edit it in place. Enter applies a checked source patch and Escape cancels. The desktop can retain one explicit recovery copy, restore it into a separate unsaved document and delete it explicitly. The native recovery store is tested directly on Linux. Native graphical recovery and inline-edit verification remain separate runtime checks.

For a browser demo, run `npm ci` and `npm run build`. Start `npm run preview -- --host 127.0.0.1 --port 4188 --strictPort`, then run `node scripts/demo-editor.mjs` in a second terminal. The script exercises the React counter, edits a paragraph inline, verifies the rebuilt preview and checks the downloaded source. Screenshots and the resulting MDX go to `.cache/editor-demo/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using a system Chromium.

### Packaged Linux acceptance

The optimized package built from `622dfb2` passed native inline edit, undo/redo, exact disk save, dirty-close cancellation, restart, reopen and explicit recovery checks in Ubuntu/WebKitGTK. The preview was denied the recovery command. Source, binary hashes, failed test-driver attempts and scope are in the [packaged acceptance evidence](security-evidence/2026-11-18-packaged-editor/README.md).

The next slice adds plain Setext heading edits and tests concurrent native recovery creation. Automatic multi-version native recovery remains open.

### Unified editing workspace

The default Split view contains source and live React output, without a duplicate
Markdown panel. Source shows CodeMirror alone; Visual shows trusted, editable
Markdown with collapsed opaque source blocks. Mode switching keeps browser React
state intact. Actual code changes still restart the isolated runtime as described
in ADR-007. Explicit Undo/Redo buttons work in either editing mode, and focus
returns to the edited block after Enter/Escape. Shift+Enter supports soft breaks.
Literal punctuation and multiline CRLF patches use the same revision and parser
validation as the original source-preserving editor. Untrusted frame messages
still cannot change source, select edit spans or authorize file operations.

The former CI timeout was in OS ffmpeg installation after successful application
checks. Walkthrough recording now uses Playwright's encoder and has no apt step.
Current UX validation and limitations are recorded in docs/ux-evidence/README.md;
prior packaged acceptance remains historical evidence for its exact package hash.

The installed optimized build from `e0689a9` passed the unified-mode, multiline,
exact-disk-byte, mode-preservation and restart/recovery acceptance suite in the
disposable Ubuntu/WebKitGTK VM. See the [exact build and scope](security-evidence/2026-11-18-unified-ux/README.md).
The browser suite now has 18 tests and the unit suite 26. Native UI acceptance
stops preview execution; native IPC/resource evidence is distinguished separately.
