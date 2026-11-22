# Current-package resource revalidation

Disposable Ubuntu 24.04.5/QEMU TCG/Xvfb, ordinary desktop user and the unchanged
production sandbox. Installed package: deb
`ac03a1a27d9ced5c5aedceed05065a1504a4e65da7e863c0c74c1878316a85e4`,
ELF `db94d324fe6efc390508eee43d02108a751634d0ac79f92d339034aeecf3f120`.
No production test feature, child automation or inspector. Software rendering
variables are the documented ones. This record does **not** claim the fresh
complete matrix passed.

The combined stress invocation passed memory/OOM and lifetime expiry with actual
interactive counter recovery. The first CPU loop consumed 775,782 µs over 3,129
ms, with 31 throttled periods and a 113 ms editor response; whole-group Stop was
observed. Its subsequent counter recovery was not accessible before expiry, so
the CPU case failed. Editor-crash and window-close cases also failed at arming or
finding their expected controls. Their intended termination assertions were not
reached and are not claimed. Raw failed output, all samples and a real blank
recovery screenshot are retained. The screenshot is a disposable desktop, not a
production/user document capture.

For memory pressure, systemd recorded OOM kill, 512.0 MiB peak and zero swap.
The observed expiry required the systemd runtime-limit journal cause and removal
of known live descendants; subsequent counter interaction passed. The first
blank counter service also expired normally under the unchanged limit. These
observations support containment on the recorded cases but do not resolve the
intermittent blank/startup behavior. No observer, timeout, CPU, memory or namespace
requirement was relaxed. Independent unchanged repetitions are recorded below
when completed; earlier package results retain their earlier exact scope.

Reproduce from the documented native prerequisites and a fresh external fixture
environment, only with disposable data:

```sh
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_EVIDENCE_DIR=/tmp/pn-resource-repeat \
  node scripts/native-stress.mjs
# To isolate a failed case without changing policy:
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_EVIDENCE_DIR=/tmp/pn-cpu-repeat \
  node scripts/native-stress.mjs --case=cpu-stop
```

## Independent CPU repeat

The unchanged `--case=cpu-stop` repeat passed: real loop, effective quota,
768,785 µs CPU over 3,042 ms, 30 throttled periods, 106 ms editor response,
whole-group Stop, then three verified counter states (0 → 1 → 2) and removal of
the replacement group. This resolves that case's execution for this repeat, not
the root cause of the earlier blank preview. No limit/observer change.

## Independent editor-crash repeat

The unchanged repeat armed the loop, actually SIGKILLed editor PID 6676, verified
independent runtime expiry/journal cause and absence of known live descendants,
then started fresh editor PID 6836. Its counter recovery was not accessible before
expiry, so the complete case **failed again**. The termination sub-observations
passed; interactive recovery did not. This repeated startup/blank-window failure
is a current native reliability blocker on this emulated stack. Its cause is
unresolved; the documented slow TCG startup is a hypothesis, not a proven cause.
Do not rerun until green and suppress the failures or increase resource limits.
Physical GPU/Wayland remain separate, unexecuted compatibility targets.

## Procfs observer correction and window-close acceptance

On the source-navigation package (deb
`be37c69ef7d8a59428eeb3147fd651d24c151e2172c6eb52c4f94333d0f24d89`,
ELF `cbe2593ad8e6b34d7a447d5b67d7707a78cf0e5ee47912b5a4eca26f47a554f0`),
the first timed window-close attempt rendered Count: 0 at 53.5 seconds, then failed
when `/proc/PID/stat` returned ESRCH during process exit. Linux can return this
after the file was opened but before read. The observer now treats ESRCH like
ENOENT only for process stat reads. The cgroup membership sample stays intact;
empty/removed membership and all known process identities are still checked.
Other errors, surviving tasks and indeterminate controller reads still fail or
retry conservatively. Read-only review found no weakened check.

The corrected case passed. A subsequent stricter run additionally required close
to finish before the earliest possible lifetime expiry using a monotonic clock.
Cleanup completed **52,238.6 ms** after the request (unit cannot start before that
request), proving it was not natural 60-second expiry. It then verified Counter
0 → 1 → 2 and complete replacement-group removal. Startup observations showed
WebKit sandboxed at roughly 15–16 seconds and first accessible content at 46–50
seconds. These timings support a slow-startup concern but do not prove why some
earlier previews stayed blank. Runtime limits and payloads are unchanged.

The same before-earliest-expiry assertion now applies to CPU Stop, preventing
natural expiry from being mislabeled as Stop. Its fresh execution is recorded
only after completion. KVM is not exposed at `/dev/kvm` in this cloud; the existing
VM uses QEMU TCG. Physical GPU/Wayland and hardware-accelerated startup comparison
have not been executed.

## CPU Stop attribution on the source-navigation package

The new strict before-earliest-expiry CPU test passed unchanged policy/payload.
The actual loop consumed 749,816 µs over 3,072 ms, showed 30 throttled periods and
a 540 ms editor response. The group and known identities were gone before 60
monotonic seconds from the request; the test fails if termination can overlap
natural expiry. Fresh counter recovery reached 0 → 1 → 2 and stopped cleanly.
This is a separate executed run on the cbe2593… source-navigation ELF, not a claim
that the earlier combined or editor-crash recovery failures have disappeared.

## Native IPC and policy regression

On the same source-navigation production package, the real WebKitGTK suite passed
editor positive control, distinct network namespace, NoNewPrivs, child automation
false, effective cgroup values and complete Stop. The automation-attached preview
probe then passed denial of every registered native command, all five versioned
recovery actions, filesystem/shell/http plugin access, editor-storage canary and
iframe parent DOM/storage access. The actual Counter reached Count: 2; actual
HTTP/file fetch attempts were denied with connect-src violations. That attached
probe changes WebKit networking and does not replace ordinary production network
namespace observations; both scopes are explicit in the raw output.

Final repository checks passed formatting, lint, TypeScript, 42 unit and 22
Chromium tests. The native observer correction is test tooling, not an application
policy change. The full fresh matrix remains partial because editor-crash recovery
still had a blank-preview failure; no hostile-document production approval is
implied by the individual passes.
