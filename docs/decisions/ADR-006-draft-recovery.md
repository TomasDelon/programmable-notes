# ADR-006 — Separate recovery drafts from source saves

Status: proposed. The editor currently holds unsaved buffers in memory.

Crash recovery should snapshot dirty buffers into an editor-owned store separate from the original files. A snapshot should carry its source bytes, document name, saved baseline identity, schema version and timestamp. Native snapshots belong in the application's private data directory and should be written atomically with a bounded size and retention policy. They must not contain reusable native file grants. Browser persistence needs a separate opt-in because it leaves note text in browser storage.

On restart, show recoverable drafts and restore a chosen draft as a dirty buffer. Reopening an original file still requires its normal picker authorization. A disk version differing from the snapshot's saved baseline should trigger the existing conflict flow or Save As. Recovery itself must never replace a file. A saved snapshot should only be cleared if the successful save corresponds to the same edit generation.

Before enabling recovery, test a crash during snapshot writes, failed or full storage, an edited original, a newer edit arriving during save, invalid snapshot data, private storage permissions and explicit draft deletion. Use temporary files and a disposable app profile for native tests.
