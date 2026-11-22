# Recovery sync-error reporting

Base d47f30d; acceptance tests only. Production recovery code, application binary,
native permissions, sandbox and resource policy are unchanged. The test binary
and external writer were compiled against the same production backend source and
executed as the ordinary user in the disposable Ubuntu 24.04.5 full-system VM.
This closes the documented syscall-error-reporting coverage gap; it is **not**
physical disk-failure or power-loss evidence.

## Executed results

Own-child x86_64 ptrace skips exactly the selected `fsync` before execution, then
returns EIO at its exit stop. It does not relabel an already successful sync.
No production failpoint, LD_PRELOAD, global ptrace setting or security exemption
was introduced. All three cases passed in `raw/ubuntu-final.log`:

- Pending-file sync: append fails before publication, all five prior records are
  byte-identical, no pending file remains, and no sixth record is published.
- Publication-directory sync: append reports `durable=false` and an uncertainty
  warning. All five prior files remain byte-identical alongside the new complete
  record. Raw files are checked **before** reopening can repair retention.
- Retention-directory sync: publication was already synced; append reports
  `durable=true` with a cleanup warning. The new record and four retained prior
  versions survive; the one obsolete record was removed as intended.

Every case reopens/validates the store, restores the prior latest source exactly,
restores the newly published source where applicable, and completes a subsequent
explicit durable retry. The synthetic BOM/CRLF/Unicode original remains untouched.
The existing four actual SIGKILL stages also passed in the same final invocation.
Thirty-five normal Rust tests passed separately; ignored fault/crash tests are
not counted as ordinary successes.

Controller tests cover uncertain publication, retention warnings and the existing
`durable=false`/null-warning fallback. They verify visible error health, automatic
pause even after more debounce time, exact source transport, no implicit restore,
and an available explicit restore. These tests mock only native transport; they
are not native runtime/security evidence. A first fixture waited for a React DOM
commit inside an enclosing `act`, preventing that commit; it now awaits transport
completion and checks the committed DOM afterward. Both failed and corrected logs
are retained. No application behavior was changed to satisfy the fixture.

Read-only review found no concrete important or minor issue. Hosted execution is
still account-billing blocked; the CI step is added but has not run on a runner.

## Reproduction

In a disposable Linux x86_64 account permitting tracing its own child, with Rust
and the locked dependencies:

```sh
cargo build --manifest-path native-documents/Cargo.toml --locked --example recovery-crash-writer
PN_CRASH_WRITER_BINARY="$PWD/native-documents/target/debug/examples/recovery-crash-writer" \
  timeout -k 5s 90s cargo test --manifest-path native-documents/Cargo.toml --locked \
  --test process_crash -- --ignored --exact \
  sync_failures_preserve_recovery_and_report_publication_state --nocapture
```

All three `INJECTED_SYNC_ERROR_PASS` markers and successful test exit are required.
The helper refuses paths outside its synthetic `pn-recovery-crash-*` fixture.
Do not disable a ptrace restriction to make it pass; record unavailable tracing
as an infrastructure limitation. This does not certify storage power-loss
behavior, native blank-preview recovery or physical GPU/Wayland compatibility.
