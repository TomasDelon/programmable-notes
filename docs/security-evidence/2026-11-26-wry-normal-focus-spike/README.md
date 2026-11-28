# Staged normal-focus diagnostic: startup-window outcome

26 November 2026. REACT-01/SECURITY-01, A09/A11. Diagnostic only; no product,
vendor, Supervisor or resource-policy changes.

**Normal component input was not exercised.** The one permitted HTML case did
not produce script-ready JSON within its predeclared 44-second action-start
window. The observer then obtained a valid targeted Stop in 0.83 seconds and
confirmed real trusted-host typing. Conditional MDX/React did not run. Normal
keyboard interaction, React and full native product/security acceptance remain
unproven. There was no runtime retry or forced-focus action.

## Question and fixed case limits

The previous packet observed Count 2 and a separately forced-focus `hello`, with
queued-event ambiguity. This packet's observer stages normal input explicitly:
real child-relative counter clicks, wait for Count 2, field click, wait for an
explicit `focus=field` receipt, then exactly one `hello` sequence. Its source
contains no native forced-focus command.

The observer's deadlines were fixed and reviewed before execution: script-ready
by unit age 44 seconds, all input receipts by 49 seconds, live Stop beginning before
50 seconds, and one absolute 5-second cleanup bound. These narrower observation
deadlines reserve a Stop witness before the unchanged 60-second service expiry.
They are not a larger runtime budget. A slow-startup outcome explicitly forbids
an automatic retry or conditional React execution.

Actual vendored Wry 0.57.2, GtkSocket/GtkPlug, the own-window pre-JS property
sentinel and bounded `_PN_FIXTURE_STATE` receipt are reused. The unchanged
Supervisor verifies actual cgroups/network namespace/non-root UID/NoNewPrivs
before delivering the trusted XID payload. The runtime remains ephemeral, with
sandbox enabled, no IPC handler/devtools, restricted navigation/downloads and
512 MiB/zero-swap/25% CPU/128 tasks/60 seconds. No author code was evaluated in the
privileged build host. No native application-command or ACL claim follows from
compiling this adapter.

## Executed observations

| Observation                                                               | Measured result               |
| ------------------------------------------------------------------------- | ----------------------------- |
| Host / supervised MainPID                                                 | 553 / 564                     |
| Native sentinel / child XID                                               | Seen at age 5.44s / 10485763  |
| Script-ready by declared 44s window                                       | Not observed                  |
| Component clicks, field-focus trial, keyboard typing                      | NOT RUN                       |
| Safe live unit/MainPID 564/start 11241 verified before trusted Stop       | Age 44.23s                    |
| All eight tracked identities satisfy cleanup predicate; host Stop receipt | 0.83s after click, age 45.08s |
| Trusted-host real input after Stop                                        | `HOST_ENTRY hostok`           |

The Stop guard rechecked a nonempty safe owned cgroup, exact effective controller
files, MainPID/start/membership and lifetime headroom. It tracked discovered
descendant identities, required empty/absent group and every matching identity
absent/replaced/zombie, observed the actual GUI-caused host Stop callback, then
confirmed emptiness again within the same bound. No direct auxiliary Stop masked
the GUI action. This is targeted benign-fixture evidence, not the complete
production resource/descendant stress oracle.

The matching trusted user-manager journal records normal stopping/stopped events
and 11.427 seconds CPU consumption, 86.8 MiB peak memory and zero swap. A later
independent sampler reached an already collected unit and correctly rejected its
empty cgroup **before any process read**. Therefore there is no independent
CPU/process-state snapshot at the Stop instant. The eight start identities and
actual policy are retained in the observer event receipt.

Additional load/pressure data was collected without another payload: guest PSI
and load at 19:22:49 UTC and host load at 19:22:52 UTC, roughly 90 seconds after Stop.
The tracked-PID query then had no entries; host PSI files were unavailable. These
post-case samples cannot establish startup contention, WebKit/JS failure or any
other causal explanation. The lack of ready JSON is scoped to the declared 44s
window; execution was intentionally stopped before the full 60s maximum.

The Rust/HTML artifact hash is identical to the previous property variant.
The observer and freshly built environment differ. Preserve the previous
packet's observations under their original subjects; do not transfer interaction
or startup results between these cases.

## Infrastructure failures and preparation

A fresh disposable guest was constructed from the approved local clean distro
tooling image. The first SSH preflight failed before any runtime case: newly
created setup directories inherited container umask 000, including a 0777 auth
directory. The fresh public key matched, and OpenSSH correctly refused that
configuration. The task-owned guest was cleanly powered down; setup was made
explicitly umask 022 with 0700 auth, 0755 trusted directories and 0644 configuration
files. Modes were audited in the rebuilt filesystem before the single native
case. No security policy was relaxed; the clean tooling image was not changed.

The executed guest was Ubuntu 24.04/kernel 6.8.0-149, GTK 3.24.41/WebKitGTK 2.52.6,
QEMU TCG, 4 vCPU/8 GiB. It detected `qemu`, had no `.dockerenv`, mounted securityfs
normally and reached systemd `running`. The documented disposable
systemd-executor namespace opt-in was applied and both namespace restriction
sysctls remained 1. Rust compilation used two jobs and the preserved lockfile.

Optional matching Firefox availability probes, including an explicit profile
path, failed with `Could not find profile folder` while requesting content
sandbox level 6. No sandbox-disabled fallback or fixture browser execution
occurred. Conditional MDX/React source preparation was not compilation or runtime
evidence; the HTML prerequisite was not satisfied, so that case was not started.

## Reproduction and retained scope

[receipt.json](receipt.json) preserves source/artifact hashes, declared deadlines,
the exact event sequence, sanitized unit journals and the explicitly post-case
load data. Exact Rust/Python/manifest/lockfile sources are in `repro/`; the tested
HTML bytes are in `raw/` under the existing raw-evidence formatting convention.
The screenshot shows the trusted host after Stop; it is not a component-render
or keyboard witness.

Use a new disposable full-system Linux guest meeting
[NATIVE_SECURITY](../../NATIVE_SECURITY.md), authenticated X11 and an ordinary
UID 1000 `ubuntu` test user with delegated user systemd controllers. The manifest
expects this repository read-only at `/repo`. Copy the manifest/lockfile into
new scratch, `repro/main.rs` to `src/main.rs`, and `raw/fixture.html` to the
scratch root, then:

```sh
CARGO_BUILD_JOBS=2 cargo build --release --locked --offline
sha256sum target/release/pn-wry-inline-spike
```

Install that fixed diagnostic as `/probe/pn-wry-inline-spike` and the observer as
`/mnt/observer.py`, with a writable disposable evidence directory at `/mnt`.
In the ordinary authenticated X11/user-bus session, with the documented supported
TCG rendering switches set to 1, start in separate terminals:

```sh
/probe/pn-wry-inline-spike > /mnt/host.log 2>&1
python3 /mnt/observer.py > /mnt/observer.log 2>&1
```

Use the original deadlines; keep slow-startup and failed controls. There is no
forced-focus fallback and no retry. Full normal input must pass before any
conditional real MDX/React case.

After evidence retention the fresh guest was powered down, the new runtime
container/heavy fixture files/ephemeral keys were removed, and only small
diagnostic sources/logs/screenshots remain private. Original retained
infrastructure and the previously approved clean tooling image are untouched.
No CPU loop, memory workload, application command/ACL, source/file persistence
or full product acceptance matrix was executed.
