# ADR-007 — Unified workspace with explicit editing authority

The workspace has three modes. Split (the default) displays source beside the
sandboxed React runtime. Source hides the runtime output. Visual displays only
the editor-owned Markdown surface and keeps CodeMirror mounted as the canonical
transaction and undo history. Unsupported blocks are collapsed, read-only source
text at their original document positions. Selecting Source or Visual never
mounts user-authored React in the privileged editor.

The existing runtime stays mounted when changing modes; this preserves React
state across presentation changes. On Linux the runtime is still a separate,
unprivileged window. Hiding the browser frame does not stop execution; Stop
preview remains available. Mode changes retain pending inline input. If source changes meanwhile, the captured revision must still match before applying it. Enter
commits an explicit, validated patch; Escape cancels and Shift+Enter inserts a
soft line break. Undo/Redo buttons operate on document history; ordinary native
textarea undo operates on the pending input until it is committed.

Literal punctuation is accepted by the parser rather than a punctuation
allowlist. A patch still requires the captured whole source revision to match
both workspace and CodeMirror, and reparses to one literal text span of exactly
the expected extent and block context. JSX, expressions, formatted Markdown,
links, hard breaks and structural replacements are rejected. Soft multiline
paragraph text is supported; inserted line endings follow the document's CRLF
or LF convention. Every byte outside the source span is retained. This is not
arbitrary React reverse editing.

## State resets

A source edit invalidates the compile effect, terminates its worker and removes
the old runtime. The next bundle creates a fresh iframe (keyed by its HTML) or
native process. Hooks therefore restart. Keeping the runtime mounted across mode
changes is a safe incremental improvement, verified by a counter interaction.
Keeping arbitrary state across changed code would require an explicit runtime
refresh protocol, boundary rules and separate security review. We do not copy
state from untrusted frames or keep obsolete code running after a source edit.

## Unapplied inline text and document lifetime

Inline input is a trusted-editor draft until Enter validates/applies a patch.
It must not be silently discarded by opening, selecting, closing or replacing a
document, or misrepresented as saved. Modified inline text blocks those actions
and manual Save/recovery restore until explicit apply/cancel. Native window close
and browser unload treat it as dirty. File operations disable inline input;
source typing keeps its existing asynchronous preservation behavior.

Mode changes retain inline drafts. A source change can invalidate their mapping:
keep the exact input accessible even if its block disappears, and reject Enter
unless the original full revision still matches. Escape explicitly cancels.
Automatic snapshots still store actual document source, never speculative text
from an invalid/stale patch. Unapplied input remains memory-only; the user sees
that applying it is necessary before saving/recovery. This bounded guard avoids
implicitly applying unsafe Markdown or inventing a second persisted source.
No untrusted preview message can set draft state, apply patches or authorize files.

## Save shortcuts

Handle Ctrl/Meta+S only on the trusted editor surface, delegating to the same Save
flow as the toolbar. Shift requests Save As. Require an actual trusted keyboard
event and retain pending/busy guards; ignore held repeats, composing and Alt input.
Do not translate preview keyboard messages into editor/file operations. Browser
exports and native picker/grant-backed writes keep their existing authorization.

## Per-source status and aggregate close protection

Selected document dirty/save status is separate from workspace dirty state. Dirty
siblings retain their own selector markers and a separate count. Browser unload
and native close protection continue to include every dirty buffer and pending
visual input. Save/reopen/recovery notices capture a document key and exact source;
a delayed completion cannot claim that another selected source or newer text was
saved. This does not authorize any operation or change native grants. See the
[actual browser/native regression evidence](../security-evidence/2026-11-19-document-status/README.md).
