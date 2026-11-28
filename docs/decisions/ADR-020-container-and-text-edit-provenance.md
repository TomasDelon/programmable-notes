# ADR020: Parser-owned container gaps and witnessed text edits

Status: accepted design; runtime acceptance is recorded separately in the daily-use receipt.

## Problem

An MDX text node can span physical quote/list continuation prefixes that are
absent from displayed text. Decoded entities can introduce additional visible
newlines. The AST's one continuous source range cannot distinguish these cases.
Guessing line prefixes from displayed suffixes is insufficient.

Comparing old/new displayed strings also cannot identify which of two identical
characters was deleted. Their original entity or physical line-ending spellings
can differ. Choosing another occurrence preserves visible text but changes
unrelated source bytes.

## Decision

Observe bounded continuation-prefix token ranges in the existing live parser
pass using its non-overriding listener. Each parse root owns its metadata;
overflow discards the witness. The parser's grammar, handlers, source offsets and
math diagnostics remain unchanged. Only witnessed container prefixes after an
actual source EOL can form gaps, and the complete decoded text must match the
AST before any gap-backed mapping is accepted.

Preserve separate ordinary text provenance spans around those gaps. A sparse
edit must have one owning source span. Use the verified ProseMirror replacement
range to select that span and the authored lexemes being changed, rather than
shifting an edit across repeated displayed text. Verify the before/after document
and replacement contents. Preserve all other span and prefix bytes exactly.

A displayed boundary beside hidden prefix bytes can have multiple source
positions. Do not invent one. Crossing gaps, unsupported structural operations
and ambiguous snapshot-only changes stay on the existing refusal/recovery path.
Ordinary prose remains visible; no per-block input or source form is introduced.
Source mode remains available for changes whose source ownership cannot be
proven. This does not claim complete visual editing of every container or IME
operation.

Literal mathematics, code and opaque JSX retain their existing boundaries.
Editor transactions and current source revisions remain the authority. Parser
metadata is internal evidence, not a preview message or filesystem permission;
untrusted React remains isolated and cannot authorize any document modification.

## Verification

Real bridge transactions and browser journeys cover quote/list/nested
continuations, entity spellings, mixed EOL, links/backlinks, inverse history and
reopening. Negative controls cover hidden-prefix edges, crossing edits, repeated
characters, unavailable or overflowed metadata and subsequent independent parses.
Actual counts and deployed input identities belong to
[the daily-use receipt](../DAILY_USE_STATUS.md), not this design decision.
