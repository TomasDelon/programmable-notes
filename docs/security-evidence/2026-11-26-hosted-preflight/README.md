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

The first actual Ubuntu 26 dispatch,
[run 45736249396](https://github.com/TomasDelon/programmable-notes/actions/runs/45736249396)
at `502b483`, exited 100 during package setup. Its generic annotation does not
identify which APT stage failed; no native runtime result follows from it.
Independent inspection of checksum-verified Ubuntu Resolute package indexes
found that `webkit2gtk-driver` is unavailable there and its replacement is
`webkitgtk-webdriver` (the same `/usr/bin/WebKitWebDriver` and WebKitGTK 4.1 ABI).
An isolated package-resolution simulation rejected the former prerequisite set
and accepted the latter. This explains a reproducible setup defect, not the
unobserved details of that hosted failure.

The corrected probe installs only session prerequisites before verifying actual
namespace containment, then installs the version-appropriate graphical driver.
Fixed annotations distinguish index, base-package and GUI-package failures;
missing-candidate annotations use only fixed prerequisite names. APT diagnostics
remain on the disposable runner. Six package-stage simulations join the existing
session and controller regressions. These controls are not a native runtime pass.

## Corrected stock Ubuntu 26 observation

[Run 45738904101](https://github.com/TomasDelon/programmable-notes/actions/runs/45738904101)
at `5a1594306a400c33c8041c4e079ffd45b3c7bb37` reached the actual constrained
service and failed with `private-network-unavailable`, exit 2 (job 139638775794).
The prerequisite correction cleared package setup. As on the corrected stock
Ubuntu 24 run, this path requires the actual fixed cgroup values, NoNewPrivs,
trusted user-manager journal, equal namespace observation, supervisor-specific
pre-delivery denial, no payload sentinel and no surviving preview unit. Graphical
prerequisites are deliberately deferred until namespace enforcement succeeds.
No WebKitGTK or installed application run occurred on this runner.

Inspection of Ubuntu's checksum-verified systemd `259.9-0ubuntu0.1` source and
packaging found that user-unit PrivateNetwork creation still follows the local
executor's user/network namespace setup. `systemd-nsresourced` is not called by
that path, and `DelegateNamespaces=` does not itself create capabilities.
Installing that service is not a demonstrated remedy. No AppArmor restriction,
profile or namespace permission was relaxed, and no such service was enabled.

The tested standard hosted Ubuntu 24/26 runners and this managed shell cannot
satisfy the positive native-runtime acceptance contract. Use the linked
full-system disposable desktop procedure with effective private namespaces; do
not count fail-closed refusal as CPU-under-load, OOM, Stop, expiry, persistence or
GUI validation. The previously canceled VM launch remains canceled.

## Separate hosted KVM observation

The optional hosted probe also reports whether its ordinary x64 Linux account
can open `/dev/kvm`, verify the opened descriptor is a character device and query
KVM API version 12. It does not create a VM, execute a guest, change permissions,
use sudo, alter groups or relax policy. Every opened descriptor is closed;
unavailable access is separate from an unexpected observer failure. Seventeen mocked
cases verify the exact single ioctl, cleanup and sanitized metadata. No device was opened locally.

This observation can inform whether a new disposable hosted Linux guest is
feasible. GitHub treats nested virtualization as experimental, so device API
access would not prove guest startup or native acceptance. A separately tested
Debian guest would have its own stock policy, package/ELF identity and results;
it could not clear either stock Ubuntu failure. The canceled retained managed-host
VM operation remains untouched. Actual hosted observations belong to their own
run receipts, not these mock tests.

The first actual KVM observation,
[45745975205](https://github.com/TomasDelon/programmable-notes/actions/runs/45745975205)
at `04beb14`, reported `device-denied` before the unchanged namespace refusal.
That observer used the same label for device-open and ioctl denial; it does not
establish absent group membership or provider permission to delegate access.
The refined observer distinguishes those stages and reports only yes/no/unknown
for device type, root ownership, stock group/mode, sysfs match, ACL absence and
caller membership. Unknown or inconsistent metadata cannot justify a new role.
The KVM observation itself changed no account, group, device permission or policy
and created no VM. The subsequent strict namespace preflight creates its
separate isolated validation user, as documented above.

## Default-off dedicated-role API experiment

The refined ordinary-account observation
[45747710175](https://github.com/TomasDelon/programmable-notes/actions/runs/45747710175)
at `82253e5` reported a stable root-owned character device matching the existing
`kvm` group, stock0660 mode, matching sysfs identity and no access ACL. The
ordinary caller was outside that group and was denied at device open, before
any API query. The original namespace gate still refused author payload. These
facts support a narrowly scoped DAC experiment, not bypassing a provider policy.

A separate default-off `kvm_role_probe` input requires `native_preflight=true`
and all unrelated inputs at their defaults. It rechecks eligibility, then
creates one locked nologin account and private primary group for a fixed
API-only observer. Only that process receives the existing kvm supplementary
group; existing memberships, device ownership/mode/ACL, AppArmor and namespace
policy remain unchanged. There is no VM, mmap, vCPU or guest execution.

The root-staged script/reference are immutable to the role. Captured numeric
identities bind launch, credentials and cleanup. The child drops capabilities,
sets NoNewPrivileges, closes inherited descriptors and uses an isolated Python
invocation with a clean environment and fixed working directory. Before device
access, its provider context must match the original namespaces, cgroup, device,
LSM labels/stack and seccomp mode/filter count. Unreadable, unknown or changed
evidence refuses the API. Root never queries the device. Runtime/output are
bounded; cleanup verifies acquired identities and resource absence, reporting
unverified cleanup separately without deleting changed records.

The opt-in step propagates nonzero outcomes directly; unavailable role access or
a cleanup error cannot become a passing step. Invalid/mixed requests fail before
checkout and cannot cancel a valid native group. Routing controls cover3,072
dispatch combinations and automatic PR/main gates. Mocked lifecycle/credential
controls and independent code review precede any hosted role action. Actual role
results belong to their own receipts. API12 would prove only that query for that
role, not guest feasibility, Ubuntu support or application security readiness.
