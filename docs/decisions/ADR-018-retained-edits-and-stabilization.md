# ADR 018: Retained edits and predictable editor lifecycles

Status: implemented in the stabilization candidate; exact validation/deployment evidence is recorded in draft PR #9 and the daily-use receipt. This does not certify native runtime behavior.

## Problem and witnesses

A refused rendered edit was retained only in component memory. A real lifecycle test showed the text vanished after unmount/reopen, while accepted BOM/CRLF source remained intact. A two-tab conflict also exposed final composition input and CodeMirror history bypasses. New combined authoring tests reproduced paste typing into a neighboring list and WebKit whitespace clicks retaining the preceding heading's caret.

The browser runtime separately rebuilt unused whole-document output during editable Preview and replaced an untouched interactive island when a dollar reclassified mathematical structure. Rebuild must remain an explicit usable operation after removing that redundant work. Re-enabling a whole-document runtime must never publish an earlier request's HTML or diagnostics.

## Recovery and source authority

Keep attempted text in a separate bounded, checksummed inventory in the existing IndexedDB store. Each entry has its own identity, document key/source kind, captured base revision/digest and exact text. The inventory is not canonical note content, a history patch, an execution permission or a native file grant. Existing workspace records and database version remain compatible.

Writes refuse overflow/storage failure rather than silently discarding unreviewed entries. The live draft and exact download remain available when a write fails. A successful explicit Keep verifies or re-establishes its exact copy in a final transaction before releasing the in-memory attempt. Live Keep/Discard operations are serialized and bound to an attempt generation; stale completions cannot clear newer text. A corrupt unrelated row does not veto a separately valid copy.

Restore creates a new Source-mode note using the original validated Markdown/MDX grammar, and consumes the reviewed entry atomically with canonical CAS publication. Plain `.md`/`.MD` braces must not become executable MDX. Unsupported source kinds remain downloadable without reinterpretation. Cancellation, conflicts or changed recovery rows preserve existing data. Reopening Recovery refreshes its inventory across tabs.

Conflict locking covers raw typing, keyboard/command history, late asynchronous attachment insertion and other content mutations. An explicit source read-only contract is separate from native file-I/O busy state, which retains its tested editing semantics. View-only preferences/navigation remain available. An already-owned document composition may finish its native read to retain text; it cannot commit canonical data after authority becomes unavailable. Distinct completed composition sessions keep separate history boundaries.

A later real-CodeMirror regression showed that `filter:false` history also
bypassed the live model validator before a read-only prop arrived, or when another
model constraint refused the change. Canonical data stayed intact but the visible
source and history diverged. Authorize every nonexternal raw-source transition at
the dispatch boundary before publishing any transaction in the batch, including
physical-ending-only inverses. Refusal preserves the full state and both history
branches. Source-neutral UI work does not call the budget validator; trusted
model-owned synchronization retains its explicit bypass.

## Rendering and execution

Use an open slice for a single-paragraph paste so follow-up typing stays in the inserted paragraph; multi-block semantics and opaque-source validation remain guarded. WebKit primary refocus synchronizes the owning view before normal native pointer handling; no extra editor field or document-code authorization is introduced.

Math reclassification preserves compatible node identity only for unchanged source spans with exact adjusted boundaries, bytes and safe noncolliding provenance. Refreshed mappings bind those nodes to current source offsets. Changed executable setup/JSX still replaces its runtime; an unchanged island does not reset merely because a neighboring mathematical delimiter changes.

Whole-document compilation remains enabled for Source diagnostics and explicit full-document execution. Editable Preview islands own their compilers; no unused background whole-document build is required. Explicit Rebuild advances a host-owned island generation. Request-owned publication masks obsolete HTML, errors, locations and ready state synchronously across input changes, re-entry, Stop and Rebuild. Theme-only presentation changes do not require compilation.

The integrated browser gate caught a missing diagnostic after this optimization:
malformed MDX and parser work-limit refusals no longer reached the global preview
notice. The installed trusted projection now reports exceptions from its existing
parse pass, bound to the exact document path and accepted source. This supplies
those diagnostics without running an unused compiler. Corrected source clears
the notice; ordinary invalid TeX remains a local raw/red formula, without a toast.

## Limits

Checksums detect inconsistent/corrupt records; they are not authentication against an actor already controlling the privileged origin. The evidence checker validates records, not execution. Acknowledged recovery persistence is not a universal power-loss guarantee. Physical IME, Firefox infrastructure limitations and native package results remain separately scoped. Native arbitrary React still requires its supervised unprivileged process; these browser changes do not authorize embedding it in the native host.
