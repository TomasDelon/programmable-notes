# Linux desktop testing package

Build with Node from `.nvmrc`, Rust stable and the native development packages listed in [NATIVE_SECURITY.md](NATIVE_SECURITY.md). No test feature is included:

```sh
npm ci
npm run native:package
node scripts/verify-linux-package.mjs 'src-tauri/target/release/bundle/deb/Programmable Notes_0.1.0_amd64.deb'
sudo apt install './src-tauri/target/release/bundle/deb/Programmable Notes_0.1.0_amd64.deb'
programmable-notes
```

The optimized Debian package is a testing artifact, not a public release. Installation requires AppArmor 4, bubblewrap, xdg-dbus-proxy, systemd >=252 and its desktop/runtime dependencies. Installation loads only the application's own namespace profile. Preview requires cgroup v2 delegation, a systemd user manager, functioning unprivileged namespaces and actual PrivateNetwork enforcement. Refusal is expected when those prerequisites are absent; do not disable sandboxing to make it launch.

On Ubuntu with restricted user namespaces, review the [production boundary decision](decisions/ADR-004-linux-persistence-and-production.md) and dated infrastructure procedure. A systemd executor namespace opt-in is an administrator decision outside the package. Never set a global namespace-restriction sysctl to zero to satisfy this test.

Use Open files to authorize `.mdx` and its explicitly selected source modules together. Save writes only that grant; Save As opens another native chooser. External changes cause a conflict. Preserve local edits with Save As, or explicitly Reopen source to discard them after confirmation. Files are UTF-8 and preserve CRLF bytes. There is no autosave/crash draft recovery. Read-only files remain unchanged on error.

In a disposable desktop account, test normal launch and two Counter clicks, edit/rebuild, native file open/save/reopen, cancelled pickers, external modification conflict, read-only retry, dirty window-close cancellation, clean shutdown and a fresh launch. Verify exact disk bytes, not only a UI toast. Preview expires after 60 seconds by policy; rebuild explicitly.

For headless software rendering, these supported WebKit options can be used without disabling its sandbox:

```sh
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
programmable-notes
```

They must be available to the editor process. Run an additional test without them on physical GPU/display hardware. A QEMU TCG/Xvfb pass establishes only software-rendering compatibility on the recorded stack.

Production security automation and exact evidence are linked from [NATIVE_SECURITY.md](NATIVE_SECURITY.md). Package inspection, cargo check and a successful install are not runtime security passes.

On the recorded QEMU TCG/Xvfb stack, launch without those rendering variables failed with Mesa llvmpipe thread segfaults before the editor could create a preview. The same installed binary passed the complete normal-desktop Counter/shutdown check with both variables set to 1. This is a documented compatibility limit of the tested virtual display/graphics stack; physical GPU and Wayland behavior has not been validated. Keep sandboxing enabled when reproducing or investigating it.

## Visual editing smoke test

In a disposable account, create a UTF-8 MDX fixture with CRLF line endings, a plain heading and paragraph, a simple list and adjacent JSX. Keep a byte copy of the original. Open the fixture through the installed application's file picker and choose **Edit rendered Markdown**. Edit one list item. Open another source and return to the fixture, then undo and redo the edit with the source editor focused.

Save through the native editor, verify the disk bytes against a copy of the fixture with only the expected item text changed, and use **Reopen source**. Rebuild the preview and verify the edited list and continued React interactivity. Check that the preview has no editor capabilities using the production procedure in [NATIVE_SECURITY.md](NATIVE_SECURITY.md). Record the package hash, WebKitGTK version, session type and result. The Chromium export and import tests cover this source path in the browser. The native graphical round trip requires its own run.

## Packaged acceptance runner

Use the installed .deb in a disposable Ubuntu desktop profile with a working user systemd manager and the prerequisites in [NATIVE_SECURITY.md](NATIVE_SECURITY.md). Start the external WebKit driver and source a fresh fixture environment from `scripts/native-test-setup.mjs`. Run:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-acceptance.mjs
```

The runner requires an empty recovery slot and a fresh fixture directory. It edits a CRLF MDX file through the desktop editor, checks undo and redo, verifies exact saved bytes, cancels a dirty close, and relaunches the application. It then checks explicit recovery, collision refusal, invalid UTF-8 rejection and deletion of its own draft. Run the separate native IPC suite to verify the preview cannot call the recovery command. The browser demo is available as `playable-editor-demo` under Artifacts on successful PR workflow runs.
