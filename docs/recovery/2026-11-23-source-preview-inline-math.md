# Two-mode editor and inline math: recovery candidate

**Status: RECOVERED TO ISOLATED BRANCH, NOT RELEASE-APPROVED**

## What changed
- The document mode selector shows **Source** and **Preview** only. Legacy saved `live` preferences migrate to editable Preview.
- Preview remains the interactive rendered editor, and removes the separate rendered-equation modal.
- Focusing an inline or display equation shows the original `$...$` or `$$...$$` LaTeX inside the document, including on mobile.
- Invalid expressions, stale source revisions and deleted delimiters are rejected without overwriting source or the pending draft. Escape cancels; Enter/blur or Done commits.
- Tests cover mode selection, exact source preservation, equation edits, undo, mobile and React/source compatibility.

## Provenance and limits
This branch was reconstructed after Vercel Sandbox reached its Hobby quota. The original tested candidate was in stopped Sandbox `pn-two-modes-inline-math-20261123`, snapshot `snap_iABUg32YkLSAWv20yelonB48cqUo`, expiring **2026-11-30 09:29:11 UTC**.

Original tested base: `8516af3f9853579e7b39e215a1bcd5309be5cb6e`.
Original tested candidate tree: `310572e13826982ab9d4b6fefdfe1d49794c6d01`.

The recovered source and tests follow that implementation, but **four blobs are not byte-identical** to the recorded snapshot, primarily because the isolated runner's Prettier output could not be directly extracted:

- `src/web/WebApp.tsx`
- `src/editor/rendered/RenderedEditor.tsx`
- `tests/e2e/web-live.spec.ts`
- `tests/e2e/web-rendered-editor.spec.ts`

**Seven of eleven changed paths match the recorded Git blob hashes exactly.** Do not claim that this recovered Git tree matches the original snapshot until all differences are resolved.

The original snapshot's observed results were: TypeScript, lint, formatting, build PASS; 270 unit tests PASS; 57/57 focused Chromium/Firefox/WebKit tests PASS. Those executions apply to the **original snapshot**, not a fresh full release check on this recovered branch. The full release suite was not completed before the Sandbox quota blocked execution.

## Follow-up
1. With Atlas or an independent runner, run `npm ci`, `npm run format` and `npm run check` with pinned Node 24.22.1/npm 11.9.0.
2. Prefer direct snapshot recovery before expiration if an authorized Sandbox session becomes available. Compare each file against the recorded hashes in the ChatGPT recovery handoff.
3. Execute all three browser engines and security/tooling checks, review the PR and check GitHub CI before merging.
4. Only deploy to production after a verified release; keep the existing production deployment for rollback.

**Production `main` is intentionally unchanged.**
