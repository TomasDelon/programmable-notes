# Native preview download handling — 2026-11-19

Scope: a minimal child-only native rejection hook, a real Linux WebKit callback
integration test, and separate attempts from installed resource-isolated MDX.
No production security-readiness claim or demonstrated iframe escape.

## Finding and change

The pinned Wry default handler returns true and chooses Downloads/current directory
without a user Save dialog (`vendor/wry/src/lib.rs`, `webkitgtk/web_context.rs`).
Tauri overrides it only when `on_download` is installed. IPC capability denial is
not authorization for a download. The preview now installs the shared
`downloads::deny` callback. Editor behavior, native grants, navigation, CSP,
iframe permissions, automation and resource policy were not relaxed.

A first WebDriver anchor probe produced no files even in the trusted editor. It
had no working positive control and is **inconclusive**, not a download-denial
pass. Its source/log are retained. The replacement separate Rust example invokes
WebKit's native download API against an observer-owned ephemeral loopback HTTP
server with synthetic attachment bytes. It does not grant that API to document
code. Its incognito default-handler case must write exact bytes. Its denial case
uses the same callback function as the application, requires a cancellation event
and no destination/canary. The observer removes only UUID-named, owned, regular,
single-link files whose complete bytes match its synthetic content.

## Exact package

Optimized `custom-protocol` Debian build, no `security-test`:

- Debian SHA-256: `ed6dc73253b51e8e5cc84bec5c40d9b92db660cf6a591e1326dd321b6ce8e6f8`.
- Installed ELF SHA-256: `30d5f193f0d3b60b039bd202931aacc76758caa5491c6b975b72becfba6e2571`.
- Package size: 6,814,440 bytes. Installed with dpkg; package inspector passed
  (inspection alone records `runtimeExecuted:false`).

The disposable Ubuntu 24.04 full-system QEMU TCG guest uses a real systemd user
manager/cgroup v2, authenticated Xvfb/Openbox, WebKitGTK and the two supported
software-renderer settings. No physical GPU/Wayland or other distribution result
is implied. Helper and application hashes are different by design; raw reports
bind each actual observer to its tested executable.

## Executed results

- **Initial no-handler baseline failed as intended:** default control wrote exact
  79-byte canary; the nominal denial case also downloaded, so the command exited 1.
- **Callback integration passed:** exact default write, actual denial callback,
  native `User cancelled the download`, null destination and no denial canaries.
  The final helper/observer run is `final-green.json`; earlier green is retained.
- **Omitted-handler negative passed:** the observer exited 1, recorded the
  unexpected exact 79-byte write and removed both verified synthetic canaries.
- **Installed ordinary MDX:** automatic and actual AT-SPI clicked data/Blob
  attempts reached their completion markers; no canary appeared in home,
  Downloads, application cwd or child cwd. The child had automation false, its
  own network namespace, NoNewPrivs and effective 25% CPU / 512 MiB / zero swap /
  128-task limits. The initial run passed. A revised observer then failed after
  Stop because it referenced an undeclared timing variable; that failure is
  preserved. The corrected final run passed, including verified group cleanup
  51,289.37 ms from the start request, before earliest 60-second expiry.
- **Installed IPC/security regression passed:** actual editor positive control,
  all 11 registered-command denials, each recovery action denied, absent
  filesystem/shell/HTTP/dialog plugin authority, Counter 2, DOM/storage isolation,
  HTTP/file CSP denial, production child networking/limits and group Stop.
- **Installed persistence/keyboard regression passed:** actual inline pending
  guards and dirty-close Cancel, exact BOM/CRLF patch/save, undo/redo/reopen, mode
  0640, trusted Ctrl+S and Shift+Ctrl+S native chooser cancellation/exact separate
  copy, and clean exit. Native before/after screenshots are retained in raw.
- **Repository checks:** formatting/lint/types, 56 unit and 26 Chromium tests
  passed. Native application Rust test passed; package built successfully.

The callback harness demonstrates enforcement when a native download is requested.
The ordinary MDX case establishes actual attempts and observed absence of files;
it does not prove that those attempts reached the native callback. Neither test
is evidence that document JavaScript previously escaped its iframe. A full resource
matrix was not rerun on this new ELF; previous current-binary memory/expiry failure
and intermittent startup limitations remain open in their own dated evidence.

## Reproduce and limits

Use the separate helper and installed production commands in
[NATIVE_SECURITY.md](../../NATIVE_SECURITY.md#preview-downloads), each with a fresh
fixture directory and a disposable profile. The helper needs the ordinary Linux
namespace/WebKit sandbox prerequisites; it intentionally uses loopback from its
trusted harness, not from an untrusted supervised child. Never weaken the
production network policy or enable child automation to make it pass.

Raw results include failed probes/observer errors. EGL/GTK shutdown warnings are
retained. Hosted run 44469361168 for dadf86e was refused before runners/steps were
created due account billing/spending limit, not a compilation/test result; its
actual annotation is retained. Main was not merged, PR #1 remains draft, and no
public release or new production readiness claim was made.
