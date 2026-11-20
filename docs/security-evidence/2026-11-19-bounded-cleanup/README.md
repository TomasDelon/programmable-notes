# Bounded native cleanup observation

Base9dffcd0. The preceding actual matrix failed when its first empty cgroup read
was followed by a historical matching non-zombie PID. Later absence and a passing
targeted repeat did not resolve that observation. The original failure, strict
OOM result and systemd kill-group warning remain in the
[preceding record](../2026-11-19-preview-renderer-loss/README.md).

This test-only change waits for BOTH group emptiness/removal and historical
PID/start identities absent, replaced or zombie within one original absolute
monotonic5s/75s deadline. Live identities, including PF_EXITING, keep waiting.
Malformed identities, unexpected errors and evidence finishing late fail.
ENODEV never establishes emptiness. A confirmation sample closes the asynchronous
repopulation hole and retains any newly discovered identities.

The instantaneous assertion semantics have changed; no application runtime,
capability, sandbox, resource limit, OOM oracle or fixed60s expiry has changed.
First/latest live identities are retained, with raw stat/start/state/time/cgroup
and logged state/location/error changes. Eventual disappearance does not erase
possible migration evidence or establish absence of a temporary escape.

## Regression verification

The initial missing-helper control failed. Read-only review then found a real
stale-empty false positive. The empty→repopulated-during-identity test failed
before the final confirmation sample, then passed.15 cleanup controls cover live
then gone, persistent live, seeded/subsequent identities, PID reuse, zombies,
transient controller reads, unexpected errors, malformed stat, late identity/
controller/confirmation reads, finite bounds and unchanged absolute deadlines.

Final full check exited0: **114 unit /37 matching Chromium**, formatting, lint,
strict types and fresh production build. The parser also read an actual Linux
`/proc/self/stat` through Node's direct TypeScript loader. An initial test-fixture
inference error was corrected before the frozen full check. Final read-only
review found no remaining Critical/Important issue. Executed native results
follow below.

## Exact native run: six cases passed

The existing optimized installed ELF remains
`a6d00cbb00a6acbbaaf6da9566a1f992b38f384df7d9b1c6878d9463334b1195`
(final Debian2a6aa569…). No new package was needed because only external test
observation changed. Ubuntu24.04/QEMU TCG/WebKitGTK2.52.6, ordinary UID1000,
systemd/cgroupv2, authenticated Xvfb/Openbox and existing software-rendering flags.

Host/guest hashes match:

- Cleanup helper:47b2f0a6ea86838d0df47c68cb935415bdfa5bfd0e67c619b6db96da7767af9d.
- Stress driver:bc7354315ce3f7ec847c124e1372dba2bf88eb1189f94d22ae719d5a23df3295.
- Unchanged strict OOM oracle:637db391c7b4ee4075e21fcf51b259af700fa06464ee1fcf70ca149b5687ca09.

The serial full six-case command exited0 on a fresh disposable fixture:
CPU throttling/Stop, full-fill memory, resident-page memory, expiry, actual editor
SIGKILL and preview window-close all passed with fresh Counter2 recovery.
Both memory cases passed the unchanged strict trusted systemd `oom-kill` oracle
and reached536,870,912-byte peak with zero swap. CPU observation measured774,393µs
over3,046ms,31 throttled periods and529ms Root response. All12 supervised targets
passed bounded whole-group/historical-identity termination.

The deliberately killed Root51824 was followed by new Root52713. Independent
post-run checks confirmed both absent, no owned units, all96 recorded historical
identities absent/replaced/zombie and recovery limited to its lock. The installed
ELF hash remained unchanged. No matching-live cleanup observation was emitted in
this run. The controlled asynchronous races are covered by unit tests, but this
run does not explain the earlier PID50295 observation or erase its original
failed matrix/systemd warning. It is a successful run under the explicitly
changed bounded-observation contract, not proof against temporary escape,
repeatability, JSC crashes or other distribution/hardware limits.
Hosted CI at exact base9dffcd0 refused both jobs before steps, run44603154321,
with the payment/spending-limit annotation. Local success is not hosted-green.

Reproduce through the existing disposable full-system procedure:

```sh
NATIVE_DISPOSABLE_PROFILE=1 npm run native:stress:test
```

No merge, public release, PR readiness or production-security certification.
