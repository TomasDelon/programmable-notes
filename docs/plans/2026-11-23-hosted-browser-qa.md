# Opt-in hosted browser QA

The recovery corrections are isolated in PR #6 (`909efe3`). Local Chromium
passes; Firefox fails before interaction and WebKit lacks native libraries.
Use a separate stacked branch for this next verification milestone.

1. Add a real in-place equation draft opened while an actual IndexedDB focus
   refresh is paused. Resume the real request, verify retention and the eventual
   competing-write conflict. No fake persistence result or production test hook.
2. Add an opt-in `browser_qa` dispatch input to the existing CI workflow. Normal
   push/PR jobs remain mandatory. The opt-in run uses standard Ubuntu runners,
   matching Chromium/Firefox/WebKit dependencies and the complete production
   check. Skip the duplicate native build only for this browser-only dispatch.
3. Retain the browser HTML report on success or failure for that dispatch.
   Run local checks, scan, commit and push; create a separate draft PR based on
   the recovery branch, dispatch QA and record actual hosted results.

No UI, source authority, isolation or application permission changes. Do not
conflate browser WebKit interaction with native WebKitGTK acceptance.
