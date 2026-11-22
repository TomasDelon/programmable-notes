# ADR-012: End a preview whose native renderer has died

Unexpected WebKit renderer termination must end its own unprivileged native
preview process. A live systemd wait connection otherwise can outlive the
interactive document renderer and leave misleading session feedback. An early
startup-only kill disconnected naturally, but a real counter followed by the
same owned-renderer kill retained that connection. Both observations are kept.

Install the native WebKitGTK termination callback only in the Linux preview
process. Ignore deliberate API termination. On unexpected termination, log the
native event and exit that process with status 1. Existing systemd ownership and
KillMode clean up its subtree; the trusted editor retains Stop and explicit
rebuild authority. No automatic restart, reload, recovery, dialog, capability or
new author message is introduced. The editor's separate native failure notice
and document operation guards remain independent.

This signal is not proof of an OOM kill. Keep the strict trusted systemd journal
oracle and all fixed memory/CPU/task/expiry limits. Do not turn exit-code or an
unavailable renderer into successful containment evidence. A live infinite loop
also need not emit termination; Stop and resource expiry remain independent gates.

The installed-package regression requires an actually interactive counter, an
external identity-checked kill, disconnection within five seconds of kernel-kill
CLOCK_MONOTONIC and before the earliest natural expiry, a responsive editor with
no editor-failure notice, owned group cleanup, explicit fresh preview/counter,
and Stop before expiry. It verifies Root identity and exit plus tracked owned
cgroups even when frontend cleanup fails. The diagnostic helper is disposable-VM
administration, never an application or document API.

Exact package hashes, runtime results and failed attempts belong in the dated
[preview-renderer evidence](../security-evidence/2026-11-19-preview-renderer-loss/README.md).
This improves lifecycle recovery, not WebKit engine stability or general production
security readiness. A healthy native connection still does not prove arbitrary
React code is responsive.
