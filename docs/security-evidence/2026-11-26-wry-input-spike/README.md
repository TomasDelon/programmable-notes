# Wry Socket/Plug readiness, input and Stop diagnostic

26 November 2026. Diagnostic only, following `f9d8007` and
[the input-validation plan](../../plans/wry-input-validation.md).

**Real pointer interaction and a targeted pre-expiry Stop were observed. Normal
keyboard interaction and React remain unproven.** The fixed HTML button reached
Count 2 after real child-relative clicks. A separate forced-focus diagnostic
reached field `hello`. Stop removed all eight tracked runtime identities within
0.79 seconds while the trusted host remained usable. This is not product A09/A11
acceptance or the full hostile-document security matrix.

No product/vendor/supervisor code changed. Both artifacts use actual vendored
Wry 0.57.2, GTK Socket/Plug and the unchanged Supervisor verify-before-payload
boundary. Only a trusted parent XID crosses stdin before GTK initialization.
The runtime remains ephemeral, with enabled WebKit sandboxing, no IPC handler,
devtools disabled, navigation/download denial and fixed 512 MiB/zero-swap/25% CPU/
128-task/60-second policy. The fixed reviewed payload is plain HTML/JavaScript.

## The original readiness measurement was inconclusive

The first artifact used Wry's document-title callback to call `GtkPlug.set_title`.
The observer read WM_NAME through XFetchName. It verified the actual live unit,
MainPID/start/cgroup and effective policy, but saw no valid JSON-ready receipt
through unit age 58 seconds. Consequently it sent no input, forced focus or Stop.
React was not attempted. This is **INVALID_READINESS_INSTRUMENTATION**, not proof
that JavaScript failed or that component input was rejected.

The exact original source, observer and result are retained. Read-only upstream
GTK 3.24.41 source inspection found:

- `gdk_x11_window_set_title` ignores windows outside its toplevel/foreign scope.
- `gdk_x11_window_set_utf8_property` also explicitly ignores non-toplevel windows.
- GtkPlug realization has child and toplevel branches; the actual internal GDK
  type in the first attempt was not measured. The guards alone do not prove the
  runtime root cause.
- General `gdk_property_change` supports the native child-window operation and
  does not use those toplevel-only wrappers.

Exact upstream URLs/hashes are in [receipt.json](receipt.json). They identify the
release source inspected, not a rebuilt/audited Ubuntu patch set.

The parent explicitly ruled the first run an inconclusive measurement and
authorized one corrected HTML case within the same 30-minute packet, with no
policy change or automatic retry. No earlier evidence file was rewritten.

## Corrected transport and observations

The corrected child realizes **its own** Plug, writes a bounded pre-JavaScript
`{"bridge":"native-before-webkit"}` sentinel to its own `_PN_FIXTURE_STATE`
UTF8_STRING property using `gdk::property_change`, and flushes the display before
constructing WebKit. The same bounded document-title callback subsequently
updates that property. It has no path/command/edit/file authority. The observer
uses XGetWindowProperty with explicit type/length checks and must observe the
native sentinel before admitting script-ready/input evidence.

| Event                                                                   | Observed unit age |
| ----------------------------------------------------------------------- | ----------------- |
| Independent pre-JS native sentinel                                      | 3.40s             |
| Script-ready JSON, Count 0/empty field/error empty                      | 35.98s            |
| Native child-relative real input begins                                 | 36.36s            |
| Count 1 then Count 2 after actual clicks                                | 38.95s,39.31s     |
| Separately labelled forced-focus diagnostic begins                      | 40.23s            |
| Field `hello`, Count 2, error empty                                     | 42.51s            |
| Verified-live unit/MainPID/start/cgroup immediately before trusted Stop | 42.69s            |
| Bounded Stop cleanup and host callback observed                         | 43.51s            |

The independently queried child XID was 10485763, under Socket 4194315, with
geometry 300×120. `ready.png` captures the readiness receipt while the first frame is still white;
`count-two.png` shows the subsequently painted interactive fixture.
Normal input used real xdotool events relative to that child,
not JavaScript evaluation/click calls. Count 2 is a positive ordinary pointer
interaction witness. The normal 3-second poll still showed the counter focused
and the field empty. The subsequent diagnostic explicitly forced native focus
and typed again; its success is not normal keyboard acceptance.

There is a timing confound: the initial injection typed immediately after the
field click, without waiting for a focus receipt. Original events were still
draining when the forced-focus phase began; an intermediate field `o` appeared
before the diagnostic `h`→`hello` sequence. This case cannot establish whether
forced focus is necessary. The next useful bounded measurement should stage
clicks, wait for the field-focus receipt, then type and allow a defined response
window. Do not silently relabel the forced-focus result as end-to-end success.

No real MDX/React case ran because full normal HTML input acceptance was not
established. An optional new-fixture Chromium control could not launch with its
sandbox enabled in the outer environment (`No usable sandbox`); no
sandbox-disabled fallback was used. The older fixture's existing browser control
remains separate evidence.

## Valid targeted Stop and its limits

The observer rejects empty/root/unsafe cgroup paths, zero/zombie/mismatched
MainPIDs, changed start identities and wrong effective limits. Before the GUI
Stop click it revalidated the live MainPID 666/start 44815 in the exact owned unit
at age 42.69 seconds, then tracked all discovered cgroup identities, including
descendant groups. One absolute 5-second deadline covers input injection,
matching host Stop receipt, empty/absent group, every matching tracked identity
absent/replaced/zombie, and a final group-emptiness check. Unexpected read errors
do not establish emptiness; observed out-of-group identities fail the check.

The trusted host logged `HOST_BUTTON_STOP Ok(())`. All eight tracked identities
met the cleanup predicate in 0.79 seconds, at unit age 43.51 seconds, well before
the fixed 60-second expiry. Real host-entry input then produced `HOST_ENTRY hostok`.
Structured unit journals record successful deactivation rather than runtime-limit
timeout. No auxiliary direct Stop masked the result.

This is a benign-fixture targeted observation, not the production stress oracle
or proof against historical/unobserved process migration. No CPU loop, either
memory workload, actual editor/disk autosave, restart/crash recovery or broader
privilege-denial matrix ran. The independent seccomp/process snapshot retained
in the receipt belongs to the **initial inconclusive unit**; do not transfer it
to the corrected artifact. The corrected run's controller/identity evidence is
recorded in its own event sequence.

## Reproducibility and cleanup

The receipt preserves both exact artifact/source hashes, rustc 1.100.0/LLVM 23.1.5,
the event sequence, actual policy, process snapshot and sanitized structured
journals. `repro/` contains both Rust variants/observers and the lockfile.
Byte-exact HTML and optional browser-control source are in `raw/`, using the
repository's existing raw-evidence formatting exclusion. No credential, guest
image or rootfs is committed.

Use a fresh disposable full-system Linux guest satisfying
[NATIVE_SECURITY](../../NATIVE_SECURITY.md), authenticated X11, an ordinary
`ubuntu` UID 1000 test user and working delegated user systemd controllers. The
tested guest was Ubuntu 24.04/kernel 6.8.0-149, GTK 3.24.41/WebKitGTK 2.52.6,
QEMU TCG, 4 vCPU/8 GiB. It detected `qemu`, had no `.dockerenv`, mounted securityfs
normally and kept both namespace restriction sysctls at 1. The existing documented
disposable systemd-executor namespace opt-in was applied. Original retained
infrastructure was not booted or changed.

In new scratch, copy `repro/Cargo.toml` and lockfile, copy a selected Rust variant
to `src/main.rs`, and copy `raw/fixture.html` to the scratch root. The manifest
expects this repository read-only at `/repo`:

```sh
CARGO_BUILD_JOBS=2 cargo build --release --locked --offline
sha256sum target/release/pn-wry-inline-spike
```

Install the diagnostic as `/probe/pn-wry-inline-spike` in the disposable guest,
and the corresponding observer as `/mnt/observer.py`; `/mnt` must be a writable
disposable evidence directory. In the ordinary authenticated X11/user-bus session,
with the supported TCG rendering variables set to 1, start:

```sh
/probe/pn-wry-inline-spike > /mnt/host.log 2>&1
python3 /mnt/observer.py > /mnt/observer.log 2>&1
```

Use separate terminals and preserve every attempt separately. The observer needs
the exact tested UID 1000/user-manager layout. Its forced-focus phase is explicitly
diagnostic; its targeted Stop check is not a substitute for production acceptance.

The fresh guest was powered down and the new runtime container/heavy artifacts/
ephemeral keys are removed after preserving small logs/sources/screenshots. A
separately authorized **local-only clean distro tooling image** is retained to
avoid repeated provisioning. Its flattened filesystem was audited offline to
exclude SSH keys/root authorization/probe/source/log contents; unsuitable
intermediate cache images/helpers were removed. It is tooling, not an accepted
runtime image or a publication. No sandbox or resource limit was weakened.
