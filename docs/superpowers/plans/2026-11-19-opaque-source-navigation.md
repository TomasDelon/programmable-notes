# Opaque visual blocks: exact Source navigation

Baseca99097; existing checkout, autonomous bounded core-editor work. Engine34dc906
and review247ee9a are already pushed. Keep the provisional design reference only.

Problem: JSX/imports/comments/fences intentionally remain opaque in Visual mode,
but users must manually find their source after switching modes. Add a small
trusted action inside an expanded read-only block, not reverse JSX editing.

1. Unit/browser RED: clicking Show in Source forwards the parser-owned start and
   captured full source, without applying a patch. Busy or modified inline input
   disables navigation. Preserve pending input and show current-source locations.
2. Pass an optional private callback MarkdownEditor→SourceEditor→App. Validate
   selected document identity, source snapshot and existing revealSource offset
   guard. Switch Source mode and focus its exact caret, without changing source,
   filesystem grants, preview messaging or history. Add document identity to the
   existing pending-location record to reject cross-document reuse.
3. Real browser: opaque JSX stays inert in trusted Visual DOM; forged preview
   navigation messages do nothing. Keyboard navigation focuses Source, preserves
   React state until an actual source edit, inserts a character at the exact
   BOM/mixed-ending/Unicode offset, and exports/undoes/redoes exact bytes. Pending
   text cannot be discarded through the new action.
4. Full checks, read-only review and exact optimized native acceptance. Reuse
   existing installed fidelity workflow with a bounded source-jump case; maintain
   all source/recovery/IPC/resource restrictions and preserve failures.
5. Update ADR007/status/progress/evidence, commit/push/update draftPR, continue.

No aesthetic redesign, no author-defined privileged editing contract, no custom
syntax/AI/marketplace/sync, no automatic execution extension, merge or release.
