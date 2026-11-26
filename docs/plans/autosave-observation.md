# Packet: observable autosave completion for the shared application

26 November 2026. PRODUCT-01/DATA-01, A04. Concrete gap identified by the shared
product integration preflight: accept() returning does not mean disk save finished;
the UI needs completion/error observations without polling or another workspace DB.

- **Outcome:** trusted shared controllers can subscribe to per-document persistence
  state and observe writing, acknowledged snapshots, saved and blocked outcomes.
- **Invariants:** observations cannot authorize edits/files, slow/throwing/reentrant
  subscribers cannot corrupt persistence, no stale acknowledgement marks newer
  content saved, released sessions cannot revive, existing writer semantics stay.
- **Witness:** held writes, later edits, failure, unsubscribe/release and throwing
  subscribers exercise real coordinator behavior; no extra typing is needed for
  a saved/error observation.
- **Done:** minimal subscription API, targeted tests, independent review, required
  checks and actual native Store harness. No UI activation or new renderer message.

Use subscribe(documentId, listener) returning unsubscribe. Defer/coalesce state
notifications into microtasks; consumers read current copied state, not an event
journal or a stable useSyncExternalStore snapshot. Send an initial state safely.
Drop listeners on release. Isolate subscriber exceptions from persistence and
other listeners; optional trusted diagnostic sink may receive errors, default
must not print note/error contents. Guard diagnostic-sink exceptions too.
Reentrant subscriptions/accepted edits must not deliver backward snapshots or
create parallel writes. The controller uses this for persistence status/baselines,
never as canonical source or permission to mutate document history.

## Result

35 targeted tests passed, including two subprocess RED→GREEN controls for async
listener/sink rejection leakage found in independent review. Final full check:
673 unit, 92 tooling/zero skips, 150 Chromium, 9 Pages and 4 inactive-cloud passed.
The real native Store/autosave harness passed with the final source. This adds
status observation only; shared UI/controller activation remains future work.
