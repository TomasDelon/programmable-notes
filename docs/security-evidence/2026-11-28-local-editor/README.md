# Local installed editor baseline — 28 November 2026

Scope: approved local plan Phase1, PRODUCT-01/DATA-01/EDIT-01; installed editing
and restart observations only. Recovery, external writers, lifecycle and native
React integration/security remain unaccepted. PR #9 stays draft.

The optimized local Debian package passed inspection (SHA256
`173f72cc0d65f0578099e6225a43074460917a3cce61077995d3ae249d16c534`).
Its ELF matches installed `/usr/bin/programmable-notes` SHA256
`9d2409dd8e1781675ed7fe0eb39616cefe55cfaadd60eb1ea99217d59a5e8c06`.
Application sources remain the8fda19a baseline; this packet changes the external
witness, tests and documentation. No application permissions or runtime changed.
This local package did not produce build.json provenance; its observed package/
installed hashes and local build log are the retained binding, not a signed
source attestation.

Environment: Ubuntu26.04 amd64, WebKitGTK2.52.6, GTK3.24.52,
systemd259.9, bubblewrap0.11.1, Node24.22.1/npm11.9.0 and Rust1.100.0.
This differs from the reference Ubuntu24.04 and sealed Debian13 helper fixtures.
It establishes no Wayland/physical-GPU or arbitrary runtime containment claim.

The real installed witness ran through the restricted retained account
`pn-local-20261128` with a fresh private synthetic vault. Its real OS chooser,
Source/Preview keyboard typing, exact BOM/mixed-ending/comment/opaque-JSX bytes,
mode0640, undo/redo, invalid-source autosave, document reopen, normal WM close,
process exit and fresh-process chooser/reopen passed. The two JSON receipts in
this directory are the bounded public results of `/tmp/pn-local-collected-gkC6L0/`.
Application and infrastructure cleanup both passed without force or residuals.
The launcher re-enumerates the restricted UID before claiming cleanup, so a late
child cannot escape verification of the initial process list.

The earlier successful `/tmp/pn-local-collected-ubmdql/` and failed
`/tmp/pn-local-collected-ggZZtl/`, `/tmp/pn-local-collected-nG7VTQ/` receipts remain
retained. The fixture mode failure was caused by umask077 filtering creation0640
to0600; explicit fixture chmod and a prelaunch assertion correct initialization.
The original post-save0640 assertion remains unchanged. No retry erases a failure.

Independent review found two Important issues: deferred mock release on early
failure and initial-snapshot-only process cleanup. Both were corrected with
focused regressions. The blocked-presentation regression observed three late
native calls before test owner retirement and none afterward. The actual cleanup
receipt producer reported cleanupVerified=true for a simulated late descendant
before fresh enumeration and false afterward. No mock security result is counted
as installed runtime acceptance. Final validation results follow when complete.

External witness identities for the passing retained run:

- `scripts/native-shared-editor.mjs` SHA256 `7dd1743e4a8f47c6b8b07e388ed18e93a1761f7315a3427ea9368a07c7bee576`.
- `scripts/run-native-shared-editor-local.sh` SHA256 `43a83cacc2995026a560aeaf5e5c3f24566f8bfcb0d4ddfeb5d27ded1ce96d6d`.

The final-check expansion exposed two further test-fixture timeouts: the
persistent-profile composition/recovery cases both stalled awaiting intentional
renderer crash when injected concurrently. Exact focused one-worker journeys
passed, two-worker injection reproduced both timeouts, and task-local corelimit0
did not correct them. A default-mode group now assigns one worker to these two
faults while other tests remain parallel. The same focused two-worker command
passes both full crash/restart/recovery journeys in21.4s; no timeout, retry or
assertion was changed. High host I/O pressure is observed, not proven cause.
The failed traces and diagnostic probes remain ignored and retained.

The default-mode group alone subsequently failed during the full suite alongside
unrelated browser work (157 passed,2 failed and a worker-teardown timeout).
That unsuccessful correction is retained. The candidate now moves the unchanged
two cases to a dependent `chromium-crash-recovery` project with one worker after
all enabled ordinary browser projects. Exact discovery comparison confirms all
159 original test titles are still present, without duplication or omission.
Final validation is pending for that stronger fault-job ownership.

## Final Phase1 checks

The corrected default `npm run check` exited0 with pinned Node24.22.1/npm11.9.0,
umask077, scanner8.30.1 and matching downloaded Chromium1255. Formatting,
ESLint, strict TypeScript,1015 unit tests,206 scanner-enabled tooling controls,
all159 browser cases (157 ordinary plus2 dependent crash/recovery),9 local Pages
cases and4 disposable local D1/storage cases passed. Zero skips/retries/flaky
outcomes were reported. Source/tests/configuration were frozen during this run;
only subsequent documentation/evidence summaries changed.

The independent reviewer confirmed exact159-title discovery coverage, unchanged
moved assertions/command helper and supported pinned Playwright project APIs.
The default suite includes both projects. Explicit `--project chromium` selects
only157 ordinary cases; it cannot establish the full browser gate. Optional
Firefox/WebKit previously skipped the Chromium-only crash cases.

History/archive secret scans found zero findings. Noreply metadata was checked
against the authenticated owner identity without printing private addresses.
Raw logs and failed traces remain ignored under `.cache/local-acceptance/`.
The evidence consistency checker is a record check, not independent execution
attestation. Installed acceptance retains its narrower exact-ELF/observer scope;
this packet does not complete recovery, external observation, lifecycle or React.
