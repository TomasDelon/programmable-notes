# Installed preview renderer loss: interactive baseline and correction

The earlier startup-only kill disconnected, but a real interactive counter
revealed a different lifecycle: its WebKit renderer died while the native wait
connection remained alive. The Linux preview now exits its own unprivileged Rust
process on unexpected native WebKit termination. No editor notice, document
operation, capability, IPC, plugin, JIT or resource-policy change is added.
See ADR012. A live connection still does not prove arbitrary React responsiveness.

## Preserved failing observations

On preceding production ELF837d2ab9…/Debian7ad9debe…:

- Early-startup Root48205/preview48283/WebKit48324: verified external SIGKILL,
  connection false at 18.939 s after start, editor responsive/no Editor stopped,
  explicit Stop and empty group. Probe/helper both exited0. No counter interaction
  preceded that early kill; it cannot establish the loaded-document behavior.
- Interactive Root48436/preview48514/WebKit48572: actual Count0→1 passed,
  verified kill, ten connection=true samples at 51.1–56.1 s after start. The strict
  pre-expiry assertion failed, so this is not accepted crash propagation. Stop
  emptied the group. Root subsequently absent. Original raw logs and trusted
  unit journal are retained; natural expiry never counts as a successful crash test.

On corrected production ELFa6d00cbb…:

- First attempt Root48776/preview48855/WebKit48895: actual Count0→1, verified
  kill, connection false 1.237 s after CLOCK_MONOTONIC kill and 49.852 s after start.
  Editor remained responsive/no Editor stopped; Stop emptied the failed group.
  Explicit fresh preview48950 ran Count0→1. The complete command nevertheless
  **failed**: the new counter finished at 53.400 s, missing the conservative 50 s
  reservation for the later Stop observation. Cleanup emptied the group and
  verified Root absence. Do not label the whole command passed. Deadlines remain
  unchanged for the bounded repeat.

The bounded repeat exited0 with unchanged deadlines. Root49129/preview49205/
WebKit49246: Count0→1, verified external kill, connection false 1.025 s after kill
and 49.017 s after start. The editor stayed responsive, no Editor stopped appeared,
and Stop emptied the old group. Explicit preview49302 ran Count0→1; Stop was
requested at 47.181 s, acknowledged and emptied its group before 55 s. Root identity
was unchanged, then its absence and both owned groups were verified. This pass
does not erase the first corrected-package late-Stop failure.

## Exact corrected package

Optimized Debian SHA256
`2a6aa569726c2e8e0eb825b27d9a67ca16327fd173c777a3b3d179ab847210ed`,
6,837,126 bytes; installed ELF
`a6d00cbb00a6acbbaaf6da9566a1f992b38f384df7d9b1c6878d9463334b1195`.
The final formatted rebuild and install exited0 and retained the **exact same
ELF** as the earlier interactive tests. Its preceding Debian archive was
9796ff842763cf0576aaab48d36f1dd3b014e0e258c1b42b760db00e5e7f2a93;
archive hashes are distinguished rather than claiming identical package files.
All 153 shipping source/config/lock/vendor/default-fixture inputs match the final
builder; this is not hermetic-build proof.

Full Node check exited0: formatting/lint/types, 99 unit tests, fresh production
build and 37 matching Chromium tests. Cached Ubuntu builder Rust commands exited0:
2 application, 39 ordinary document and 7 policy tests; 4 infrastructure-only cases
were explicitly ignored, not newly passed. The host's offline Rust attempt could
not start because its separate cache lacked bytes 1.12.2; that prerequisite error
is retained, followed by the successful cached-builder execution.

Inspection and installation exited0. No security-test feature or production
child automation was enabled. Runtime environment: disposable Ubuntu 24.04 QEMU
TCG, systemd/cgroupv2, WebKitGTK/JSC 2.52.6, Xvfb/Openbox, ordinary UID 1000 with the
existing documented software-rendering flags. No claim about physical GPU/Wayland.

## Reproduce

Use the full-system disposable profile procedure in Linux desktop testing and a
fresh fixture. The external administrator helper is retained as
[owned-preview-renderer-kill.py.txt](raw/owned-preview-renderer-kill.py.txt).
Run it with `python3 HELPER FIXTURE EXPECTED_INSTALLED_ELF_SHA256` in a second VM
administrator terminal; run the probe as the ordinary GUI user:

```sh
NATIVE_DISPOSABLE_PROFILE=1 npm run native:preview-renderer:test
```

The helper is scoped to the disposable Ubuntu UID 1000 account. It verifies the
Root PID/start/hash/path and trusted fixture PIDfile, exact preview PID/start/hash,
child argv/unit/cgroup and exactly one descendant WebKit process before killing
only that process. It writes the kernel-kill CLOCK_MONOTONIC timestamp and
identity receipt. Receipts are a trusted external-helper boundary, not signed
attestation or an author API. Both helpers must share the guest clock domain.

The probe requires real counter interaction before the kill; false connection
within 5 s of that kill AND before 55 s since start; responsive editor/no failure
notice; Stop and empty failed group; explicit new preview/real counter; Stop
requested before 50 s and observed before 55 s. Cleanup verifies tracked owned groups
and Root identity/exit, including a frontend-unavailable fallback. Unsupported
arguments must fail before prerequisites or fixture effects; that unit test was
first RED for the missing probe, then GREEN.

## Scope and remaining risks

The native callback improves failure propagation only. Exit1 or renderer loss
never proves OOM; keep the trusted systemd `UNIT_RESULT=oom-kill` oracle unchanged.
Full resource results and targeted follow-ups below retain their exact executed
scope and failures. Existing JSC/blank/startup failures, incomplete resident-page pressure
acceptance, distribution/Wry maintenance risks and hosted-runner billing blocker
remain. This record does not certify production security readiness.

## Full resource matrix: four passed, two failed

The unchanged six-case stress command exited1 on this final installed ELF.
CPU-stop passed with real quota/throttling, Root response115ms, Stop before
expiry and fresh Counter2. Original full-fill memory passed, including fresh
Counter2 and the unchanged strict trusted OOM oracle: actual systemd reports
`UNIT_RESULT=oom-kill`,512MiB peak,0swap. Expiry and fresh Counter2 passed. Window-close and fresh Counter2 also passed.

The resident-page case **failed** descendant-cleanup acceptance: the observer
first saw an empty/missing cgroup.procs, then historical PID50295 still matched
its start tick and a non-zombie state. Immediate assertion preserved that failure.
Later separate observation found the PID absent. Trusted systemd identifies it
as bwrap and logs SIGKILL, an Invalid argument kill-group warning and a strict
`oom-kill` result. The independent unchanged OOM oracle accepts that journal,
but this is **not** a whole-case pass. Original stat/state/flags were not retained
at the assertion, so the current evidence does not distinguish exiting-task
observation order from a surviving descendant. Do not claim an escape or dismiss
it as harmless. A bounded targeted diagnostic will retain those actual fields
and follow-ups while preserving the original failing assertion/deadlines.

Editor-crash case **failed before its deliberate Root kill**: Arm CPU loop did
not become available through the unchanged55s accessibility observer. Trusted
systemd reports normal fixed lifetime expiry/timeout. This does not establish
editor-SIGKILL recovery on this package. No observer, resource or expiry check
was relaxed. Native blank/startup availability remains unresolved.

The original full matrix JSON, stdout and independent cleanup are retained. All
Root49808 units and Root itself were absent afterward, PID50295 was absent and
recovery contained only its lock. An initial cleanup read used an inaccessible
inherited cwd; the corrected ordinary-user read explicitly changed to `/tmp` and
exited0. That observation error did not change any application setting.

## Bounded targeted follow-ups

The read-only diagnostic copy retained the exact original failing stat assertion,
resource limits, OOM oracle and deadlines. It adds monotonic samples and, only if
that assertion would fail, records raw stat/start/state/flags, cgroup/status/wchan/
cmdline plus one second of follow-ups before throwing on the **original** stat.
No test Stop runs during that capture and later absence cannot turn failure into
success. Its source SHA256 is
`74ea5565ba16edb3a806ae6ad1008582b555ddea2b33e395ea28f5f3969de312`;
[exact copy](raw/stress-descendant-diagnostic.mjs.txt) must be copied beside the
ordinary native harness before execution.

A fresh targeted `--case=memory-pages` run on this exact ELF passed actual strict
OOM termination and fresh Counter2. Root50983 and its observer50961 were absent
afterward. The matching-live-PID failure did not recur, so there is no new failing
stat capture and no claim that the original observation is resolved. The tools
reconnected during the run; the wrapper exit receipt was lost. The completed
report and actual CASE_PASS/WEBKIT_STRESS_PASS output were retained and independently
validated, rather than inventing a wrapper status.

A separate fresh ordinary `--case=editor-crash` repeat exited0. It actually armed
the CPU loop, SIGKILLed Root51356, verified independent preview expiry, launched
Root51517 and recovered a real Counter2. Both Roots were absent afterward. This
establishes the executed targeted recovery on this ELF without relabeling the
original full-matrix startup failure or claiming repeatability is solved.

The next bounded test-engineering task is to require both cgroup emptiness and
historical PID termination before one original absolute deadline, retaining live
identity observations. This would change instantaneous assertion semantics and
must be documented/tested as such. It must never count PF_EXITING as dead, extend
the deadline, ignore unexpected errors, erase possible migration evidence or
claim eventual cleanup proves there was never temporary escape. The original
failed matrix and systemd warning remain release-validation limitations.
