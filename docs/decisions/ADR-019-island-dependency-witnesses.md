# ADR 019: Preserve islands using compiler dependency witnesses

Status: implemented in the development candidate; current validation and deployment
receipts are recorded in [daily-use status](../DAILY_USE_STATUS.md). Native
runtime readiness is a separate gate.

## Problem

The compiler receives all files in an imported group. A real two-tab reproduction
showed that saving an unused Markdown sibling replaced a live Counter frame and
reset its state, although the island entry and imported TypeScript bytes were
unchanged. Changing the actual TypeScript dependency correctly rebuilt it.

## Decision

Only editable React islands opt into dependency reuse. The trusted compiler
records actual workspace loads and import-resolution decisions during a
successful build. Its bounded optional receipt belongs to that exact compilation
and prepared preview; document frames cannot supply it. Other compiler clients,
including the native host and Run full document, keep their conservative rebuild
behavior.

Before reusing a prepared island, validate the complete new workspace budget,
compare every loaded source byte, and replay every recorded import resolution
against the complete current file map. Replaying resolution catches added
higher-priority extension matches, deleted imports and transitive changes.
Entry, assets, compiler settings and explicit lifecycle inputs must also match.
Make that decision before committing a render so an unnecessary empty-HTML frame
does not itself destroy React state.

Missing, malformed, oversized, failed or retired evidence triggers a normal
rebuild. Error, Stop, Rebuild, disabling execution and effect disconnection retire
the corresponding ownership; late compilation or document preparation cannot
restore it. The receipt adds no filesystem, source-edit or native IPC authority.

## Consequences and validation

This preserves an existing frame only for proven irrelevant group changes. It is
not React hot reloading or arbitrary state persistence after executable changes.
Source maps, note bytes, canonical history and full-document semantics remain
unchanged. Unit tests exercise actual esbuild resolver/load callbacks, shadowing,
missing modules, budgets, malformed receipts, late replies and lifecycle cleanup.
The browser regression uses two real workspace tabs and exact public exports,
then verifies both untouched Counter continuity and changed-import replacement.
