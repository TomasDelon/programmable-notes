# Linux Tauri/WebKitGTK validation

This procedure is required before treating native preview as safe for hostile documents. No step may be replaced by Chromium, a missing JavaScript global, configuration inspection, or a passing mock test.

Current package-specific results and unresolved gates are linked from
[implementation status](IMPLEMENTATION_STATUS.md). The [latest complete matrix](security-evidence/2026-11-19-current-stress/README.md)
contains four passes and a failed memory/OOM acceptance gate; earlier successes
do not certify later binaries.

## Milestone 3 production configuration

The historical debug/test-feature procedure below remains useful, but does not establish production package behavior. New production work, actual results and limitations are recorded in the [2026-11-18 evidence](security-evidence/2026-11-18/README.md). Read [ADR-004](decisions/ADR-004-linux-persistence-and-production.md) for the authorized file store, actual namespace enforcement, WebKit process sandbox and residual native risks.

Build/install the optimized package as described in [Linux desktop testing](LINUX_DESKTOP_TESTING.md). Start tauri-driver in the same ordinary graphical user session. Then create external test launchers (the installed binary receives no test feature or additional permission):

```sh
NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs
# Source the env.sh path printed by setup, then:
. /tmp/pn-native-REPLACE/env.sh
npm run native:test > production-ipc.log 2>&1
npm run native:persistence:test > production-persistence.log 2>&1
node scripts/native-lifecycle.mjs > production-lifecycle.log 2>&1
NATIVE_DISPOSABLE_PROFILE=1 npm run native:stress:test > production-stress.log 2>&1
npm run native:editor:test > production-editor-cpu.log 2>&1
npm run native:editor:test -- --pressure > production-editor-heap.log 2>&1
```

Run once per new fixture directory; persistence tests intentionally create Save As targets and should not overwrite an earlier run's files. The editor wrapper records its actual PID; the preview wrapper feeds fixed trusted HTML over stdin solely for direct ACL/profile probes. The latter is outside the supervisor and therefore never proves resource containment. Real supervised children keep automation=false; interaction uses an external OS accessibility driver. Production stress cases also inspect actual WebProcess NoNewPrivs/seccomp.

The controlled heap editor test requires a rendered marker set only after two retained, touched 16 MiB allocations. Busy WebKit on this TCG stack painted that marker while its accessibility subtree remained unavailable. `scripts/native-visible-text.py` therefore observes this marker through a non-root, preview-PID/window-bound X11 screenshot and exact English OCR. It verifies process start identity, an unobscured stable EWMH client window, and exact whole-client normalized text; it cannot accept a merely high startup RSS. Openbox/EWMH and Tesseract English data are required for this X11 automation. Counter clicks still use AT-SPI. The OCR deadline is 55 seconds and never extends the 60-second preview lifetime. Wayland automation is not claimed by this procedure.

The persistence suite uses real native pickers and exact UTF-8/CRLF file bytes, atomic inode replacement, mode preservation, read-only errors/retry, forged-grant refusal, external-change conflicts, cancelled dialogs, Save As, reopen and interactive source rebuilding. The editor CPU/heap suites now require actual authorized disk writes during attacks; historical Blob observations are not substituted. Lifecycle covers dirty-close cancellation and saved-source reopening after a clean application restart. Backend tests additionally cover xattrs, hardlinks, symlink/FIFO refusal and races; the native GUI save checks a real POSIX ACL. Distinguish backend tests from GUI coverage.

On restricted Ubuntu, first run the strict namespace negative control: a service request can succeed while PrivateNetwork was skipped. The application must refuse before sending author input. Keep actual namespace inode, NoNewPrivs, cgroup and payload-sentinel evidence. Administrator opt-in configuration and its scope must be recorded separately; the package never installs a systemd executor exception or changes global namespace sysctls.

## Build prerequisites

Use a Linux desktop with cgroup v2, a running systemd user manager, delegated cpu/memory/pids controllers, user namespaces enabled, and a graphical session. PrivateNetwork must work for user services; if this distribution cannot supply it, preview must refuse to start. Do not disable it as a workaround.

Ubuntu 24.04 example (administrative package install):

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf webkit2gtk-driver xvfb xauth xdotool python3-pyatspi dbus-user-session dbus-x11 acl xdg-desktop-portal xdg-desktop-portal-gtk openbox x11-utils tesseract-ocr tesseract-ocr-eng
# Install Rust from rustup with TLS verification intact, then:
rustup component add rustfmt
cargo install tauri-driver --version 2.1.0 --locked
npm ci
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo fmt --manifest-path native-policy/Cargo.toml -- --check
npm run native:policy:test
cargo fmt --manifest-path native-documents/Cargo.toml -- --check
npm run native:documents:test
# Optional legacy ACL-shell build, distinct from installed production validation:
npm run native:build -- --debug --features custom-protocol,security-test
cargo test --manifest-path src-tauri/Cargo.toml --features custom-protocol,security-test --locked
```

The native build requires GLib/GTK/WebKitGTK and links the binary. `cargo check` alone does not prove launch. Rust Cargo.lock files are committed. Cargo resolves package artifacts with registry checksums; do not fake pkg-config files or disable verification.

For this cloud's writable Rust install only:

```sh
export CARGO_HOME=/workspace/.cache/cargo
export RUSTUP_HOME=/workspace/.cache/rustup
export PATH="$CARGO_HOME/bin:$PATH"
```

`npm run native:dev` opens the editor, but intentionally refuses preview because the private network cannot reach Vite. An embedded `custom-protocol` build is mandatory for preview validation.

## Automated real-native suite

On the graphical Linux machine, launch `tauri-driver --port 4444` in a separate terminal. It starts the actual WebKitWebDriver. Run:

```sh
npm run native:test
```

Set NATIVE_BINARY to an absolute path if necessary. WEBDRIVER_URL defaults to http://127.0.0.1:4444. Missing binary/display/driver exits 2 with NOT RUN. Any IPC/React/resource assertion failure exits nonzero. The suite does not skip failed assertions.

The test-feature editor shell first proves host_probe is callable from editor, launches an actual service, inspects the effective cgroup limits, stops it and requires its cgroup to disappear. The test-feature preview shell calls those same registered commands directly and requires denial, probes the absent fs/shell/http plugins, loads compiled handoff Counter MDX in the sandbox iframe, clicks twice to Count: 2, and requires iframe parent DOM/storage denial. A missing native invoke bridge is a failure. Test-only shells contain the same ACL/handler checks as production. The probe-only session bypasses process launch for WebDriver attachment; it does not validate resource isolation by itself.

The native suite has now run in a real Ubuntu 24.04 VM created inside this cloud. Retained versions, stdout, screenshot and systemd/cgroup observations are in [the validation record](security-evidence/2026-11-17/README.md). WebKitGTK behavior differs from Chromium; neither Chromium nor cargo check substitutes for this suite.

Additional native tests:

```sh
NATIVE_DISPOSABLE_PROFILE=1 npm run native:stress:test
npm run native:editor:test
npm run native:editor:test -- --pressure
```

The stress suite executes real compiled React/MDX in the production supervised child. It controls the child externally through Linux AT-SPI, matching its native PID; the child has no WebDriver automation and no testing IPC capability. Cases cover CPU throttling/Stop, the exact immediate-allocation fixture below, natural expiry, editor SIGKILL, window close and interactive recovery. Each case reports independently and any failure makes the command fail. Run one case with `NATIVE_DISPOSABLE_PROFILE=1 npm run native:stress:test -- --case=memory` (also `cpu-stop`, `expiry`, `editor-crash`, `window-close`). OOM and expiry require the actual systemd journal cause. A disappearing renderer alone never counts as either.

The current editor suite launches the full installed application using the fixture environment above, observes the browser-WASM compiler, opens a real file through the native picker, tests actual CodeMirror input and exact native disk saves under CPU or confirmed growing-heap pressure, and rebuilds additional unsaved source. The immediate-allocation OOM fixture is unchanged and remains separate. Earlier Save Blob captures are historical evidence only; the current test does not substitute a Blob for an actual write. Set `NATIVE_EVIDENCE_DIR` to retain native screenshots and cgroup samples; stdout/stderr must also be retained.

## Automated supervisor-only gates

`npm run native:resource:test` compiles a trusted Rust helper (no GTK needed) and exercises the real Linux service/cgroup supervisor: a CPU loop, memory pressure, whole-group Stop, expiry, and restart after collected units. The helper receives only fixed test modes over stdin after limit verification. Missing/rejected backend exits 2, not PASS. It can take over a minute. It does not exercise WebKit or author JavaScript, and memory-pressure termination still requires journal evidence before labelling it an OOM enforcement pass. It passed in the delegated Ubuntu VM, with separate kernel/journal evidence for the helper OOM. Keep these helper results distinct from the actual WebKit JavaScript tests.

## Resource and termination acceptance

Build a normal embedded app without security-test, open it from a graphical user session, and close other app instances so unit observations are unambiguous. Watch generated units with:

```sh
systemctl --user list-units --all 'programmable-notes-preview-*'
# Substitute the actual unit below:
systemctl --user show UNIT --property=ControlGroup,MemoryMax,MemorySwapMax,CPUQuotaPerSecUSec,TasksMax,RuntimeMaxUSec,KillMode,OOMPolicy,PrivateNetwork
journalctl --user -u UNIT
```

Test ordinary handoff Counter first. Failure to render means the native engine has not passed regardless of ACL/unit tests. Confirm two clicks, live source rebuild, stop and rebuild. Verify editor source remains intact throughout.

Then use each malicious MDX fixture below. These are intentionally unsafe test documents; execute only through the resource-isolated native preview. Never evaluate them in the editor or an ordinary same-origin browser console.

```mdx
export function Loop() {
  while (true) {}
  return null;
}

<Loop />
```

```mdx
export function Pressure() {
  const retained = [];
  while (true) {
    const block = new Uint8Array(16 * 1024 * 1024);
    block.fill(1);
    retained.push(block);
  }
  return null;
}

<Pressure />
```

Required observations, separately for each fixture:

1. Native editor remains responsive and its source can still be edited/saved. Inspect the service's actual cgroup files, not only systemd property strings. Sample cpu.stat and memory.current/memory.peak; verify cpu.max, memory.max, memory.swap.max and pids.max remain bounded.
2. Stop preview terminates the entire service group, including WebKit children; its cgroup must have populated 0 or disappear. Ensure no descendant remains outside it. Rebuild a valid counter and confirm interactivity.
3. Allow a loop to expire naturally after the fixed 60-second service lifetime (observe for up to 75 seconds). Confirm all descendants exit and a subsequent valid rebuild starts. Close the preview window and confirm restart also works. Stop after a collected unit must not permanently disable future builds.
4. For pressure, retain journal/cgroup evidence of OOM or another contained failure; do not equate a JavaScript RangeError with demonstrated cgroup OOM. Confirm memory is bounded, editor survives, no shared-profile data is exposed, and valid rebuild succeeds.
5. Terminate the editor unexpectedly and require the independent preview lifetime limit to remove the remaining service group. Separately revoke controller delegation and require launch failure before any author artifact is sent. No fallback is acceptable.

The automated observations and remaining manual/production-build gates are recorded in the linked validation record; do not infer unrecorded passes. The fixed limits are prototype policy, not measured performance budgets. Long-running legitimate notes expire after 60 seconds and need explicit rebuild.

## Reproducible headless Linux session

Use a disposable Ubuntu 24.04 VM (4 vCPU, 8 GiB is sufficient for these tests) with a real systemd boot. A container sharing an undelegated host cgroup is insufficient. Prefer hardware virtualization; software QEMU TCG was usable here but WebKit startup under the unchanged 25% CPU quota takes tens of seconds. Keep the 60-second service lifetime and 512 MiB memory limit unchanged.

Install the packages and build as above. Confirm `systemctl --user is-system-running` is running/degraded and the user manager has cpu/memory/pids controllers. If delegation is missing, configure it on this disposable VM as administrator, then reboot/log in again:

```sh
sudo mkdir -p /etc/systemd/system/user@.service.d
printf '[Service]\nDelegate=cpu cpuset io memory pids\n' | sudo tee /etc/systemd/system/user@.service.d/delegate.conf
sudo systemctl daemon-reload
# Reboot the VM so its user manager starts with delegation.
```

As the ordinary graphical/test user, create a private authenticated Xvfb session and enable accessibility **before** starting applications:

```sh
export DISPLAY=:99
export LANG=C.UTF-8
unset WAYLAND_DISPLAY
export XAUTHORITY="$XDG_RUNTIME_DIR/pn-Xauthority"
touch "$XAUTHORITY"
chmod 600 "$XAUTHORITY"
xauth -f "$XAUTHORITY" add "$DISPLAY" . "$(mcookie)"
Xvfb "$DISPLAY" -screen 0 1280x900x24 -nolisten tcp -auth "$XAUTHORITY" > xvfb.log 2>&1 &
openbox > openbox.log 2>&1 &
gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method org.freedesktop.DBus.Properties.Set org.a11y.Status IsEnabled '<true>'
gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method org.freedesktop.DBus.Properties.Set org.a11y.Status ScreenReaderEnabled '<true>'
```

Earlier headless runs encountered llvmpipe crashes before these supported rendering switches were set. They change rendering, not sandboxing. The current supervisor forwards them from the trusted editor environment through its clean allowlist, so export them before launching the editor/driver; manager-only values are not forwarded.

```sh
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
# Build/install the production package using LINUX_DESKTOP_TESTING.md first.
tauri-driver --port 4444 > driver.log 2>&1 &
pn_native_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_native_env"
npm run native:test > native-ipc.log 2>&1
npm run native:persistence:test > native-persistence.log 2>&1
npm run native:lifecycle:test > native-lifecycle.log 2>&1
node scripts/native-environment.mjs > native-environment.log 2>&1
NATIVE_DISPOSABLE_PROFILE=1 npm run native:stress:test > native-stress.log 2>&1
npm run native:editor:test > native-editor.log 2>&1
npm run native:editor:test -- --pressure > native-editor-pressure.log 2>&1
npm run native:resource:test > native-resource.log 2>&1
```

Never use a WebKit sandbox-disable variable to obtain a successful application run, remove PrivateNetwork, share the editor profile, enable production-child automation, loosen a cgroup limit or replace a failed assertion with a skip. Deliberate environment-poison negative controls must prove rejection or sanitization rather than successful weakened execution. The current AT-SPI driver allows 55 seconds for slow native startup while the independent service lifetime remains 60 seconds. Its outer process timeout is 65 seconds; that cannot extend an expired service. The earlier production candidate needed about 50 seconds after the launch reply under TCG; an old 45-second test deadline failed correctly, and both immediate and deferred 55-second polling subsequently reached Count: 2. Keep logs from failed attempts as well as successful retries.

## Missing-controller negative test

Run on the disposable VM as administrator, using a **different** user so the real editor's controller delegation is unaffected. Build `cargo build --manifest-path native-policy/Cargo.toml --locked --example resource_gates` first and copy its binary to an executable path accessible to the test user (for example `/opt/pn-resource-gates`). Select a free UID; 1001 is used below.

```sh
sudo useradd -m -u 1001 -s /bin/bash pn-denied
sudo mkdir -p /run/systemd/system/user-1001.slice.d
printf '[Slice]\nDisableControllers=cpu\n' | sudo tee /run/systemd/system/user-1001.slice.d/no-cpu.conf
sudo systemctl daemon-reload
sudo loginctl enable-linger pn-denied
sudo systemctl start user@1001.service
cat /sys/fs/cgroup/user.slice/user-1001.slice/user@1001.service/cgroup.controllers
sudo runuser -u pn-denied -- env XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus /opt/pn-resource-gates
# Expected exit 2, specifically Cannot verify cpu.max; not a success exit.
sudo find /run/user/1001 -maxdepth 1 -name 'pn-preview-payload-*'
# Must print nothing: no author payload was delivered.
```

The helper writes a sentinel only after it has received nonempty stdin. Also run it successfully as the delegated main user to establish the positive control. Inspect the generated service cgroups and retain `journalctl --user -u UNIT` plus administrator `journalctl -k` for memory events. Destroy the disposable VM after collecting evidence.

## Infrastructure scope and remaining gates

The outer Codex workspace still has no user manager, delegated cgroups, GTK or display. Rootless Docker provides package installation but its cgroup driver is none, so it cannot validate containment directly. A full Ubuntu guest with its own kernel, systemd, cgroup v2 controllers, user bus and Xvfb supplied the missing boundary. KVM is not exposed by the outer host; the guest ran with QEMU TCG. No host cgroup was mounted writable and no security assertion was skipped for that infrastructure.

See [the dated validation record](security-evidence/2026-11-17/README.md) for precise passes, failures and outstanding gates. CI compile results remain separate from runtime evidence. Native filesystem save, non-Linux supervisors, broad compromised-native-code containment and production packaging are not established by these tests. Visual editing remains deferred.

## Failure evidence and startup diagnosis

The stress runner requires NATIVE_DISPOSABLE_PROFILE=1. Each returned unit is
registered before policy/readiness checks, and a whole-case failure stays attached
to every corresponding unit. Keep its report and stderr on failure; a completed
termination sub-observation is not a whole-case pass. Raw generated evidence is
marked separately from the visible summaries for review.

For a separate static/no-JavaScript versus real Counter startup comparison using
the same production limits, run `NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-startup.mjs`
with a fresh fixture env. It records accessibility timing, CPU/memory/process
samples and verified before-expiry cleanup. It does not replace any stress gate
or prove pixel visibility. [Executed startup comparison](security-evidence/2026-11-19-startup-probe/README.md).

## Preview downloads

The preview child explicitly rejects native download requests in addition to the
iframe's absence of `allow-downloads`, its hash CSP and navigation policy. Keep
this callback: Wry's default handler permits implicit Downloads/current-directory
writes, independently of native IPC permission checks. The trusted editor's
explicit document Save/Save As operations are unchanged.

In a disposable Linux desktop account, build the separate native callback harness
and run both callback and packaged-MDX tests. The helper is not a shipping app or
an author-accessible API. Build the production package separately as described
above; start the external driver and source a fresh fixture environment for each
command. Use the pinned Rust dependencies and normal enabled WebKit sandbox.

```sh
cargo build --manifest-path src-tauri/Cargo.toml --locked --release \
  --example download-policy --features custom-protocol
NATIVE_DISPOSABLE_PROFILE=1 \
  NATIVE_DOWNLOAD_PROBE="$PWD/src-tauri/target/release/examples/download-policy" \
  node scripts/native-download-policy.mjs
# Intentional negative: must exit 1, with its verified canary recorded/removed.
NATIVE_DISPOSABLE_PROFILE=1 \
  NATIVE_DOWNLOAD_PROBE="$PWD/src-tauri/target/release/examples/download-policy" \
  node scripts/native-download-policy.mjs --without-deny-handler
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-download-sandbox.mjs
```

The callback positive control must actually write exact synthetic bytes; absence
of a file from an attempted anchor without that control is inconclusive about the
native callback. The packaged-MDX case requires automatic and clicked completion,
no canaries in the tested destination directories, ordinary child automation off,
private networking, unchanged effective cgroup bounds, editor IPC responsiveness
and Stop cleanup before earliest expiry. It does not replace the full memory,
CPU, expiry/crash-recovery matrix or establish a successful iframe escape.
[Real results and failed observer attempts](security-evidence/2026-11-19-native-downloads/README.md).

## Connection feedback is not termination evidence

`preview_connection_active` is an argument-free editor-only read. Native label/
child authorization runs again before reading the owned `systemd-run --wait`
handle. It retains unit/child ownership for Stop even after disconnection; preview
code has no permission. The UI's bounded serial read never restarts or extends
execution or authorizes source/filesystem changes. “Connected” does not establish
renderer health; “ended or disconnected” does not establish an empty cgroup or a
cause. Native tests independently check journals, monotonic unit age and cgroups.
A UI Stop acceptance test must observe UI-caused cgroup removal before cleanup;
an additional direct Stop would mask a failure. See [actual evidence and fault
controls](security-evidence/2026-11-19-session-status/README.md) and ADR009.
