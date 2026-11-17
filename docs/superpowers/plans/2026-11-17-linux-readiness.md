# Production Linux Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reviewed, packaged Linux editor with explicitly authorized native document persistence and real production-runtime evidence.

**Architecture:** Keep the existing compiler and separate preview supervisor. Add a small capability-based Rust document store, editor-only dialog-backed IPC and frontend persistence state. Build a Debian package and test the installed production binary in a disposable systemd VM.

**Tech Stack:** React/TypeScript/CodeMirror, Tauri 2, Rust/Linux directory descriptors, systemd/cgroup v2, WebKitGTK, Vitest/Playwright/AT-SPI.

**Spec:** `docs/superpowers/specs/2026-11-17-linux-readiness-design.md`

## Global Constraints

- Branch `feat/mdx-react-engine` from `0275bdc`; keep PR #1 draft, no merge/public release/readiness change.
- Preserve CPUQuota=25%, MemoryMax=512M, MemorySwapMax=0, TasksMax=128, RuntimeMaxSec=60, PrivateNetwork, no preview capability, ephemeral profile and production automation=false.
- No arbitrary-path renderer filesystem command, auto-loading neighbors, generic FS plugin permission or unprivileged document grant.
- No visual editing, custom syntax, AI or Git synchronization; no security disabling to pass tests.
- Use disposable environments; distinguish real runtime evidence from compile/unit success.

## Review Focus

- External file changes, symlink replacement and moved parent directories must not redirect or silently clobber authorized saves.
- Read-only, foreign-owned, invalid UTF-8, oversized and metadata-bearing documents must fail safely or preserve their data/metadata.
- Cancelled/failed/in-flight save and dirty close must retain source and never clear later edits.
- Inherited systemd debugging/sandbox-disable environment must not weaken production children.
- The installed no-test-feature release binary must be tested, with direct ACL probes kept separate from supervised resource evidence.

### Task 1: Capability-scoped file store

**Files:** Create `native-documents/{Cargo.toml,src/lib.rs,src/linux.rs,tests/store.rs}`.
**Interfaces:** `Store::open(paths)` returns bounded `Document {id, revision, name, logical_path, source}`; `save(id, expected_revision, source)` returns committed revision/durability; `save_as(path_from_native_dialog, source)` authorizes only the dialog result; `close(id)` releases a grant. No renderer supplies paths.

- [ ] Write failing real-filesystem tests for open/save/reopen, exact UTF-8/CRLF, token/revision rejection, disk conflicts, symlink/FIFO/oversize/encoding refusal, failed writes, permissions/xattrs and parent rename anchoring.
- [ ] Run `cargo test --manifest-path native-documents/Cargo.toml`; observe missing behavior failures.
- [ ] Implement minimal Linux descriptor-anchored store with no-follow regular files, cryptographic IDs/revisions, bounded source, exclusive temp/fsync/atomic rename and metadata preservation. Other platforms fail closed.
- [ ] Run all store tests, including a concurrent reader seeing only complete old/new bytes; commit the independently tested store.

### Task 2: Native authorized UI/IPC

**Files:** Create `src-tauri/src/documents.rs`, `src/documents/*`, related unit/integration tests; modify native command manifest/capability and `src/App.tsx`.
**Interfaces:** Editor-only `open_documents`, `save_document`, `save_document_as`, `close_document`, `set_documents_dirty`; dialogs return paths internally, never via renderer arguments. Frontend bindings map existing logical buffers to native grants/saved snapshots.

- [ ] Add failing tests for native adapter cancellation, save errors/conflicts, editing during save, exact dirty snapshots and unchanged browser importer/download behavior.
- [ ] Add pinned Rust native dialog dependency; expose only custom editor commands with authorization repeated before dialog/store access. Do not grant dialog plugin IPC or generic filesystem scopes.
- [ ] Wire Open/Save/Save As/reopen/dirty close while preserving compiler/editor behavior. Run file I/O/dialog waiting on blocking workers; child has no document store or dialog plugin.
- [ ] Test missing/forged native grants, handler denial and native dirty-close cancellation; run JS and Rust suites; commit integration.

### Task 3: Review/harden preview boundary

**Files:** `native-policy/src/lib.rs`, native tests, security-review documentation.
**Interfaces:** Existing `Supervisor` API unchanged; inherited unsafe/debug/injection environment sanitized before child exec.

- [ ] Audit concrete findings against source and create failing regressions.
- [ ] Fix verified weaknesses, preserve all existing isolation and resource limits; document same-UID/DBus/X11/native exploit limitations.
- [ ] Verify original Wry archive integrity/two-file patch and actual production child automation=false; run policy/native tests; commit hardening.

### Task 4: Optimized package and production validation

**Files:** `src-tauri/tauri.conf.json`, desktop/icon metadata, `scripts/native-*`, `scripts/linux-validation/*`, CI workflow, dated evidence and implementation status.
**Interfaces:** `native:package` produces optimized no-security-test `.deb`; production test harness targets the installed executable and optional external stdin wrapper for ACL-only attachment.

- [ ] Add package/config regression checks; build optimized executable and Debian package with locked dependencies and metadata.
- [ ] Install in a disposable full-system Linux VM; validate native picker open, edit/save/reopen, conflict/permission recovery, dirty-close cancellation, normal shutdown and restart.
- [ ] Run direct production IPC/profile tests, actual supervised CPU/OOM/Stop/expiry/crash/close recovery and persistence while attacked. Inspect real namespaces/controllers/journals.
- [ ] Exercise software rendering and feasible hardened profiles; record precise absent hardware/infrastructure limits rather than inferred passes.
- [ ] Add CI store tests, native app tests and release-package artifacts; keep runtime job results separate from compile/package jobs.
- [ ] Retain reproducible commands, versions, binary/artifact hashes and failed attempts. Run `npm run check`, Rust checks and artifact verification; fresh whole-branch review, then push/update draft PR #1.
