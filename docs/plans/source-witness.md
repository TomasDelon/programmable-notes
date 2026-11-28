# Packet: revision witnesses for accepted editor batches

26 November 2026. Implementation plan only; no product code activated.
Governed by PRODUCT-01, EDIT-01, MATH-01, DATA-01 and SECURITY-01; contributes
to A04/A07/A08/A10. This does not establish shared-product or native runtime
acceptance and does not wire autosave, IPC, a new UI or manual Save.

- **Outcome:** rapid Source/Preview edits use the exact accepted session/revision,
  including before React props echo; stale same-byte callbacks cannot edit or
  navigate a later history state or reopened document.
- **Invariants:** CodeMirror remains the single canonical source/history authority;
  preserve raw bytes, inverse physical-ending effects, pending text, compiler/runtime
  isolation and all existing callers. No second canonical history or write permission.
- **Witness:** hold React echoes while successive Markdown/math edits succeed;
  edit/undo back to identical bytes, then reject an older patch/location/link/IME
  attempt without consuming history or losing attempted text.
- **Done:** optional synchronous receipt protocol, all three rendered apply paths,
  external echo provenance, session lifecycle guards, focused RED→GREEN tests,
  independent review and required checks. Actual Linux autosave/UI gates remain
  separate from these shared-editor witnesses.

## Existing behavior to preserve

`SourceEditor.dispatchTransactions` preflights every non-external raw-changing
transaction before calling `editor.update(transactions)`. A later rejection rejects
the whole batch without updating CM/history. The update listener publishes final
`rawSource(update.state)` once for a batch containing an accepted raw transition.
CM updates its state, view plugins, DOM and selection before that listener runs;
publication is nevertheless synchronous before subsequent React projection layout
effects. This packet preserves that order; it does not promise external witness
publication before CM plugins. Plugins must read their CM transaction state.

RenderedEditor synchronously updates closure-local `projection` and `acceptedSource`
after successful `apply`, before PM node-view refresh. The two dollar/math insertion
paths do likewise. A witness captured only from React props would regress the next
keystroke. `sourceBridge` is a pure source-mapping layer and cannot mint revisions.

## Optional protocol and authoritative ownership

Use one small shared type definition, with names settled during implementation:

```ts
interface SourceWitness {
  sessionId: string;
  editorRevision: number;
  source: string; // exact raw string, never the LF CM projection
}
interface AcceptedBatch {
  expected: SourceWitness;
  source: string; // final raw bytes after the whole accepted batch
}
interface SourceAcceptance {
  validate(batch: AcceptedBatch): boolean;
  publish(batch: AcceptedBatch): SourceWitness;
}
type ApplyReceipt =
  { accepted: true; witness: SourceWitness } | { accepted: false };
```

Add this as an optional session-aware protocol, leaving existing boolean
`acceptChange`, string `onChange` and legacy apply callers operational when absent.
Do not overload a boolean result with a truthy object without updating all consumers.
For the new path, publication supersedes the legacy authoritative `onChange`; do
not submit the same accepted batch to two publishers/autosave queues.

The trusted application session owns the monotonic revision and current-source
witness. SourceEditor owns its synchronous last accepted receipt, not an independent
revision counter. `validate` is synchronous and side-effect-free. After every existing
intermediate transition/budget check and a final session/revision preflight succeed,
CM applies the batch. Its update listener calls `publish` synchronously exactly once;
the publisher updates the trusted current witness before scheduling React work and
returns that exact witness. SourceEditor stores it before dispatch returns. Storage
is never awaited. Do not calculate a receipt from `expectedRevision + 1` in PM.

For a session-aware visual edit, compare expected session/revision/bytes against the
current accepted receipt before dispatch, then return the receipt actually produced
by that dispatch. Rejected dispatches return refusal. Source-equal no-ops may return
the unchanged current witness; they do not invent an edit. A batch containing raw
transitions mints one revision even if its final bytes equal its initial bytes.
Successful history traversal must invalidate old projections even when bytes recur;
selection/reconfiguration alone does not mint a revision. Preserve real CM history
objects/effects, rather than deriving history identity from bytes or serializing it.

`publish` must not await, reject normally, reenter editing or replace sessions. Treat
an unexpected throw/malformed receipt as a retained-source session failure: CM may
already have advanced, so block further acceptance and retain exact current text;
do not pretend rollback, return success or silently save under an invented witness.
Test this exceptional path. Validate batch start-state continuity before application;
define mixed external/user source-changing batches explicitly, preferably refuse them
in the new protocol rather than misclassifying their provenance.

## Cohesive changes and propagation

1. **SourceEditor and protocol tests:** optional incoming witness/currentness check,
   batch validation/publication, synchronous receipt return and session-aware raw
   patch/reveal guards. Use immutable session identity for mount/history ownership;
   keep logical path separate for Markdown/MDX parsing/import resolution. Retired
   sessions cannot accept, and reopening a path uses a new session. Switching notes
   does not revoke a valid callback for another still-open originating session.
2. **RenderedEditor and projection tests:** keep a local projection witness alongside
   `acceptedSource`. Feed it to apply and pass returned receipts into `acceptProjection`.
   Update projection/source/witness together before PM `updateState`, including the
   external refresh path, which currently installs PM state first. Convert all three
   apply sites: normal `dispatchTransaction`, literal-dollar promotion and math-dollar
   insertion. Keep pending-dollar provenance conservative; revisions do not establish
   literal-dollar intent or repair reopening/history ambiguities.
3. **External props and deferred actions:** validate incoming witness identity before
   adopting echoes. Old props cannot rewind a locally accepted receipt. Replace the
   `next === acceptedSource` early exit with identity-aware handling: a newer same-byte
   history/external witness must advance provenance and invalidate old intents without
   creating an edit or duplicate autosave. A genuine external source replacement adopts
   an already-published revision and is not re-published through the user edit path.
4. **Captured mappings:** keep `sourceBridge` pure; a projection wrapper or explicit
   witness field carries provenance through rebase/reparse without deriving authority
   from AST/HTML/node attributes. Node views resolve current nodes/ranges through the
   current mapping and check liveness. A delayed callback captures its witness/range;
   never relabel an old range with whichever revision is newest.
5. **Links/navigation/IME:** extend pending link selections, analysis diagnostics,
   retained-attempt bases, math/link draft spans, composition base and source-location
   requests with their captured witness. Preserve a composition's base witness through
   provisional PM updates; concurrent replacement makes finalization refuse/retain.
   Propagate `{offset, witness}` through MarkdownEditor's source-location action,
   SourceEditor's `onShowSource`/`revealSource`, and WebApp's pending-location and
   animation-frame navigation. Revalidate before focus/selection. RenderedEditor's
   `openSource` prop is currently unused internally; do not invent an extra control.

Implement steps 1–2 as one coordinated editor packet with one owner for shared files;
they are not independently shippable protocol halves. Follow immediately with steps
3–5 before calling the seam ready for native autosave. Tests may be reviewed separately,
but no half-migrated session-aware production caller should be enabled. WebApp remains
on its legacy controller until a separate shared-session/controller integration owns
real session lifecycle and authoritative receipts; use controlled session hosts in
this packet's tests. No giant filesystem provider or alternative editor is involved.

## Tests first: old code must fail these cases

- Accepted multi-transaction batch publishes one final receipt; a rejected later
  candidate publishes none and leaves raw source/history unchanged. Include net-zero
  `A → B → A`, selection-only/reconfiguration and external-echo cases.
- Hold parent React props constant while two PM Markdown changes and consecutive
  dollar/math edits occur; each uses the previous receipt and advances exact source.
  Check every apply path and preserve BOM/mixed endings/unrelated JSX bytes.
- Delay/reorder echoes; old echoes cannot rewind source/witness/caret. New same-byte
  witnesses refresh provenance without another publish or save.
- Capture a patch/link/location at revision N, edit then undo to the same bytes at
  N+2, and reject each old action. Verify undo/redo still uses the owning CM history.
- Compose with a captured base; accept an unrelated canonical revision before finish.
  Refuse the stale commit and retain the complete attempt. Ordinary uninterrupted
  composition commits once with a receipt and subsequent typing still works.
- Switch notes before a delayed callback; a valid open origin stays bound, a retired
  origin fails, and reopening the same path cannot revive old actions/history keys.
- Assert publication precedes dependent React projection layout refresh, without
  falsely asserting it precedes CM view-plugin/DOM updates. Check exceptional publisher
  failure retains text and prevents further revision-dependent acceptance.

Run affected editor/history/source-bridge tests, strict typecheck/lint and targeted
real browser caret/Markdown/math/IME journeys with the pinned engine before final
`npm run check`. Independent review must inspect source fidelity, delayed echoes and
receipt flow at all three apply sites. These tests do not prove installed native
input, inline React, real-file durability or runtime containment.

## Executed outcome

The optional owning Source/Rendered Preview protocol is implemented; production
callers remain unchanged and legacy alternate live/form editors are excluded by
props types. All three PM paths use synchronous host receipts, with external
same-byte provenance, deferred links/IME/navigation and retired-session guards.
Publisher failure keeps exact attempted text, pending/close latches and separate
retention; it cannot claim rollback or durable recovery.

23 targeted witness tests and two pinned Chromium fixture tests passed. Independent
review reran all 23 tests and found no remaining blocker after the documented
corrections. Final joint-candidate check exited0:726 unit, 96 tooling/zero skips,
152 Chromium, 9 Pages, 4 inactive-cloud, format/lint/types/build. See ADR031 and the
dated receipt for exact source hashes and acceptance limits. Shared/native product
integration remains a later gate, not something enabled by this optional protocol.
