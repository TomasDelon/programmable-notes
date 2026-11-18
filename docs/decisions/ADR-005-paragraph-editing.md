# ADR-005 — Source patches for plain paragraphs

Spike C starts with a separate editing surface alongside the sandboxed React preview. The editor parses the current MDX buffer for top-level, single-line paragraphs whose AST contains one literal text node matching the original source slice. It renders these slices as React text in an editor-owned panel.

Applying an edit requires an explicit form submission and an exact match to the captured source in both the workspace and CodeMirror. The editor reparses the candidate and requires a literal paragraph at the expected range. CodeMirror applies one isolated history transaction. Normal save authorization remains in place.

The panel neither takes selection from the preview nor executes document code. JSX, formatted text, lists, headings and multiline paragraphs remain editable through source mode. The first slice tests CRLF, adjacent imports, comments and nested JSX, stale source rejection, no-op bytes and undo/redo. Native graphical interaction needs a separate runtime test.

## ATX headings

The panel also edits literal text in ATX headings. The text node supplies the range, so opening hashes, separator spaces and optional closing hashes stay outside the patch. The candidate must reparse at the same heading depth. Setext headings and formatted heading text remain in source mode.
