# Scoped vault opening evidence — 26 November 2026

Scope: Rust-only retained-root lazy opening, following `24a9eea`. No new IPC or
installed application behavior. Source hashes identify this packet, not a claim
that an installed GUI or native renderer passed acceptance.

| File                                   | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `native-documents/src/lib.rs`          | `f13306d79fe27b222801eefe42c4fc27ac964d382c7f79feffb3ecc74f36dcd0` |
| `native-documents/src/vault.rs`        | `e9ab921eea8dd5ed1dc838325aaca5e272fc78c3fb4a8ae3f12bbabab50e31e7` |
| `native-documents/tests/vault_open.rs` | `42530103a4c7ca248a5108526c4221cfd4ab99c167495b6c29ec0579f9825e8e` |

## Executed results

- Test-first API RED: Cargo exited 101 for missing `Store::open_vault` before
  implementation. New filesystem tests: **9 passed**.
- Full native document crate: **71 passed, 0 failed, 7 existing ignored slots**.
  One helper is deliberately invoked by its contention test; six dedicated
  ptrace/ENOSPC checks require their separate CI/environment commands.
- Independent reviewer ran **9 lazy-open + 11 inventory + 10 original vault
  tests**, unprivileged, and found no blocking issue.
- Actual Store/autosave integration passed after this change, including lost
  acknowledgement after successful publication, undo and stale-CAS refusal.
- Rust formatting and whitespace checks passed. Existing tests were not weakened.

The 9 tests cover opening a chosen note among 100 without sibling payload reads;
all batch path validation before any valid file is read; symlink/FIFO/special and
forbidden path refusal; root/ancestor rename/replacement plus continued Save after
Vault drop; formats/depth; no partial grants/descriptor leaks after failed batches;
encoding/size/grant/aggregate limits; exact source bytes, mode 0640, external-file
replacement, stale Save denial and explicit reopen baseline refresh.

Frontend source, unit/browser/tooling tests, build/deployment settings, dependencies
and workflows are unchanged from `24a9eea`. Reused relevant-input evidence is its
complete npm check: **663 unit, 92 tooling with zero skips, 150 Chromium, 9 Pages,
4 inactive-cloud passed**, plus format/lint/types/build. Native inputs changed, so
its old native result is not reused: the new full crate and actual Store harness
ran again. Final head CI runs from its own checkout and is recorded in draft PR #9.

## Reproduce on Linux

```sh
cargo test --manifest-path native-documents/Cargo.toml --locked --test vault_open
cargo test --manifest-path native-documents/Cargo.toml --locked
npm run native:autosave:test
cargo fmt --manifest-path native-documents/Cargo.toml -- --check
```

Tests used installed Rust/Cargo 1.100.0 through explicit `RUSTUP_TOOLCHAIN=stable`,
`CARGO_HOME=/workspace/.cache/cargo`, `RUSTUP_HOME=/workspace/.cache/rustup` and its
Cargo bin directory on PATH. The named pinned Cargo shim is unavailable locally;
CI installs the repository-pinned toolchain. Use an unprivileged Linux test user.
Only synthetic owned `/tmp` fixture files are created and removed.

## Limits

A relative filename and inventory record are not write authority. The retained
root descriptor and existing file-grant/disk-CAS machinery own authority. Display
paths can be stale after moving folders. This API must never be exposed as a
path-taking preview command. No GUI authorization/close/autosave/Trash acceptance,
atomic multi-file snapshot, arbitrary React editing or production security
readiness is established. Existing Save's documented final-check/rename race
against a noncooperating same-user writer remains.

See [ADR027](../../decisions/ADR-027-scoped-vault-opening.md),
[packet plan](../../plans/vault-lazy-open.md) and
[product acceptance](../../PRODUCT_ACCEPTANCE.md).
