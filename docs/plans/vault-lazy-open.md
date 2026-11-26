# Packet: open selected sources from a retained vault capability

26 November 2026. Follows inventory at `24a9eea`. DATA-01/02, SECURITY-01;
supports A03/A05/A06, not installed acceptance. No new IPC or UI activation.

- **Outcome:** trusted host code opens chosen note/module files from a large vault
  through its retained directory descriptor and existing Store, without reading
  siblings or trusting cached absolute paths.
- **Invariants:** source bytes, scoped grants, disk CAS, no-follow/pinned reads,
  existing size/count/aggregate limits and all-or-nothing grant publication.
- **Witness:** open one exact source from 100 notes, observe no sibling payload
  events, save/reopen exact bytes; root/ancestor replacement cannot redirect read
  or save; invalid paths, symlinks and failed batches create no grants/leaks.
- **Done:** minimal Rust API, actual filesystem/security regressions, independent
  review and complete relevant validation, then a coherent commit. Frontend/host
  rendering acceptance remains separate.

## Design

Add `Store::open_vault(&Vault, &[String]) -> Result<Vec<Document>, Error>`.
Vault privately resolves selected components starting at its root descriptor.
Validate every requested path before I/O: nonempty UTF-8 slash-separated relative
paths; no NUL, backslashes, empty/dot/dotdot components or absolute paths; no exact
`.git`, `node_modules` or `.programmable-notes` components. Reject duplicate paths
within a batch, preserve case and supported extensions, retain depth/path bounds.
Do not decode URLs or normalize spellings into authority.

Use current O_PATH/no-follow pinning and `AuthorizedFile::select_anchored`.
Do not call path-taking `AuthorizedFile::select` on a root/path concatenation and
never rescan the complete inventory to open selected files. Source reading still
validates UTF-8, 500 KB, 32 loaded grants and 8 MiB aggregate. Prepare all grants
and revisions before publishing once; failure drops all prepared descriptors.

Retain selected root spelling only as private display metadata, because existing
AuthorizedFile.path supplies names/logical paths/displayPath, not actual I/O.
A moved root can make displayPath stale while descriptor-based authority remains
correct. Future UI must distinguish a label from authority. File disk CAS remains
separate from editor revisions. Inventory entries are never authorization tokens.

Inventory can observe literal backslash filenames on Linux; this shared path
policy cannot open those entries. Report an unsupported spelling rather than
rewriting a filename or moving data. Empty-directory lifecycle and automatic
compiler dependency resolution remain later work.

## Tests and review

Use real synthetic filesystem tests: selective opening among 100 notes, unreadable
siblings and inode open/access observation, all formats/case, root and ancestor
replacement, dropped Vault versus retained file grants, malformed/forbidden paths,
symlink/special refusals, size/encoding/grant/aggregate budgets, atomic batch
failure/descriptor cleanup, external file replacement and exact save/reopen CAS.
Retain all existing Store, folder/inventory and autosave regressions unchanged.
Independent review must inspect path and descriptor authority before activation.

## Progress

- [x] Existing grant publishing and descriptor I/O inspected; narrow API defined.
- [x] Test-first missing-API RED; 9 new filesystem tests and full native crate
      71 passed/7 existing ignored; actual Store/autosave regression passed.
- [x] Independent review found no blocker and ran 30 relevant native tests. Rust
      formatting and source-specific checks passed; unchanged frontend evidence
      retained. Final publication/head CI is recorded in the draft PR.
