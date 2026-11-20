# Browser review with mixed-break fix — 2026-11-19

The [downloadable review](../../demo/README.md) now contains source 6f7d4c6 with
internal mixed LF/CRLF preservation and conservative ambiguity refusal. Earlier
164cb4e delivery remains historical, not the current archive.

- 6,350,148 bytes / 29 entries.
- SHA-256: `c175fbe7c7cc250347512e90de668b9aa7b84392d7b60c8454c1c3a24f4d6dee`.
- Real recording, full production build/asset/capture manifest, responsive
  before/after modes, exact saved notes, source-status screenshot and walkthrough.
- Fresh extracted build passed React interaction, New note, trusted-key exact
  exports, pending protection, BOM/CRLF/opaque JSX preservation, selected versus
  sibling dirty status and offline recompilation after initial load.
- The extracted build also passed exact mixed internal-break word editing and
  repeated-line ambiguity refusal: input stays available, Save is blocked, Escape
  returns to exact original bytes. This exercises the delivered app, not local
  TypeScript modules.
- CRC/full hash validation and all eight packaging negatives passed.

First capture attempt encountered connection refused because the environment
restart had stopped the local preview server. No archive was assembled from that
failed capture. After restarting the owned loopback server, recording and all
checks passed. The failed infrastructure log and successful receipt are retained.

Separate installed Linux byte/recovery/IPC results and failed old-binary attempts
are in [internal-break evidence](../2026-11-19-internal-eol/README.md). This is a
browser review attachment, not a native installer, public site or release.
No cold-offline/PWA, browser resource quota or production security-readiness claim.

During the required delivery repository check, one390px counter click remained
at zero. The input trace and screenshot are retained. Ten serial and ten parallel
targeted repeats passed without changing the test, but the cause is unresolved;
these repeats do not establish a fix. This occurred before visual patching in that
case. It is distinct from the passing standalone archive mixed-break checks.

The subsequent complete repository check passed 63 unit / 28 Chromium with no changes
to the counter test. Final extracted-build validation was rerun after formatting
and passed all cases. This passing run does not resolve the recorded missed click.

Actual GitHub source Blob re-download matched all 6,350,148 bytes and the archive
SHA above (delivery b45ffa6, blob e3a7fa33b22309e841e323efd30f58a8cd809f20).
Hosted run 44484287256 for that head was refused before any runner/step because
of the account payment/spending-limit restriction; exact jobs/annotation retained.
