# Packet: collision-safe source creation in a local vault

26 November 2026. Builds on scoped opening at `090a213`.
DATA-01/02, SECURITY-01; supports real note creation in A03/A06. No IPC/UI activation.

- **Outcome:** trusted host code creates a real note in an authorized existing
  vault directory and receives the existing scoped grant for subsequent autosave.
- **Invariants:** never overwrite an existing or racing destination; resolve only
  from retained directory capability; preserve source bytes, loaded limits,
  transactional grant publication and honest post-publication durability results.
- **Witness:** actual filesystem creates exact BOM/EOL/Unicode data, keeps existing
  files/symlinks/FIFOs untouched, supports later CAS Save/reopen, and gives exactly
  one winner to independent racing creators. Failed attempts leak no grants.
- **Done:** narrow Rust implementation and negative filesystem tests, independent
  review, affected regression checks and reviewable publication. This is a backend
  prerequisite, not a claim that the application creates/autosaves files yet.

## Smallest design

`Store::create_vault(&Vault, path, source)` uses the same validated relative path
and retained parent traversal as lazy opening. Parents must already exist and be
real directories; create no folders implicitly. Validate path/source size/count/
aggregate capacity and prepare grant entropy before file publication.

A private anchored missing-target constructor must never read an existing
payload. Reuse current temporary O_EXCL writes, file sync and
`renameat2(RENAME_NOREPLACE)`; a competing regular file, symlink, directory or FIFO
must remain untouched. Do not add a public preparation API or a test-only bypass.
Existing missing-file publication must remain the final race protection.

Share only the necessary existing Save As final grant-publication logic, with
explicit vault-relative logical identity. Keep its original behavior unchanged.
A successful rename followed by failed directory sync still returns the new grant
and revision with durability warning; do not pretend creation did not happen or
retry it as another create. Subsequent persistence uses that grant and disk CAS.
New files use current mode 0600/default-ACL/umask behavior; no sibling permissions
are copied. Display root remains a private label, never an I/O path.

## Test/review focus

Real temporary-filesystem tests: exact source and nested logical path, mode and
Save/reopen; all collision types plus no existing inode payload opens/accesses;
invalid path/source/budgets before writes; root/ancestor replacement and symlink
parents; read-only parent failure and ordinary cleanup; independent concurrent
creators with one exact winner; deterministic prepare/intervening-create refusal
through private production helpers if practical; failed operations retain existing
grants/capacity and successful creation consumes one grant. Retain all existing
Save As, file/inventory/lazy-open and actual autosave regressions unchanged.

Do not claim cleanup against a noncooperating actor that changes parent permissions
mid-operation; existing temporary cleanup limits and Save's final-check/rename
race remain documented. New creation must use no-replace even though existing-file
Save has that separate residual race.

## Progress

- [x] Existing missing-target atomic writer and Save As publication inspected.
- [x] Missing-API RED, 7 integration + 1 private race test; native suite 79 passed
      with 7 existing ignored slots; actual Store/autosave passed.
- [x] Independent review ran 37 relevant tests with no blocker. The combined creation/observation full npm
      check passed (673 unit, 92 tooling/zero skips, 150 Chromium, 9 Pages, 4 cloud).
      Final publication/head CI is recorded in the draft PR.
