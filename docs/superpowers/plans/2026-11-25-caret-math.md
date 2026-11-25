# Caret mathematics implementation plan

**Goal:** Reveal dollar-delimited mathematical source in place while editing it, then render on caret exit, without form fields or action buttons.

**Architecture:** Keep the trusted ProseMirror math atoms and exact-source planner. Replace the form with an embedded, unframed CodeMirror contenteditable surface using local history; closing applies one guarded canonical source transaction. No runtime/IPC authority changes.

**Constraints:** Preserve physical source breaks, unrelated bytes, stale-revision refusal, pending-draft navigation protection and bounded untrusted KaTeX rendering. Keep PR draft; no merge/release.

## Implementation

- [x] Add failing browser acceptance for no input/buttons, caret entry/exit, local undo/redo, display newlines and exact canonical undo/reload.
- [x] Replace math input/textarea and controls, reuse CodeMirror history, forward arrow exits to the surrounding document and arrow entry to math.
- [x] Adapt existing unit/browser draft, conflict and source-preservation regressions to the contenteditable surface.
- [x] Run full check and focused real-browser acceptance; record executed results, failures and native limitations.
- [x] Update architecture/status and draft PR, scan secrets and push verified changes; deploy existing beta through its established branch only after checks.

## Review focus

- IME composition must not be committed/cancelled by composition keys.
- Moving directly between equations must first commit the preceding draft.
- Invalid syntax/stale snapshots must retain the draft and block destructive mutations.
- Exiting without changes must not normalize CRLF or create history events.
- Local undo and canonical undo must not be confused across nested editors.

Execution is inline under the owner's explicit implementation instruction; no additional approval checkpoint.
