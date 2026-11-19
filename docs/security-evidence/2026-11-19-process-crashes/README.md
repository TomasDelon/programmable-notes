# Actual writer and desktop process-crash validation

Tests use synthetic data in the disposable Ubuntu 24.04.5 x86_64 VM.
Native permissions and sandbox restrictions are unchanged. A concrete inherited
file-descriptor lock-lifetime bug found during validation is fixed below.

## Publication boundaries

The integration test starts a separate main-thread validation writer as the same
ordinary user. That child requests tracing by its own parent. The parent observes
successful syscall exits and sends SIGKILL at four points: pending-file write,
pending-file fsync, atomic publication rename, and directory fsync before pruning.
No production failpoint, mock filesystem, root capability, ptrace sysctl change or
sandbox relaxation is involved. Descriptor targets distinguish file and directory
syncs. The owned-child guard tracks terminal reaping and cannot signal a reused
PID; the successful terminal wait goes through std::process::Child.

All four cases passed. Five prior records were seeded. Before publication, the
new reader discarded the pending file and exposed only the five previous complete
versions. After publication/durability, it exposed the complete new version and
safely completed five-version retention. The immediately preceding durable
version survived in every case; no incomplete record was exposed. See raw logs
and exact source/executable hashes. This is process death, not disk power-loss.

The first prototype tried to trace a libtest worker as the process leader and
hit its 90-second deadline. It was replaced with a separate main-thread helper;
the failed attempt is retained and is not counted as passing. External commands
now use a hard kill-after timeout; tracer exit also kills its own traced child.

Build/reproduce in a disposable Linux x86_64 environment allowing own-child ptrace:

```sh
cargo build --manifest-path native-documents/Cargo.toml --locked --example recovery-crash-writer
PN_CRASH_WRITER_BINARY="$PWD/native-documents/target/debug/examples/recovery-crash-writer" \
  timeout -k 5s 90s cargo test --manifest-path native-documents/Cargo.toml --locked \
  --test process_crash -- --ignored \
  --exact process_crashes_preserve_durable_recovery_at_each_publication_stage --nocapture
```

The normal suite explicitly ignores this environment-dependent test. CI has a
separate named gate that executes it, checks the final verified stage marker,
and uses explicit Bash pipefail. A producer deliberately printing that marker
then exiting 7 was verified to leave the gate failing with status 7; tee cannot
mask it. The ENOSPC gate now uses explicit Bash too.

## Installed desktop crash

The optimized installed P2 production package also passed actual main-process
SIGKILL after automatic recovery of two dirty same-file buffers. A fresh process
with a different PID discovered the retained histories. Explicit restore opened
an unsaved buffer; Save As cancellation preserved the original, and a separately
chosen file received exact recovered bytes. The original was never automatically
written. This run uses package SHA-256
`9c6a3ff6ca5df01fd5700e9dc3cca4f587f74baa266c7630112b4583e31a1472`
and ELF `33e90d64bf3636ddea68bb96cf6a37e0b66ff356630f00fae1447c7c97ac7862`.

Use the base native prerequisites and a fresh external fixture env, then:

```sh
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_CRASH_RESTART=1 node scripts/native-auto-recovery.mjs
```

This intentionally kills only the test's own installed application. It must not
be run on personal documents or a populated recovery collection. Physical GPU,
Wayland, machine power failure and fresh preview CPU/OOM/expiry stress are outside
this test. Some successful native dialog operations emitted X_QueryTree/BadWindow
warnings; actual chosen files and their complete bytes were checked afterward.

## Inherited recovery-lock regression

A full parallel backend run exposed an intermittent busy error on the next
operation after a completed writer. A fork can inherit the locked open file
description until exec; close-on-exec does not release it at fork. The guard now
explicitly unlocks on drop before its descriptor closes. Failed acquisitions do
not own a guard lock and cannot unlock another writer. The deterministic test
keeps the child alive while reopening: it failed before the fix and passes now.
The complete snapshot suite then passed ten consecutive parallel runs (15 tests
per run, disk-full test separately executed). No contention check was removed.

After the fix, the complete backend suite passed 35 tests; all four actual writer
SIGKILL boundaries and the real tmpfs ENOSPC test passed again. Repository checks
passed formatting, lint, typechecking, 39 unit tests and 19 Chromium tests. The
optimized package was rebuilt and installed (deb SHA-256
`9b613d312236bf8f704bcd9a4e5d413383947aa2e1157144ac4667bfba72fd03`,
ELF `a6d6d8f83a4f1ce842d0d5681e0fccbe367cba0cb9a86ad6acad8208ff6706f7`).
See raw logs for the red regression and subsequent executed checks.

The rebuilt lock-fix package also passed the installed SIGKILL/restart suite
(root 4542, fresh root 4673), discovery, explicit restore, Save As cancellation,
exact separate saving, unchanged original and cleanup. The process exited normally
after the final clean close. See `raw/desktop-sigkill-after-fix.log`.

## Hosted CI availability

Run [44436506110](https://github.com/TomasDelon/programmable-notes/actions/runs/44436506110)
for `83d1e4a` failed **before either job started**. Check-run annotations report
failed account payments or an insufficient spending limit; both jobs have no
runner and no steps. This is an account-infrastructure blocker, not a test result.
The account owner must resolve GitHub Billing & plans before a rerun can execute.
The preceding `438f4b4` run 44430453610 passed both jobs. Local checks and disposable
VM observations above were actually executed and are independent evidence.
