# Literal dollars and private storage implementation plan

Cloud activation is **paused at the owner's request**. Continue with
[the Linux local-editor plan](2026-11-26-linux-local-editor.md). Preserve this
inactive implementation and its actual test failures/evidence; do not provision
Cloudflare or request its token while the feature is paused.

> **For agentic workers:** use the repository close-feedback-loop protocol with exclusive file ownership. The owner explicitly authorized autonomous design and execution without routine review.

**Goal:** make dollar typing behave as ordinary document text until a complete mathematical expression exists, then provide authenticated, server-authoritative storage without a paid service.

**Architecture:** preserve the owning ProseMirror view, canonical source history, and isolated React runtime. Add a build-selected storage adapter backed by same-origin Pages Functions and D1. Upload bounded immutable chunks and atomically compare-and-swap a manifest; never assemble the complete workspace in a Worker.

**Tech stack:** existing TypeScript, ProseMirror, KaTeX, Vitest and Playwright; Cloudflare Pages Functions, Web Crypto and D1 SQLite.

## Constraints

- No merge, public release, history rewrite, paid plan, R2 activation, or sandbox relaxation.
- Preserve deliberate Source escapes, code, JSX, unrelated source bytes, canonical undo and revision checks.
- Cloud saves require authentication and server acknowledgement; no silent browser-storage fallback.
- Preserve existing browser data; migration is explicit backup export/import, never automatic replacement.
- Cloudflare credentials remain outside the repository and untrusted runtime. Request authentication only when account operations actually require it.

## Review focus

- Pending dollars must not consume neighboring formatting or expose generated Markdown escapes.
- Provenance must distinguish editor-typed dollars from deliberate literal Source escapes.
- Failed, stale, interrupted or corrupt remote writes must leave the last committed inventory intact.
- Opaque preview origins, forged/expired tokens and alternate deployment origins must fail authorization.
- Free-tier CPU, storage and request limits are deployment constraints, not permission to drop data or upgrade billing.

## Task 1 — Dollar classification and shortcuts

- [ ] Reproduce unfinished-dollar/neighboring-bold failure with actual browser keystrokes.
- [ ] Add bounded parser and same-view insertion regressions, including deliberate escapes and balanced invalid TeX.
- [ ] Correct parser ownership and typed-dollar provenance without rewriting neighboring source.
- [ ] Verify paired/unpaired transitions, formatting shortcuts, undo/redo, focus and exact export in matching browser engines.

Ownership: math worker owns math/rendered source and math unit tests; browser worker owns `tests/e2e/web-dollar-shortcuts.spec.ts`.

## Task 2 — Backend design and authorization

- [ ] Record official-source research, free-tier constraints, alternatives and chosen architecture in ADR021 and the research document.
- [ ] Test signed Access JWTs against pinned issuer, audience, owner subject, expiry and algorithm; reject absent configuration and opaque/cross-site mutations.
- [ ] Implement Pages adapter and bounded chunk upload, staged manifests and atomic D1 head publication.
- [ ] Exercise actual SQLite schema, transactions, quota triggers, incomplete uploads, concurrent CAS and cleanup.

Ownership: server worker owns `backend/**`, `functions/api/storage/[[path]].ts`, and server tests; research worker owns ADR021 and backend research.

## Task 3 — Server-authoritative storage adapter

- [ ] Test checksummed inventory transfer, remote acknowledgement, conflicts, corrupted/missing chunks and retained-edit atomic consumption.
- [ ] Add cloud storage adapter and fixed build-time selection; retain the existing browser adapter for deployments not yet configured.
- [ ] Preserve existing state/recovery validation, history budgets and explicit backup restore semantics.
- [ ] Use two-second cloud autosave and truthful storage UI; disable browser persistence requests in cloud mode.

Ownership: client worker owns new storage modules, workspace hook, WebApp and cloud-client tests.

## Task 4 — Integration and delivery

- [ ] Add reproducible local cloud API/browser acceptance using real SQLite and actual authentication validation; distinguish it from Cloudflare runtime evidence.
- [ ] Validate Worker packaging/local runtime if tooling is available, without account or billing changes.
- [ ] Exercise save, reopen in a fresh browser profile, conflict/error recovery and isolation in cloud mode.
- [ ] Run required `npm run check`, affected multi-engine browser cases, review, privacy scan and coherent commits.
- [ ] Push the verified branch and update the existing draft PR. Do not promote unverified cloud builds over the current deployment.
- [ ] If deployment requires credentials or free Access onboarding cannot proceed, document the exact prerequisite and ask only then.

Ownership: root owns integration tooling/configuration, final verification, evidence and delivery.
