# Actual pinned-Wry X11 diagnostic, 26 November 2026

**Partial presentation proof; interaction and security remain unproven.** The
actual vendored Wry 0.57.2 rendered fixed HTML inside a GTK Socket/Plug in the
trusted host's window. The separate raw-X11 `build_as_child` variant remained
black in cold and warm controls. Neither variant establishes inline React or
product acceptance A09/A11. No application, vendor or supervisor source changed.

This is a standalone Rust diagnostic, not the application. The fixture is fixed
plain HTML/JavaScript, not React/MDX. It creates one reserved 300×120 region between
trusted host widgets; it does not implement a document editor, DOM integration,
scrolling, multiple islands, source updates, persistence or application parity.

## Exact boundary and environment

Both variants depend directly on the current vendored Wry and unchanged
`native-policy` Supervisor. The child reads a bounded trusted parent XID from
stdin **before GTK initialization**. Supervisor performs its normal actual
cgroup/namespace/UID/NoNewPrivs verification before delivering that payload.
The child creates an ephemeral WebView with devtools disabled, download denial,
restricted navigation and a fixed CSP. No native IPC handler is registered.
Release debug assertions/devtools are disabled. The Supervisor still discards
child stdout/stderr; `CHILD_READY` and document title changes are not observed
load/input receipts in this experiment.

The new disposable Ubuntu 24.04 VM had kernel 6.8.0-149, GTK 3.24.41,
WebKitGTK 2.52.6, 4 virtual CPUs and 8 GiB RAM, using QEMU TCG. Official free distro
repositories supplied missing dependencies. The image was built from a fresh
container, with `.dockerenv` removed before first boot; systemd detected `qemu`,
securityfs was mounted normally and systemd reached `running`. The documented
disposable systemd-executor AppArmor namespace opt-in was applied; both namespace
restriction sysctls stayed 1. No retained VM/container was booted or modified.

The Rust compiler was 1.100.0, LLVM 23.1.5. Compilation used two jobs and a separate
target. Initial failures (`cc` not yet installed; an unsupported Debug format for
PageLoadEvent in diagnostic logging) were retained; final compilation succeeded.
Unchanged vendor code emitted two `unexpected cfg v2_42` warnings. Compiler,
source, artifact hashes, process samples and sanitized trusted journal records
are in [receipt.json](receipt.json). The lockfile and exact sources are retained
under `repro/`.

## Actual observations

| Variant                                  | Independent native observation                                                         | Presentation/input result                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Raw `build_as_child`, cold               | host PID 539; supervised main PID 550; XQueryTree child 10485762 under parent 4194318. | Black through the 55.495 s observer window. No rendered fixture/input witness.       |
| Same raw artifact, warm                  | host PID 643; main PID 652; child 12582914 under parent 6291470.                       | Black through 55.007 s. No rendered fixture/input witness.                           |
| GTK Socket/Plug + actual Wry `build_gtk` | host PID 531; main PID 542; child 10485763 under GtkSocket 4194315.                    | Green fixed fixture/button/input first observed at 42.015 s. Input remains unproven. |

The raw host explicitly calls `ensure_native()` on its EventBox. This differs
from the earlier Python diagnostic; it does not explain either failure. The
Plug variant uses GTK's actual cross-process XEmbed machinery: a local
`gtk::Plug` in the supervised child is passed to Wry's `build_gtk`. No manually
constructed Python foreign WebKit window is involved in either Rust variant.

The Plug observer queried the native tree and translated the Socket's origin to
root coordinates. It observed inside RGB 187/238/221 and outside trusted-host
RGB 246/245/244, then sent two clicks and typed `hello`. The screenshot 0.5 seconds
later still shows `Count: 0` and an empty component field. Input was sent **after**
the paint marker, not before it. This observation does not establish that GTK
input is unsupported: event targeting, focus proxy routing, JavaScript readiness
and observation latency have not been isolated. A future experiment should use
the independently queried child XID for relative input and a sufficiently timed
state receipt, while retaining the same execution lifetime.

The green surface fits the reserved region and the sampled outside pixel remains
trusted host background. That is not full clipping, scroll, focus, accessibility
or same-document acceptance. The fixture's JavaScript changes document.title,
but no callback is registered to expose it as an external receipt. No React
payload was attempted because interactive fixture behavior was not established.

All sampled unit controller files retained 512 MiB RAM, zero swap,
`cpu.max=25000 100000`, 128 tasks and 60 seconds. Sampled WebKit WebProcesses belonged
to their matching unit cgroups and showed NoNewPrivs 1, Seccomp 2/filter 1 and
separate sandbox network namespaces. The trusted user manager recorded the
runtime-limit cause and timeout result for each unit. These snapshots and
expiry records do not replace the full resource/descendant/Stop security matrix.

## Failed observer and lifecycle limits

An extra raw-warm Stop observation ran **after** natural expiry. The native
host's Stop callback returned Ok for the already collected unit. Its diagnostic
checker then treated an empty ControlGroup as the root cgroup and failed its
deadline while inspecting unrelated guest processes. This observer is **INVALID**
as cleanup evidence; its failure is not a runtime cleanup failure or a Stop pass.
Its exact source is archived as `stop-check-failed.py`, not recommended as a
validator. Future checkers must reject empty/root/unsafe cgroup paths before
reading processes and must prove a live unit before attributing Stop.

The raw host's forced X11 window destruction also emitted GDK lifecycle warnings;
it did not yield a normal-close Stop receipt. No Stop/crash-recovery acceptance
is claimed. After collecting the Plug case, the fresh guest was powered down;
the console reached `reboot: Power down`. Heavy fixture files, keys and the new
container are removed after evidence retention. Small private diagnostic logs
remain task-local; no credentials, disks or rootfs are included here.

## Reproduction

Use a fresh disposable full-system Linux desktop/VM satisfying
[NATIVE_SECURITY](../../NATIVE_SECURITY.md), authenticated X11, working delegated
user cgroups/private namespaces and normal enabled WebKit sandboxing. Mount this
repository read-only at `/repo` for the manifest's exact dependency paths. Use
the preserved compiler/lockfile; do not edit vendor APIs to force a result.

In a new writable scratch directory, copy `repro/Cargo.toml`, `repro/Cargo.lock`
and either `raw-main.rs` or `plug-main.rs` to `src/main.rs`, then:

```sh
CARGO_BUILD_JOBS=2 cargo build --release --locked --offline
sha256sum target/release/pn-wry-inline-spike
```

Install that diagnostic as `/probe/pn-wry-inline-spike` in the disposable guest.
Its executable identity must remain stable while Supervisor launches itself.
Use an ordinary desktop user with a writable disposable evidence directory at
`/mnt`; export DISPLAY/XAUTHORITY and the actual user runtime/bus environment.
Keep the supported software-rendering switches used by this TCG environment:

```sh
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
/probe/pn-wry-inline-spike > /mnt/host.log 2>&1
```

From another terminal in the same authenticated session, run the preserved
`observe.py`. It only queries X11/GDK pixels and sends external input; it does not
construct GTK/WebKit foreign windows. The preserved `inspect.py` was run by the
disposable administrator while the unit was alive to record controllers/processes.
Do not run the archived failed Stop checker as an acceptance validator.

Retain every attempt separately, including source/artifact hashes and actual
unit journals. Do not infer a load from native child existence, a successful
input from event injection, or a cleanup cause from a disappearing surface.
The next bounded engineering work is input/focus diagnosis of the rendered
Socket/Plug variant, then actual React and document geometry/lifecycle adapters
if that succeeds. The raw-window failure does not establish an infrastructure
root cause or justify a host switch, a larger resource budget or a privilege
change. GTK Socket/Plug remains X11-specific; Wayland is unproven.

A separate root-run Chromium control loaded the **exact** archived Plug fixture
HTML/CSP, observed its script startup title, clicked the counter twice and filled
`hello`; counter/title updates passed without page errors. This narrows fixture
syntax/CSP concerns in Chromium only. It is not WebKitGTK input or native script
readiness evidence; those remain unproven.
