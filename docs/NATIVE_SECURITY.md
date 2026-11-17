# Linux Tauri/WebKitGTK validation

This procedure is required before treating native preview as safe for hostile documents. No step may be replaced by Chromium, a missing JavaScript global, configuration inspection, or a passing mock test.

## Build prerequisites

Use a Linux desktop with cgroup v2, a running systemd user manager, delegated cpu/memory/pids controllers, user namespaces enabled, and a graphical session. PrivateNetwork must work for user services; if this distribution cannot supply it, preview must refuse to start. Do not disable it as a workaround.

Ubuntu 24.04 example (administrative package install):

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf webkit2gtk-driver xvfb xauth xdotool python3-pyatspi dbus-user-session dbus-x11
# Install Rust from rustup with TLS verification intact, then:
rustup component add rustfmt
cargo install tauri-driver --version 2.1.0 --locked
npm ci
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo fmt --manifest-path native-policy/Cargo.toml -- --check
npm run native:policy:test
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
npm run native:stress:test
npm run native:editor:test
npm run native:editor:test -- --pressure
```

The stress suite executes real compiled React/MDX in the production supervised child. It controls the child externally through Linux AT-SPI, matching its native PID; the child has no WebDriver automation and no testing IPC capability. Cases cover CPU throttling/Stop, the exact immediate-allocation fixture below, natural expiry, editor SIGKILL, window close and interactive recovery. Each case reports independently and any failure makes the command fail. Run one case with `npm run native:stress:test -- --case=memory` (also `cpu-stop`, `expiry`, `editor-crash`, `window-close`). OOM and expiry require the actual systemd journal cause. A disappearing renderer alone never counts as either.

The editor suite launches the full application, observes the browser-WASM compiler, tests actual CodeMirror input and exact Save source Blob during a busy WebKit preview, and requests an unsaved source rebuild. The `--pressure` variant edits during a controlled growing heap and tests Stop/rebuild; it complements the separate immediate-allocation OOM fixture, which is unchanged. Blob capture verifies the save payload; it is explicitly not a native filesystem-write test. Set `NATIVE_EVIDENCE_DIR` to retain native screenshots and stress cgroup samples; stdout/stderr must also be retained.

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
export XAUTHORITY="$XDG_RUNTIME_DIR/pn-Xauthority"
touch "$XAUTHORITY"
chmod 600 "$XAUTHORITY"
xauth -f "$XAUTHORITY" add "$DISPLAY" . "$(mcookie)"
Xvfb "$DISPLAY" -screen 0 1280x900x24 -nolisten tcp -auth "$XAUTHORITY" > xvfb.log 2>&1 &
gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method org.freedesktop.DBus.Properties.Set org.a11y.Status IsEnabled '<true>'
gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method org.freedesktop.DBus.Properties.Set org.a11y.Status ScreenReaderEnabled '<true>'
```

On a software-rendered VM, llvmpipe crashed before these supported rendering switches were set. They change rendering, not sandboxing. The supervisor gets them from the user manager's environment, so exporting them only for tauri-driver is insufficient:

```sh
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
systemctl --user set-environment WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1
tauri-driver --port 4444 > driver.log 2>&1 &
export NATIVE_EVIDENCE_DIR="$PWD/test-results/native"
npm run native:test > native-ipc.log 2>&1
npm run native:stress:test > native-stress.log 2>&1
# For the full editor, build without the probe feature:
npm run native:build -- --debug --features custom-protocol
npm run native:editor:test > native-editor.log 2>&1
npm run native:editor:test -- --pressure > native-editor-pressure.log 2>&1
npm run native:resource:test > native-resource.log 2>&1
```

Never set a WebKit sandbox-disable variable, remove PrivateNetwork, share the editor profile, enable production-child automation, loosen a cgroup limit or replace a failed assertion with a skip. The AT-SPI driver allows 45 seconds for slow native startup while the independent service lifetime remains 60 seconds. Keep logs from failed attempts as well as successful retries.

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
