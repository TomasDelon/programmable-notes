# PR #6: independent recovery review and local production smoke

**Status:** web implementation verified within the stated scope; **not a release approval**.

## Reviewed source

- Repository: `TomasDelon/programmable-notes`
- Draft PR: [#6](https://github.com/TomasDelon/programmable-notes/pull/6)
- Original base: `8516af3f9853579e7b39e215a1bcd5309be5cb6e`
- Recovered code tested: `36f84cd910115dc8f2528d676e2a833f1fa77120`
- Source and test files inspected: `src/web/WebApp.tsx`,
  `src/editor/rendered/RenderedEditor.tsx`,
  `tests/e2e/web-live.spec.ts`, and
  `tests/e2e/web-rendered-editor.spec.ts`. Their surrounding source
  authority (`SourceEditor.tsx` and `mathSource.ts`) and regression tests
  were also checked.

Review focused on the two-mode selector and legacy `live` migration;
in-place `$...$` and `$$...$$` editing without a popup; stale revision,
delimiter and KaTeX validation; canonical CodeMirror source writes; exact
export, undo, pending drafts, mobile interaction, and the isolated
MDX/React runtime. No source-level blocking defect was found within this
review scope. The PR changes no native authority, permission, dependency
lockfile or CI security workflow.

The review did identify inaccurate public documentation still describing
three web modes and a modal equation editor. The same isolated branch
corrects `README.md`, `docs/WEB_APP.md` and
`docs/IMPLEMENTATION_STATUS.md`. Historical native mode descriptions
remain unchanged.

## Fresh local verification

An isolated, clean checkout was used, without modifying the original
local project or `main`.

- Node.js `24.22.1` and npm `11.9.0`, installed within the ignored
  test checkout, not system-wide
- `npm ci`: 429 packages installed, 0 audit vulnerabilities reported
  at execution time
- `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm run build`: **PASS**
- Full `npm run check` with `CI=1` and two Playwright workers: **PASS**
  (40 Vitest files, **270/270 unit tests**, tooling checks and
  **84/84 Chromium browser tests**). Full-check log SHA-256:
  `1cfd585ce0a4a6d526312c4b982dfc91d07f1ba74a562fafe236dce31bf91f39`
  (retained in the ignored local QA workspace, not published)
- Built application served through `vite preview` on
  `http://127.0.0.1:4189` only; browser **Chromium 159.0.8154.6**
- Seven direct browser smoke checks **PASS**, covering Source/Preview,
  in-place math, exact BOM/CRLF/Unicode bytes, cross-mode undo,
  invalid mobile math, persistence/reload and mobile width
- No unexpected external network requests observed in the browser
- Original synthetic smoke fixture did not access personal documents

Immutable result: [2026-11-23-pr6-atlas-smoke.json](2026-11-23-pr6-atlas-smoke.json),
SHA-256 `2d2def7d320b3ceb5e4faa8b92deae7e9a131e948364b8ad09e5ab26e6acd001`.
The test probe itself ran from ignored local QA files and was not
committed; its SHA-256 was
`3e19e96972ec209b59b2e06a71d1beab23654a93bb9585630ea4f88afe2009de`.
The existing tracked Playwright suites provide separately reproducible
regression tests.

Independent hosted results from the same application/test source:

- [CI #98](https://github.com/TomasDelon/programmable-notes/actions/runs/45164663292):
  both `check` and `native-check` succeeded, including 270 unit
  tests, 84 Chromium tests, native package inspection and Rust checks
- [Focused three-browser QA](https://github.com/TomasDelon/programmable-notes/actions/runs/45163015436):
  28 checks each in Chromium, Firefox and WebKit, **84/84 passed**

## Remaining release boundaries

- The original tested Vercel snapshot tree
  `310572e13826982ab9d4b6fefdfe1d49794c6d01` does **not** match the
  recovered source tree `25f3ddce9bea36f71059ecae3db9b3757be03902`
  at the verified recovery commit. This is a provenance limitation, not
  a reported functional failure. Vercel Hobby usage currently prevents
  resuming the stopped snapshot before its 2026-11-30 expiration.
- A real installed native GUI acceptance run in a disposable full-system
  Linux desktop/VM was **not performed**. Native package builds and
  backend tests do not prove GUI runtime behavior or security.
- This was a local production-build smoke, **not** a hosted production
  deployment or an approval for hostile documents.
- PR #6 stays Draft. Do not merge, deploy, alter repository permissions or
  change production until a separate owner-approved release decision.
