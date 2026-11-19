# ADR-008 — Immutable, bounded native recovery

Status: backend, manual discovery/restore and bounded automatic native snapshots implemented and tested.

Recovery is separate from original documents and their grants. Use immutable,
versioned records in the existing private recovery directory. Each record carries
a schema version, opaque document identity, basename, saved-baseline digest,
parent snapshot revision, generation and exact UTF-8 source. A SHA-256 digest
covers metadata and source; this detects accidental corruption, not malicious
rewrites by the same desktop user.

Use descriptor-relative, no-follow operations, private regular single-link files
and a nonblocking advisory lock shared by cooperating application instances.
Publish a fully written/fsynced temporary file with atomic no-replace rename,
then sync its directory. Clean interrupted temporary files only under the lock.
Never delete a previous record to make a failed write succeed. Prune older
versions only after the new version is durably published. Full storage or an
uncertain durability result must retain previous records and report the outcome.

Keep at most five versions per document, 64 records and 8 MiB of committed
record bytes, with bounded one-record temporary headroom. At a global quota,
refuse new writes until explicit deletion makes space. Metadata and file names
must agree. Reject stale parent revisions and duplicate/ambiguous generations.
Corrupt records remain discoverable as errors; valid older records remain
available for explicit restore. Do not silently continue a corrupted head.

Migrate the legacy copy without deleting or modifying it; migration must be
idempotent. Restoring always creates a new unsaved buffer with no native grant.
Automatic snapshots will use this protocol after backend and restart tests pass.

Alternatives: replacing one mutable JSON manifest would make a failed update a
single point of loss; a database adds migration/runtime complexity not needed for
this bounded store. Immutable files reuse Linux atomic publication and make
individual corrupt versions independently recoverable. Advisory locking cannot
exclude hostile native code running as the same desktop user.

## Automatic recovery and identity

The trusted editor schedules one bounded batch after two seconds of inactivity
for all modified buffers. It coalesces newer source, skips queued closed/changed
buffers, and never has more than one batch in flight. Store errors or revision
conflicts pause automatic writes with a visible recovery-health message; Resume
is explicit. Saving the original remains a separate picker/grant-backed action.

Each open buffer/session has its own recovery identity. Two buffers or app
instances editing the same path cannot prune one another's unsaved versions.
Reopening a file after restart starts a new lineage; older lineages stay in the
recovery list until explicit deletion or their own bounded retention. Basename
and baseline digest describe the revision without storing a path or grant. This
may reach the global quota sooner than shared-path eviction; refusing further
writes preserves the other histories. No old records are rewritten on upgrade.

Pause, source closure or clean saves cancel queued work; an already issued native
write may finish. Edits before the debounce/write completes can be newer than the
latest durable record. The native unsaved-close confirmation remains required.
