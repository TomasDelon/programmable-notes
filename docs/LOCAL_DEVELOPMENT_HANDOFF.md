# Local Linux development handoff

28 November 2026. Today's outcome is **a reproducible transfer of development to
the owner's computer**, not completion of all product acceptance gates. Stop
adding cloud-only debugging infrastructure. Cloud caches are expendable; Git is
the source of code, requirements, tests and durable evidence.

## Exact checkpoint

- Repository: https://github.com/TomasDelon/programmable-notes
- Working branch: `fix/preview-markdown-input`; actual open draft is PR #9,
  targeting `feat/cloudflare-pages-testing`. Do not switch to historical PR #1 or
  `feat/mdx-react-engine` merely because an old prompt names them.
- Application-code checkpoint: `f02db0d8b1662b225c0ecc7805f977230e7fc0ab`.
  Later handoff-only commits do not change its application behavior.
- [CI46079096696](https://github.com/TomasDelon/programmable-notes/actions/runs/46079096696)
  passed both required jobs at that checkpoint, including SDK compilation,
  optimized Debian packaging, native backend tests and failure injection.
  Duplicate manual run46079124498 was cancelled; it is not passing evidence.
- No further installed test was dispatched for the Home initialization before
  this transfer. Its actual GUI effect is **not yet verified**.

## Read in this order

1. [AGENTS](../AGENTS.md), [product contract](PRODUCT_CONTRACT.md),
   [target architecture](ARCHITECTURE_TARGET.md), [acceptance gates](PRODUCT_ACCEPTANCE.md).
2. This handoff, [implementation status](IMPLEMENTATION_STATUS.md),
   [living plan](plans/unified-local-vault.md), [agent workflow](AGENT_WORKFLOW.md).
3. [Native security](NATIVE_SECURITY.md), the **shared candidate introduction** in
   [desktop testing](LINUX_DESKTOP_TESTING.md), ADR042 and ADR043 in `docs/decisions`.
4. [Dated source-bound evidence](security-evidence/2026-11-27-shared-product/README.md).
5. [Original handoff](handoff/CODEX_START_HERE.md), its product/architecture/test
   matrix/research; original research is supporting evidence, not automatic
   implementation authority. Later owner corrections govern.
6. [Design reference and original ZIP](design-reference/2026-11-18/README.md),
   `docs/superpowers/specs` and `docs/decisions` when relevant. Do not redesign now.

The old `LINUX_LOCAL_EDITOR.md`, `/engine` demos and lower historical sections
of other guides describe the rejected manual-Save/Split/separate-window product.
They are provenance, not instructions to recreate it. The original files remain
available in Git; do not delete evidence to simplify the story.

## Product and code map

The target is a real local vault with automatic writes, Source/Preview only,
lossless Markdown editing and React inside the same document/window. Obsidian is
a persistence analogy, not a UI to clone. Browser and native behavior are not
fully equivalent yet; do not claim platform parity from shared components alone.

| Area                                | Entry point                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Shared workspace and chrome         | `src/product/ProductRoot.tsx`                                                   |
| Native boot/platform services       | `src/desktop/nativeProductBootstrap.ts`, `nativeProductServices.ts`             |
| Local vault and canonical sessions  | `src/application/nativeWorkspace.ts`, `nativeProduct.ts`, `documentSessions.ts` |
| Editor-owned direct editing         | `src/editor/rendered/RenderedEditor.tsx` and existing editor modules            |
| Native commands, OS picker          | `src-tauri/src/documents.rs`                                                    |
| Files, atomic saves, recovery       | `native-documents/`                                                             |
| Supervisor and containment          | `native-policy/`, `src-tauri/src/preview_*`                                     |
| Fixed experimental React diagnostic | `scripts/native-inline-react-v1/` (current profile guarded-v2)                  |

The native entry mounts the shared ProductRoot. Its selected vault writes real
files automatically; it must not fall back to browser storage. Recovery creates
an explicit new copy and never silently overwrites an original. General native
React remains disabled; a separate preview-window fallback is not accepted.

## Local machine setup

Inspect distribution, architecture, session type, existing tools and checkout
before changing anything. Reference packaging is Ubuntu24.04/Debian amd64;
other distributions/architectures are not certified. Do not install an amd64 DEB
on another architecture or blindly run apt on a non-Debian distribution.

Pins: **Node24.22.1**, **npm11.9.0**, **Rust1.100.0 with rustfmt**. `.nvmrc`,
`package.json` and `rust-toolchain.toml` are authoritative. Use an existing
user-owned version manager; do not use sudo npm or replace a system Node install.
If nvm is already installed:

```sh
nvm install
nvm use
npm install --global npm@11.9.0
npm ci
npx playwright install --with-deps chromium
```

Rustup selects the pinned toolchain automatically; install it if missing:

```sh
rustup toolchain install 1.100.0 --profile minimal --component rustfmt
```

Ubuntu24.04 build dependencies (OS installation requires local administrator
permission; adapt after detecting the distribution):

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf
```

Do not copy `/workspace` paths, `node_modules`, `target`, cloud toolchain paths,
cloud environment variables, SSH keys or authentication from the cloud machine.
Keep legitimate local tool configuration. Playwright should use its matching
installed browser; remove inherited cloud-only executable/cache overrides.
No Cloudflare token, database account, paid backend or public server is required.

## Build and run locally

From the checkout root, use the existing scripts:

```sh
npm run native:wry:verify
npm run native:dev
```

The development command owns Vite on127.0.0.1:5173 and launches Tauri. Do not also
start a conflicting Vite server. For production-configuration acceptance:

```sh
npm run native:package
npm run native:package:verify
sudo apt install --reinstall './src-tauri/target/release/bundle/deb/Programmable Notes_0.1.2_amd64.deb'
programmable-notes
```

Close old running versions before installing; replacement on disk does not
replace an existing process. Preserve all existing notes and application/recovery
data. Use disposable data for first trials. Do not launch destructive crash,
resource or legacy automation against the owner's normal desktop profile.

The package declares runtime dependencies including AppArmor4+, systemd252+,
DBus user session, bubblewrap, xdg-dbus-proxy and PackageKit. A graphical Polkit
agent is needed for installer authorization. Preview containment additionally
requires real delegated cgroup-v2 CPU/memory/pids and private network namespaces.
Never use sandbox-disable flags, global namespace sysctl relaxations or fake
receipts to bypass an unavailable requirement. Ordinary editor development can
continue while general native React stays refused.

An already-built engineering package is also available from
[CI46079096696](https://github.com/TomasDelon/programmable-notes/actions/runs/46079096696/artifacts/15236735413).
With local GitHub CLI authentication, download into a fresh directory:

```sh
pn_package_dir=$(mktemp -d "${TMPDIR:-/tmp}/pn-f02db0d-package.XXXXXX")
gh run download 46079096696 --repo TomasDelon/programmable-notes --name linux-amd64-testing --dir "$pn_package_dir"
```

Check SHA256SUMS, build.json and the existing production-package inspector before
installation. Bind build.json.sourceTree to `git rev-parse f02db0d^{tree}`;
sourceRevision can be a PR merge commit, so compare the tree rather than assuming
the revision string equals the branch head. `scripts/verify-native-shared-artifact.mjs` deliberately
requires an exact tree; `native:package:verify` only inspects the DEB and does not
perform that build.json provenance comparison. In the artifact verifier, do not compare this old artifact against a later
handoff-only HEAD and weaken the assertion when it refuses. Build locally if the
artifact expired or local authentication is unavailable. Version0.1.2 alone does
not identify the UI; inspect build identity to avoid the old rejected package.

## First local acceptance task

Cloud run46077685409 onbf365d7 reached the real shared app and exact folder path
entry, but refused a matching GTK button with visible/showing=true and
enabled/sensitive=false (1100). Cleanup passed. This was not a filesystem denial.
The subsequent7-line change in f604cc4 gives the picker a trusted platform Home
starting directory. It does not grant Home access, accept a folder, force a button
state or change permissions. Its SDK build passed; its GUI result remains open.

1. Reproduce with the actual packaged application and a disposable vault. Observe
   the real picker directly. Verify cancellation preserves the current scope,
   then select the fixture through the OS dialog. Do not invoke a grant API from
   WebDriver JavaScript or substitute a mock port.
2. Open a synthetic MDX with BOM, mixed CRLF/LF, Unicode, comments and opaque JSX.
   Edit Source, independently inspect disk bytes/mode, undo/redo; edit supported
   Preview text, switch modes and verify unrelated bytes remain identical.
3. Close normally, require process exit, launch again, re-authorize the vault and
   reopen the exact file. Verify invalid source can still save and recover.
4. Follow [installed recovery acceptance](plans/native-recovery-installed-acceptance.md)
   in a disposable account/VM: actual app-generated pending snapshot, real restart,
   cancellation, invalid sibling, exclusive new-copy restore, no original overwrite.
5. Record engine/session/source/artifact identity, screenshots and exact failures.
   Fix the discriminated cause before expanding scope. See the source-bound
   earlier receipts; do not retry cloud observers unchanged.

GTK source supports an empty-Recent/selection explanation for the disabled button,
but the actual mode was not observed. No backend fork is justified by the
threading hypothesis: pinned Tao holds the default GLib context for its live loop.
Do not substitute guessed causes for local observation.

## Tests, evidence and what remains open

```sh
npm run check
npm run test:product:browser
npm run native:policy:test
npm run native:documents:test
npm run native:autosave:test
npm run native:updates:test
```

`check` includes formatting/lint/types, units/tooling, Chromium and local
Pages/workerd/D1 cases. These are disposable local test services, not activation
of the paused cloud backend. Leave4173,4174 and4185 available. Gitleaks-dependent
tooling controls can skip when its pinned binary is absent; run
`bash scripts/scan-secrets.sh` to install/verify the scanner, then set
`PN_GITLEAKS_BIN="$PWD/.cache/security-tools/gitleaks"` for the final tooling run.
Report skipped controls explicitly. Before pushing, scan history/archives again.

Existing scoped results, **not newly rerun for this documentation transfer**:

- Local application:1014 unit,159 Chromium,9 Pages,4 local cloud; final tooling194
  with zero skips and static checks passed. Rustfmt passed for the Home change.
- f02db0d required CI passed both jobs and produced the inspected optimized DEB.
- Guarded fixed React helper46075399735 on3b92912 passed pointer/acknowledged
  keyboard input, Stop, natural expiry and cleanup on sealed Debian13/WebKitGTK2.54.3.
  It is not the packaged app, a hostile-workload matrix or a causal startup fix.
- The earlier guarded readiness failure remains retained. Schema2 diagnostic
  flags were not emitted on the successful run; their values are unobserved.
- Actual packaged editing/save/close/restart/recovery and Home GUI correction
  remain unverified. Full inline React geometry/lifecycle/IPC/filesystem/network/
  CPU/both-memory/recovery gates remain open; keep the feature disabled.
- Rename/move/recoverable Trash, continuous external observation and configured
  signed updates remain pending. Physical GPU/Wayland compatibility is separate;
  it does not justify delaying unrelated local editor work or weakening isolation.

## Continue efficiently and safely

Work in English. Use the real local app for feedback. Define one observable
acceptance case, choose one discriminating probe, fix it and run relevant tests.
Delegate independent tasks with exclusive file ownership; avoid duplicate builds
or watchers. Run the full required suite after relevant inputs freeze, and reuse
valid evidence for unchanged inputs with an explicit scope. Maintain current
contract/status/ADRs and coherent commits so the next session needs no chat history.

Keep PR #9 a draft. Do not merge, publish a release, change visibility, activate
paid services, overwrite user data or enable unsafe rendering. Signing/updater
activation requires the owner's later authorization and real key custody; Actions
artifacts are expiring engineering builds, not an update feed.
