# Preview Markdown input and notifications

> Inline execution under the owner's explicit opt-out from questions and routine approvals. Use executing-plans; independent read-only final review.

Goal: make ordinary Markdown typing usable in the trusted Preview, remove the formatting bar and replace inline failure panels with compact animated notifications without losing drafts.

Architecture: retain ProseMirror, guarded lossless source patches and canonical CodeMirror history. Fix the serialization/reparse mismatch at its source; do not relax semantic validation, JSX opacity or sandboxing. Keep unresolved drafts behind an explicit recovery action. Reuse the web notification location with accessible status/error announcements, dismissal and reduced-motion support. No new dependencies.

- [x] Reproduce empty list input rules (`1. `, `- `, `* `, `+ `), continuation/exit/nesting and common heading/quote/fence transitions with unit and actual keyboard browser tests. Observe RED, fix narrowly, verify exact surrounding MDX/BOM/CRLF and undo/reload.
- [x] Remove the formatting bar, preserve commands through keyboard/Markdown/palette where appropriate. Replace editor errors and important workspace feedback with one minimal notification system; keep recovery explicit and protected, not inserted above the document. Verify repeated failures, dismissal, focus, stale revisions and no lost drafts.
- [ ] Expand real browser regression coverage, capture screenshots at desktop/mobile, update ADR/status, run full checks and independent review. Commit/scan before push; keep a stacked draft PR, verify CI, deploy only verified corrections and repeat live acceptance. No merge/release/readiness change.

Review focus: transient empty Markdown states, preserved unrelated bytes, opaque JSX neighbors, cross-mode history, pending recovery navigation guards, keyboard-only formatting and alerts that never take typing focus.

Local final candidate: 333 unit, 14 tooling, 95 Chromium and 4 local Pages-policy
cases passed. Source bridge includes 69 cases. Independent read-only review is
complete; found prefix/whitespace regressions were reproduced and corrected.
Next gate: push reviewed commits, create a stacked draft PR, verify hosted CI and
cross-browser coverage, then promote and test the live Pages beta. Keep main and
all draft readiness/release state unchanged.
