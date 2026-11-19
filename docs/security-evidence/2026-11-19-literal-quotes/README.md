# Literal single-line quotes and honest native input — 2026-11-19

The trusted visual surface now edits a root blockquote containing exactly one
literal single-line paragraph. Root/paragraph/text offsets, raw marker and text
must agree. Patches exclude indentation, `>` spacing/tabs and terminators;
quote-root context participates in candidate reparse. Full source revision checks
remain in SourceEditor. Nested/lazy/multiline/formatted/escaped/entity/JSX quotes
stay opaque. No source code runs in this editing surface.

## Verified behavior

Unit expectations failed before mapping support. The real browser test failed
on absent semantic blockquote rendering, then passed direct editing, no-op,
Escape, exact BOM/CRLF/Unicode/JSX exports, undo/redo, reopening, unsafe multiline
input retention/Save blocking, and actual React interaction. Final repository check passed **65 unit / 30 Chromium tests**, formatting,
lint and strict TypeScript. The complete output is retained in raw evidence.

The installed optimized app passed the entire existing native fidelity suite
with both `--mixed-eol --quotes`: actual React counter, unchanged save, modes,
quote no-op with full-disk-byte/history assertions, actual Unicode paste, unsafe
input retention/cancellation, paragraph mixed-break saves/history, mode 0640, list
edit, dirty-close Cancel/OK, actual process restart, explicit unsaved recovery,
invalid UTF8 rejection/deletion and unchanged original. No existing gate was
skipped. Separate actual native IPC suite passed registered-command/recovery and
plugin denials, parent DOM/storage, HTTP/file CSP, Counter 2, private production
child networking, automation=false, actual fixed cgroup bounds and Stop. The
automated ACL probe and ordinary supervised child retain their different scopes.

## Failures retained and test-driver corrections

Initial packaged attempts failed before loading the document: first a busy Open,
then a chooser that did not acknowledge its action. They do not establish quote
acceptance. The old chooser driver ignored failed Open clicks and did not verify
dismissal. A controlled **real GTK dialog** holding validation reproduced a false
success; the fixed driver waits for visible/enabled/sensitive actions and actual
dismissal, with exact focused path echo before Enter. It never confirms overwrite
or retries an acknowledged click. X-server errors/ambiguous dialogs fail. Only
actual no-match means absence; transient BadWindow queries are retried as reads
within the same deadline. A query failure after a successful file load is also
retained; its underlying stderr was not captured, so its exact cause is not
claimed. Earlier instrumentation showed a correctly focused path in a passing
chooser, not proof of the earlier busy chooser's cause. Two initial full chooser
fixtures accidentally passed the old driver and are explicitly ineffective
controls. The effective refused-action negative uses a small real GTK dialog.

The next native run passed runtime/modes but failed the new no-op/history oracle.
Probes established that WebKitWebDriver retyped `Quoted café 😀.` as `Quoted café .`.
Settled X11 key synthesis also omitted astral characters on this stack. That input
was a real change, so Undo correctly reverted it before the heading. No production
history defect was established. Real OS clipboard paste retained the full text.
The fidelity helper now uses a bounded synthetic GTK clipboard owner and actual
Ctrl+V, asserts exact intended input before Enter and exact rendered text after
apply. Actual Shift+Enter still inserts soft breaks. No-op also saves and compares
full source before Undo and after Undo/Redo. No DOM value setter or weaker byte/
history oracle was substituted. Clipboard use is restricted to disposable tests;
the application and its authority were unchanged by these driver corrections.

Final delayed-validation GTK regression passed actual acceptance and unchanged
source/mode with empty stderr. Host/builder app sources and host/guest observer
hashes match. Raw failures, probes, source variants and final successful outputs
are retained alongside the actual synthetic saved MDX.

## Exact optimized package

- Debian SHA256: `e7456301ba3bd53cf38d935eef2f65e6ba2fea388efe445c070669993c86534a`.
- Installed ELF: `4a14f61b695f8fd502844c7792a232e5d8440373b3cd0559ea3613bb933d8824`.
- Size: 6,814,844 bytes. Custom-protocol build, no security-test CLI shells.
- Native observer: `4c6a02ab407ff791c0ac95bfa9083054de9accad9f1adda56de0373ffeec994b`.
- Both actual root process identities and default JIT environment [] are logged.
- Disposable Ubuntu 24.04 QEMU TCG, WebKitGTK 2.52.6, authenticated Xvfb/Openbox,
  real systemd/cgroup v2, supported software-rendering settings.

This is not physical GPU/Wayland/IME validation, a new full pressure matrix, or
production security readiness. The long-document WebKit renderer SIGSEGV and
prior memory-before-expiry acceptance failure remain unresolved. Native backend
source is unchanged; preceding 36 normal Rust tests are separate evidence.

## Reproduce

Follow Linux desktop prerequisites, install the optimized package and run the
external driver as the ordinary graphical user. With a fresh fixture environment:

```sh
NATIVE_DISPOSABLE_PROFILE=1 python3 scripts/native-dialog-regression.py
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes
# Use another fresh fixture env for the independent IPC suite:
npm run native:test
```

The input helper needs GTK3 Python introspection and the authenticated desktop
clipboard; it keeps only synthetic text and expires automatically. Other IME/
physical keyboard input is not certified by a successful paste. Hosted CI is
still separately blocked before runner startup by account billing.
