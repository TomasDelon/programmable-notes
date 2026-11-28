# ADR-027: lazy source opening from the retained vault

Date: 26 November 2026. Status: Rust domain implementation; no IPC/UI activation.
Requirements: DATA-01/02, SECURITY-01; supports A03/A05/A06.

`Store::open_vault` prepares selected sources from a `Vault` directory capability
without loading siblings or treating inventory paths as grants. Validate the
complete request batch before any source I/O: relative slash-separated UTF-8
paths, supported extensions, no empty/dot/dotdot/NUL/backslash/absolute spelling,
no duplicate paths, and no exact `.git`, `node_modules` or `.programmable-notes`
components. Reject rather than normalize. Depth and relative-path bounds remain.

Resolve each component from the retained root descriptor with no-follow O_PATH
pinning. Only pinned directories are reopened for traversal; only a pinned regular
source inode reaches the existing `AuthorizedFile::select_anchored` reader. Do
not call absolute-path selection on a cached root/path concatenation or rescan
the vault. Unrelated inaccessible or symbolic-link siblings are not visited.

The original root spelling is private display metadata only. Existing native I/O
uses held parent descriptors and final names, so root/ancestor renames and replaced
pathnames cannot redirect opening or saving. `displayPath` can become stale after
a rename; it must never authorize an operation. Already authorized file grants
remain valid after the Vault object drops.

Keep 32 loaded grants, 500 KB per source, 8 MiB aggregate, strict source UTF-8,
inode/digest disk witnesses and existing atomic Save/permission preservation.
Prepare files, entropy and revision tokens before publishing once. Failed batches
release temporary descriptors and publish no new grants. This is atomic grant
publication, not an atomic snapshot of several filesystem files. Concurrent leaf
replacement must cause the existing Save conflict check to refuse competing data.

Native filesystem tests cover selective opening among 100 notes with inotify
payload-read witnesses, validation-before-read, unsupported paths and special
files, root/ancestor replacement and continued Save after Vault drop, exact bytes,
permissions, encoding/count/aggregate failures, batch cleanup and stale/external
CAS/reopen behavior. Independent review executes the relevant original and new
tests. No new dependency, generic filesystem permission or renderer-facing command
is introduced. The Rust-only path-taking API is trusted host code after OS folder
authorization, not proof of GUI authorization.

Inventory can list a literal backslash filename on Linux; this stricter shared
path policy refuses opening it instead of silently changing its spelling. Empty
directory lifecycle, real create/rename/Trash, watching/conflict resolution and
application controllers remain later work. Compiler import loading requires its
own bounded trusted graph policy; this API does not grant preview code arbitrary
filesystem requests. The existing noncooperating-writer final-check/rename race
is unchanged and must not be described as eliminated.
