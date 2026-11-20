# Native startup comparison under fixed production limits

One paired diagnostic on the installed optimized keyboard-save package (frontend
94e6b15), Ubuntu 24.04.5/WebKitGTK 2.52.6, disposable QEMU TCG/Xvfb desktop and the
documented software-rendering settings. No KVM device or cloud compute connector /
AWS CLI/profile is available in this task environment. A hardware-accelerated
comparison cannot be executed here; no personal machine or production service was
used. No production policy or application code changed.

Installed ELF SHA-256:
`886285a41426b8d1d66a3c432139e057f7bf6a31cc823fd5831a30112cfccb5e`.
The matching package hash/install evidence is in the keyboard-save record. The
observer's own hash is in the raw report and matched the executed source.

## Executed observations

| Fixture                               |   Bytes | Sandboxed WebKit observed | Accessible text ready | Stop cleanup complete |
| ------------------------------------- | ------: | ------------------------: | --------------------: | --------------------: |
| Static button, no document JavaScript |     153 |                   14.44 s |               40.54 s |               41.59 s |
| Real MDX/React Counter                | 224,305 |                   15.33 s |               43.88 s |               48.51 s |

Counter actions actually reached Count 1. Both cases verified the same effective
25% CPU, 512 MiB memory, zero swap and 128-task limits, private network namespace,
NoNewPrivileges, child automation disabled and real WebKit seccomp. Cleanup used
empty/removed cgroup membership plus known PID/start-identity checks, and finished
before the earliest possible 60-second expiry. An unverified static cleanup would
abort the Counter case. These are accessibility observations, not pixel visibility,
GPU, Wayland or a replacement for the full resource/security matrix.

Near readiness, static startup consumed 10,018,401 microseconds of CPU by 40.36 s,
with 400/400 cgroup periods throttled. Counter consumed 10,628,206 microseconds by
43.70 s, with 424/428 periods throttled. Observed memory peaks were 63,033,344 and
68,550,656 bytes; sampled task peaks 47 and 51. Raw process states/ticks, CPU
pressure, memory events and journals are retained. Throttle time can accumulate
across threads and must not be read as one sequential wall-clock delay.

The JavaScript-free fixture is also slow under the same quota: ordinary baseline
startup delay is not entirely React execution. This narrows investigation toward
common native/bootstrap work on the emulated stack. It does **not** establish the
cause of the earlier intermittent blank preview after editor crash, prove a fix,
or establish non-emulated latency. Do not raise limits or bypass isolation to
produce faster numbers.

## Failed observer attempt retained

The first attempt observed static content at 43.41 s, then started the Counter
unit but did not execute its UI lookup: Node rejected a fractional execFile timeout
with ERR_OUT_OF_RANGE. That is a harness error, not a Counter application failure.
The timeout now rounds the remaining budget down to an integer; the fixed budget
is unchanged. The complete corrected pair exited 0. Both raw attempts remain,
with distinct observer hashes. Failed observations are never omitted from reports.
Read-only safety review found no important issue before execution.

A separate source review ruled out repeated payload injection into inner srcdoc
on Linux: Tauri 2.12.6 webview/mod.rs:943 sets for_main_frame_only=true;
runtime-wry 2.12.4 lib.rs:5117 forwards it; the vendored Wry webkitgtk/mod.rs:844
uses UserContentInjectedFrames::TopFrame. The existing API is already main-frame
only. No change was made for that disproven hypothesis; Windows behavior was not
validated by this Linux source finding.

## Reproduction

Install the optimized package and use a disposable desktop account with the native
prerequisites, external driver and fresh generated fixture environment:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-startup.mjs
```

The script prints its private synthetic evidence path and writes startup.json.
It refuses an existing report, records failures, and returns failure for missing
readiness, observer errors, uncertain cleanup or an executable change. It does not
enable production child automation or inspection. Do not infer whole-group
termination from an empty accessibility tree or an elapsed timer.

Final repository checks passed formatting, lint, strict types, 56 unit and 26
Chromium tests. No application code changed in this diagnostic milestone.

Next: retain active targets in the stress report even when UI lookup fails, then
repeat only the previously failing editor-crash acceptance on this current package.
Preserve startup/process data and failure outcomes. The earlier whole fresh matrix
remains partial until its actual cases pass; hosted CI still cannot start due to
account billing. Physical GPU/Wayland and broad distribution review remain separate.
