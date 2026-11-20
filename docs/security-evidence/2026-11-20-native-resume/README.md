# Restored disposable Linux desktop: bounded transition acceptance

The existing disposable Ubuntu24.04 QEMU TCG VM survived the workspace pause. Its
container and guest were restarted; systemd, AppArmor, the authenticated software
rendered Xvfb desktop and external WebDriver were available. No sandbox, JIT,
resource limit, graphics flag or application policy was relaxed.

The installed optimized production ELF remained
`a6d00cbb00a6acbbaaf6da9566a1f992b38f384df7d9b1c6878d9463334b1195`,
the previously recorded preview-termination package. Public-notice/build-tool
changes are not a newly installed GUI build. The fresh standalone original Save
ENOSPC acceptance is recorded separately.

The current `native-long-paragraph.mjs --visual-cycles 20` observer passed:
20 actual Visual transitions/19 Source returns, full1000-line text, bounded360px
input with27000px internal scroll, actual end typing, exact disk Save, Undo/Redo,
positive reopen, BOM/mixed-ending source fidelity, mode0640 and clean exit.
The structured report binds observer and executable hashes and the owned Root
PID/start tick. This single successful session does **not** explain or fix the
historical intermittent renderer SIGSEGV/startup failures.

The first harness attempt failed before launching the app because the new
observer directory lacked npm dependencies. That failure is retained; the next
command used the existing trusted acceptance dependency directory after verifying
its lockfile matched the current lock. No failed run was converted into a pass.
No full native malicious-resource matrix, physical GPU or Wayland test is claimed.

Reproduce using the installed-app procedure and external driver in
[LINUX_DESKTOP_TESTING](../../LINUX_DESKTOP_TESTING.md), then:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 timeout -k 5s 300s node scripts/native-long-paragraph.mjs --visual-cycles 20
```

## Fresh-profile seven-option acceptance

A separate actual command used a new private XDG data/cache/config profile and
an external driver with those same directories. The ordinary, non-debugger
`native-fidelity.mjs --mixed-eol --quotes --multiline-quotes --source-navigation
--visual-budget --same-names --extension-case` run exited0. Its explicit identity
records bind the same production ELF and no JIT environment overrides.

All requested gates passed: same-name distinct files/history/reopen, dense
read-only fallback, mixed-case MDX and interactive React, three modes, literal
and multiline quotes, heading/paragraph/list edits, exact mixed-LF/CRLF saves,
opaque Source navigation/caret/history, dirty-close cancellation, actual process
restart, explicit unsaved legacy recovery, invalid UTF8 draft refusal and explicit
delete. Originals were unchanged during recovery.

Independent postcheck recomputed four exact fixture hashes/lengths/mode0640
from the trusted fixture constructor (not application patch functions), verified
both known Roots gone and recovery contents limited to `.lock`. The current-boot
kernel query found no matching WebKit fault/OOM entry. These successful commands
do not prove absence of intermittent engine failures, fix their root cause, or
replace the distinct malicious resource-containment matrix. No profile or source
from the preceding acceptance was overwritten.
