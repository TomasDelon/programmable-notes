# ADR-006 — Separate recovery drafts from source saves

Status: explicit browser snapshot implemented. Continuous and native recovery remain proposed.

Crash recovery should snapshot dirty buffers into an editor-owned store separate from the original files. A snapshot should carry its source bytes, document name, saved baseline identity, schema version and timestamp. Native snapshots belong in the application's private data directory and should be written atomically with a bounded size and retention policy. They must not contain reusable native file grants. Browser persistence needs a separate opt-in because it leaves note text in browser storage.

On restart, show recoverable drafts and restore a chosen draft as a dirty buffer. Reopening an original file still requires its normal picker authorization. A disk version differing from the snapshot's saved baseline should trigger the existing conflict flow or Save As. Recovery itself must never replace a file. A saved snapshot should only be cleared if the successful save corresponds to the same edit generation.

Before enabling recovery, test a crash during snapshot writes, failed or full storage, an edited original, a newer edit arriving during save, invalid snapshot data, private storage permissions and explicit draft deletion. Use temporary files and a disposable app profile for native tests.

## Browser pilot

The browser offers an explicit single-source snapshot. It stores an MDX or Markdown buffer in local browser storage when the user chooses **Keep local draft**. Restore opens a separate unsaved buffer. The original source, imports from companion files, native grants and undo history are outside this snapshot. Delete removes the browser copy explicitly. A draft survives a reload on the same origin and profile. The browser's storage limits and eviction policy still apply. This pilot has no continuous autosave.

The browser pilot can also update the draft automatically after explicit activation for one open document. It takes an initial snapshot and updates it after 500 milliseconds of inactivity while that document is selected. An existing draft must be deleted before starting automatic updates. If the stored bytes differ from the last snapshot, the editor stops automatic updates. This comparison detects observed changes and provides no cross-tab locking guarantee. Stopping, restoring, or deleting cancels pending updates. Activation is in-memory and expires on reload. Edits made immediately before leaving the tab can be newer than the last stored draft.
