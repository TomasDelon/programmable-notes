# Proposed inline native denial witnesses

27 November 2026. **Proposed and unexecuted.** This is the next source-bound
diagnostic design, not permission to activate arbitrary native React or a claim
that GTK denies these requests. The current `inline-react-guarded-v2` profile and
its observations remain unchanged.

## Scope and invariants

Follow [REACT-01 / SECURITY-01](../PRODUCT_CONTRACT.md),
[A09–A11](../PRODUCT_ACCEPTANCE.md), [the native security contract](../NATIVE_SECURITY.md)
and [ADR043](../decisions/ADR-043-inline-native-browser-guards.md). First finish the
current guarded-v2 validation. Then independently review a separate fixed
`inline-native-denials-v1` profile before execution. This name is a proposal, not
an existing executable interface.

Reuse empty Wry construction, canonical GTK guards, consumed-on-failure
Activation, GtkSocket/Plug and the existing Supervisor. Preserve exact Tauri
eligibility and assignment checks and borrowed-dialog semantics. Keep the fixed
25% CPU, 512 MiB memory, zero swap, 128 tasks and 60-second lifetime; do not extend
the current v2 input/Stop deadlines. Give destructive or slow probes fresh
supervised children and define their bounded schedules before running them.

Keep share-free admission, non-root identity, real namespace/seccomp checks,
host-only private keys, fixed transfer allowlists, no native inspector and real
OS input. No generic commands, caller HTML/URLs, new IPC, document grants, network
exceptions, production permission toggles or Wry fork are proposed. Do not enable
fullscreen or loosen CSP merely to make a probe reach a handler. General native
React remains disabled.

## Smallest fixed probes

Use one fixed authored trigger per case, activated by real OS input. Observe
bounded native events from the **actual denial callbacks**, separately from
authored attempt/result receipts. An adjacent signal listener may not run after
an earlier handler returns handled; it cannot reliably witness that denial.
Any observational seam in the canonical module needs source review and must add
no authority or renderer-controlled admission.

| Probe                  | Required witness and oracle                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File input             | Actual chooser callback enters and cancels; no selected files or remaining chooser; subsequent input works.                                                                                                                  |
| Permission             | Actual request class reaches the catch-all callback and denial executes. A promise rejection alone is insufficient. Record each supported class separately; do not extrapolate one class to all permissions.                 |
| Alert, confirm, prompt | Separate native dialog-type events; confirm returns false, prompt returns null, alert continues. Repeated interaction afterward checks continuation and borrowed-dialog lifetime.                                            |
| Print                  | Actual print callback suppresses the request; no print dialog/job and subsequent input works.                                                                                                                                |
| Fullscreen             | Native settings readback remains disabled; a gesture-driven request leaves native window geometry unchanged. If settings prevent a signal, classify setting-level denial separately from an unobserved fullscreen handler.   |
| Download               | Fixed tiny blob/data canary reaches the child-owned context callback, which cancels immediately; native cancellation completes with no destination or canary file. Preserve the editor context and authorized exports.       |
| Popup                  | Fixed `window.open('about:blank')` reaches the deny callback; no additional native window/view appears.                                                                                                                      |
| Navigation             | First record initial `load_html` policy-event ordering. A fixed non-network, nonallowlisted target must reach native denial and leave the document unchanged. Test exact `about:blank` separately as the known allowed case. |

Discover actual GTK behavior on the pinned stack; the table defines observations
to collect, not assumed API behavior. Check absence of windows/jobs/files with
independent native sensors and bounded guest-local canary paths. Do not grant
authored code filesystem access to inspect results. Prove sensor sensitivity with
reviewed fixed synthetic controls, separate from the guarded authored cases;
never disable product denial handlers as a test option.

## Results and negative controls

Record `attempted`, `native_handler_observed`, `denial_executed`, `continuation`
and `effect_absent` separately. CSP, secure-context restrictions, absent devices,
engine policy or user-activation rules may stop requests before GTK. Such a case
is an earlier-policy observation with the native handler **not observed**; it
cannot pass that handler's gate. Host-triggered requests or synthetic signal
emission prove narrower behavior and must not be relabelled authored end-to-end
denial. Authored success titles cannot replace native witnesses.

Before runtime, add controls rejecting forged title success, missing/duplicate/
out-of-order native witnesses, wrong request classes, lost continuation and stale
PID/start-time/window identity. A missing effect sensor or indeterminate read is
not proof of absence. Native observation records must use closed enums and bounded
counts, with no raw authored text, URLs or dialog contents. Retain failed and
unperformed cases; no automatic retries or changed deadlines to obtain a pass.

## Source and evidence identity

Freeze a new exact profile, build frame and closed schemas. Bind the fixture,
compiler, canonical guards, Activation, host, observer/session/driver, dependency
locks, pinned vendored-Wry identity, compiled bundle and binary hashes. Record
the guest image, GTK/WebKit versions and actual effective isolation. Preserve the
trusted-build-producer limitation; source hashes alone do not attest execution.
Reject legacy v1/v2 receipts under the new profile and altered relevant inputs.
Keep actual handler events separate from authored receipts and existing passive
load snapshots. Independent review and compilation precede native execution;
source checks and mocks are not native passes.

## Remaining security and product gaps

Exact same-URL `about:blank` navigation is currently allowed. Tightening it needs
actual policy-event evidence and another reviewed change. X11 properties are
diagnostic transport, not protection against native compromise. This fixed
diagnostic cannot establish application IPC denial, integrated geometry/lifecycle,
hostile CPU or both memory workloads, recovery, or packaged-product acceptance.
Existing shared-startup success and packaged chooser failure remain independent;
this work cannot waive the chooser failure or satisfy A09/A11 by itself.
