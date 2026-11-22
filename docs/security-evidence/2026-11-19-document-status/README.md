# Selected document save status — 2026-11-19

Two concrete correctness failures were reproduced before changing application code:
a dirty Alpha made an unchanged selected Beta read `Unsaved changes`; a delayed
native Alpha save displayed `Saved.` on Beta. Notices now capture a stable
workspace document key and exact source. Selected status uses only that source's
dirty state, with a separate count for dirty siblings. Aggregate browser/native
close protection remains unchanged, including unapplied visual input.

A native durability warning remains visible for the selected saved source even
when a sibling is dirty. Changes during delayed save still retain newer text and
adopt only the completed captured revision. This fixes attribution and status;
no source mutation, native grants, persistence, preview messages, sandbox or
resource policy changed. The UI layout/design is otherwise unchanged.

## Actual verification

- Initial Chromium and mocked-native transport cases failed on the exact two
  bugs. Both passed after the ownership/status change.
- The first complete browser run caught an ambiguous legacy text locator:
  `Unsaved changes` now also appears in the sibling status. The assertion was
  strengthened to the named document-status element with exact text. Failure and
  focused regression output are retained; no product/security predicate was
  skipped.
- Final whole repository check passed formatting, ESLint, strict types,
  **58 unit / 27 Chromium tests**, including source fidelity, sandboxing,
  native-transport late saves/warnings, aggregate beforeunload prevention and
  exact multi-document exports.
- Actual optimized installed Ubuntu/WebKitGTK package passed two real OS-picked
  files: clean selected Beta with dirty Alpha, Saved Beta with dirty Alpha,
  real window-close/Cancel retention, correct Alpha status and exact save,
  returning to Beta without Alpha's notice, exact reopen and clean process exit.
  Both files retained original BOM/CRLF/unrelated JSX and mode 0640.
- Repeated installed native suite passed all registered-command/recovery/plugin
  denials, Counter 2, parent DOM/storage and HTTP/file denial, ordinary private
  namespace/limits and Stop. These ACL automation probes are still distinct from
  normal production child observations.
- Repeated installed inline/keyboard suite passed protected pending input, actual
  dirty-close Cancel, Enter/Escape, BOM/CRLF patch/save, undo/redo/reopen, mode 0640,
  real Ctrl+S/Shift Save As cancellation/exact separate copy and clean exit.
- Read-only review found no important issue in the final implementation/tests.

## Exact package and screenshots

No test feature was enabled. Debian package inspection, installation and actual
runtime tests are separate retained results.

- Debian SHA-256: `8f54a2645346d969e4e8e235c8c2aab97fa13ced7104f043d7ddf804c2ab62da`.
- Installed ELF SHA-256: `7ef9a9c735e4fdf8717054a50ab552fbe75e912552a14f78ccb68af666689224`.
- Package size: 6,814,588 bytes. Application source hashes match the Ubuntu builder;
  actual test report binds its observer hash and running executable.
- [Clean Beta / dirty Alpha](raw/native-clean-selected.png) and
  [saved Beta / dirty Alpha](raw/native-saved-selected.png) are actual native screenshots.

The disposable Ubuntu 24.04 QEMU TCG guest uses systemd/cgroup v2,
WebKitGTK, authenticated Xvfb/Openbox and supported software-rendering settings.
This is not physical GPU/Wayland validation, a new complete pressure/expiry matrix
or a production readiness claim. The prior memory-before-expiry acceptance failure
and intermittent startup/blank reports remain open. Hosted CI is still unable to
start because of the previously recorded account billing restriction.

## Reproduce

Build/install the normal production package, start the external driver and source
a fresh fixture env as described in [Linux testing](../../LINUX_DESKTOP_TESTING.md).
Use an empty recovery collection in a disposable profile; the test pauses automatic
snapshots and never uses personal files.

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-document-status.mjs
# Each other native suite gets its own fresh fixture environment.
npm run native:test
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-pending-edit.mjs --leading-bom --shortcuts
```

The delayed transport tests intentionally mock OS IPC; they are not native security
proof. Actual picker, disk, permissions, dirty-window cancellation and clean exit
come from the separate installed test. Raw successes/failures and checksums follow.
