# Shared autosave foundation evidence — 26 November 2026

Scope: DATA-01/A04 backend foundation. **Not active application autosave, installed GUI acceptance, or native renderer security readiness.** The rejected native interface is unchanged.

## Subject

Base source: `dc60a3d69913d8e30ae66e1a55591a82d3526a38`; this packet adds the files below. Final commit and head CI are recorded in draft PR #9. No dependency or security-policy change.

| Relevant file                                  | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `src/application/autosave.ts`                  | `d1658481699e6e00ea76a1e2a21a2cd5054f8c452fa4f73809e17e5d1ae53d9b` |
| `tests/unit/autosave.test.ts`                  | `9587753d69c24ff1f4eada439cba0ba9aa510ca4aafbd9c762341b65aaf6ac80` |
| `native-documents/examples/autosave-writer.rs` | `71fe6a19443b121aa5755d0dd8e9265ea76751b97caf0cf8f55af715cdb2f3bd` |
| `scripts/native-autosave.mjs`                  | `f839eb29bfba88e81fafd94c8aab617846a10b516e410c7ac5d9b5f8b1ecd132` |

Host: Linux x86_64, Node 24.22.1, npm 11.9.0; Rust/Cargo 1.100.0. The installed named pinned toolchain lacked Cargo; local native commands explicitly used the installed `stable` alias, whose Cargo and rustc both report 1.100.0. CI uses the repository-pinned toolchain. No silent version fallback.

## Executed observations

- Targeted coordinator: **25 passed**, including a failing-then-passing uncertain-commit/undo case and a failing-then-passing released-session callback case found in independent review.
- Real native Store/coordinator harness: **passed**. The test observes actual file bytes before calling flush. It covers in-flight coalescing, exact BOM/CRLF/mixed endings/Unicode/opaque JSX, invalid document syntax persistence, undo/redo, atomic inode replacement, mode 0640, writer process restart/reopen, stale/unknown grant denial and external-change conflict with retained latest source and failed close. Actual publication followed by an externally simulated lost reply also stays blocked after undo/retry; stale CAS preserves published disk bytes.
- Negative control `--negative-control`: **exit 1 as expected**, at the automatic real-file observation assertion when source scheduling is omitted. It is not reported as an ordinary passing command.
- Native document crate: **51 passed, 7 ignored, 0 failed**. Existing ignored entries are the process helper, four dedicated ptrace/crash/sync checks and two dedicated ENOSPC checks. The contention test invokes its ignored helper explicitly; the six dedicated ptrace/ENOSPC controls require separate commands. Native CI retains those dedicated steps.
- Rust formatting, focused ESLint and TypeScript checks passed. The complete `npm run check` finished with exit 0: **663 unit, 150 Chromium, 9 local Pages and 4 inactive-cloud tests passed**, plus formatting/lint/TypeScript/production builds. Its tooling phase ran 90 passed/2 skipped because the local scanner variable was not set; a separate `PN_GITLEAKS_BIN=/workspace/programmable-notes/.cache/security-tools/gitleaks npm run test:tooling` rerun passed **all 92 with zero skips**. No skipped control is counted as passing.

Observed accepted-snapshot-to-file latency in the final backend run: **12 ms**. This measures the test coordinator/stdio/Store fixture on this host, not installed GUI latency or a performance guarantee.

History/archive credential scans returned zero findings. The actual native embedding diagnostic failed to render in both attempts; its [separate receipt](../2026-11-26-native-inline-spike/README.md) does not establish A09/A11.

## Reproduce on Linux

```sh
npm ci
npm run native:autosave:test
cargo test --manifest-path native-documents/Cargo.toml --locked
PLAYWRIGHT_BROWSERS_PATH=/path/to/matching/playwright-cache npm run check
```

Local explicit toolchain invocation used:

```sh
CARGO_HOME=/workspace/.cache/cargo RUSTUP_HOME=/workspace/.cache/rustup \
RUSTUP_TOOLCHAIN=stable PATH=/workspace/.cache/cargo/bin:$PATH \
npm run native:autosave:test
```

The harness makes and deletes only its own private synthetic `/tmp/pn-autosave-*` fixture. Its Rust example opens fixed `note.mdx`, receives bounded JSON-lines and is never linked into the app or exposed as IPC. To check that omitted scheduling is detected, run `node scripts/native-autosave.mjs --negative-control` and require exit 1 at the disk-observation assertion, rather than accepting any arbitrary error.

## Failures and limits

Initial harness assertions incorrectly assumed inode numbers could not be reused and that umask preserved the requested test mode. Fixtures were corrected by retaining an open handle to the original inode and explicitly setting synthetic mode; production Store behavior was not weakened. The first full npm attempt stopped during formatting because a new VM rootfs had inaccessible directories inside ignored cache. The experiment relocated the rootfs outside the repository; no guest permissions or production isolation were relaxed.

The coordinator retains accepted snapshots only. Editor transaction acceptance, external watch/reread/reconciliation, shared UI status and real close/upgrade integration remain unimplemented gates. An explicit retry cannot force overwrite and may remain blocked until trusted reconciliation. The native writer retains its documented final-check/rename race against noncooperating same-user writers. Process restart here means restarting the test writer, not restarting the installed desktop app.

See [ADR025](../../decisions/ADR-025-shared-autosave-coordination.md), [the code-fit map](../../research/2026-11-26-shared-code-fit.md), [inline feasibility](../../research/2026-11-26-native-inline-feasibility.md), and [the migration plan](../../plans/unified-local-vault.md). No replacement installer, merge, public release, signed update activation or cloud backend was delivered.
