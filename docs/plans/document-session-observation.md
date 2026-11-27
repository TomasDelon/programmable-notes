# Document session observation implementation plan

> **For agentic workers:** Use subagent-driven development or executing-plans to implement the single packet below. Root owns final checks and commits.

**Goal:** Refresh the existing document surface from canonical session and autosave notifications without manual rerenders.

**Architecture:** A React observation hook consumes the existing document controller. Snapshots project its authority; synchronous SourceSession publication remains authoritative. No new workspace model or native product route.

**Tech Stack:** Existing React, TypeScript, Vitest and Testing Library; no new dependency.

**Spec:** PRODUCT_CONTRACT.md PRODUCT-01/EDIT-01/DATA-01; ADR038 and the living unified-local-vault plan. The owner explicitly delegates ordinary decisions and opts out of routine review questions.

## Global constraints

- One canonical source/history owner; preserve exact bytes and revision checks.
- No browser storage, native invoke, filesystem or runtime authority in this hook.
- No bootstrap activation, alternate UI, package promotion or security relaxation.
- Existing `state()` allocates snapshots; never use it directly as an uncached React external-store getter.

## Review focus

- A save completes without another keystroke: the mounted status must refresh.
- Old A callbacks arrive after selecting B: B remains unchanged.
- A path closes and reopens with a fresh identity: retired callbacks cannot target it.
- Changes between render and subscription are reread; StrictMode leaves no listeners behind.
- Rapid canonical edits outrun React projection: stale snapshots never republish or replace source.

## Task 1: Observe existing sessions

**Files:** Create `src/workspace/useDocumentSession.ts` and `tests/unit/document-session-observation.test.tsx`; modify only the controlled native host in `tests/unit/document-surface.test.tsx`.

**Consumes:** `Pick<DocumentSessions, 'state' | 'subscribe'>` from `src/application/documentSessions.ts`; existing `DocumentSessionState` and SourceSession.

**Produces:** `useDocumentSession(controller, sessionId: string | null): DocumentSessionState | null`.

- [x] Write failing hook tests for stable snapshots, null selection, missed-subscription updates, stale callbacks, controller/session replacement, unmount/StrictMode cleanup and rapid edits; assert exact witness/session IDs and unchanged accepted bytes.
- [x] Run `npx vitest run tests/unit/document-session-observation.test.tsx`; confirm the missing hook or behavior fails.
- [x] Implement cached observation bound to controller identity/session ID. Subscribe/reread without side-effectful render subscriptions; retire callbacks on cleanup. Unknown controller failures are not silent persistence fallback.
- [x] Replace manual source/status rerenders in the existing controlled DocumentSurface host with this hook. Prove `writing` to `saved` after a held writer resolves without rerender/edit; A saving cannot replace B; retained draft/failure state remains visible. Keep injected-writer evidence distinct from real Store or native GUI.
- [x] Run focused hook/surface/controller tests, types, lint and formatting; freeze and obtain independent review.
- [ ] Root runs required `npm run check`, verifies unchanged functional inputs, scans secrets, updates status/decision evidence, commits and pushes the reviewed packet. Native renderer acceptance remains an independent gate.
