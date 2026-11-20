# Preview renderer health baseline

Basec798791, production ELF837d2ab9…. The API connection_active deliberately
reports the owned systemd wait connection, not renderer health. Establish actual
behavior when only the unprivileged WebKit renderer dies, before choosing a fix.

Use a fresh disposable fixture. Launch the trusted editor, stop its initial
preview, then explicitly start a real compiled counter through the existing
supervisor. Record Root/preview MainPID/start/hash, exact unit/cgroup and request
time. An external administrator validates those identities, child argv/cgroup and
exactly one descendant WebKit process, then kills only that renderer. The Root
renderer must remain responsive and must never show Editor stopped.

Sample connection/main/cgroup state within five seconds, strictly before earliest
60-second expiry. Preserve raw observations; an expiry cannot satisfy quick crash
propagation. Require disconnected state for the prospective recovery behavior,
then preserve failure if current native Main/connection remains alive. Always
Stop the owned unit afterward and verify cleanup. No new author API/permission,
policy/JIT/timeout change or claimed complete pressure matrix.

If the baseline exposes a gap, consider the smallest native child-only callback
that exits its own Rust preview process on real renderer termination, letting
existing systemd group cleanup and Root connection feedback operate. Keep the
editor notice callback separate. Implement only after baseline/review, and run
real Stop/rebuild/counter plus native security/resource regression appropriate to
that lifecycle change. Otherwise document the verified behavior and choose the
next independent core reliability task.

## Executed baseline and justified correction

The early-startup renderer kill disconnected before expiry. A stronger real
interactive counter baseline did not: after actual Count0→1, the owned renderer
was killed and ten samples remained connected for over five seconds. The strict
pre-expiry check failed; Stop still emptied the group. Both observations remain.

Install a separate native child-only termination callback that exits only its own
unprivileged process after unexpected WebKit termination, leaving systemd to
clean its subtree. Ignore deliberate API termination. No new author API, dialog,
capability, policy or JIT change. Validate the optimized installed package with
real counter→kill→quick disconnect, Root responsiveness/no editor notice, Stop,
explicit restart/counter/Stop before expiry. Keep identity-bound Root/group
cleanup even if frontend IPC fails, and measure propagation from external kernel
kill CLOCK_MONOTONIC rather than only preview age. Repeat IPC and relevant real
CPU/OOM/expiry/recovery checks without relaxing trusted OOM cause requirements.
