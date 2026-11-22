# Explicit native Stop retry — 2026-11-19

The preceding actual syscall-failure control exposed misleading feedback: the
editor said “Preview stopped” before native confirmation, and a second Stop click
with no mounted artifact did nothing. Native cleanup ownership and sixty-second
expiry remained intact. This was a recovery/feedback defect, not new execution
authority or a demonstrated sandbox escape.

The trusted toolbar now reports pending/failure/confirmed state and sends a later
explicit retry through the existing serialized queue. The first Stop still uses
exactly one component cleanup. There is no hidden automatic retry. Each request
owns its feedback; newer retries/rebuilds supersede both old success and failure.
Implicit source-change cleanup still reports failures. No preview permission,
native command, source/file grant or resource restriction changed.

## Tests and review

A real App test with controlled transport failed first on the premature stopped
label. A stronger deferred-completion test failed on older success overwriting a
newer pending retry. Fresh read-only review found cleanup's unconditional error
callback bypassed the guarded handler; deferred-rejection cases reproduced stale
alerts after both Rebuild and newer Stop. Single explicit completion ownership
fixed these failures. The focused **10 tests** passed; final full local check
passed **74 unit /30 Chromium**, formatting, lint and strict TypeScript.

A separate full local check with Playwright's matching downloaded Headless Shell
**159.0.8154.6** also passed74unit/30browser, format/lint/types. The system browser
used by the preceding run is Chromium156.0.8078.79. The exact install receipt and
actual launch metadata are retained. This validates the pinned browser locally;
it is neither a hosted CI pass nor an explanation of the intermittent miss.

The initial full run passed72unit/29browser but failed the tablet-width initial
Counter0→1 click. Its complete Playwright trace, screenshot and output are
retained. The trace records the same iframe and a click at the button; it does not
establish a React reset or explain the missed interaction. Twenty unchanged820px
repetitions passed, then the final full suite passed. No retry/timeout/assertion
was weakened and no speculative runtime change was made. This is unresolved
intermittent interaction behavior, not a proven fix. Trace SHA256:
`210eaf0fe7f92fba689df5b1b6f61487595066ffe506a7189797990d2693d26c`.

The actual installed fault/retry acceptance passed. After real Counter0→1, an
externally injected Stop execEIO left the cgroup/connection
live and the UI correctly showed “Preview stop failed”. Fault preparation was
measured at unit age49.696599s. After tracer detachment,
a second trusted UI click at age51.357028s removed the cgroup within three seconds,
before natural expiry, confirmed stopped and cleared the error. Original bytes and
mode0640 remained unchanged; only final cleanup used direct native Stop. The
observer SHA256 is
`3237cd9035600a7d89ec957e38cb1871ce90197a47815970727ed4df5308e280`.
Host/builder application sources and four host/guest observers match exactly.

The same installed ELF passed ordinary session expiry/rebuild/counter/UI Stop and
the independent full IPC suite. The first fidelity attempt failed to find Counter0
before actual60s expiry (journal:14.403s CPU,66.3MiB peak), so that complete run
exited1 and is retained. A later full fidelity run passed quote/no-op/unsafe-input
retention, exact BOM/mixed-EOL/Unicode/JSX saves and history, mode0640, dirty-close
Cancel/OK, real restart, explicit unsaved recovery, invalid UTF8 rejection/deletion
and original unchanged. Neither repetition is a fix for the first startup failure.
An additional read-only startup monitor was ineffective: it sampled the transient
unit while activating with ActiveEnterTimestampMonotonic=0 and consumed its capture
markers prematurely. Its source/data are retained as inconclusive, with no useful
screenshot or cause claim. This was a diagnostic-only flaw; the shipping session/
Stop observers validate nonzero activation timestamps after actual interaction.

## Exact optimized package

- Debian SHA256: `1ee05d1143876a41cc9e90e9980916d7e11dec3184f9ddf4b0b3722340b3d97d`.
- Installed ELF: `5318edc9565757b503f061b45596f1bb0b8dbaa217a9b603f105e08ab3fe8773`.
- Size6,827,236bytes. Custom-protocol production build, no security-test CLI.
- Disposable Ubuntu24.04 full-system QEMU TCG, real systemd/cgroupv2,
  WebKitGTK2.52.6, authenticated Xvfb/Openbox, supported software-rendering flags.

The first native attempt failed at the unchanged fifteen-second compiler deadline,
before any preview unit/fault injection; its report shows source retained. This is
not Stop acceptance. Subsequent validation is recorded separately. A successful
retry does not resolve that timeout or earlier blank/SIGSEGV/memory-gate failures.
No physical GPU/Wayland/IME, full new pressure matrix or production readiness is
claimed. Hosted CI remains separately blocked by account billing before runner
steps; the exact pushed revision must be checked after commit.

## Reproduce

Use the documented external native driver and a fresh disposable fixture/profile:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-stop-retry.mjs
```

The optional `--exec-stop-fault` mode requires the external owned-process fault
controller retained in the preceding session-status evidence. It must confirm an
actual native EIO/live group, detach, then observe a second user-clicked Stop and
cgroup removal before the actual fixed expiry. Final direct Stop is cleanup only.
No production SDK method replacement or sandbox bypass is used. Run controller
only as disposable-VM administrator against its synthetic ordinary-user editor,
never against personal profiles or files. Failure/unsupported prerequisites are
not passing acceptance.

For the exact recorded external fault on a disposable Ubuntu account UID1000,
install `strace`6.8 and prepare the fresh fixture above in terminalA. Before any
controller starts, point it at that new fixture:

```sh
# Terminal A, ordinary graphical test user, fresh pn_env already sourced:
printf '%s' "$NATIVE_EVIDENCE_DIR" >/tmp/pn-stop-kernel-current
# Terminal B, disposable VM administrator, from repository root; waits for A:
sudo python3 docs/security-evidence/2026-11-19-session-status/raw/stop-exec-controller.txt
# Terminal A, while B is waiting:
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-stop-retry.mjs --exec-stop-fault
```

The controller deliberately requires UID1000 and `/usr/bin/programmable-notes`,
verifies PID/start ticks/executable hash and the synthetic wrapper's recorded PID,
then injects one `execve`/`execveat` EIO into the owned editor's next child. Its
request wait is bounded160s and active fault25s; it detaches before the second
click. Successful acceptance requires a trace containing `INJECTED`, actual failed
UI feedback/live group and subsequent UI-only cleanup before expiry. Do not run
two controllers/tests simultaneously or reuse stale fixture pointers. These are
trusted disposable test scripts, not a privileged production API or a hardened
multi-user service. The application has no ptrace capability.
