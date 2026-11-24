# Current installed Linux validation — 24 November 2026

## Scope and immutable candidates

Disposable Ubuntu 24.04 full-system QEMU TCG guest: four vCPU, 8 GiB,
kernel 6.8.0-149-generic, WebKitGTK 2.52.6-0ubuntu0.24.04.2, AppArmor enabled,
delegated cpu/memory/pids controllers, Xvfb/Openbox and ordinary `ubuntu` user.
Fresh private XDG profiles and exclusive test fixture directories were used.
External editor WebDriver and PID-bound AT-SPI control remain distinct from the
production supervised child, whose automation stays disabled. Existing software
rendering switches were retained; no JSC override, quota change, sandbox-disable
variable, capability or CSP directive change was introduced.

The existing guest administrator executor namespace opt-in was retained, not
installed or broadened by these packages. [Policy snapshot](guest-policy-summary.json)
records on-disk profile hashes and actual kernel settings: userns clone1,
AppArmor userns restriction1, additional unconfined restriction0. This is the
baseline configuration; no new tighter-unconfined/Wayland/GPU run is claimed.
The host has no `/dev/kvm`, so this run used software virtualization. See the
[original executor-policy scope](../2026-11-18/README.md).

Both optimized packages were built without `security-test`, inspected by
`verify-linux-package.mjs`, installed using dpkg, and checked against the running
ELF. Node 24.22.1/npm 11.9.0/Cargo 1.100.0. Container Cargo downloads failed;
430 archives fetched through the available host HTTPS route were individually
verified against Cargo.lock before an offline build. No dependency was replaced.

| Candidate | Debian SHA256                                                      | Installed ELF SHA256                                               |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `21b3a48` | `9f59b9085888b9da25e04688ad12520a303bfa86a91a910699bd756559463312` | `e26aeaf828b90c404856582563a4b5ea941e0ff139cdc2b955a88802e43f51bb` |
| `3cf7f28` | `4a126dc47748fdfabc01673a373278f9f3151badd3a0ce27fbe0c100d2d59409` | `9c527058610b66d6293282ff0681476f60e7cc9050cbcb89fb05e92e8d4fa7dd` |

The builds took 3m14s and 45.84s respectively (second reused compilation cache).
Artifacts remain local testing candidates; no installer was publicly released.
Historical binaries and failed observations were preserved.

## Confirmed source-fidelity defect and correction

The unchanged full fidelity observer first failed while saving a physical ASCII
Space in the second of two same-named documents. Disk contained NBSP. Event
inspection showed ASCII `keydown.key` and `beforeinput.data`, with no modifiers
or composition. CodeMirror's computed whitespace was `normal`: its dynamic
stylesheet was blocked while the trusted boot style had a Tauri-authorized nonce.

[ADR 014](../../decisions/ADR-014-editor-style-authority.md) documents the minimal
correction: use CodeMirror's supported nonce facet with the existing host nonce.
No Unicode normalization, source rewrite, keyboard substitution or CSP relaxation.

- Browser nonce-policy regression: RED before correction; GREEN after, including
  continued refusal of an unauthorized inline style, BOM/CRLF, explicit NBSP,
  physical ASCII-space input, history, export and reimport.
- [Native RED](whitespace-red-1.json) on `21b3a48`: computed whitespace `normal`.
- [Native GREEN](whitespace-green-1.json) on `3cf7f28`: `break-spaces`; actual
  ASCII space and explicit NBSP preserved through disk saves, Undo/Redo, mode
  0640, and a positive reopen after an external change to the owned fixture.
  Unauthorized CSS remained ineffective. Session closed successfully.

The RED observer precedes the final fixture-mode/reopen strengthening; its exact
hash differs and is retained. It failed at the original style assertion, which
is still required by the final observer. No failed product assertion was removed.

## Actual startup and remaining runtime gate

On `21b3a48`, `native-startup.mjs` passed static and compiled Counter launches,
actual sandbox observation, bounded Stop cleanup, final empty-group confirmation
and absence of known live descendants. [Summary](startup-21b3a48-summary.json)
binds the executable, CLI, cleanup module and original report hashes. Static UI
was ready at 36.54s; Counter at 45.35s; final cleanup at 37.30s and 50.59s from
request, before fixed 60s expiry. The counter was clicked **once to Count: 1**;
this corrects the earlier progress-log shorthand “Count: 2”. This precompiled
artifact test alone does not establish the editor's actual compiler pipeline.

On corrected `3cf7f28`, full fidelity attempt 2 passed same-name independent
source/history/save/reopen and dense-source read-only navigation/exact save. It
then failed to observe `Native probe 0` before its unchanged accessibility
deadline. A single corresponding service reached the fixed 60s timeout; it was
not a substituted service or a passing React test. Subsequent editing/recovery
steps were not reached.

A fresh private diagnostic using the exact failed MDX fixture did compile that
entry, report a connected preview, expose its rendered document and click
`Native probe 0` to `Native probe 1`. This proves that fixture can work on the
same candidate, not that the preceding failure was spurious or repaired. The
root cause of intermittent startup/render availability remains unresolved.
No JSC/sandbox change or extended preview deadline was used.

## Complete fidelity retry

A separate fresh-profile attempt 3 ran the **unchanged complete seven-option**
`native-fidelity.mjs` and exited 0 on `3cf7f28`. Its observer hash is identical to
failed attempt 2. [Retained result markers and log hashes](retained-observations.json)
record the actual scope:

- Same-name independent dirty keys, selections, histories, saves and reopening.
- Dense-source read-only visual fallback and exact source navigation/save.
- Real editor-WASM compilation of mixed MDX/React and an actual counter click.
- Existing native Source/Split/Visual modes (not the two-mode web interface).
- Heading, literal/multiline quote and paragraph edits, rejected unsafe pending
  input, no-op history and preserved mixed LF/CRLF quote prefixes.
- Exact disk bytes and mode 0640 across Undo/Redo and opaque JSX source navigation.
- Dirty-close cancellation, actual application restart and explicit recovery as
  unsaved source; invalid UTF-8 recovery refusal and explicit deletion.
- Original disk bytes unchanged by recovery and refused draft replacement.

This completes one real current-candidate fidelity/recovery acceptance run. The
preceding availability failure remains evidence of intermittent reliability;
passing retry does not diagnose historical JSC crashes or certify security.

## Versioned native recovery

A separate fresh-profile `native-recovery.mjs` run on `3cf7f28` exited 0:
two exact CRLF versions retained without original writes; discoverable after a
real application restart; explicit older-version restoration as an unsaved
buffer; Save As cancellation left originals unchanged; explicit Save As wrote
exact restored bytes. A damaged latest version failed integrity checking and
restoration, the older valid version stayed recoverable, and deletion required
explicit actions. Both original and restored file bytes remained unchanged by
the refused restore. See the hash-bound [result markers](retained-observations.json).

## Production IPC and browser boundary

The unchanged `native-webdriver.mjs` exited 0 against installed `3cf7f28`.
The editor's positive `host_probe` control succeeded. The real supervised child
had automation false, a separate network namespace, NoNewPrivs, actual cgroup
limits (CPU25000/100000, memory536870912, swap0, tasks128), and full-group Stop.

A separate external ACL probe then used the installed binary's production
preview label, outside the resource supervisor solely for WebDriver attachment.
All 17 editor/recovery calls were denied by ACL; filesystem/shell/HTTP/dialog
plugins were refused. The real iframe could not access parent DOM/storage,
incognito storage lacked the editor's synthetic canary, and both local-file and
loopback fetches failed with observed `connect-src` violations. This directly
attached probe is **not** evidence of production namespace/process containment;
the supervised-child observations and stress suite are separate.

The handoff Counter clicked twice to Count: 2 in actual WebKitGTK:

![Real native WebKitGTK counter after two clicks](ipc-counter.png)

Exact assertions and observed limits are hash-bound in
[retained observations](retained-observations.json). No test-feature application
or extra preview capability was used.

## Test controller evidence retention

The first six-case run used an external 660s controller. Five cases completed
successfully (CPU Stop, both strict OOM cases, expiry and editor death), and the
last window closed at 46.17s before earliest expiry. The run disappeared during
its final recovery at the outer window; exit status was unavailable after the
cloud session reattached. **The complete command did not pass.**
The old observer wrote JSON only in its final cleanup; no report survived this
interruption, though its exact logs remain retained. This is an infrastructure /
diagnostic defect, not evidence of an application resource-boundary bypass.

The observer now atomically checkpoints after each completed case and still
attempts native cleanup if writing a report fails. An exclusive same-directory
temporary file is renamed only after its complete contents have been written.
This protects against observer process interruption, not whole-machine power
loss. Partial checkpoints never imply all cases passed: check expected case
coverage, each outcome, the final CLI marker and controller exit status.

A real Linux integration races 1 MiB writes/reads, requires multiple observed
generations, kills its owned Node writer and checks the retained JSON. The naive
truncate/write variant failed with partial JSON; atomic replacement passed.
It does not deterministically inject a kill at every filesystem boundary.
Independent read-only review found no blocker; generation-progress coverage was
added from review feedback.

A fresh full rerun uses a 1000s **outer controller only**, records exit status in
its private fixture, and keeps every case, 5s Stop cleanup, 60s child lifetime,
75s termination observation and trusted OOM oracle unchanged. It already retained
a failed CPU Stop attribution checkpoint while the next case ran: readiness at
52.51s left insufficient time for the unchanged sampling/Stop sequence before
expiry. The earlier CPU run passed when ready at 43.90s. Neither result cancels
the other; variable startup margin remains an unresolved reliability gate.

## Complete current resource matrix

The fresh checkpoint-enabled run completed all six cases and recorded **exit1**:
**five passed, CPU Stop attribution failed**. [Sanitized structured evidence](stress-2-summary.json)
binds the installed ELF, observer/helper hashes, original report, actual limits,
observed peaks, trusted OOM records, cleanup and individual outcomes.

| Case                               | Actual result                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CPU / Stop                         | FAILED: actual throttling observed, but Stop completed too late to distinguish it from earliest expiry. Cleanup found no known live descendants. |
| Original immediate memory workload | PASS: trusted systemd `oom-kill`, observed peak 536870912 bytes, whole-group cleanup and Count: 2 recovery.                                      |
| Resident-page memory workload      | PASS: independent trusted `oom-kill`, same observed peak, cleanup and Count: 2 recovery.                                                         |
| Natural expiry                     | PASS: loop armed, lifetime termination, editor responsive and Count: 2 recovery.                                                                 |
| Editor SIGKILL                     | PASS: independent expiry removed descendants; new editor launched and Counter recovered.                                                         |
| Preview window close               | PASS: close/cleanup at 49.33s before earliest expiry, then Count: 2 recovery.                                                                    |

Neither the preceding CPU pass nor the stronger memory results turn this complete
run green. Startup margin is variable on TCG. No resource limit, OOM cause check
or termination deadline was relaxed. Earlier resident-page failures retain their
own binary/environment scope; these successful current observations do not
explain their cause or historical renderer crashes.

## Native persistence and save-under-attack gate

The unchanged production persistence suite exited 0 on a fresh profile: real picker
cancellation, forged-grant denial, exact UTF-8/CRLF writes, inode replacement,
mode 0640 and POSIX ACL retention, read-only failure/retry without data loss,
external-change refusal, cancelled reopen, explicit Save As, actual reopen and
interactive rebuilt Counter/X buttons. Hash-bound markers are retained.

The separate CPU editor/save test exited 1: its exact-disk assertion succeeded,
but end-to-end edit/save took 5133ms against the unchanged below 5000ms requirement.
Later CPU-delta and unsaved-rebuild assertions were not reached. This is a failed
latency gate, not a passing CPU/disk availability suite or confirmed data loss.
No threshold was increased. Distinguish TCG/WebDriver overhead from application
work through future phase measurements or a suitable accelerated Linux VM;
no speculative source or security-policy change was made.

The heap edit/save suite exited 1 before editing. Its saved image actually shows
“Heap pressure active”, but48 observer attempts could not verify it because the
VM lacked `tesseract`. This is an infrastructure failure, not proof that pressure
failed to execute. The attempted VM package install could not resolve
`archive.ubuntu.com`; no heap/disk pass or successful dependency installation is
claimed. The later escalated retry produced no execution result after the cloud
runtime was replaced. Reproduction needs the documented `tesseract-ocr` and
`tesseract-ocr-eng` packages in the disposable VM.

![Captured heap marker; automated OCR and edit/save did not pass](heap-marker-before-ocr.png)

The CLI now checks Tesseract and English data before native launch for `--pressure`.
A missing-tool control exits 2 with an explicit NOT RUN message, without launching
an application or waiting 55s. The actual missing-tool failure and screenshot
remain retained; no OCR, visible-text or memory-growth assertion was bypassed.

## Reproduction and verification limits

Follow [Linux desktop setup](../../LINUX_DESKTOP_TESTING.md) and
[native security contract](../../NATIVE_SECURITY.md). Install the optimized
package, start the external driver in a fresh disposable ordinary-user XDG
profile, then create/source a new fixture with `native-test-setup.mjs`. Run each
mutating suite only once per fixture and retain stdout/stderr and evidence:

```sh
NATIVE_DISPOSABLE_PROFILE=1 npm run native:source-whitespace:test
# New fixture/profile before the complete acceptance run:
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs \
  --mixed-eol --quotes --multiline-quotes --source-navigation \
  --visual-budget --same-names --extension-case
# Separate fresh fixture/profile for each remaining suite:
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-recovery.mjs
npm run native:test
NATIVE_DISPOSABLE_PROFILE=1 npm run native:stress:test
```

Focused fidelity success is not a full security certification. Historical
renderer/JSC crashes, reliable CPU Stop attribution, distribution-specific
namespace setup and native redistribution/license decisions remain open.
Physical GPU/Wayland coverage is independent compatibility work; it does not
block web/source-fidelity corrections. Never disable isolation to satisfy a gate.

## Final local verification and continuation

`npm ci` installed429packages in6s. Final `npm run check` exited0: formatting,
ESLint, strict TypeScript, **281 unit / 12 tooling / 87 Chromium tests**, zero
skipped tooling controls, and a fresh production build. The final pressure
preflight additionally passed scoped lint/format and a real missing-tool
exit2/NOT RUN control before native launch. Read-only code reviews found no
blocking issue in the nonce correction or diagnostic changes.

These local passes do not convert the failed native matrix or latency/heap gates
into passes. [Hosted browser checkpoints](../../BROWSER_QA.md) retain exact run
scope and infrastructure failures. All transient test drivers were stopped and
the disposable guest shut down normally; its disk, binaries and raw observations
were retained. No merge, deployment, public installer, license decision or
production security-readiness claim follows.

The next implementation is scoped in the
[direct hosted Linux acceptance handoff](../../plans/2026-11-24-native-hosted-acceptance.md).
Investigate startup/latency phases on a suitable Linux VM, complete OCR-backed
heap/save validation and preserve strict cause/termination checks. GPU/Wayland
compatibility can proceed separately; it does not block browser/source fidelity
work. The proposed hosted native runtime job is not implemented yet.
