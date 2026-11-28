# ADR-029: persistence status observations for the shared controller

26 November 2026. Implemented application-domain API; no UI/runtime activation.
DATA-01, PRODUCT-01 and A04.

The coordinator's `accept` return does not imply durability, and a paused editor
must learn about later completion or failure without polling a browser workspace.
Add `subscribe(documentId, listener)` with an unsubscribe function. Deliver an
initial copied state, then deferred/coalesced current persistence snapshots.

Listeners and diagnostic sinks cannot interrupt writes or other listeners. Default
diagnostics print no note/error content. Each delivery reads fresh state so an
earlier listener's accepted revision cannot cause a backward captured snapshot.
Unsubscribe and release discard pending deliveries; initial subscriptions do not
rebroadcast unchanged state to existing listeners. This also avoids reentrant
subscription loops. Existing session retirement and write serialization remain.

This is trusted controller observation, not an event journal, canonical source,
stable `useSyncExternalStore` snapshot or new preview message. Controllers use it
for status/persisted baselines, never to rewrite editor history from disk ACKs.
User-authored React receives no coordinator, writer, native grant or callback.

Tests exercise background completion, older ACKs/newer source, failure, lifecycle,
per-listener copies, reentrant edits/subscriptions/release and exception isolation.
The actual native Store harness remains a separate integration witness. Shared UI
model extraction and real lifecycle/IPC adapters still need implementation and
native acceptance; this API does not establish installed application autosave.

Review found that TypeScript void callbacks can return rejecting promises. Consume
listener/sink promise rejections as well as synchronous throws, without awaiting
them. Subprocess tests demonstrated the prior leak and verified its correction;
this prevents default unhandled-rejection logging from exposing error contents.
