# Automatic recovery of notes never saved to disk

Installed optimized production package from d955aae, no security-test feature:

- Debian package SHA-256: `4654d62f6d3c8e1dc60cd4f0261c5720558e1aaf93f05d4162f9fa4f5b326eea`.
- Installed ELF SHA-256: `72e89298e1289f667fb1c0c6a6e5176379ad594631cc4e19ee930a6648d4406d`.
- Ubuntu 24.04.5, WebKitGTK 2.52.6, systemd 255; disposable full-system
  QEMU TCG VM, ordinary desktop user, Xvfb/Openbox and the documented software
  rendering variables. No sandbox, resource policy or native command changed.

## Executed results

Both final installed-app invocations exited 0 and reached the explicit cleanup /
clean-exit marker: `raw/new-notes-final.log` and `raw/file-backed-final.log`.
A prior unbound-note run and the original-file regression also passed before the
final B-source assertion was added; final logs exercise that assertion. Full
repository checks passed formatting, ESLint, TypeScript, 45 unit and 23 Chromium
tests. The current source changes are acceptance tooling and documentation only.

Hosted run 44453697227 for c93968b was refused before either runner started. Its
actual annotation is retained in `raw/ci-billing.txt`; local results do not imply
hosted success. The current browser review archive was separately re-downloaded
from its GitHub Blob API and matched SHA-256
`854731fd2820664f14d2fa7a59def7ba6ebf0282b50d334fce0832f81e3f39c0`.

## Acceptance scope

The `--new-notes` variant creates two empty unsaved buffers through **New note**,
without choosing an original file. Actual CodeMirror input produces automatic
snapshots with null saved baselines and independent identities. Six successive
updates in B retain five B versions while A remains recoverable. Restoring the
first A and B records and the final B record through the backend must return
complete exact source, not just matching byte counts or generation numbers.

The harness SIGKILLs the real editor, verifies its exit, launches a new process,
discovers the retained versions and explicitly restores A into an unsaved buffer.
Save opens an OS chooser; cancellation leaves the sentinel original unchanged.
A separate explicitly chosen Save As target must contain the exact restored
source. Only this test's versions from the initially empty disposable collection
are deleted, and clean editor exit is checked. The separate original-file case
opens the same BOM/CRLF original twice and retains its existing exact-byte checks.

Published immutable metadata is observed externally only to locate completed
new-note generations without contending with the writer lock. The native list
and restore operations validate records; full source comparisons remain mandatory.
Optional initial empty snapshots are accepted without weakening five-version
retention, exact-source or independent-history requirements. Read-only review
found no concrete issue.

Reproduce each case with a fresh fixture environment and an empty disposable
collection, following [Linux prerequisites](../../LINUX_DESKTOP_TESTING.md):

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_CRASH_RESTART=1 \
  node scripts/native-auto-recovery.mjs --new-notes
# Generate/source another fresh fixture environment before the file-backed case.
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_CRASH_RESTART=1 \
  node scripts/native-auto-recovery.mjs
```

These are completed-write process-restart tests, not power-loss proof or recovery
of keystrokes still inside the debounce window. The earlier native blank-preview
startup/recovery failure remains unresolved. No new full resource matrix, physical
GPU, Wayland, IME or production security-readiness claim is made.
