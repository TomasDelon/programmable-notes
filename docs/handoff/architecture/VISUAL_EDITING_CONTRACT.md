# Visual Editing: Safe Staged Contract

## Core distinction

An arbitrary React component can *render* and respond to clicks; that does not mean the application knows how to transform its DOM back into the original MDX/JSX source. We must not rewrite an entire document or guess original JSX from a rendered tree.

## Initial model

- **Canonical authored text** is original `.mdx` bytes. CodeMirror is the primary editor.
- Parse/compile without silently reformatting the buffer. Maintain source spans for Markdown blocks wherever the parser can provide them.
- The preview is read-only *as a document editing surface* during the first runtime milestone, but React UI interactions work.
- Phase 2 visual editing applies only to a deliberately narrow set of Markdown text nodes for which source span mapping is unambiguous and validated.
- Arbitrary JSX elements/expressions/imports are **opaque** in visual mode. Selection and deletion use explicit atomic controls; custom editing adapters may add editability later.

## Proposed surgical edit flow

1. User enters rendered editing mode and selects an eligible Markdown block.
2. Map selection to a unique original source range.
3. Display an edit overlay or appropriate structured editing control.
4. Replace only that source range, preserving every byte outside it.
5. Reparse and rerender; show error if mapping is stale or ambiguous; never guess.
6. Group patch in an undoable transaction and invalidate affected preview state.

## Invariants

- No-op rendered edit produces a **byte-identical** `.mdx` file.
- Editing one allowed paragraph does **not** change nearby JSX, comments, imports, whitespace or formatting.
- JSX without an adapter cannot be accidentally modified through text mutation, double click, Backspace or a DOM `contenteditable` operation.
- Rendered component *interaction* (e.g. changing a React slider) does not persist new props into MDX unless explicitly defined as document editing.
- Undo/redo restores the exact authored source; conflicting concurrent edits are rejected or reconciled safely.
- If source mapping is incomplete, preserve source and fall back to code mode.

## Future adapter contract

An editable React component may register `schema`, `sourceLocator`, `editableRegions`, `propsInspector`, `serializePatch`, `validatePatch`, `previewState` vs `documentState`, and `version`. Each adapter requires round-trip and deletion/selection tests. This is a proposal, not a mandatory V1 API shape.

## Libraries to investigate, not adopt blindly

CodeMirror 6 for source; ProseMirror/Tiptap and Lexical for structured rich text. Examine https://github.com/brentvanw/tiptap-mdx for an **approach**, while checking its actual maintenance, schema limitations and source fidelity on representative fixtures. 'Round-trips JSX' is not equivalent to arbitrary JSX semantic editing.
