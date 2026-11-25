# Unified Mathematical Text Implementation Plan

> **For agentic workers:** Use the approved parallel execution with test-driven changes and a final independent review.

**Goal:** One document cursor/history for Markdown and mathematical source, with lossless patches and passive metadata title.

**Architecture:** Text-bearing ProseMirror math nodes expose contentDOM in the owning view. Inert KaTeX presentation responds to selection; incomplete formulas project as normal text with exact provenance. Source/CAS security remains authoritative.

**Tech Stack:** Existing ProseMirror, React, KaTeX, Vitest and Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-25-unified-math-text.md`

## Global Constraints

Preserve source revisions, opaque JSX, BOM/CRLF, canonical history, filesystem grants and preview isolation. No merge, public release or PR readiness change. Work on current isolated checkout. User has authorized autonomous implementation without repeated approvals.

## Review Focus

- Unfinished dollars adjacent to Markdown, JSX and encoded whitespace.
- Selection crossing an equation and ordinary text; keyboard and IME ownership.
- Reclassification after closing-dollar deletion without source/spacing corruption.
- Undo/redo and source updates while selection enters/leaves formulas.
- Passive metadata title with explicit rename and unchanged MDX content.

## Tasks

- [x] Source bridge: add red tests for literal text and entity leakage; implement exact text provenance and text-bearing math serialization; verify bridge/literal unit suites.
- [x] Same-editor math: add red tests for shared contentDOM and rendering feedback; remove nested MathView/history/key handling; implement selection-driven presentation and real document text editing; verify units.
- [x] Passive title: add real rename/navigation regression; replace permanent input, retain rename dialog and keyboard focus into editor; update title-only tests.
- [x] Browser acceptance: reproduce old failure, test no nested fields/stops and stable incomplete layout, source preservation, continuous editing/history, invalid correction and persistence; migrate prior interaction tests.
- [x] Integration: run format/lint/typecheck, full unit/tooling/browser/Pages check; investigate failures without weakening assertions. Independent review and docs record exact evidence.
- [ ] Delivery: verify noreply identity, history/archive secret scan, commit/push draft PR; CI and three-browser deployment acceptance before beta fast-forward and principal-origin acceptance. Record real failures and remaining native limitations.
