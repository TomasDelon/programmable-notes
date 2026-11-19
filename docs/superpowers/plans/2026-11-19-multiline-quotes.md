# Multiline quoted text implementation

Base10cb2f3, existing checkout; authorized autonomous bounded P2 work. SpecADR010.

1. Add unit tests to tests/unit/markdownEdits.test.ts: strict two/three-line quotes
   with mixed LF/CRLF, Unicode/BOM and distinct prefixes; exact text edit, no-op,
   context forgery/staleness and unsafe structural changes. Expect RED. Only remove
   the newly supported strict example from opaque cases; retain lazy/nested/JSX
   and all single-line multiline-input rejection tests.
2. Extend MarkdownRange with continuation-prefix context, validate parser/raw
   agreement, preserve prefixes/endings with unchanged line count, reparse exact
   candidate. Avoid changes to JSX, native capabilities or undo architecture.
3. Add a real Playwright test before UI changes, expect absent mapping RED. Verify
   marker-free in-place value, source fidelity, no-op/history, unsafe pending text,
   save/reopen and React interaction. Existing semantic blockquote renderer reused.
4. Run complete checks, request read-only review and fix important findings. Build/
   inspect/install optimized package; extend native quote fidelity with this exact
   contract and verify actual editing/disk/history/recovery plus IPC regression.
   Retain failures and exact source/package/observer identities.
5. Update ADR/status/progress/evidence, commit/push/update draft PR and continue.

No new UI redesign, grammar, privilege, automatic execution extension or merge.
