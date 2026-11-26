# ADR-025: accepted-source autosave coordination

Date: 26 November 2026. Status: implemented foundation; not activated in the
application and not installed-editor acceptance.

Requirements: DATA-01/SECURITY-01, A03–A05 in
[product acceptance](../PRODUCT_ACCEPTANCE.md). The owner requires automatic
writes to real vault files, not manual Save or a browser database. Architecture
quality governs reuse; the rejected native shell is not the integration target.

## Decision

Implement a small platform-independent `AutosaveCoordinator` in
`src/application/autosave.ts`. It receives only already accepted canonical source
snapshots and a document writer. It imports no UI, browser storage, compiler,
React runtime or IPC. It does not create another canonical editor/history model.
An untrusted renderer is never given this object or a message that invokes it.

Document session identity, monotonically increasing editor revision and opaque
disk compare-and-swap token are distinct. The caller owns editor transactions;
the coordinator rejects stale/duplicate revisions and retains immutable snapshots.
Each session ID may be attached once in a coordinator lifetime; released IDs stay
retired so delayed callbacks cannot target another opening. Future adapters map
session IDs privately to native grants; a pathname is not authorization.

Each accepted edit schedules asynchronous persistence immediately. At most one
write per document is in flight; newer accepted snapshots coalesce to the latest
pending one. Each actual dispatch uses the preceding acknowledgement's disk
token. Acknowledgements advance only their captured source revision. Different
documents can progress independently. Compilation and math validity do not enter
this path. Source is never normalized or serialized through an AST/DOM.

Undo/redo are newer accepted editor revisions. Known durable identical bytes
need no extra write, but an in-flight intervening write must finish and then write
the undo bytes back. Identical bytes never authorize an old editor revision.

Writer rejection blocks that document, retains its latest source and invalidates
durability certainty. More typing does not retry implicitly. An explicit retry
still uses CAS; a changed or uncertain on-disk version is never force-overwritten.
In particular, lost acknowledgement followed by undo cannot skip disk validation
just because the old baseline bytes recur. Reconciliation is a future trusted
application use case, not an unconditional rebase primitive in this coordinator.

A `durable: false` receipt means publication happened: adopt its new disk token
and acknowledged snapshot, but block flush/close until durability is confirmed.
The state field `persisted` is the acknowledged snapshot; only `status: saved`
with `durable: true` claims successful persistence. Malformed receipts fail closed.
`flush` waits through later accepted revisions and rejects for any unsaved session;
`release` refuses in-flight, failed or pending state. UI lifecycle integration must
use these outcomes and retain failed source, not merely invoke a fire-and-forget save.

## Alternatives and consequences

- Adapting `useDocuments` directly would couple the new coordinator to the rejected
  product/manual-save controller. Browser workspace generation also includes view
  changes and is not a per-document editor/disk revision. Both need later adapters.
- A generic filesystem/backend framework would add unimplemented operations and
  conceal authority. This packet adds only the write port that it can test.
- The existing native `Store` remains responsible for scoped grants, exact bytes,
  atomic publication, external-file conflict checks and permission preservation.
  The coordinator cannot fix its documented final-check/rename race against a
  noncooperating same-user writer and does not claim to do so.

The real-file integration fixture is a separate Rust example process, constrained
to an owned private synthetic `/tmp` directory and a fixed note filename. It is
never linked into the app or registered as IPC. JavaScript bundles the real
coordinator and exercises the actual Store, including automatic disk appearance,
undo/redo, restart, external conflict and denied stale/unknown grants. A negative
control that omits scheduling must fail. The native CI job runs this fixture.
These are backend integration results, not a native GUI/close or cgroup proof.

## Remaining integration gates

The application still needs one shared product/session controller, a real vault
inventory/create/lifecycle service, external-change observation and explicit
conflict resolution, accepted-revision editor bindings, truthful reactive status
and close handling. No UI behavior is changed by this packet. Real installed
automatic file writes/restart remain A03–A05 obligations. Native inline rendering
must independently meet A09–A11; a shared coordinator or embedding experiment
does not establish renderer isolation or product readiness.
