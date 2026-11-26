# Document-session controller evidence — 26 November 2026

Scope: trusted application orchestration, not active UI/native integration. See
[ADR032](../../decisions/ADR-032-document-session-controller.md) and
[the packet plan](../../plans/document-sessions.md).

**27 document-session tests and 35 existing autosave tests passed** with controlled
writer/close promises, plus typecheck and targeted lint/format. Cases cover rapid
accepted revisions, exact snapshots, same-source revisions/ABA refusal, originating
sessions, stale callbacks, in-flight close, write failure/false durability,
retained/unapplied text, native-close rejection and late attempts, observer
exceptions/copies/reentrancy, fixed source budgets and configuration isolation.
No filesystem I/O occurs in this controller fixture.

Independent review reproduced subscription rebroadcast and widened-budget defects.
The correction targets initial delivery to the new subscriber, ignores unchanged
draft signals and validates every named cap without widening existing limits.
The reviewer independently ran 60 tests after those corrections. Two further
bounded regressions fixed inherited/getter configuration copying: values are read
once, validated and retained in that exact plain object. Those final changes were
code-reviewed; the worker's final targeted run passed all 62 tests. The root's final joint-candidate `npm run check` exited **0**: **726 unit, 96
tooling/zero skips, 152 Chromium, 9 Pages and 4 inactive-cloud tests passed**,
plus format/lint/types/build. This includes the separate optional editor-receipt
packet; it does not establish a native bridge or installed application behavior.

Reproduce:

```sh
npm ci
npm test -- tests/unit/document-sessions.test.ts tests/unit/autosave.test.ts
npm run check
```

The injected native close port is awaited before session release. Rejection after
admission means authority is uncertain, so publication freezes instead of silently
retrying or claiming closed. Retained failures are memory only, kept outside
accepted-source autosave; no hidden overwrite/discard/recovery guarantee exists.
The core has no private native-grant mapping, invoke, browser DB, runtime service
or second editor history. Its source labels never authorize filesystem operations.

The separate actual Store/autosave harness validates its own existing backend
path; it does not establish real disk writes through this new controller. Next
integration must bind reviewed private grants, exercise that path against real
files, and wire one shared product/close acknowledgement. Watch/reconciliation,
explicit safe retry and installed restart/recovery remain separate acceptance.
