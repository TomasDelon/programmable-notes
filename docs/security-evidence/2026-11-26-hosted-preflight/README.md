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
