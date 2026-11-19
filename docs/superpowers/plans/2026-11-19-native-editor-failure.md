# Native editor failure notification implementation plan

> Execute inline using superpowers:executing-plans; use read-only review after implementation.

**Goal:** A real Linux editor-renderer termination must present native recovery guidance and an explicit warned Quit action, including when the old renderer left client_busy set.

**Architecture:** Connect WebKitGTK's native termination signal only to the trusted editor window. Reuse the existing native dialog plugin and pinned GTK dependency. Do not reload, restore or write a document automatically; ignore normal API termination. Keep the separate unprivileged preview unchanged.

**Constraints:** No new IPC/capabilities, JIT/sandbox/resource changes, source transformation or visual redesign. Only actual native termination may trigger the notice. Existing fixed25% CPU/512MiB/0swap/128tasks/60s policy remains.

**Approaches:** Leaving the blank window gives no safe quit/recovery path with stale busy state. Automatic reload loses current buffers and leaves native grants/state inconsistent. Choose a native warned Quit notice: the user explicitly decides to end the failed process and can restore completed snapshots after restarting.

## Tasks

- [x] Write an external installed-app probe: positive-control the existing native dialog, set synthetic client_busy, kill only its identity-verified owned Root renderer, require Editor stopped / Quit editor, and observe Root exit. Run against old ELFff7d4bab… and retain the missing-notice failure plus original close-guard behavior. No document writes in this baseline.
- [x] Add `src-tauri/src/renderer_failure.rs::install(&WebviewWindow) -> tauri::Result<()>`; connect the GTK event inside with_webview, only for !child. Native notice warns recent unsaved changes may be unavailable, with Quit editor / Keep window open. Quit exits only on explicit confirmation. Normal API termination is ignored; prevent duplicate notices per failed window.
- [x] Move the already-pinned Linux webkit2gtk2.0.2 dependency from dev to ordinary target dependency. Keep lock graph/capabilities/Wry fork unchanged.
- [x] Extend existing automatic recovery acceptance with a strict renderer-restart mode, using the external owned-renderer kill barrier after committed snapshots. Preserve all prior histories, retention, source, restore/cancellation/save/cleanup gates. Run actual restart/recovery and independent IPC on the new production package.
- [x] Check ordinary preview failure and normal shutdown do not present an editor failure notice; retain any unexecuted interaction as a limitation.
- [x] Run full Node checks, Rust/native checks/build, package inspection/install and actual native probes. Review safety boundaries, document ADR/results/limits, commit/push/update draftPR. The underlying JSC bug stays unresolved and must not become a false passing gate.

Dedicated preview-WebProcess-kill control remains explicitly outside this acceptance and is the next lifecycle task. IPC and ordinary preview shutdown passed; the final delivered code installs no child callback.
