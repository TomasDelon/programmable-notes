# Original document Save: external sync-error acceptance

On the resumed Linux x86_64 cloud host, an external own-child ptrace tracer
verified the real `Store::save` path with two error injections. This does not
require WebKitGTK or claim packaged UI acceptance. The synthetic fixture is an
owned private temporary directory; no personal documents are touched.

The tracer verifies child executable SHA256, PID/start tick and exact descriptor
identity, then replaces **one successful fsync syscall return** with `-EIO`. The
actual fsync already succeeded. This tests error propagation and publication
semantics, not real physical media failure, power loss or failed kernel writes.
The directory injection additionally requires the observed matched rename to the
authorized original document. Per-stop and whole-observation deadlines plus an
outer timeout bound execution; owned-child cleanup and EXITKILL remain enabled.

Observed results:

- Original helper panicked on the injected file EIO; the new reporting oracle
  failed (exit101). This was a missing **test helper** reporting mode, not a
  reproduced production Store bug. The red evidence is retained.
- File fsync injection: actual public Save returned `Io` with errno EIO. Original
  bytes, mode0640 and sibling were unchanged; no handled-error temporary remained.
- Parent-directory fsync injection after publication: Save returned a nonempty
  new revision and `durable:false`; complete new bytes, mode0640 and sibling were
  correct. It did not report that the original was untouched after publication.
- Both cases reopened with a fresh Store and performed another explicit durable
  save successfully. The two-case gate passed.
- The preexisting four-stage real SIGKILL gate passed again with the revised
  helper, preserving exact original/new bytes at its documented boundaries.

The tracer also records terminal reaping before any late-stop assertion can
unwind, preventing cleanup from acting on an already-reaped PID. An ordinary
regression uses waitid WNOWAIT to observe a child exit without reaping, then
verifies that a deliberately late wait still fails with reaping recorded.

Only the external validation example gained an opt-in JSON result mode. It is not
linked into the desktop app. No production failure hook, authority, permission,
resource limit or document-write behavior changed. The new CI step runs this
ignored gate explicitly and requires both stage markers; an unavailable ptrace
prerequisite fails rather than becoming a passing skip.

Reproduce on disposable Linux x86_64 with Rust and own-child ptrace:

```sh
cargo build --manifest-path native-documents/Cargo.toml --locked --example document-save-crash-writer
PN_SAVE_CRASH_WRITER_BINARY="$PWD/native-documents/target/debug/examples/document-save-crash-writer" \
  timeout -k 5s 90s cargo test --manifest-path native-documents/Cargo.toml --locked \
  --test save_crash -- --ignored --exact injected_sync_errors_preserve_original_and_report_publication --nocapture
```

Ordinary Cargo tests do not execute ignored ptrace gates. Hosted execution of this
new step must be observed separately. Real filesystem ENOSPC and packaged native
restart/recovery evidence remain distinct in the existing dated records.
