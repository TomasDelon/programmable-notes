# Document-session application seam

Outcome: bind accepted editor receipts to existing autosave and authorized session close (EDIT-01, DATA-01; A04/A07).
Invariants: one CodeMirror history; exact source witnesses; private native authority remains outside this controller; unapplied text never enters autosave.
Witness: controlled writes/close promises prove latest persistence, originating-session isolation and truthful blocked close.
Done: focused controller tests, typecheck and lint; no UI, grant bridge, browser database, build or installed acceptance.

The controller receives a writer and close-by-session port. Trusted callers attach
already-authorized source/disk baselines. Logical paths are metadata, never grants.
Publication validates exact witnesses and existing loaded-source budgets, feeds
AutosaveCoordinator synchronously, then installs its receipt. All observations are
deferred copies. It adds no editing/history engine.

Close gates publications, checks unapplied/retained text, flushes writes, awaits
the close port, then releases/retires the session. A native close rejection leaves
authority uncertain and blocks further publication; it does not trigger a retry.
Failures before calling that port leave the session open. Retained failed batches
are copied, separate from accepted originals; resolution/recovery durability is a
future explicit use case, not an implicit clear/discard operation here.

This packet does not implement selection, native grants, external observation or
conflict reconciliation. CAS failures retain accepted source and block persistence;
their safe reread/resolution and close-uncertainty reconciliation remain separate.
Caller identity/port access is trusted application authority, not a sandbox.

## Observed verification

The test-first scratch probe failed on the missing session attachment behavior;
the implementation then passed its lifecycle tests before repository publication.
After review corrections, the focused repository run passed 62 tests in two files
(27 session tests and 35 existing autosave tests), with no skipped tests:

```sh
node_modules/.bin/vitest run tests/unit/document-sessions.test.ts tests/unit/autosave.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint src/application/documentSessions.ts tests/unit/document-sessions.test.ts --max-warnings 0
```

Typecheck and targeted lint passed. An initial test-only `prefer-const` lint issue
was corrected before this run. Formatting was applied to these three packet files.
The worker did not build or run browser/native suites. The root subsequently
completed the joint candidate check: exit 0, 726 unit, 96 tooling/zero skips, 152
Chromium, 9 Pages and 4 inactive-cloud tests passed, plus format/lint/types/build.
This covers the new controller and separate receipt packet, not active UI/native
integration or installed acceptance. See ADR032 and the dated receipt.

Root/independent review identified rebroadcasts when a listener subscribed inside
another listener, plus configurable budgets that could widen fixed source limits
or omit required fields. Eight new regression cases failed before correction.
Initial subscription delivery now targets only that subscription; state changes
queue current subscribers with fresh copied state for each delivery. Repeating an
unchanged unapplied signal produces no notification. Custom budgets must validate
every named field and may only tighten the fixed loaded-source limits.

A subsequent budget-copy review added two failing bounded cases: inherited
properties vanished when spread, and changing getters were read twice. The
constructor now captures each named value once into a plain object, validates
that exact object and stores it. Valid inherited limits and the validated getter
values therefore remain enforced without rereading caller configuration.
