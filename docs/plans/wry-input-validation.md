# Packet: diagnose input on the rendered Wry Socket/Plug surface

26 November 2026. Follows partial presentation evidence at `f9d8007`.
REACT-01/SECURITY-01, A09/A11. Diagnostic only; no product/vendor/policy changes.

- **Outcome:** distinguish native script readiness, event targeting and input/focus
  from mere painting, then test fixed real React if normal interaction succeeds.
- **Invariants:** unchanged Supervisor verify-before-payload, fixed 512 MiB/zero-swap/
  25% CPU/128-task/60-second limits, enabled sandbox, no IPC/devtools/privileged
  document authority, disposable full-system Linux only.
- **Witness:** bounded external receipt first observes script ready; child-relative
  real input changes count/text; a verified-live pre-expiry Stop kills the recorded
  process tree while trusted host input remains usable. No fake JS click/evaluate
  API substitutes for actual input.
- **Done:** exact source/artifact/environment identities, honest result classification,
  failed controls retained, small reproducible evidence, heavy new fixture cleanup.
  Interaction/React/security gates remain incomplete unless actually observed.

## Smallest diagnostic changes

Use the actual GtkSocket/Plug Wry path that painted. Add only a bounded
`with_document_title_changed_handler` presentation receipt: the child updates its
own Plug's title from a truncated fixed-fixture state string. External X11 observer
reads the child's title; it cannot authorize source/files or invoke application
commands. No new production channel or change to Supervisor's discarded stdout.

Wait for the fixture's script-ready state, not just green pixels. Query native
child XID/geometry independently and send real input relative to that child.
Poll a bounded state receipt rather than sampling only 0.5 seconds after injection.
Log timing against unit lifetime. Distinguish normal click-focus from a separate
forced-focus diagnostic; the latter is not end-to-end input acceptance.

If fixed HTML input passes, compile a small reviewed real MDX/React counter using
existing pinned dependencies, validate its fixture behavior cheaply, then load it
in the same isolated mechanism. No attacker-controlled code executes in the
privileged build host; compilation is not evaluation. Keep each artifact distinct.

For Stop, first prove a nonempty safe unit cgroup and live PID/start identity before
clicking the trusted host control. Reject empty/root/unsafe cgroup paths. Record
all descendant identities, actual Stop callback and bounded disappearance/emptiness;
expiry or a late callback does not prove Stop. If script/input never becomes ready
in the unchanged lifetime, record that result without restarting automatically.

## Resources and limits

At most one fixed-HTML diagnostic and one conditional React case within a bounded
30-minute packet. No raw-X11 retries, quota/lifetime increases, sandbox bypass,
production app rewrite or host switch. Prefer cached clean tooling, two compile
jobs, 8 GiB/4-vCPU guest. Extracted rootfs/disks stay outside the repository. Never
reuse or modify retained old VM state. Cache only clean toolchain assets without
keys/application data if it reduces provisioning cost; do not publish any image.

## Progress

- [x] Exact prior fixture CSP/script ran in a Chromium control (Count 2/hello).
      This is not native readiness/input evidence.
- [x] Executed bounded native readiness/input and valid Stop diagnosis; partial result.
- [x] Conditional React not run: normal keyboard acceptance remains unproven.
- [x] Source hashes/Python syntax/screenshots reviewed; new heavy fixtures and keys removed.

[Evidence](../security-evidence/2026-11-26-wry-input-spike/README.md) retains the
inconclusive title-based measurement and corrected native-property sentinel run.
Ordinary pointer input reached Count 2; forced-focus typing is diagnostic only.
A verified-live pre-expiry Stop cleared eight tracked identities in 0.79 seconds
and the host remained usable. No full security/React acceptance is inferred.
Next bounded measurement must wait for an explicit normal field-focus receipt
before typing, without forced focus or policy changes.
