# Runtime dependency and native fixture boundaries

Scope: incremental architecture and fixture corrections after `71fc17b`.
This is not native product, provisioning or security acceptance. The separate
native interface remains rejected; no replacement installer is promoted.

## Implemented changes

The shared inline editor no longer imports browser compilation or iframe
presentation. WebApp explicitly supplies WebRenderedRuntime. An absent adapter
shows an unavailable state and cannot silently execute through the browser path.
The existing source/history and island compilation/lifetime behavior is retained.
Whole-document execution still belongs to WebApp and is not yet platform-neutral.

The versioned native fixture launcher constructs only a fixed share-free QEMU
command. Strict configuration/layout controls reject overlapping or symlinked
roots, aliases, unsafe permissions, unknown fields and extra arguments. Descriptor
pinning protects boot input identity; the private key is checked without reading
its contents or passing it to QEMU. Output is capped at 16 MiB and child ownership
survives spawn-time signals. Monotonic expiry, interruption and excessive output
enter bounded terminate/kill/reap cleanup.

Independent review found three concrete issues in the initial launcher: inode
aliases through bind mounts, interruption before capturing process ownership, and
unbounded serial output. Regression controls now cover all three. No host mounts,
guest, container or QEMU invocation was used to exercise these cases. Bind-mount
identity cases substitute inode metadata; actual bind mounts were not performed.

## Reproduction

From the repository root on Linux with the pinned Node/npm dependencies installed:

```sh
npm run prepare:runtime
npx vitest run tests/unit/rendered-runtime-boundary.test.tsx tests/unit/rendered-island-lifecycle.test.tsx
node --test tests/tooling/native-vm-launch.test.mjs
```

The Node fixture invokes Python with isolated mode. It exercises the actual CLI
and temporary file layouts, while QEMU dispatch is mocked. Actual bounded local
pipes exercise output pumping. An inotify positive control distinguishes opening
the synthetic key from reading it; no real private key is generated or disclosed.

The import regression check inspects direct static imports in the shared runtime.
It is not a transitive dependency audit or a JavaScript sandbox. The browser hook
is mocked only in unit cases; real browser regression remains a separate gate.

## Results

The first full check failed in two browser-publication unit fixtures: they mounted
the shared component without an explicit browser renderer. No compiler request
was emitted, so their synthetic reply callback was absent. Supplying the explicit
web adapter repaired the fixtures without changing assertions or the fail-closed
default. The complete affected publication/boundary/lifetime group then passed
33 tests. The first failed log is retained locally rather than treated as a pass.

The corrected complete `npm run check` exited 0: **739 unit, 152 Chromium, 9 local
Pages and 4 inactive-cloud browser tests passed**, plus formatting, lint, strict
types and the production build. Its tooling stage passed 95 with 2 scanner controls
skipped because the optional local scanner environment variable was omitted.
Root then reran the entire tooling suite with the pinned scanner explicitly:

```sh
PN_GITLEAKS_BIN="$PWD/.cache/security-tools/gitleaks" npm run test:tooling
```

That run passed **97 tooling tests, zero failures and zero skips**, including the
29 Python launch controls counted by the Node wrapper and both real synthetic-key
disclosure controls. The scanner is installed/verified by `bash scripts/scan-secrets.sh`;
CI retains its separate mandatory scanner-control step.

Raw logs remain ignored as `.cache/sharefree-final-check.log`,
`.cache/sharefree-tooling-pinned.log` and the first failed check. These are local
execution receipts, not downloadable native evidence. No Rust crate changed or
native Rust/GUI suite was rerun in this packet. No new native runtime evidence is
claimed.

## Remaining gates

The launcher cannot establish image freshness, synthetic credential origin,
public-key-only guest installation, pinned SSH host identity, transfer safety or
successful boot. Corrected end-to-end provisioning must be versioned and reviewed
before any new guest under [NATIVE_SECURITY](../../NATIVE_SECURITY.md).

The current cloud host has no `qemu-system-x86_64`/`qemu-img`, no package helper and
no sudo executable for its unprivileged task user. A previously prepared Docker
tooling image exists, but the current guard executes the host's fixed
`/usr/bin/qemu-system-x86_64` and checks the private key in that same namespace.
It cannot be followed by an unchecked container launch. Host QEMU preparation or
a separately reviewed container/transport integration is required; this is an
environment/interface limitation, not proof that native testing is impossible in
cloud infrastructure. No system policy was changed to bypass it.

The earlier [React pointer diagnostic](../2026-11-26-wry-react-pointer/README.md)
remains excluded from isolation acceptance. Its ESRCH Stop failure is unchanged.
Native keyboard, geometry/multiple islands, Stop/expiry/containment, actual new
command authorization and installed shared-workspace autosave/recovery remain
unverified. No source change here weakens browser/native isolation or enables
authored React to publish source or access files, IPC or shell.
