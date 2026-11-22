# Fail-closed native fidelity options

Base `77dedad`. The external acceptance runner previously ignored unknown flags,
so a typo could silently omit requested optional coverage. It now validates all
six supported flags and the multiline-quotes dependency before preflight,
fixture creation or application launch. Existing flags, test gates, production
code and permissions are unchanged.

An invalid-option unit test first failed with the old prerequisite exit2 instead
of explicit argument exit1. Final tests distinguish invalid flags/dependencies
from valid options reaching unavailable prerequisites. The complete recognized
flag set reaches preflight; that is not a native acceptance pass.

In the real disposable Ubuntu desktop, the installed binary/wrapper and external
native driver prerequisites were positively checked. A misspelled `--same-name`
then exited1 before any launcher PID or fidelity-specific file/directory existed.
The verification wrapper exited0 only after checking that expected refusal. Raw
log, observer hash and unit red/green are retained. No new application was run by
this control. Full local check passed **92 unit /35 Chromium** tests, formatting,
lint, strict types and a fresh production build. Read-only review found no
Important/Critical issue.

The previous complete production acceptance used observer2399a54d… and installed
ELF4c0ab980…; its exact editing/recovery/IPC scope remains in safe-source-selection.
This CLI-only milestone does not relabel that record as a fresh full GUI run.
The six-case resource run on earlier ELF6e301bce… remains5passed/1failed additional
OOM gate. Native renderer/startup limitations and hosted billing refusal remain.
No public release, merge, security readiness or PR readiness change is implied.
