# Recovery audit and continuation — 23 November 2026

## Recovered state

The old workspace was clean at `fff0e7e` on `feat/mdx-react-engine`.
It is preserved. The actual recovery branch is
`recovery/two-mode-inline-latex-20261123` at `c3906da`, based on current main
`8516af3`. PR #6 remains draft. GitHub Actions run `45281294302` completed
successfully in both jobs. The recovered tree differs from the unavailable
original sandbox; behavioral verification does not establish original byte identity.

## Execution plan

1. Reinstall pinned dependencies and execute the unmodified production check.
2. Review canonical source transactions, pending equation drafts, persistence
   races and the React trust boundary. Independently review persistence and
   projection handling. Reproduce suspected failures before changing behavior.
3. Add regressions for confirmed defects, make minimal corrections, run the full
   check and focused Chromium/Firefox/WebKit tests. Keep the approved Source /
   editable Preview interface, in-place math and opaque JSX.
4. Correct current documentation, retain actual evidence and unresolved native /
   licensing gates. Scan before publication, commit and push recovery corrections
   to PR #6 without merging or changing readiness.
5. Advance the next safe editor-reliability or native-validation task separately
   if it exceeds recovery scope. No permanent tabs or interface redesign.

## Initial audit observations

- Favorites is already absent from the web editor.
- A read-only independent review found no established defect in asynchronous
  workspace adoption, guarded imports or the source bridge. A real inline draft
  during a delayed persistence refresh remains a useful integration test.
- Parent review is testing whether ordinary ProseMirror document edits can
  destroy an invalid, unfinished in-place equation draft. This is a hypothesis
  until reproduced.

Do not infer native GUI/security acceptance from web tests or compilation.

## Verified checkpoint

Steps 1–3 completed: the recovered baseline passed 270 unit / 84 Chromium
checks. Red regressions led to minimal equation draft / deferred source /
interacting link-retention corrections. The corrected full check passed
273 unit / 85 Chromium tests. All 10 tooling controls passed with the pinned
scanner. History/archive scanning reported zero additional findings.

Independent review checked the correction and identified the link-retention
case, which was reproduced before correction. Local Firefox interaction remains
unverified because launch failed before reaching the app; local WebKit needs
missing native libraries. Full evidence and prioritized continuation are in
`docs/recovery/2026-11-23-resumed-engineering-audit.md`.
