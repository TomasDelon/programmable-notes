# ADR010 — Prefix-preserving multiline quoted text

Status: implemented; unit, actual browser and installed Linux acceptance passed.

Extend the existing trusted text surface only for a root blockquote containing
one paragraph and one literal text leaf, with an explicit marker on every physical
continuation line. Current single-line behavior remains unchanged. Nested, lazy,
formatted, escaped/entity, blank-separated, heading/list and JSX forms stay opaque.

The parser supplies the exact raw span; mapping separates literal text from an
ordered array of continuation prefixes. Logical text retains original LF/CRLF;
markers/indentation/spacing are copied verbatim. Editing may change literal text
but must keep physical line count. The existing line-break reconciler restores
original endings after textarea normalization. No inferred prefix insertion or
removal, and single-line-to-multiline edits remain rejected.

The captured full source revision, exact range/text/prefix context and reparsed
candidate all must agree. Candidate raw length includes preserved prefixes;
logical text length does not. Undo remains one source transaction. UI remains
editor-owned, without preview message authorization or reverse JSX editing.

This bounded contract avoids guessing how inserted/deleted lines inherit quote
prefixes. Use Source to change structure. Verify mixed physical endings, markers,
Unicode/BOM, no-op/history, stale/forged metadata, opaque MDX, actual browser export/
reopen and installed native editing before claiming support.

[Exact tests, failed first close observation and driver controls](../security-evidence/2026-11-19-multiline-quotes/README.md).
