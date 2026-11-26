# Creation and autosave observation evidence — 26 November 2026

Engineering foundation only. No UI/IPC activation or installed product acceptance.
Base source `f9d8007`; final commit/head CI is recorded in draft PR #9.

| Relevant source                          | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `native-documents/src/lib.rs`            | `474f857b1033defd8f8397743f6a07b9ae603e28a125d1c814c0bebb9a254ca9` |
| `native-documents/src/vault.rs`          | `29061d9c5cd8ef971ccfb38242d6768fe8cafe8cb970ff2b7b3437454a039233` |
| `native-documents/src/linux.rs`          | `b597835b00d2b23ff4f3e57c732ca482d48946cb6f9bad8d373b1f3f3c3d1746` |
| `native-documents/tests/vault_create.rs` | `5e7a4ae805e7f100b2df79dcc9e745665dd2f14678e46bb95649f76f2d185307` |
| `src/application/autosave.ts`            | `164a7e6cc585496330dec7f9fa5bff83fe32f9899fb742a15ed1c417618c9ff0` |
| `tests/unit/autosave.test.ts`            | `2830e56f13de4121f5525a3cb434553fdf6101d0f1e9296e9619b56a2cb523a4` |

## Executed native creation results

- Missing-API RED: new creation target exited 101 before `Store::create_vault` existed.
- Native crate: **79 passed, zero failed, 7 existing ignored slots**. New coverage is
  7 creation integration tests plus one private deterministic intervening-creator
  test; original Store/Save As/inventory/lazy-opening tests remain unchanged.
- Independent reviewer ran **37 relevant tests** unprivileged and found no blocking
  issue. Creation never opens existing destination payloads, remains descriptor
  scoped, and the unchanged missing-target writer uses final RENAME_NOREPLACE.
- Actual Store/autosave integration passed again with the new Rust and observation
  code, including post-publication lost reply and stale-CAS refusal after undo.
- A successful directory rename with failed directory sync still produces a live
  grant/new revision/durability warning. **This branch was code-reviewed through
  the unchanged writer and shared helper; new-create sync failure was not injected.**
- Rust formatting and whitespace checks passed.

Tests exercise exact BOM/CRLF/Unicode/nested identity, mode 0600 and subsequent Save/
CAS/reopen, existing file/symlink/FIFO/directory collisions without payload reads,
invalid path/source/count/aggregate preflight, root/ancestor replacement,
read-only parent and descriptor/grant cleanup, independent racing creators with
one exact winner, and deterministic creation after missing-target preparation.

Seven ignored slots retain their prior meaning: a worker invoked explicitly by
its owning contention test, and six dedicated ptrace/ENOSPC cases requiring
separate commands/environments. CI retains those dedicated steps.

## Autosave observations

The targeted coordinator suite passed **35 tests**, including the original 25.
Tests cover asynchronous writing→saved without additional typing, older ACK plus
newer pending text, blocked failure, unsubscribe/release, throwing listeners and
throwing diagnostic sinks, silent default diagnostics, per-listener copies,
reentrant edits/subscriptions and no redundant unchanged-state rebroadcast.
The API is trusted status observation, not a canonical source/edit authority or a
stable useSyncExternalStore snapshot. Full final `npm run check` exited 0: **673 unit, 92 tooling/zero skips, 150 Chromium, 9 Pages and 4 inactive-cloud tests passed**, plus formatting/lint/TypeScript/build.

## Reproduce

```sh
cargo test --manifest-path native-documents/Cargo.toml --locked
npm run native:autosave:test
npm test -- tests/unit/autosave.test.ts
cargo fmt --manifest-path native-documents/Cargo.toml -- --check
```

Local Rust commands explicitly used `RUSTUP_TOOLCHAIN=stable` with
`CARGO_HOME=/workspace/.cache/cargo`, `RUSTUP_HOME=/workspace/.cache/rustup` and
its bin directory on PATH; Cargo and rustc both report 1.100.0. CI uses the pinned
repository toolchain. All filesystem fixtures are owned temporary synthetic data.
No new dependencies, renderer IPC, generic filesystem permission or app route.

The existing-file Save final-check/rename race and cleanup limits under hostile
parent-permission changes are unchanged. Normal new creation cannot replace an
existing/racing destination. Runtime input/React/security remains a separate gate;
see [the native input diagnostic](../2026-11-26-wry-input-spike/README.md).

Independent observation review found async callback rejections escaped the original
synchronous catches. Both subprocess regressions reproduced three unhandled
rejections before the fix and zero after it. Listener and diagnostic promise
rejections are now consumed without awaiting them in persistence. The final full
check above ran after that correction. No second review pass is implied.
