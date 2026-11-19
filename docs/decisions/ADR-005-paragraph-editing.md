# ADR-005 — Source patches for plain paragraphs

Spike C starts with a separate editing surface alongside the sandboxed React preview. The editor parses the current MDX buffer for top-level, single-line paragraphs whose AST contains one literal text node matching the original source slice. It renders these slices as React text in an editor-owned panel.

Applying an edit requires an explicit form submission and an exact match to the captured source in both the workspace and CodeMirror. The editor reparses the candidate and requires a literal text node at the expected range with the same block type. CodeMirror applies one isolated history transaction. Normal save authorization remains in place.

The panel neither takes selection from the preview nor executes document code. JSX, formatted text, nested lists and multiline paragraphs remain editable through source mode. The first slice tests CRLF, adjacent imports, comments and nested JSX, stale source rejection, no-op bytes and undo/redo. Native graphical interaction needs a separate runtime test.

## ATX headings

The panel also edits literal text in ATX headings. The text node supplies the range, so opening hashes, separator spaces and optional closing hashes stay outside the patch. The candidate must reparse at the same heading depth. Formatted heading text remains in source mode.

## Simple lists

A root list is eligible when every item contains just a single-line literal paragraph. The panel uses an ordered or unordered list with the original start number. The patch excludes the list marker and indentation, and the candidate must reparse in the same list. Nested, multiline, loose and task lists remain in source mode.

## Inline editing

Selecting supported rendered text opens a single-line field in the same paragraph, heading or list item. Enter submits an editor-owned transaction and Escape discards the field contents. The separate React preview remains interactive and isolated. It cannot select ranges, supply edits or initiate saves.

A plain, single-line Setext title is also eligible when the parser reports a heading and the original underline matches the supported marker shape. The underline and surrounding whitespace remain outside the patch.

## Unified workspace update

ADR-007 replaces the separate panel presentation with Source/Split/Visual modes.
The validator now accepts literal punctuation and soft multiline text using
parser round trips. The revision, context and untouched-byte guarantees above
remain required; the original single-line allowlist is historical.

## Opaque mapping-style front matter

A leading YAML-style mapping block is protected source, not an editable Setext
heading. Physical LF/CRLF delimiter scanning avoids Unicode separator confusion;
an ordinary leading rule with prose remains Markdown. An incomplete mapping
header falls back to Source. The editor masks the protected prefix only in its
private AST analysis, preserving UTF-16 offsets and line endings. It never
rewrites document bytes or changes the runtime grammar. Metadata/fences/JSX and
Unicode are covered by exact-byte browser and installed-native tests.

## Bounded parser reuse

The range/block/no-op/candidate/remapping sequence repeatedly parsed identical
source. A measured 5,000-paragraph cycle justified retaining one successful AST
keyed by the entire bounded source string. Only this module reads the tree;
callers get fresh projections. Different or malformed source cannot reuse a
previous revision's mappings. No stale-source, context or candidate check is
skipped, and no untrusted preview input is accepted. The cache has no history and
holds at most one source/AST. Initial parsing remains synchronous; timing evidence
is descriptive, not a portable performance guarantee.
