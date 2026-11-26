# ADR022: Literal dollars and editing provenance

Status: implemented; delivery requires current-candidate browser evidence.

## Problem and decision

An unfinished math tokenizer consumed neighboring Markdown. Actual typing of
`$x` before `**bold**` revealed raw bold markers. Fixing only bold display would
leave underscore emphasis, links and escapes exposed to the same ownership bug.

Keep the single document editor and canonical source history. New ordinary
dollars display as text and serialize escaped, without showing the backslash or
creating a pending math node. Only a complete, nonempty expression with witnessed
editor-authored delimiters promotes to mathematics. Empty and incomplete runs
stay literal; complete invalid TeX stays editable red source without a notification
or a global editing failure. Imported unfinished mathematical text still needs
protection from MDX expression parsing; its tokenizer respects Markdown boundaries
while preserving TeX group/script/optional-argument context.

## Exact ownership

Intentional Source-authored `\$` and a newly typed literal dollar have identical
stored bytes. Global unescaping would corrupt intentional prose. Only session-
authored dollars acquire promotion provenance; actual transaction positions map
that ownership, including repeated characters. Direct insertion projections must
remain bound to the actual ProseMirror transaction document.

Canonical history remains CodeMirror-owned. Bounded session witnesses restore
ownership only for editor-invoked undo/redo. Identical source with different
ownership is ambiguous and must never restore guessed provenance. Cache exhaustion
also stops history provenance restoration, without replacing canonical history.

External Source refreshes and reopening never infer ownership from escaped bytes.
Reopened pending dollars remain literal; Source can explicitly author mathematical
delimiters. No invisible source marker or automatic migration is introduced.
This conservative limitation protects intentional portable MDX.

## Validation and boundaries

Regressions cover empty/inline/display/multiline runs, invalid TeX, neighboring
formatting/links, TeX commands, deliberate escapes, JSX, exact BOM/CRLF/mixed-EOL
exports, canonical history and ownership collisions. Browser keyboard/focus
observations remain separate from unit/parser results. Current-source receipts
belong in the implementation status; earlier dev/HMR runs are diagnostic.

No preview mutation authority, filesystem permission, IPC grant or network
allowance changes.
