# Web workspace acceptance, 2026-11-22

## Scope and source

The isolated branch `feat/web-daily-workspace` starts from
`fff0e7ea81ac1c1a53d847ab741b1dfcf672cac6` on `feat/mdx-react-engine`.
It integrates the approved UI Lab shell with the existing CodeMirror source
editor, MDX/esbuild worker, and opaque document preview. The original engine
remains available at `/engine`; native document authority was not extended.

The UI reference was recovered from deployment
`dpl_J89AkbZyR8Sp3R7Co4qco4upB7dX`. All eight recovered runtime/configuration
files matched their deployment SHA-1 hashes. The integration preserves the full
approved CSS cascade, hover intent controller, Source/Preview capsule, fixed
canvas geometry, and stable insertion-order Recent contract. Application storage
and rendering replace the prototype implementations.

## Completed acceptance gate

`npm run check` completed with exit code 0 in an isolated Ubuntu cloud runner
using the repository's exact Node **24.22.1** and npm **11.9.0** versions,
Playwright **1.65.1**, and its downloaded Chromium. Browser concurrency was one
worker (`PLAYWRIGHT_WORKERS=1`); retries were disabled.

| Gate                                              | Result                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Prettier, ESLint, strict TypeScript               | Passed                                                                 |
| Vitest                                            | 143 tests passed in 23 files                                           |
| Tooling controls                                  | 10 passed, none skipped                                                |
| Fresh production build                            | Passed; 207 dependency notices generated                               |
| Chromium integration                              | 55 passed, including 37 original engine regressions                    |
| Full base history and archived-source secret scan | Zero findings after the existing narrowly scoped historical exceptions |

The new browser coverage exercises note/folder creation, reserved-folder refusal,
rename/move/search, stable Recent order, Trash, immediate title persistence,
command-palette ranking and focus, mobile layout, canvas geometry, and typography
across viewport thresholds. It also checks ordinary Markdown, GFM, KaTeX and
bundled fonts, local TSX imports, preserved React state across modes and themes,
compile/runtime recovery, preview isolation, and exact source exports.

Storage acceptance covers successive autosaves after idle, exact Unicode and
BOM/CRLF preservation, complete backup restoration, invalid backup and oversized
edit refusal, stale-tab conflicts, damaged-record recovery, offline compilation
and saving, and a real service-worker upgrade followed by a reload with the
selected document and theme intact.

## Defects and failed observations retained in the investigation

The final gate followed corrections for a no-op save promise race, input arriving
during asynchronous reload/persistence permission, stalled compiler downloads
that could not retry, rejected folder creation changing the current selection,
search body matches outranking exact titles, and a darker iframe canvas in dark
mode. Focused tests cover these corrections.

Earlier test runs also exposed test setup assumptions: CodeMirror's DOM text is
not an exact source serialization, lazy routes need a readiness assertion, and
the main panel inherits its canvas from the body. These assertions were corrected
while exact saved/exported source checks remained in place. A two-worker backup
predicate initially exceeded its five-second deadline; its retained trace
returned the exact expected bytes after 5.288 seconds. The isolated reproduction
and final single-worker gate passed without extending that assertion's deadline.

The first remote history scan used a one-commit shallow checkout and attributed
four previously audited certificate fingerprints to the shallow root. Fetching
the full 95-commit base history resolved the discrepancy. No allowlist was widened.

## Manual interface review

The actual browser review confirmed the minimal reading layout, Source/Preview
switching, navigation overlay, Settings, dark appearance, mathematical rendering,
and live React counter. An actual Save and update action reloaded successfully
and retained the workspace; the corrected dark preview matched its host canvas.

## Limits of this evidence

This is a personal browser workspace with local IndexedDB storage and downloadable
backups. It has no account, cloud note database, or cross-device synchronization.
Mobile checks use Chromium viewport emulation; physical iOS/Android, Firefox,
Safari, and a new native Linux runtime acceptance matrix were not tested here.
Browser iframe isolation is not the native process/CPU/memory containment system.
Only trusted personal document code is within this release's intended scope.

The final local commit must be scanned again before source publication. Its
downloadable checkpoint includes the base commit, isolated commit, source tree,
and SHA-256 digests, and verifies that applying the patch reconstructs that tree.
GitHub synchronization is separate from deployment: this session lacks an
authenticated shell push, while the available connector cannot specify the
verified noreply author/committer required by `AGENTS.md`. No existing GitHub
branch, merge status, repository visibility, or shared history was changed.

See [the web app guide](WEB_APP.md) for usage and enforced resource limits.

## Drag-and-drop tree extension

The additive treeOrder metadata preserves mixed folder and document ordering
without migrating or rewriting legacy saved documents. Repositioning a folder
updates its subtree's display paths while preserving stable document IDs,
source bytes, compile-group locations and Recent shortcut identities.
Invalid moves into descendants and destination collisions are rejected.
The browser implementation uses native HTML drag-and-drop for desktop pointer
input; mobile touch gestures are not part of this acceptance scope.

Specific regression coverage:

- tests/unit/web-tree-dnd.test.ts: nested paths, invalid cycles,
  ordering, migration-free backup roundtrips and source fidelity
- tests/e2e/web-tree-dnd.spec.ts: reorder, document reparenting,
  root restoration and complete folder-subtree moves with reload persistence
