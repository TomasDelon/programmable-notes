# ADR-028: collision-safe creation through the vault capability

26 November 2026. Implemented Rust domain operation, not IPC/UI activation.
DATA-01/02 and SECURITY-01; supports A03/A06.

`Store::create_vault` creates a source in an existing authorized vault directory
and returns the ordinary file grant/disk revision for subsequent autosave. It
validates path, source size and Store capacity before filesystem writes. Shared
parent traversal starts only at the retained root descriptor and rejects unsafe
spellings, reserved components, symlink parents and missing parents. No implicit
folder creation or concatenated absolute-path I/O.

A private anchored constructor records missing-target intent with no snapshot;
it never opens or reads a destination. Reuse the existing O_EXCL temporary writer,
file sync and final `renameat2(RENAME_NOREPLACE)`. Existing files, symlinks,
directories, FIFOs and independent racing creators cannot be overwritten.

Share the small Save As commit helper while preserving its original basename
identity. Vault creation supplies its validated relative logical identity. Prepare
grant ID, revision and names before publication. A published rename followed by
failed directory sync returns a live grant/new revision and durability warning;
it is not a failed/no-op create. New files retain existing mode 0600 subject to
umask/default ACL semantics, without copying a sibling's permissions.

Real tests cover exact bytes, scoped access through root/ancestor changes, collision
and no-payload-read cases, permission/capacity failure, concurrent creators and a
deterministic prepare/intervening-create race through private production helpers.
No public test hook or authority was added. The durability-warning branch was
reviewed, not newly fault-injected; existing dedicated filesystem controls remain.

No new renderer permission or path-taking IPC endpoint. Shared application code
must await actual creation, attach the returned binding/baseline to the source
session and autosave coordinator, and then select the note. A virtual metadata
entry or unbound buffer is not a created vault file. Rename/move/Trash, watchers,
conflict resolution and shared controller/UI integration remain separate work.
Existing Save races and cleanup limits under hostile permission changes remain.
