# Container source provenance implementation plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` with exclusive writers and the repository feedback/evidence skills. Root owns builds, ports, Git and delivery. Execute only the scoped standard Markdown improvement below.

**Goal:** Allow ordinary punctuation edits around existing wikilinks inside multiline quotes and lists without rewriting continuation prefixes or unrelated source.

**Architecture:** Observe exact container-prefix token ranges in the existing live Markdown parser pass. Split displayed text provenance around verified gaps; patch only one source span owning an edit. Retain conservative refusal for crossing or ambiguous source boundaries. Document React and native authority remain unchanged.

**Tech stack:** Existing MDX/GFM/math processor, mdast continuation tokens, ProseMirror, Vitest and Playwright. No new parser, syntax or runtime dependency.

**Spec:** Existing owner requirements and [stabilization plan](2026-11-26-editor-stabilization-and-daily-use.md); [source fidelity follow-up](../../DAILY_USE_STATUS.md#entity-and-wikilink-source-provenance-follow-up). The owner explicitly delegated ordinary implementation choices and requested autonomous subagent execution; no routine approval pause is needed.

## Global constraints

- Preserve exact source, physical EOLs, revision validation, history, retained attempts and opaque JSX.
- No preview-to-host write authority, new inputs/forms, parser grammar extension, dependency upgrade or native-policy change.
- Never infer container syntax from decoded line suffixes: character references can introduce nonphysical displayed newlines.
- Capture bounded per-parse evidence; no mutable cross-document/parser-closure witness. Missing/partial/invalid evidence stays conservative.
- Keep the current tested `82bd530` application independently deliverable. Root promotes only an exact tested commit after its hosted gates, regardless of dirty future work.

## Review focus

- Entity-created newlines versus real CRLF/LF/CR and original BOM/frontmatter offsets.
- Nested quote/list prefixes, tabs, lazy continuation and ordinary literal greater-than text.
- Repeated parses must not reuse another document's ranges.
- A visible caret can sit between two source spans separated by hidden syntax: never invent one source offset.
- Cross-gap edits/structural rewrites must not bypass the existing fidelity refusal; unchanged neighboring JSX, links and source remain exact.

## Task 1 — Capture trusted prefix evidence and apply a sparse span edit

**Files:** `src/editor/math/mathSource.ts`, `src/editor/rendered/sourceBridge.ts`, `tests/unit/rendered-source-bridge.test.ts`; one focused parser metadata helper/test only if needed to keep concerns local.

**Consumes:** `analyzeLiveSource(source, path)` and its existing processor parse; current exact decoder/offset functions and merged text provenance.

**Produces:** Bounded per-parse source-gap metadata from non-overriding `beforeEnter` listeners; ordinary text provenance parts separated by validated container-prefix gaps. Existing parse/serialize public signatures and diagnostics remain compatible.

- [x] Add real PM punctuation cases for multiline quote, list and nested combination, with entities, existing wikilink and mixed EOL. Assert exact source except the one insertion. Run before implementation and record refusal/failed behavior.
- [x] Observe only container-owned contiguous token ranges after a physical EOL. Validate bounds/ownership/actual source and decoded equality with the AST; do not add a second parse or change parser handlers. Test repeated/masked-source input and bounded refusal.
- [x] Preserve separate source parts across gaps. Teach sparse text editing to identify one unambiguous owning part. Keep gap bytes and other parts unchanged; reject boundary/cross-gap and unsupported structural rewrites safely.
- [x] Test source/visible caret ambiguity, numeric/astral/multichar entities, lazy continuation, tabs, neighboring sparse edits, JSX opacity and undo through the real bridge. Run affected parser/editor/math tests.
- [x] Independent review of the frozen source and evidence before root integration. No worker commit or shared build.

## Task 2 — Actual browser acceptance and delivery

**Files:** A narrowly scoped browser fixture under `tests/e2e`; update the daily-use status and implementation status after executed results.

- [x] Exercise native browser typing in quote/list text, real link/backlink interaction, exact export, canonical undo/redo, saving and reload. Keep source-span ambiguity controls.
- [x] Root runs targeted pinned Chromium/WebKit, then required complete `npm run check` on frozen inputs. Preserve failing checkpoints.
- [x] Verify hosted current-source three-engine acceptance, actual immutable deployment and the public origin after authorized beta promotion; retain current screenshots/walkthrough artifacts.
- [x] Commit/push verified changes with noreply identity and required privacy scan. Keep PR #9 draft; no main merge, public release, paid infrastructure or native runtime claim.

Local receipt:543unit/71tooling/143Chromium/9Pages, plus21 repeated WebKit cases, zero retries. Actual hosted and deployment gates remain unchecked until their own run receipts.

Delivery receipt: application `52c86c4` passed 411 editor/18 intentional skips plus 27 Pages cases and 27 actual principal-origin cases; walkthrough artifact 15089977069. Native evidence remains separately blocked. [Current receipt](../../DAILY_USE_STATUS.md#current-accepted-browser-delivery).
