# Vault inventory foundation — 26 November 2026

Scope: Rust-only metadata inventory supporting DATA-01/02. **No new IPC, frontend
activation, installed GUI acceptance or native renderer security claim.** Base:
`73fa3a0e9319281ad6a6a4f41bde4d80073fbf97`.

## Relevant source identity

| File                                  | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `native-documents/src/lib.rs`         | `f5c85d6f85f338e9031fdf2e44c28418c15f98a11597a3139c6baaefdaecbbde` |
| `native-documents/src/vault.rs`       | `9d927aad3f7d979192cde000efd50ef4fe7b8e3edf7c979022ed94bf30bc4078` |
| `native-documents/tests/inventory.rs` | `47a33761967f754afe7f616c5099bae6e7ae8e49594d919deec1f439586a44bb` |

## Executed native observations

- Test-first missing-API control: inventory target exited 101 before the new Vault
  existed. No original tests or source limits were weakened.
- **11 inventory tests passed**, covering 100 notes, unchanged 32-file loaded
  capacity, exact mixed-case paths/sizes, large/unreadable/invalid UTF-8 contents,
  exclusions and symlink/FIFO refusal, root/ancestor/path replacements, traversal,
  depth/entry/path bounds and temporary descriptor cleanup.
- An actual inode inotify watch observed no payload `IN_OPEN`/`IN_ACCESS` events
  during indexing; an actual source read produced events as its positive control.
  Inventory retains one root descriptor and no per-file write grants.
- Complete native document crate: **62 passed, 7 existing ignored slots, 0 failed**.
  The contention test invokes its ignored helper; six dedicated ptrace/ENOSPC
  controls require their separate environment/commands, retained in CI.
- Independent reviewer executed **11 inventory + 10 original vault tests** as an
  unprivileged user and found no blocking issue. Review covered descriptor-based
  authority, metadata-only behavior, original collection limits and error cleanup.
- The real Store/autosave integration passed after the refactor, including actual
  publication followed by lost reply and undo/retry stale-CAS refusal. Its observed
  edit-to-file latency was 14 ms in this backend fixture, not GUI latency.
- Full `PN_GITLEAKS_BIN=/workspace/programmable-notes/.cache/security-tools/gitleaks PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npm run check`: **exit 0; 663 unit, 92 tooling/zero skips, 150 Chromium, 9 Pages and 4 inactive-cloud passed**, plus formatting/lint/TypeScript/build.
- Rust formatting and whitespace checks passed.

## Reproduce

Use Linux, the repository's Rust 1.100.0 toolchain and pinned Node/npm dependencies:

```sh
npm ci
cargo test --manifest-path native-documents/Cargo.toml --locked --test inventory
cargo test --manifest-path native-documents/Cargo.toml --locked
npm run native:autosave:test
cargo fmt --manifest-path native-documents/Cargo.toml -- --check
```

Local execution explicitly selected `RUSTUP_TOOLCHAIN=stable` with the installed
`CARGO_HOME=/workspace/.cache/cargo` and `RUSTUP_HOME=/workspace/.cache/rustup`;
Cargo and rustc both report version 1.100.0. The named pinned Cargo shim is unavailable
in this task environment; CI uses the repository toolchain. Permission evidence
requires a non-root test user and fails rather than skipping otherwise.

## Remaining gates

`Vault::select_authorized` is trusted Rust host code invoked only after OS folder
selection. It is not an author-facing path-taking IPC function. Inventory output
is observational metadata, not an atomic filesystem snapshot, revision or write
capability. Concurrent mutations can stale it. Future lazy-open/lifecycle code
must validate from the retained root and obtain a new scoped file grant, never
trust cached absolute paths. Empty-directory lifecycle is not represented yet.

The actual folder chooser still uses bounded eager loading. The shared application
must adopt vault indexing/lazy opening before large folders work in the UI. Real
create/rename/move/Trash, external watch/reconciliation, source autosave integration
and installed acceptance remain. The native inline diagnostic remains unproven;
this filesystem work does not change that result or weaken renderer isolation.

See [ADR026](../../decisions/ADR-026-vault-inventory.md),
[the packet plan](../../plans/vault-inventory.md) and
[the product acceptance matrix](../../PRODUCT_ACCEPTANCE.md).
