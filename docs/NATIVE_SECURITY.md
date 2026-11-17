# Linux Tauri/WebKitGTK validation

This procedure is required before treating native preview as safe for hostile documents. No step may be replaced by Chromium, a missing JavaScript global, configuration inspection, or a passing mock test.

## Build prerequisites

Use a Linux desktop with cgroup v2, a running systemd user manager, delegated cpu/memory/pids controllers, user namespaces enabled, and a graphical session. PrivateNetwork must work for user services; if this distribution cannot supply it, preview must refuse to start. Do not disable it as a workaround.

Ubuntu 24.04 example (administrative package install):

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf webkit2gtk-driver xvfb
# Install Rust from rustup with TLS verification intact, then:
rustup component add rustfmt
cargo install tauri-driver --version 2.1.0 --locked
npm ci
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo fmt --manifest-path native-policy/Cargo.toml -- --check
npm run native:policy:test
npm run native:build -- --debug --features custom-protocol,security-test
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

The driver/capability/iframe script is committed but UNRUN in the cloud. Even its first successful Linux run must retain exact versions, stdout, screenshots and systemd/cgroup observations. WebKitGTK behavior may differ from Chromium; investigate every failure.

## Automated supervisor-only gates

`npm run native:resource:test` compiles a trusted Rust helper (no GTK needed) and exercises the real Linux service/cgroup supervisor: a CPU loop, memory pressure, whole-group Stop, expiry, and restart after collected units. The helper receives only fixed test modes over stdin after limit verification. Missing/rejected backend exits 2, not PASS. It can take over a minute. It does not exercise WebKit or author JavaScript, and memory-pressure termination still requires journal evidence before labelling it an OOM enforcement pass. On this cloud it is NOT RUN because the user manager is unavailable; the supervisor refuses launch.

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

These stress/lifetime observations are not automated or run in this cloud and remain release blockers. The fixed limits are prototype policy, not measured performance budgets. Long-running legitimate notes expire after 60 seconds and need explicit rebuild.

## Cloud evidence and exact blockers

A workspace-local Rust 1.100.0 toolchain was installed with TLS/checksum verification. Four dependency-free Rust policy tests pass; JS configuration/adapter tests and the browser suite run separately. Tauri dependency resolution and ACL generation succeeded, but Linux cargo check stops in glib-sys because glib-2.0.pc is absent; GTK/WebKitGTK development packages, display and WebKit driver are absent. This uid has no sudo/root package installer. The user systemd bus is unavailable, cgroup mount is not writable/delegated, and bubblewrap user-namespace creation fails. A Windows cross-check also stops in resource generation because the MinGW windres tool is absent; it is not a Linux native pass.

Native build, native IPC denial, actual WebKitGTK Counter, delegated resource/namespace enforcement, memory pressure, stop/expiry/restart and native profile separation: NOT RUN. Do not mark Milestone 1 or Spike B complete. CI adds a Linux compile gate; its result is separate from runtime evidence and must be read from PR #1.
