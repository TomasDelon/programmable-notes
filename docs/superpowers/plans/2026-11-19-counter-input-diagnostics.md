# First-counter input diagnostics

Base:0975b35, existing checkout. Investigate the retained intermittent initial
Counter0→1 click failure without guessing a production change or weakening tests.

1. Add a bounded standalone Chromium diagnostic using the same Desktop Chrome
   context, viewport and first click/text assertion. Record exact browser/source/
   probe identity and distinguish instrumented from untouched controls.
2. Read-only capture of trusted pointer/click events, mutations, errors and frame
   navigation; no preventDefault, handler replacement, source/DOM edits, application
   messages or permission changes. A diagnostic second click never converts failure
   into success. Keep each case result; bound forensic trace/screenshot retention.
3. Run bounded system156 and matching Playwright159 controls. Keep failures with
   actual delivered-event/target evidence; absence of reproduction is not a fix.
4. Fix only an established cause with a regression. Otherwise record precise
   remaining uncertainty and next diagnostic action. Verify the harness/format/lint,
   preserve results and update progress/draft PR in a coherent commit.

No aesthetic work, native limit changes, new product scope, merge or public release.
