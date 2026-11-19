# Next security-test milestone: bounded cleanup observation

Base: preview lifecycle correction and retained four-pass/two-fail resource matrix.
The first empty cgroup read followed by a matching non-zombie procfs read caused
an immediate failure. A targeted repeat did not reproduce it. Do not relabel that
original result or claim an escaped task is disproven.

Implement a bounded cleanup observation helper, with deterministic IO/clock tests,
that requires BOTH conditions before one absolute original deadline: cgroup
empty/removed AND every historical PID/start identity absent, replaced or zombie.
A matching live identity must keep waiting. This explicitly changes instantaneous
assertion semantics to eventual cleanup within the existing5s/75s bounds. Never
reset/extend deadlines, accept PF_EXITING as dead, ignore unexpected read errors
or use ENODEV to prove emptiness. Check the deadline again after asynchronous IO
and before success. Keep actual fixed systemd/cgroup policy and strict OOM oracle.

Record matching live identity observations with raw stat/start/state/flags,
monotonic time and cgroup location, even when later cleanup succeeds. Eventual
cleanup is not proof against temporary cgroup escape. Any clear migration outside
the owned group remains a separate security finding requiring investigation.
Retain existing failed matrix/journal warnings. No native product authority change.

Write regression tests first for live→gone within bound, persistent live at bound,
PID reuse, transient controller errors, unexpected errors and reads finishing
past deadline. Reuse the existing sample/identity logic through a small adapter;
avoid a broad process framework. Run unit/lint/types and appropriate real native
matrix/targeted negative controls on exact installedELFa6d00cbb…. Record all failed
or unavailable observations. Fullcheck, docs/review, coherent commit/push/draftPR.

Then resume the independent original-document Save crash-validation plan. No
merge, public release, readiness promotion, JIT/policy adjustment or guessed
engine workaround.
