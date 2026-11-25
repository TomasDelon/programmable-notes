# Unified mathematical text verification record

## Approved correction

The owner rejected form-like mathematical editing, independent Tab stops and focus-induced line-spacing changes. Preview must be a continuous document editor. The metadata title must also stop being a permanent input. ADR 017 records the existing-library investigation and chosen adaptation of the maintained ProseMirror/KaTeX primitives.

Baseline public deployment: `1fad6ff`. Do not replace it until final acceptance.

## Reproduced failures

- Source inspection confirmed attrs-only atomic math nodes, nested CodeMirror view/history and explicit Tab entry/exit. Even unfinished dollars used that model.
- Three synthetic source-bridge/renderer diagnostic tests confirmed generated trailing-space `&#32;` could become visible when closing-dollar removal reclassified source as literal math. Normal Markdown decoding alone did not reproduce it. The user's full editing sequence remains unknown; no universal Unicode-corruption claim is made.
- New passive-title browser regression failed on the original build because the title was an input rather than a heading.
- New unfinished-math browser regression failed on the original build because literal formulas were not ordinary paragraph text.
- Initial integrated browser run passed stable unfinished-text geometry but exposed formula click hit-testing failures, plus native DOM replacement unwrapping a math node and escaping corrected dollars. An initial pointer-events explanation was ruled out by real computed geometry; fragmented inline/accessibility hit quads were investigated instead. These failures must be corrected, not waived.

## Intermediate executed results

- Passive title fresh isolated production build: 9 Chromium navigation/runtime-link cases passed, zero retries, including explicit rename, source bytes through reopen/export, mobile navigation, Trash and wikilink rename.
- Migrated editor host-boundary units: 23 passed, including immediate same-editor math edits, external source adoption and refused-CAS recovery.
- Intermediate full unit suite: 392 tests across 47 files passed. This precedes later browser-driven integration fixes and is not the final gate.
- Source mapping implementation initially passed 94 targeted bridge/literal cases; additional exact multi-span caret and entity-spelling cases are being added.

## Later review and full-gate failures

The first complete gate passed formatting, lint and TypeScript, then stopped on
one newly introduced regression: **401 unit tests passed, 1 failed / 48 files**.
The failure reproduces loss of the final IME insertion when editing becomes
disabled before ProseMirror's final DOM read. The dependency's DOM observer does
not register mutations while `view.editable` is false, so changing the dispatch
guard alone did not repair it. The final design defers the DOM's noneditable switch only for an already-owned
IME operation so the existing observer reads its whole provisional document.
Canonical source writes remain forbidden while unavailable. On completion the
whole attempt is retained for recovery and read-only state is explicitly restored.
A pinned-span DOM snapshot was rejected after cross-selection and replaced-wrapper
regressions demonstrated incomplete recovery.

Independent review also found missing pending-state reporting for deferred math
composition; synchronous editor/model pending flags now guard normal navigation.
Another review finding required exact inverse caret mapping across merged source
spans; targeted source tests cover the repair. KaTeX presentation caches avoid
rebuilding unchanged formulas for unrelated cursor moves.

Development hot reload interrupted some browser diagnostics. The legacy dev run
finished 33 passed / 5 failed; separate focused reruns passed two cases, but those
reruns do not convert it into a clean gate. Stable fresh-production acceptance is
still required. Canceled runs and connection-refused server-lifecycle attempts
are infrastructure diagnostics, not product acceptance results.

## Stable production keyboard regressions

A fresh complete local gate then passed **407 unit /48 files and 14 tooling**,
but stopped at **125 passed /2 failed browser cases**. The entity-reload failure
trace showed `data-save-status="saving"` immediately before reload: exporting
proved in-memory bytes, not durable storage. The test now waits for acknowledged
persistence before asserting exact reopened source; it passed against the same
production build without a product change.

The other failure was a real navigation defect. Native-selection probes proved
forward inline entry jumped to the end, backward entry skipped math, and all four
arrow directions could skip a displayed block. The repair bridges only proven
math entry boundaries in the same view, preserves Shift anchors, and leaves
internal/exit/word movement native. Wrapped text has a negative regression.

The final focused suites passed **47 editor units** and **7 actual production
browser cases**, zero browser retries. Those browser cases cover ordinary-text
geometry, continuous selection, exact source/history/reopen, red invalid correction,
whitespace-entity leakage and inline/display keyboard entry and exit. A fresh
complete gate is required on that frozen application before promotion.

## Physical line-ending integration failure

The next fresh gate passed **418 unit /48 files, 14 tooling and all 128 Chromium
browser cases**, then failed **1 of 8 Pages-policy cases**. Replacing the entire
source of a display equation through a native text-selection insertion normalized
its original CRLF fences/body to LF. The selected-dollar fast path had bypassed
the existing physical-break preservation helper. The byte-exact deployment
assertion remains mandatory; no expected source bytes were relaxed.

## Final complete local gate

The final frozen application passed the complete fresh `npm run check`:

- **422 unit tests across 48 files**.
- **14 tooling tests**, zero skips.
- **128 Chromium browser tests**, zero retries, including all seven unified-math
  cases, seven synthetic Chromium IME cases, title rename/reopen, actual conflict
  races, source byte checks, React interaction and sandbox denial.
- **8 local Pages-policy browser cases**, including the unchanged exact-CRLF
  replacement/undo/redo/reopen contract and the passive title assertion.
- Formatting, ESLint, strict TypeScript and a fresh optimized frontend build.

Local ordinary-build fingerprint: `13e4b89b2d6ffb31`; Pages-policy preparation:
`82731c41b8b68486`, 77 assets. The newline correction also passed 51 focused
editor units and all eight Pages cases before this final full gate.

The optional hosted matrix discovery selects all seven unified and seven
composition cases in Chromium/Firefox/WebKit. Discovery is not execution evidence;
Chromium-specific synthetic IME fixtures intentionally skip other engines.

## First hosted candidate: real engine differences

Commit `0a20412` passed both mandatory clean-checkout CI jobs in
[run 45697445631](https://github.com/TomasDelon/programmable-notes/actions/runs/45697445631).
It was **not promoted** because actual immutable-candidate acceptance
[run 45697740145](https://github.com/TomasDelon/programmable-notes/actions/runs/45697740145)
reported 22 passed, one Firefox failure and one Chromium flaky case.
Retries were not accepted as success. Its synthetic failure report remains a
[downloadable artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/45697740145/artifacts/15062235844)
for the existing seven-day lifetime.

Firefox's DOM-only final-dollar path converted the unfinished paragraph's CRLF
to spaces. Public DOMParser and real editor DOM-observer regressions reproduced
it locally. Paragraph `whitespace: 'pre'` declares the already-existing soft-LF
model correctly to ProseMirror; heading behavior remains scoped separately.

Matching Playwright Chromium 1255 reproduced the other failure in **2 of 20
repetitions**, zero retries. The native range correctly selected invalid TeX,
but the dollar pre-input shortcut used a cached heading selection and inserted
the correction there. A deterministic same-task native-range/beforeinput unit
also reproduced it. The shortcut now maps owned native endpoints using public
APIs before source authorization; original source revisions, inert-node checks
and explicit Select All authority remain intact. Existing documents are not
silently rewritten to guess repairs for earlier mistaken edits.

Artifact and log download from this cloud was HTTP 403 even after approved
escalation. No signed download URL is reproduced here. Public annotations,
matching-browser local traces and extracted synthetic event timelines provided
the diagnosis; the owner's GitHub artifact remains linked above.

## System-browser security probe diagnostic

After the hosted-engine corrections, a fresh gate passed **426 unit tests /48
files and 14 tooling tests**, but its system-Chromium browser phase reported
**127 passed /1 failed**. The original handoff malicious fixture produced no
console result after one ordinary button click. Direct sandbox denial and the
other interaction/security cases passed, but an absent result was not accepted
as proof of denial. The fixture and expected denied/denied report are unchanged.

The cloud system binary is Chromium `156.0.8078.79` (Debian 13). Its failure trace
was copied before further runs. A controlled run with the exact matching cached
Playwright Chromium is required to investigate the difference; no security
assertion, timeout, browser isolation or application authority is relaxed.

## Final corrected matching-browser gate

The original security fixture and assertion passed **20/20 repetitions**, zero
retries, with matching Chromium revision 1255 / Chrome for Testing
`159.0.8154.6`. No activation, timeout, fixture or runtime changes were made.
This is controlled evidence for the pinned browser, not a proven explanation of
the one system-Chromium 156 failure. The latter trace remains separately retained.
AGENTS now distinguishes matching-browser final gates from system-browser smoke.

The stale-selection scenario likewise passed **20/20 repetitions**, zero retries,
with the same case/configuration that previously failed twice in twenty.

The final complete fresh `npm run check`, using matching Playwright Chromium,
passed **426 unit tests /48 files, 14 tooling (zero skips), all 128 browser cases
and all 8 Pages-policy cases**, plus formatting/lint/strict TypeScript/build.
Ordinary fingerprint: `5fef8f01aa3575df`; Pages: `fc20e87af304619a`, 77 assets.
The security fixture, byte-exact source contracts and failure-on-flaky gates
remain unchanged. New-head hosted CI and actual candidate/main-origin gates are
still mandatory before promotion, with results linked in the draft PR.

Reproduce with the matching browser already installed:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright install chromium
env -u PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH \
  PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
  PLAYWRIGHT_WORKERS=2 npm run check
```

Use a writable browser-cache path appropriate to another machine. Do not disable
browser isolation when a platform cannot run an engine; use the documented hosted
Linux validation instead.

## Hosted and delivery evidence

The exact pushed head, clean-checkout mandatory CI, repeated three-browser
matrix, actual immutable Cloudflare candidate and main-origin acceptance are
recorded in [draft PR #9](https://github.com/TomasDelon/programmable-notes/pull/9)
and its linked workflow runs/artifacts after execution. Promotion remains gated
on those results. Keep the PR draft; no merge, public GitHub release, readiness
or repository-visibility change is authorized by this work.

Reports/screenshots/traces contain synthetic fixtures and retain the existing
seven-day artifact lifetime. No new packaged native GUI or physical Android
keyboard validation was run for this web correction. Native `/engine` keeps its
existing UI and authority boundaries. Compilation does not establish native
runtime security or production readiness.
