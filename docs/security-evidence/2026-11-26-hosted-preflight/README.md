# Hosted native infrastructure investigation — 26 November 2026

This record concerns the standard Ubuntu runner's prerequisites. It is not
installed-application, WebKitGTK runtime, IPC, resource-containment or production
security acceptance.

## First hosted observation

- Source: `8c365800689a84432adcb872c77c900e9cabdb85`.
- [Manual run 45730773012](https://github.com/TomasDelon/programmable-notes/actions/runs/45730773012), native-preflight job 139611929673.
- The registered CI workflow accepted its branch-only native input and selected
  the separate native-preflight group. The capability step failed after 1m23s;
  controller exit 2, fixed annotation `NATIVE_PREFLIGHT_BLOCKED user-bus`.
- The controller reached the socket observation after its stock-policy and
  dedicated-user setup. It did not reach constrained-service, supervisor,
  namespace, graphical-session or application assertions. No document payload
  was run, and no new native package was installed by this job.

The socket predicate ran as the Actions runner, while the runtime directory is
private to the dedicated UID. That observer could not establish whether the bus
was present. Do not reinterpret this result as a missing/broken D-Bus service, or
as evidence of working isolation. Keep the original failed run.

## Correction and local evidence

The corrected observer checks the socket as its owner. If needed, that same user
requests bounded activation of `dbus.socket`, then verifies the socket and an
actual D-Bus GetId round trip whose response is discarded. The user manager must
reach exactly running or degraded within its deadline. Activation, transport,
timeout and manager errors retain distinct fixed annotations.

Ubuntu Noble package units already connect the user default target through
basic/sockets targets to `dbus.socket`; its listener is `%t/bus`. No directory
permissions, groups, global namespace controls or application capabilities need
loosening. A real private Unix-socket fixture reproduced the old observer refusal.
Nine session scenarios, the existing thirteen controller/cleanup mocks and the
wrong-runner/annotation controls passed locally after correction. Those are
harness tests, not a live Linux security result.

Subsequent hosted outcomes must be bound to their own source/run identities and
are tracked in [draft PR #9](https://github.com/TomasDelon/programmable-notes/pull/9).
The earlier installed-package startup and CPU Stop-attribution gaps remain open
until matching actual package tests pass.

## Reproduce the current infrastructure probe

```sh
gh workflow run ci.yml --repo TomasDelon/programmable-notes \
  --ref fix/preview-markdown-input -f native_preflight=true
```

Leave other inputs at their defaults. Verify the resulting run's exact head SHA,
mode/group and native-only job before interpreting its outcome. Keep nonzero
unsupported results. The [full native acceptance procedure](../../plans/2026-11-24-native-hosted-acceptance.md)
requires an actual optimized installed package and the unchanged security matrix;
a successful preflight does not replace it.

## Corrected stock Ubuntu 24 observation

At `e54423ff843ffaa09ee0ed17d5f00c0d863d1394`,
[run 45732366199](https://github.com/TomasDelon/programmable-notes/actions/runs/45732366199)
(job 139617244338) failed with controller exit 2 and the fixed annotation
`private-network-unavailable` after 1m38s. The corrected owner-context observer
passed. Reaching this result requires the actual CPU/memory/swap/task values,
NoNewPrivileges, trusted user-manager journal and equal-network-namespace checks,
followed by the supervisor's specific pre-delivery refusal, no payload sentinel
and no live preview unit.

This verifies stock refusal on that runner. It does not verify CPU throttling
under authored JavaScript, memory pressure, Stop, expiry, the installed application
or graphical/IPC behavior. The unchanged supervisor correctly withheld payload
delivery when actual PrivateNetwork enforcement was unavailable.

A simulated executor-policy transaction was investigated but not promoted or run.
Selecting a named unconfined AppArmor profile on one manager does not make its
kernel-wide permission exclusive to that UID. No such policy was loaded, no
restriction was disabled and no production application permission changed.

## Stock Ubuntu 26 alternative

The manually selected infrastructure job now probes standard x64 `ubuntu-26.04`;
mandatory compilation/backend/browser jobs retain `ubuntu-24.04`. The script
accepts either Ubuntu release and keeps the same strict AppArmor restriction,
actual namespace, limits, privilege and cleanup assertions. This is an OS-target
change, not a relaxed isolation path.

The [official runner image manifest](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md)
lists Ubuntu 26.04 image `20261116.202.1`, kernel `7.0.0-1020-azure` and systemd
`259.9-0ubuntu0.1` (observed Git blob `58bb856f8f026db66e6f5080cc8c8b4c5502c4cc`).
It establishes availability of the standard runner, not effective namespace
isolation. Subsequent actual run outcomes belong to their own source identity.
