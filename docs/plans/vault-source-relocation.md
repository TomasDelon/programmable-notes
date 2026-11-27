# Single-source vault relocation: staged design and bounded TDD plan

Status: revised after architecture review; **Store-wide write barrier rejected**. Only the read-only foundation below is proposed for the next implementation packet. Relocation and its uncertainty handling remain unimplemented and require another design review and authorization.

**Outcome:** advance DATA-02 without compromising DATA-01 autosave for unrelated notes.

**Invariants:** captured native authority, no overwrite, unchanged exact source/history, no automatic rollback or uncertainty reset. One uncertain operation must not freeze unrelated documents.

**Next witness:** actual Linux fixture files prove private vault provenance and detection of duplicate source/destination grants without moving or writing a file. No path-label change counts as relocation acceptance.

## Current interfaces and a correction

Read against PRODUCT_CONTRACT DATA-01/DATA-02 and `native-documents/src/{lib,linux,vault}.rs`. `Store::open_vault` and `create_vault` use a captured `Vault`, but `Grant` currently retains only `AuthorizedFile`, revision, size and logical path. `AuthorizedFile` anchors a parent descriptor/final name and stores device/inode/content-digest metadata; `Vault::resolve_parent` walks from the captured root without following symlinks. `Snapshot::matches`, `AuthorizedFile::current`, the bounded UTF-8 reader and `resolve_parent` are private helpers, not public APIs.

Correction to the earlier investigation: an existing grant does **not** automatically recreate a removed old pathname. It has `snapshot: Some`; `AuthorizedFile::write` rereads that name and returns `Conflict` if missing or replaced. Only absent-target creation uses `snapshot: None` and `RENAME_NOREPLACE`. Duplicate bindings still need detection; explicit `reopen` can also adopt a replacement baseline.

## Packet 1: private provenance and duplicate detection only

Proposed future files: `native-documents/src/lib.rs`, `linux.rs`, `vault.rs`, and focused crate-private unit tests with real temporary files. No new public filesystem operation, dependency, IPC registration, UI, source model or application lifecycle change.

- Give each retained `Vault` a private identity shared with grants issued by `open_vault`/`create_vault`. An internal reference-counted marker can provide identity without serialized authority. A new Vault selection of the same displayed path is a different origin; root renaming preserves the retained origin.
- Keep standalone `open`, `open_folder` and Save As grants without Vault provenance. Thread provenance explicitly through the existing private `publish`/`commit_authorized` paths rather than inferring it from a display path.
- Factor only the narrow internal endpoint observations needed for duplicate detection: parent descriptor device/inode, exact final name and a granted file's recorded inode identity. A display path is never an endpoint identity. These are proposed private helpers, not existing APIs or a generic filesystem provider.
- Add a private read-only relocation-eligibility check: known grant, expected revision, matching retained Vault origin, valid source/destination paths, current source endpoint/snapshot, and no other live grant overlapping source or destination. Use endpoint identity to detect standalone/foreign aliases too; use inode identity to detect hard-link source aliases. Same-origin logical paths provide an additional consistency check, not authority.
- Reuse existing path policy, including reserved components, supported extensions, traversal/separator, depth and UTF-8 byte limits. Existing destination parents must be real directories. Do not create directories or retarget any grant.

Foundation tests must demonstrate: same origin accepted; standalone/foreign/stale grants refused; duplicate same-path, alternate captured-root spelling, standalone endpoint and hard-link grants detected; destination-bound grants detected even if their file was subsequently removed; captured-root rename remains valid while a replaced source parent fails validation. Every test verifies unchanged file bytes, grants/revisions and ordinary unrelated save behavior. Closing a duplicate may make eligibility pass, but creates no relocation or recovery claim.

Run these tests RED before adding the private helpers. Preserve existing save/open/create capacity, permission and descriptor cleanup tests. Targeted Rust tests/formatting, independent review and root-owned final checks are required. No relocation syscall or uncertainty latch belongs in this packet.

## Later relocation API: proposed, not implemented

The bounded eventual operation remains Linux-only:

```rust
pub fn relocate_vault(
    &mut self,
    vault: &Vault,
    id: &str,
    expected_revision: &str,
    target: &str,
) -> Result<Relocated, Error>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relocated {
    pub id: String,
    pub revision: String,
    pub name: String,
    pub logical_path: String,
    pub display_path: String,
    pub durable: bool,
}
```

The source comes from the granted logical path. Verified success preserves one grant ID and byte accounting, advances its disk revision, and rebinds its anchored parent/name/path and logical path together. It does not republish source, reset editor revision/history or return a second source buffer. Reject an exact source/target spelling match before publication. Directories, Trash, reference rewriting, parent creation, cross-vault moves and copy/delete fallback are outside scope.

After preflight and preallocation, a future implementation would make a final source check and perform descriptor-relative `renameat2(..., RENAME_NOREPLACE)`. Reopen the destination without following its final name, verify inode plus stable exact-content digest against the pinned source baseline, and treat an unexpected replacement at the old source entry conservatively. Rename preserves the inode's ownership/mode/ACLs/xattrs and source bytes; rename-related timestamps can change, so pre/post ctime equality is not valid across rename.

Only a verified publication may rebind the grant and return the fresh revision. Attempt synchronization of both affected parents even if the first sync fails. A verified rename with failed sync returns its new binding/revision with `durable: false`. Kernel destination collision is `Conflict`, without uncertainty. Other attempted-publication failures and failed postchecks are `PublicationUncertain`; never retry or roll back automatically. `EXDEV` has no copy/delete fallback.

These requirements do not authorize implementing publication before the scoped uncertainty problem below is resolved.

## Rejected barrier and unresolved scoped protection

**Rejected:** a Store-wide mutation barrier, including treating its suppression of unrelated autosaves as an acceptable limitation. Unrelated notes must continue saving. The earlier version of this plan proposed that barrier; architecture review rejected it. It is not an approved implementation choice.

A per-grant latch is necessary but insufficient. `prepare_save_as(path)`, `commit_save_as(pending, source)`, `save_as(path, source)` and `create_vault(vault, path, source)` can publish without identifying the uncertain source grant. New opens can issue alias grants. Save As is a separate authorization, not reconciliation or permission to clear old uncertainty.

A small **operation-specific** retained reservation could identify the original grant plus captured source/destination parent device/inode and exact name, retaining those parent descriptors. It could additionally remember the expected and any positively observed affected inode identities. This plausibly blocks known overlaps without stopping unrelated saves, but is not yet a complete reviewed design:

| Entry point                                      | Required protection before publication/baseline adoption                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save` / `reopen`                                | Refuse the uncertain original grant and any granted endpoint or known affected inode alias. `reopen` cannot clear the latch or bless a replacement automatically.                                                       |
| `prepare_save_as` / `commit_save_as` / `save_as` | Check captured target endpoint and existing inode aliases. Recheck at commit even when `PendingSave` predates uncertainty. A successful rescue to a disjoint authorized file must leave the original protection intact. |
| `create_vault` / private `commit_authorized`     | Check the resolved target against protected endpoints before publication; absence does not make a protected name safe.                                                                                                  |
| Further relocation                               | Check both source and destination endpoints and known inode aliases. Do not move a reservation away or let a renamed alias bypass it.                                                                                   |
| `close` / new opens                              | Closing the original grant cannot discard unresolved endpoint protection. New grants cannot bypass it. Observational inventory need not be blocked.                                                                     |

The remaining issue is broader than setting a flag: every publication path must honor the same reservations at its final commit boundary, and protection must survive grant close without becoming a generic recovery subsystem. If source replacement occurs between final check and rename and postchecking then fails, the identity of the inode actually moved may not be available. Captured endpoint plus **known** inode matching must not be described as complete arbitrary-alias reconciliation. External moves/hard links and directory topology changes need explicit limits and adversarial tests.

Do not invent a general uncertainty ledger, automatic reset, restart reconciliation or Store-wide fallback to hide this gap. First implement only the independently testable provenance/duplicate foundation. A later design must define narrowly scoped reservation ownership, final-boundary overlap checks and explicit recovery/abandonment semantics before relocation can be implemented or activated.

## Required later publication witnesses and limits

Once that design is reviewed, use real files to prove exact BOM/CRLF/Unicode bytes and metadata preservation; no destination overwrite; same-ID/fresh-revision rebinding; both-parent durability warnings; and stale save ordering. `&mut Store` serializes this process: save-first advances the revision so an old move fails; move-first advances it so an old queued save fails, while a save using the acknowledged revision addresses only the new endpoint. It does not serialize external writers.

For deterministic boundary races, privately factor final validation, actual rename and postcheck phases. `#[cfg(test)]` unit tests must replace/edit the source or create a destination **after final validation and before the real rename syscall**, then exercise the ordinary outcome handling. Keep these private phases consecutively orchestrated in production. Compile-time test-only narrow syscall/sync adapters can model failed results, including real publication followed by a lost-result error. No environment flag, public paused-operation API, IPC hook or production-enabled test feature is permitted. Distinguish real-filesystem observations from injected-failure evidence.

Later scoped-protection tests must prove blocked overlapping save/reopen/create/Save As/relocation, a pre-acquired `PendingSave`, newly opened aliases and protection after close, **while an unrelated grant still saves successfully**. A disjoint rescue Save As must not clear the old protection. Source-race outcomes must produce uncertainty and no normal receipt, without rollback. These are gates, not foundation-packet claims.

This is not atomic source CAS: `RENAME_NOREPLACE` atomically protects destination absence, not source identity. A replacement at the boundary may itself be moved; detection does not undo that side effect. External changes may occur after verification, and captured directory descriptors do not freeze namespace topology. Crash/lost response may leave committed placement without an acknowledged revision; fsync is not a persistent journal or restart reconciliation. A fresh Store is not proof that an earlier uncertain move never happened.

Future application wiring must protect drafts, pause acceptance for the affected session, flush accepted writes and adopt the new disk revision/path without resetting history. Current `NativeWorkspace.run` serializes structural operations only. None of this plan changes that controller, activates native commands/UI, implements Trash or establishes installed DATA-02 acceptance.
