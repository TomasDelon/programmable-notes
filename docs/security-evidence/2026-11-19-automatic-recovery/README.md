# P1 automatic native recovery acceptance

Actual installed optimized production package, `custom-protocol`, no test feature.
The runtime source hashes are in `raw/runtime-source.sha256`. Ubuntu 24.04.5,
WebKitGTK 2.52.6, disposable full-system VM, ordinary desktop user, Xvfb/Openbox
and supported software rendering. Preview permissions, sandbox and resource
policy are unchanged.

Package SHA-256: `64260af8ae583d782a077371b181ae63833a7319e42efa202500b8ada5a967dc`.
Installed ELF SHA-256: `5b2eabb5a281193d3587dada8d81d4bbc4c24e7710bac9d2e99835177f51689a`.

## Executed results

- `native-automatic.log`: actual typing produced automatic BOM/CRLF snapshots
  without pressing Keep or Save. Two dirty buffers of the same original had
  independent histories. Six updates in the second buffer retained five versions
  and left the first buffer's only unsaved version recoverable. Original disk
  bytes stayed unchanged. Dirty close/cancellation, actual root-process exit,
  restart/discovery, explicit unsaved restore, Save As cancellation and exact
  saving to a separate chosen file passed. Only synthetic versions were deleted.
- `native-enospc.log`: a dedicated 2 MiB tmpfs, with only its records subdirectory
  bind-mounted onto the private recovery directory, was filled until ENOSPC.
  The filler lived outside the records directory on the same filesystem. A new
  automatic write failed, paused further snapshots and showed a visible error
  outside the closed recovery drawer. The prior durable version survived and
  explicit Save to the original still worked. After freeing space and explicit
  Resume, a new automatic snapshot held the latest exact source without writing
  the original again. The test verifies tmpfs type and a maximum 4 MiB size before
  filling anything. Mounts were removed afterward.
- `manual-regression.log`: manual versioning, actual restart, corruption refusal,
  older-version restoration, Save As cancellation and exact saving passed again.
  This suite explicitly pauses the new automatic mode; the separate automatic
  suite tests its default enabled behavior.
- `native-ipc.log`: all privileged commands and all new recovery actions were
  denied from preview. Real WebKit Counter interaction, profile/DOM/storage and
  file/HTTP fetch denial, production child flags, effective limits, actual private
  networking and full-group Stop passed. No fresh CPU/OOM/expiry stress claimed.
- `check.log`: formatting, lint, strict types, 34 unit tests and 18 production
  Chromium tests passed. Controller tests cover all dirty buffers, debounce,
  coalescing, one in-flight batch, closed queued buffers, failure pause and
  independent same-path lineages.

## Failures and scope

The first automatic harness attempted to type before CodeMirror mounted after a
picker response. It now waits for the selected source and actual editor element.
The first ENOSPC run passed failure/preservation/explicit-save checks, then hit a
WebDriver key-input error after Resume. That runner now uses actual xdotool input
and verifies the edited text. Both failed logs are retained; no source assertions
or sandbox checks were removed. A failed ENOSPC harness now terminates only its
own test application before the caller unmounts the disposable filesystem.
Some successful dialog runs emitted transient X_QueryTree/BadWindow diagnostics;
the picker operation and exact saved bytes were subsequently verified.

This is process-restart and filesystem-error validation, not machine power-loss
or physical GPU/Wayland/IME certification. Edits inside the two-second debounce
window or during an unfinished write can be newer than the latest durable record.
Recovery remains separate from explicit saves and never marks the original clean.
No private documents, recovery records, credentials or machine configuration are
included here; fixtures and retained test observations are synthetic.

## Reproduction

Install the optimized package; use a disposable account with an initially empty
version collection and a real graphical session/tauri-driver. Follow the base
prerequisites in `docs/NATIVE_SECURITY.md`. Generate/source a fresh fixture env:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-auto-recovery.mjs
```

For GUI ENOSPC, stop the test application first. As administrator in that
**disposable VM only**, mount a 2 MiB tmpfs at `/mnt/pn-automatic-recovery`, owned
by the test user's UID/GID with mode 0700. Create its `records` child with the same
ownership/mode and bind-mount that child onto the app's private recovery directory
(default `$XDG_DATA_HOME/dev.programmablenotes.app/recovery`, or
`$HOME/.local/share/dev.programmablenotes.app/recovery`). Leave its parent available
to the test user for the synthetic filler. Then as that ordinary desktop user,
with a fresh fixture env:

```sh
NATIVE_DISPOSABLE_PROFILE=1 PN_RECOVERY_FILLER=/mnt/pn-automatic-recovery/filler \
  node scripts/native-auto-enospc.mjs
```

Stop the test application, unmount the recovery bind mount, then unmount/remove
the tmpfs mountpoint. Never apply this test to a personal account or disk.
