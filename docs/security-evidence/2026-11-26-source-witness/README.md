# Accepted-source receipt evidence — 26 November 2026

Scope: optional SourceEditor/RenderedEditor protocol, not product or installed
native acceptance. Current production callers remain unchanged. See
[ADR031](../../decisions/ADR-031-source-session-receipts.md) and
[the packet plan](../../plans/source-witness.md).

The unit cases exercise single receipt publication for accepted batches, net-zero
source/history transitions, rejected batches without consuming history, exact
physical-ending history, rapid edits before prop echoes, same-byte ABA refusal,
new same-byte external provenance, all three math/Markdown apply paths, captured
links/IME/navigation, retired sessions and immutable protocol mode. Failed
publication keeps exact attempted raw bytes, latches pending/close and excludes
them from accepted-history caching; throwing after host publication does not
pretend rollback.

Targeted observations: **23 witness tests and 161 affected unit tests passed**;
independent review reran all 23 witness tests. Two pinned Chromium fixture tests
passed real Markdown/math typing with delayed props and same-byte undo/stale
navigation/edit refusal. The fixture is bundled in memory with a test-only runtime
stub, intercepted by Playwright and never shipped as a production route. These
browser assertions establish actual editor interaction and CRLF retention; they
are not an exhaustive BOM/JSX/file-byte or native security witness. Newly typed
spaces can use the existing serializer's entity encoding in Source while remaining
ordinary visible spaces; no replacement serializer is claimed.

Independent review found and corrected raw insertText reporting success after
failed publication, protocol changes falling back to legacy behavior, stale
navigation/currentness after mode changes and invalid initial provenance. Failed
publication also stays pending across child cleanup. Workers reported fail-first
runs; their original command output remains in the task record rather than a
public raw log. Final joint-candidate `npm run check` exited **0**: **726 unit, 96 tooling/zero
skips, 152 Chromium, 9 Pages and 4 inactive-cloud tests passed**, plus format/lint/
types/build. This includes the separate controller packet's 27 unit cases; the
receipt identifies this editor packet's exact source/test inputs.

Reproduce with the pinned Node/npm and matching Playwright Chromium:

```sh
npm ci
npm test -- tests/unit/source-witness.test.tsx
npm run test:e2e -- --grep 'opt-in receipts|same-byte undo rejects'
npm run check
```

The full project check uses production application assets; the two isolated
browser fixtures also bundle the current editor source in memory. Neither mocked
transport nor these browser fixtures establishes Linux file authority, original
file durability, close/restart behavior or native runtime containment. Shared
controller/native adapter activation remains separate work.
