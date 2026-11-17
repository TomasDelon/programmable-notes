# Local Files, Git and Optional Sync

## Current product direction

- Canonical authored documents are local `.mdx` files; ordinary `.md` can be opened without losing standard Markdown content.
- Attachments are ordinary workspace files referenced by relative paths when possible.
- Workspace-level settings and optional caches have distinct files/locations; generated build artifacts are not authoritative document content.
- Git is optional. An ordinary user can create/edit/save notes without installing or understanding Git.
- GitHub is an optional remote synchronization/backup location; Google Drive integration is later and not a dependency.

## Recommended behavior

- Save safely and atomically where possible; avoid corrupting files on crash or autosave race.
- Distinguish editor undo/redo, file autosave, Git commit, Git push, remote pull and conflict resolution as **different operations**.
- Avoid commits on every keystroke or auto-push without clear consent.
- Display local uncommitted and remote-diverged states with useful conflict recovery.
- Never commit credentials, runtime caches, huge generated binaries, or personal environment secrets.
- Ignore `node_modules`, build output, local temp files and credentials in Git.
- Preserve user-owned Git history. Do not reset, force-push, delete branches or rewrite history automatically.

## Initial implementation priority

Do not implement Git synchronization until the MDX source editing/runtime spike passes. Early stage may use browser temporary fixtures and test-only file persistence; the later native storage adapter should respect workspace permissions. Include basic open/save/reopen and byte identity in first usable editor milestone.
