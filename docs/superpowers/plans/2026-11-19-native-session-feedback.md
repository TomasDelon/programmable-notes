# Native Session Feedback Implementation Plan

> For agentic workers: use superpowers:executing-plans. Progress is recorded in
> docs/AGENT_PROGRESS.md, the user's required durable ledger. Continue without
> routine approval prompts under the user's explicit autonomous authorization.

**Goal:** Show a truthful native connection state and manual recovery guidance.

**Architecture:** Read the owned supervisor wait handle through an editor-only
command. Poll serially from NativePreview, retain stop ownership and all limits.

**Tech Stack:** Existing Rust/Tauri2, React/TypeScript, Vitest, Ubuntu/WebKitGTK.

**Spec:** docs/decisions/ADR-009-native-session-feedback.md.

## Global constraints

- Preview receives no new permission; every native handler repeats authorization.
- Preserve 25% CPU, 512MiB memory, zero swap, 128 tasks and 60-second lifetime.
- No automatic restart, source/file writes or cgroup-emptiness claim from status.
- Keep unit and child handles until existing Stop/replacement cleanup.
- Use the existing checkout; keep PR #1 draft, no merge or public release.

## Review focus

- A disconnected launcher may leave a live unit: retain cleanup ownership.
- Old replies after source changes must not label a newer session ended.
- Failed or malformed status is unknown, never assumed stopped.
- A pending read must not accumulate one new request every second.
- Natural expiry must produce useful feedback and support explicit rebuilding.

## Task 1: Native connection feedback, one coherent feature

**Files:** native-policy/src/lib.rs; src-tauri/src/main.rs;
src-tauri/build.rs; src-tauri/capabilities/editor.json; generated permission;
src/preview/NativePreview.tsx; src/App.tsx; tests/unit/native-preview.test.tsx;
scripts/native-webdriver.mjs; scripts/native-session-status.mjs; dated evidence.

**Interfaces:** `Supervisor::connection_active(&mut self) -> Result<bool,String>`;
argument-free Tauri `preview_connection_active -> Result<bool,String>`;
NativePreview props remain html/onError.

- [x] Add real child-handle lifecycle/retained-unit test. Run locked native-policy
      tests; expect missing-method failure before implementation.
- [x] Implement readonly owned-child try_wait projection, handler/build metadata
      and editor-only permission. Run native-policy tests; expect all pass.
- [x] Add frontend lifecycle, stale-response, failed/non-boolean and one-pending-read
      tests. Run native-preview tests; expect missing state/command failure.
- [x] Implement serial 1-second polling with effect ownership and cleanup. Separate
      compiler wording from connection feedback. Run full unit suite; expect all pass.
- [x] Extend real native IPC positive/denial checks. Build/inspect/install optimized
      package without security-test. Run actual session-status acceptance: active
      counter, unchanged natural expiry/cause, ended UI, manual rebuild/counter/Stop,
      original source unchanged. Run native IPC and mixed-EOL/quotes fidelity suites.
- [x] Request read-only review of the complete feature; fix important findings
      with regression proof. Run npm run check and relevant Rust checks. Preserve
      exact package/source/observer hashes and all failures. Update status/ADR/ledger.
- [x] Commit/push verified feature and update draft PR; continue next safe task.

## Execution rulings

The user explicitly chose autonomous implementation and existing AGENT_PROGRESS
continuity; no new worktree or approval round is needed. Status is informational,
so no execution authority depends on a connection boolean. Backend/frontend stay
in one feature commit after actual native verification rather than shipping an
unused endpoint as a separate milestone.
