# Bounded long-input review delivery — 2026-11-19

The portable review is refreshed from committed frontend `d919978`, including
the bounded textarea, exact mixed endings and preceding document/status fixes.
The provisional design remains reference only. Delivery tooling now records a
real thousand-line paragraph, scrolls to its end, types text, captures the pending
input and verifies exact exported MDX. No mockup or native acceptance claim.

- ZIP: `7,024,457` bytes / `31` entries.
- SHA256: `08b7f34d80b000551b53046b3cda0996e685cb0a5295be7bac9803c1c85f59ae`.
- Included: runnable browser build, actual WebM/HTML walkthrough, before/after
  desktop/tablet/mobile screenshots, new-note/status/long-input screenshots,
  three actual saved MDX files, complete asset/capture hashes and receipt.
- Extracted build passed actual React, focused new note, trusted keyboard export,
  pending guard, BOM/CRLF/JSX, offline recompilation after initial loading,
  selected status, internal mixed breaks, ambiguous-refusal retention and
  actual end typing/exact export of a bounded long paragraph.
- Manifest/CRC validation and eight negative packaging controls passed.
- Native evidence is separate: [scoped disk/reopen passes and unresolved renderer
  SIGSEGVs](../2026-11-19-long-inline/README.md). This browser attachment does
  not certify WebKitGTK, cgroups, recovery or native filesystem isolation.

See [download/run instructions](../../demo/README.md). Hosted artifact jobs
remain refused before execution by account billing, so this Git-tracked ZIP is
the PR-accessible review attachment. No public site, release or readiness change.
Remote byte-for-byte retrieval must be verified after push; until then the prior
dated Git download receipt applies only to its previous artifact.
