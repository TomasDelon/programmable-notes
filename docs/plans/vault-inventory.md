# Packet: descriptor-anchored vault inventory

26 November 2026. Follows the shared autosave foundation at `73fa3a0`.
Requirements: DATA-01/02, PRODUCT-01; supports A03/A06 but does not complete them.
The current product contract and native isolation policy remain authoritative.

- **Outcome:** native domain code can inventory more than 32 notes without reading
  all source or allocating document write grants. The vault index is separate from
  the bounded loaded/compiler graph.
- **Invariants:** OS-authorized directory capability, descriptor-relative no-follow
  traversal, existing exclusions/depth/entry/path bounds, exact case/paths and all
  current explicit-open budgets. Inventory metadata is never write authorization.
- **Witness:** actual temporary Linux filesystem tests index 100+ mixed-format
  sources and unreadable/oversized/invalid-content notes; existing 33rd-open limits
  remain enforced. Root replacement cannot redirect the selected capability.
- **Done:** small Rust-only Vault/inventory API, tests including negative path and
  descriptor-lifecycle cases, independent security review, full relevant checks,
  documentation and a reviewable commit. No new IPC or application activation.

## Engineering design

`Vault::select_authorized(root)` is a Rust-only trusted-host entry point after OS
folder authorization, like the existing path-taking Store selection API. Retain
one root directory descriptor. `inventory()` yields deterministic supported-source
relative UTF-8 paths and byte lengths. It reads metadata only, not note contents,
revision hashes or file grants. Directories can initially be derived from source
paths; empty-directory CRUD belongs to a later real lifecycle operation.

Use one source-entry traversal for inventory and current folder collection rather
than duplicating security-sensitive walkers. Reuse O_PATH pinning and existing
no-follow primitives. Keep reading/500 KB/32-source/8 MiB constraints in the
collection visitor. Preserve 4096 scanned entries, 16 nested directories and
4096 relative-path bytes for both visitors. No global budget increase.

Inventory may list a source that explicit open later rejects (size, encoding or
permissions). The UI must not silently load it or treat it as a writable grant.
Selection remains a capability over the pinned directory even if its pathname
moves. Returned metadata is not an atomic snapshot: future read/create/move/Trash
must revalidate from the root descriptor, never trust cached absolute paths.

## Work and validation

1. Write meaningful filesystem tests before implementation; observe missing API
   and the intended rejection/descriptor/metadata witnesses.
2. Extract the smallest common traversal and implement the two-field inventory.
   Existing Store/folder/save behavior must remain unchanged.
3. Run focused tests, the complete native document crate and rustfmt. Review path
   authority, symlink/special files, renamed roots, budget boundaries, metadata-only
   behavior and temporary descriptor cleanup independently.
4. Run required repository checks and update status/results. Keep GUI/native inline
   acceptance uncompleted. No third shell, generic filesystem permission, community
   plugins, backend activation, public release or merge.

## Progress

- [x] Existing pinned descriptor walker and budgets inspected; API/risks reviewed.
- [x] Test-first implementation and native suite: 11 inventory/62 crate passed;
      7 existing helper/prerequisite slots remain separately accounted for.
- [x] Independent review found no blocking issue; full npm check passed (663 unit,
      92 tooling/zero skips, 150 Chromium, 9 Pages, 4 inactive-cloud), plus Rust
      format and actual Store/autosave regression.
- [ ] Verified publication and durable next-step handoff.

## Outcome and next work

The Rust-only inventory boundary is implemented; the application still uses its
old eager chooser. Inventory does not authorize reads/writes from cached paths.
Next filesystem slice: scoped lazy opening and real file lifecycle through the
retained capability, with explicit authority/revision tests before shared product
integration. Native inline Wry feasibility proceeds independently; no filesystem
pass completes the renderer or installed acceptance gates. Final commit/run and
publication outcomes are recorded in the draft PR rather than a stale CI checkbox.
