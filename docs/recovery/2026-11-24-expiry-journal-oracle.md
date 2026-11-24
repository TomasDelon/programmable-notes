# Trusted runtime-expiry evidence

The prior expiry observer matched a phrase in formatted journal output. An author
console message can contain that phrase, so text alone is not an authoritative
expiry cause. The fixed test fixture did not spoof it; this is a diagnostic
false-positive risk, not a reproduced application privilege bypass.

The observer now requires both a matching trusted systemd-user failure record
with `UNIT_RESULT=timeout` and a matching trusted runtime-limit cause record.
Both must have the expected executable, process name, UID, journal transport
and exact user unit. The failure record also requires the existing unit-failure
MESSAGE_ID. The cause has no MESSAGE_ID on the observed systemd255; its exact
runtime-limit message is required in addition to trusted sender fields. A generic
start/stop timeout, OOM result or authored stdout cannot substitute for either.
The original elapsed55–75s assertion, child60s policy and all cleanup bounds remain.
The existing OOM predicate retains every original condition.

Four new regression tests failed against a naive phrase-matching variant; all six
journal tests then passed, including the previous OOM controls. Replay of the real
captured expiry/editor-death journals accepted the new predicate, forged stdout
was rejected, and both captured real OOM results remained accepted as OOM only.

A fresh production-package `--case=expiry` run exited0: actual loop arming, fixed
lifetime termination, trusted runtime-cause/timeout pair, no known live descendants
and a new interactive Count2 counter followed by bounded Stop. See the
[sanitized fresh result](../security-evidence/2026-11-24-current-package/expiry-1-strict-summary.json).
This is one dedicated case, not a new all-six pass; the complete earlier matrix
remains failed on CPU Stop attribution. No application permission, package,
resource policy or runtime sandbox was changed by this diagnostic correction.
