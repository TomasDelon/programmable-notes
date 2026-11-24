# Preview Markdown input and notifications

> Inline execution under the owner's explicit opt-out from questions and routine approvals. Use executing-plans; independent read-only final review.

Goal: make ordinary Markdown typing usable in the trusted Preview, remove the formatting bar and replace inline failure panels with compact animated notifications without losing drafts.

Architecture: retain ProseMirror, guarded lossless source patches and canonical CodeMirror history. Fix the serialization/reparse mismatch at its source; do not relax semantic validation, JSX opacity or sandboxing. Keep unresolved drafts behind an explicit recovery action. Reuse the web notification location with accessible status/error announcements, dismissal and reduced-motion support. No new dependencies.

- [x] Reproduce empty list input rules (`1. `, `- `, `* `, `+ `), continuation/exit/nesting and common heading/quote/fence transitions with unit and actual keyboard browser tests. Observe RED, fix narrowly, verify exact surrounding MDX/BOM/CRLF and undo/reload.
- [x] Remove the formatting bar, preserve commands through keyboard/Markdown/palette where appropriate. Replace editor errors and important workspace feedback with one minimal notification system; keep recovery explicit and protected, not inserted above the document. Verify repeated failures, dismissal, focus, stale revisions and no lost drafts.
- [x] Expand real browser regression coverage, capture screenshots at desktop/mobile, update ADR/status, run full checks and independent review. Commit/scan before push; keep a stacked draft PR, verify CI, deploy only verified corrections and repeat live acceptance. No merge/release/readiness change.

Review focus: transient empty Markdown states, preserved unrelated bytes, opaque JSX neighbors, cross-mode history, pending recovery navigation guards, keyboard-only formatting and alerts that never take typing focus.

Local final candidate: 333 unit, 14 tooling, 95 Chromium and 4 local Pages-policy
cases passed. Source bridge includes 69 cases. Independent read-only review is
complete; found prefix/whitespace regressions were reproduced and corrected.
Next gate: push reviewed commits, create a stacked draft PR, verify hosted CI and
cross-browser coverage, then promote and test the live Pages beta. Keep main and
all draft readiness/release state unchanged.

Pre-promotion review found and reproduced quadratic internal whitespace work.
A follow-up removes the new matcher and extends the existing visual work budget
for the independently slow upstream parser. Full local gates passed again:
336 unit, 14 tooling, 97 Chromium and 4 Pages-policy cases. New browser coverage
verifies exact recovery downloads and safe Source-only editing. Re-run hosted
gates on the follow-up commit; do not promote the earlier candidate.

Cross-browser checkpoint: the old all three run failed (281 passed/4 failed). Fixed
Firefox global/editor shortcut collision; WebKit expects its isolated ErrorEvent
redaction. Earlier intermittent Firefox input remains unclassified until hosted
zero-retry repetition. Added optional explicitly named input diagnostics; all
mandatory PR/native gates remain unchanged. Local full checks passed again.
Next: dispatch Firefox diagnostics, inspect failures, then final all three and actual
Pages preview/production acceptance. Do not promote on Chromium results alone.

Firefox diagnostics exposed a raw-source equality refusal. Two RED tests proved
obsolete React echoes can rewind canonical state; a private read-only freshness
witness vetoes those echoes without relaxing CAS or history checks. Affected
22 unit tests passed, independent review found no issue, and the full local run
passed 338 unit/14 tooling/97 Chromium/4 Pages. Next gate: repeat Firefox on the new
commit, then all three and actual edge promotion. The earlier 17/18 run remains failed.

The freshness correction passed 18/18 zero-retry Firefox and 12/12 actual candidate
checks in all three browsers. The full three-browser run succeeded with one unrelated WebKit worker-update
flake; all editor cases passed. Fixed premature reload before activation finishes,
added five update/save/deadline unit regressions and repeated the full local check:
343 unit/14 tooling/97 Chromium/4 Pages passed. Next: zero-retry all three diagnostics now
including real worker update, current mandatory CI and fresh edge acceptance.

Completed: application `854f304` passed current mandatory CI, 63/63 zero-retry
three-browser input/recovery/update diagnostics, 12/12 real candidate checks and
12/12 real production URL checks. Promoted by non-forced fast-forward only;
main and draft readiness were unchanged. Evidence and downloadable screenshots
are linked from the verification log. Documentation-only closure follows; no
further application changes are pending. Next independent work should prioritize
measured host-parser responsiveness/source fidelity and explicit durable recovery
for unapplied visual candidates; native GPU/Wayland remains separate.
