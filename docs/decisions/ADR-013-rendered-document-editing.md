# ADR 013: Editable rendered documents in the web application

Status: accepted for the browser application. Native `/engine` editing is unchanged.

## Problem

The web Live surface was a CodeMirror source document with a small number of
decorations. Its list markers, task syntax and display mathematics differed from
the compiled, read-only Preview. Styling a source editor alone did not provide
the requested rendered-document editing experience.

## Decision

Preview is now a trusted ProseMirror projection of the note's Markdown syntax
tree. Paragraphs, headings, formatting, lists, tasks, tables and mathematical
atoms are edited directly. Keyboard commands, Markdown input rules, list
continuation and editor-owned formatting commands operate on that projection.

The existing CodeMirror instance remains the canonical source transaction and
undo engine. Every projected change must serialize and reparse successfully
before the source revision guard accepts it. Source and editable Preview share the
same saved document and history; no HTML-to-Markdown conversion of arbitrary
rendered runtime output is permitted.

Unchanged top-level blocks reuse exact original source slices, including BOM,
physical line endings, surrounding whitespace and opaque MDX. Ordinary text,
checkbox and mathematical edits use sparse patches where their source mapping
is unambiguous. Structural edits and decoded entities may normalize the changed
top-level block. This is deliberately narrower than a claim of byte-identical
serialization for every kind of edit.

Empty paragraphs and empty task items are represented during editing without
inventing visible placeholder characters. A failed semantic round trip refuses
the write, reconciles the editor DOM and retains the attempted text for recovery.

## Runtime and security

JSX, expressions and ESM never become executable host DOM. React components in
the editable view run as opaque isolated islands through the existing compiler,
sandbox and CSP. Their messages remain limited to presentation and errors.
Changing ordinary prose does not restart a component with unchanged code and
dependencies. The shared WASM initializer has independent consumer leases.

Separate islands are independent module instances. The inspector's **Run full
document** command retains the complete original MDX runtime for shared mutable
module state, context spanning components and exported document layouts. **Edit
rendered document** returns to the editable surface. Both paths retain the source;
switching between these execution contexts starts a new component runtime.

Pasted HTML is removed before ProseMirror creates clipboard DOM. Plain text is
inserted instead, preventing even detached remote image loads. Host links reject
executable schemes. Images come only from the validated local attachment catalog.
The native compiler and document authority are unchanged.

## Cross-tab persistence

View-only changes can safely rebase against the latest verified workspace. Clean
tabs refresh on focus or visibility changes. A content edit is never silently
merged over a competing content edit, and input arriving during an asynchronous
refresh prevents stale replacement. IndexedDB's atomic revision check remains
the final write guard. Open equation and link drafts, plus rejected text retained
for recovery, also prevent automatic replacement and navigation. A draft that
opens while a storage read is pending is checked again before adoption.

An unfinished in-place equation also blocks changes to the ProseMirror document
itself: a failed blur must not let a nearby deletion destroy the field and its
uncommitted LaTeX. Refused browser mutations reconcile to the accepted projection.
An already-open link form retains its URL while the equation prevents submission.
Closing the equation flushes any canonical source revision deferred while it was
open; stale equation commits still fail before source application.

## Validation contracts

Unit tests cover sparse source preservation, structural round trips, empty
paragraph/task continuation, mixed line endings, code pipes in tables, shifted
math offsets, rejected drafts, IME refresh, late attachment catalogs, shared
compiler leases and competing tab writes.

Browser acceptance covers rendered editing, keyboard/palette and Markdown commands, real
task controls, table and equation editing, undo across modes, source export and
reload, composition, narrow layouts, React state, full-document execution and
host security. The existing native/browser suite remains required before release.

## 24 November: keyboard authoring and notifications

The web Preview no longer displays a formatting toolbar. Markdown input rules,
keyboard shortcuts and editor-owned command-palette actions invoke the same
revision-guarded source transactions. Ctrl/Cmd+Shift+K opens the explicit link
form; Ctrl/Cmd+Shift+7/8 starts ordered/bullet lists. The native `/engine` UI is
unchanged.

Ordinary typing includes incomplete Markdown prefixes, trailing spaces and empty
nested list items. Text serialization must preserve these intermediate states:
escape literal prefixes once, use numeric references for authored trailing
spaces that CommonMark would discard, and retain a paragraph separator before an
empty nested list (otherwise a dash can become a Setext underline). Decoded
punctuation offsets are accepted only after the complete decoded span matches the
parser text. The two emitted whitespace references have verified offsets; unknown entity
mappings still fall back to block serialization. Typed whitespace may remain
represented by standard Markdown character references; existing raw source is
not decoded or normalized for presentation.
Strict semantic reparse, source revision checks and opaque JSX remain required.
Unchanged blocks and unrelated raw slices are reused byte-for-byte.

Editor and web workspace feedback use a host-owned notification provider. Notices
never take writing focus; transient notices pause for keyboard focus, hover or
inspection, and animations respect reduced-motion preferences. Detailed errors
appear only after an explicit Details action. No preview message can call this
provider or authorize edits, exports or filesystem operations.

A refused transaction retains the first complete serialized source candidate and
blocks later modifications until explicit resolution. The notification opens an
editor-owned recovery dialog; downloading its retained source preserves BOM and
physical line endings. Copying the textarea may normalize line endings according
to browser behavior. Downloading never replaces the accepted document, and the
draft remains pending until explicitly discarded. Navigation guards remain active.
