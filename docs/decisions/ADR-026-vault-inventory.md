# ADR-026: vault inventory is separate from loaded source grants

Date: 26 November 2026. Status: implemented Rust domain capability; no application
or IPC activation. Supports DATA-01/02 and A03/A06, without completing those gates.

## Decision

The Rust host may retain a `Vault` root directory descriptor after explicit OS
folder authorization. `inventory()` returns supported-source relative UTF-8 paths
and observed byte sizes. It neither reads note contents nor creates file write
grants. This allows indexing more than the compiler/loaded-source budget of 32
files without allocating every note's source or changing existing open limits.

Use one descriptor-relative traversal for metadata and existing folder loading.
Pin entries with `O_PATH | O_NOFOLLOW` before classification, reopen only pinned
directories for enumeration, and keep all current depth/entry/path bounds. Only
real directories named `.git`, `node_modules` or `.programmable-notes` are skipped;
symlinks and special files still fail closed even if named like excluded entries.

The metadata visitor records path and size only. The collection visitor retains
the existing 32-file, 500 KB/file and 8 MiB loaded-source checks, anchored reads and
all-or-nothing grant publication. Oversized, unreadable or invalid-UTF-8-content
files can appear in inventory but still fail explicit opening. Invalid UTF-8
source paths remain rejected. All six existing source extensions retain case.

The retained root capability survives root or ancestor rename/path replacement.
Inventory never resolves the old root pathname again. Each scan owns its stream
and temporary descriptors; only the root descriptor persists until `Vault` drops.
No new Tauri command, generic filesystem permission or renderer message is added.
The path-taking `select_authorized` function is trusted Rust host code, not an IPC
endpoint and not a substitute for actual OS authorization.

## Evidence and limits

Actual Linux filesystem tests cover 100 notes, unchanged open capacity, exact
paths/sizes, unreadable/invalid/large content, exclusions, symlinks/FIFO, root and
ancestor replacements, invalid paths, depth/entry/relative-path bounds and
descriptor cleanup. An inode inotify watch observes no source open/access during
inventory; a real read positive control produces an event. This avoids treating
mode 000 alone as proof when a test could run with root privileges.

Inventory is observational metadata, not an atomic snapshot, disk revision or
authorization to open/write a returned pathname. Concurrent changes can stale it.
A pinned descendant moved elsewhere remains the same selected capability under
the existing traversal semantics. Future lazy opening must rewalk and validate
from the retained root, with scoped grants and fresh source/disk witnesses.

The current folder chooser still uses bounded eager collection. This packet does
not make the visible application handle larger vaults yet. Shared vault navigation,
lazy opening/create/rename/Trash, watch/conflict handling and autosave integration
remain application work. Empty directories are not represented by this source-only
index; their lifecycle needs a deliberate later API. Installed GUI and native
inline/security acceptance remain independent gates.

Alternatives rejected: raising global source limits would conflate indexing with
compilation and retained authorities; duplicating a path-based walker would add
race/security drift; loading all source to build an index would retain the current
memory/count problem. This is a small host capability for the shared architecture,
not another native interface.
