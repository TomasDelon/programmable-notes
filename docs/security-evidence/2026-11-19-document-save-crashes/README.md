# Original-document Save: real process interruption

The standalone test exercises the production native document Store with real
Linux child processes and SIGKILL. It adds no application failpoints, native
commands, permissions or persistence behavior. It complements recovery snapshot
crash tests; this gate concerns explicitly saving an existing original file.

## Executed result

On disposable Ubuntu24.04/Linux x86_64, as ordinary UID1000, the final frozen
integration test exited0: **one integration test, four actual crash stages**.
Each stage independently creates a private synthetic directory and writer.

| Stage                   | Observed successful syscall        | Required target after SIGKILL | Orphan temporary |
| ----------------------- | ---------------------------------- | ----------------------------- | ---------------- |
| Temporary write         | write,1                            | Exact complete original bytes | 1                |
| Temporary file synced   | fsync,74                           | Exact complete original bytes | 1                |
| Atomic publication      | renameat,264                       | Exact complete new bytes      | 0                |
| Parent directory synced | fsync,74 after matched publication | Exact complete new bytes      | 0                |

All stages verified mode0640, untouched sibling bytes, fresh Store reopening and
an explicitly requested subsequent exact save. Sources contain a leading UTF8
BOM, Unicode, mixed LF/CRLF, imports and opaque JSX/comments. The new source is
224,067bytes. The final run records writer PIDs53401–53404, start ticks,
executable path/SHA256, successful syscall return, matched descriptor/path and
publication names. It completed in17.01s under a mandatory90s outer timeout.

Final observer binary SHA256:
`35a5a5277a56c53aae8e5fa92e76b5bb9c095809e3b983d40371cb5bffb90ee3`.
Writer SHA256:
`45a07e9813684ab420c6567838f0c501b7a88fe685ca5ebec7817c4851acbdb3`.
Exact source hashes are retained with the binaries' hashes. Build occurred in the
cached Ubuntu builder; these binaries ran in the full-system guest as the
ordinary user. They were not installed into the desktop package.

The writer rejects non-fixture roots before opening documents. An actual invalid
root invocation failed with its explicit personal-document refusal; this is an
expected negative control, not a passing crash-stage test. It requires an owned,
private, canonical synthetic directory directly under the temporary directory.

## Failed observations and corrections

- Actual missing-writer test first failed, exit101, before the external writer
  was implemented.
- The first complete writer run passed write/file-fsync, then failed publication:
  its observer expected only renameat2. A separate retained trace showed actual
  successful renameat264. The test was not weakened to accept arbitrary progress.
- Publication now requires successful renameat or renameat2, both directory
  descriptors matching the fixture, the generated `.pn-save-`32-hex name, exact
  `note.mdx` destination and applicable flags. The directory-fsync stage requires
  prior matched publication. The actual successful source/destination names are
  read from the stopped owned writer with bounded ptrace memory reads.
- Review found no Critical/Important issue. A minor timing issue was corrected:
  stops that arrive after either observation deadline cannot establish success.
  The frozen four-stage test then passed again, with exact source/binary hashes.
- Initial binary extraction assumed an older Cargo artifact layout. That setup
  failed and the attempted binary did not run, exit127. Structured Cargo artifact
  metadata corrected the path. This is retained as NOT RUN setup evidence, not a
  test failure or a fake red/green result.

## Reproduce safely

Follow [the Linux procedure](../../LINUX_DESKTOP_TESTING.md#actual-original-document-save-interruption).
Build the external writer and explicitly run the ignored integration test:

```sh
cargo build --manifest-path native-documents/Cargo.toml --locked --example document-save-crash-writer
PN_SAVE_CRASH_WRITER_BINARY="$PWD/native-documents/target/debug/examples/document-save-crash-writer" timeout -k 5s 90s cargo test --manifest-path native-documents/Cargo.toml --locked --test save_crash -- --ignored --exact actual_save_crashes_preserve_complete_document_and_permissions --nocapture
```

Require successful exit and all four REAL_DOCUMENT_SAVE_CRASH_PASS stage lines.
The outer timeout remains necessary for final OS child reaping. Ptrace denial is
explicit NOT RUN and cannot satisfy acceptance. Observation relies on documented
Linux x86_64 syscall-entry/exit conventions, not a portable tracing claim. The
new CI step uses Bash pipefail and checks each stage; hosted execution remains
blocked by the account billing/spending limit.

## Final checks and scope

The frozen full Node check exited0:114 unit tests,37 matching Chromium tests,
formatting/lint/types and a fresh production build. Final cached Ubuntu ordinary
Rust commands exited0:39 document and7 policy tests. Five infrastructure-only
cases were ignored in the ordinary document command; the new Save crash case
was separately executed above. No new pass is inferred for the other four.
Independent checks found all four owned writer PIDs and their synthetic fixture
directories absent, and the invalid-root path absent. Source/binary hashes match
the frozen successful run. Final review found no Critical/Important issue.

The new workflow gate is committed as a reproducible procedure; do not infer
hosted execution. Exact preceding head2e0a9b5/run44607665007 failed both jobs before
steps with the payment/spending-limit annotation. The production application
and installed ELFa6d00cbb remain unchanged by these external tests. Earlier
packaged security/fidelity/cleanup results retain their dated scope.

## Limits

SIGKILL does not simulate power loss. This is a production-library integration
test, not a new packaged-GUI save/restart run. It does not close the documented
external-writer comparison-to-rename race or prove every filesystem's durability.
The first successful temporary write can precede completion of write_all.

A pre-publication process crash can leave one `.pn-save-` temporary in the selected
user directory. Store reopening uses the original document and does not silently
promote or delete that orphan. The test removes only its own synthetic directory.
General cleanup of user-directory temporaries requires a separate safe design;
no arbitrary scavenger was introduced. Recovery snapshot quotas remain separate.
No production security-readiness claim or release is implied.
