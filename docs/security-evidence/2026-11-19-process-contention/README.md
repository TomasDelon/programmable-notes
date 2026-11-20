# Actual recovery writer-process contention — 2026-11-19

Production storage code is unchanged from 4aa81f1. This adds a normal automated
regression covering real independently exec'd writers; prior snapshot races used
threads, and the basic held-lock test used descriptors within one process.

Each of five rounds starts four child processes in newly created synthetic
fixtures. The first must receive `busy` while the parent owns the store lock.
After releasing it, three ready writers receive their start signal before any
result is awaited. They share one expected parent revision and different exact
Unicode/CRLF/JSX source. Exactly one may publish. Losing writers must report busy
or revision conflict; unrelated errors fail the test. Results are bound to each
actual Child PID, distinct from the parent.

Reopening verifies a single generation-2 head, its correct parent and winner
source, the complete previous snapshot, stale retry rejection, successful
explicit current-head retry at generation 3 and an unchanged synthetic original.
Ready/completion waits are bounded; owned-child kill/reap cleanup also runs on
failure. This does not protect against noncooperating same-user writers or prove
power-loss durability.

## Real results

- Initial cloud Linux run passed five rounds / 20 actual writer processes.
- Read-only review found a fixture-cleanup ownership bug in the test: its cleanup
  guard was constructed before directory creation succeeded. Corrected before
  delivery; no production storage behavior changed.
- Final complete backend suite passed **36 normal Rust tests**. Ignored syscall,
  ENOSPC and worker-only cases are not falsely counted as executed tests.
- The explicit pre-existing-fixture negative passed: the contention test exited
  101 on `AlreadyExists`, and a controller-owned sentinel/directory remained
  intact. Its known contents were checked before the controller removed only
  that file and empty directory. Expected failed output and verifier are retained.
- Same final test/source hashes were built in Ubuntu and executed as ordinary
  UID 1000 in the disposable full-system Ubuntu 24.04 VM: all five rounds / 20
  processes passed in 1.37 s, with independently varying winners.
- Ubuntu test executable SHA-256:
  `d054ed53233cb860d9634267e2dffb9cd48a7dad1d140f140c6c572277539d02`.
  Source hashes are retained in raw; builder and cloud source hashes matched.

This is actual Linux recovery-backend evidence, not a new installed GUI run or a
new memory/CPU/IPC acceptance result. The installed download-hardened package and
its separate runtime evidence remain in the preceding dated record. No installer
needed rebuilding for this test-only change.

## Reproduce

```sh
cargo test --manifest-path native-documents/Cargo.toml --locked \
  --test process_contention -- --nocapture
cargo test --manifest-path native-documents/Cargo.toml --locked
```

The worker-only ignored test is invoked by its owning test; do not invoke it
standalone without its private synthetic fixture and stdin gate. The new normal
test runs automatically in existing native CI when a hosted runner can start.
Hosted run 44473135599 for 4aa81f1 was refused before runner startup, as with prior
billing-blocked runs. Local/VM passes do not mean hosted CI is green.
