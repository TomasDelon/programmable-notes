# Two-mode editor and inline math: recovery candidate

**Status: RECOVERED AND VERIFIED BY HOSTED CI, NOT RELEASE-APPROVED**

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

The recovered source and tests follow that implementation. At the time of initial recovery, **four reconstructed blobs were not byte-identical** to the recorded snapshot:

- `src/web/WebApp.tsx`
- `src/editor/rendered/RenderedEditor.tsx`
- `tests/e2e/web-live.spec.ts`
- `tests/e2e/web-rendered-editor.spec.ts`

**Seven of eleven code/test paths originally matched recorded Git blob hashes exactly.** Prettier was subsequently run and the five reported formatting failures were fixed. However, the recovered code tree, excluding this recovery report, has SHA `25f3ddce9bea36f71059ecae3db9b3757be03902`, which **does not match** the original tested tree. Do not claim byte-for-byte recovery.

The original snapshot's observed results were: TypeScript, lint, formatting, build PASS; 270 unit tests PASS; 57/57 focused Chromium/Firefox/WebKit tests PASS. Those executions apply to the **original snapshot**, not a fresh full release check on this recovered branch. The full release suite was not completed before the Sandbox quota blocked execution.

## Independent verification (2026-11-23)

- Full pinned GitHub [CI #96](https://github.com/TomasDelon/programmable-notes/actions/runs/45162114617) **passed** on commit `2469590b80f73692aa6a1927e72fd49189fa7c28`: Prettier, ESLint, TypeScript, build, tooling, secret-history scan, **270 unit tests** and **84 real Chromium browser tests**.
- The same CI run's `native-check` **passed**, including Rust/Tauri packaging, package inspection, ENOSPC, crash and sync-error recovery tests. This does not count as execution of the native graphical application.
- Focused [three-browser QA](https://github.com/TomasDelon/programmable-notes/actions/runs/45163015436) **passed 84/84 tests**, comprising 28 each on Chromium, Firefox and WebKit. It covered the changed editor regression specs, including mobile equation editing and exact source preservation.
- The Vercel Sandbox remains stopped. A resume request returned HTTP 402 (Hobby quota exhausted until 2026-12-01, after the snapshot expires).

## Outstanding release gates

1. Review the four reconstructed implementation/test files and the persistent original-snapshot tree mismatch; recover exact snapshot bytes if an authorized session becomes available before expiration. Fresh behavioral tests are not proof of matching historical source bytes.
2. Perform an independent PR review and production-like browser smoke without merging or deploying this Draft PR. Native graphical application acceptance remains a separate unverified scope.
3. Keep the prior production release available for rollback. No merge or production deployment until release approval.

**Production `main` is intentionally unchanged.**
