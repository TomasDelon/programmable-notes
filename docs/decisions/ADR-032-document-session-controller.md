# ADR-032: shared document-session controller

Date: 26 November 2026. Status: application foundation; UI/native bridge pending.
Requirements: EDIT-01, DATA-01/02, SECURITY-01; supports A04/A07/A10.

Compose the existing SourceSession receipt protocol and AutosaveCoordinator in one
framework-independent DocumentSessions controller. The application owns a unique
session witness and logical path; native grants remain private to injected writer
and close ports. No invoke, renderer service, browser database or second editing
history belongs in this controller. Inventory remains separate from loaded sources.

Publication validates the exact originating witness and loaded-source budgets,
feeds the coordinator synchronously, then installs/returns the next receipt before
writer/observer microtasks can run. Source-equal accepted batches still advance the
revision. Session identity, editor revision and disk CAS retain distinct meanings.
Configuration can only tighten the fixed source/count/aggregate caps. Capture its
three named values once, validate that same plain object and retain it unchanged;
structural inherited/getter configurations must not lose or change validated limits.

Failed editor publication and unapplied text stay separate from accepted originals.
Copied observations do not authorize edits. Subscription initial delivery targets
only the new listener; subscribing inside a callback cannot rebroadcast unchanged
state indefinitely. Listener exceptions/rejected promises cannot interrupt writes.

Normal close gates further publication, checks unapplied/retained text, flushes,
rechecks, awaits the injected close port and only then releases/retires the session.
Failure before port admission leaves the session open. Rejection or late retained
text after port admission preserves a close-uncertain session and freezes new
publication: grant validity cannot be inferred. Never silently retry, release first
or reuse the retired identity. A valid open origin remains independent of which
note the eventual UI selects.

This is not active application autosave. The private native-grant bridge, shared
product tree, native dirty/busy acknowledgement, safe explicit retry/reconciliation,
external watching, durable recovery and installed close/restart acceptance remain
integration work. Retained failures here are memory only; no hidden discard or
resolution API is introduced. Read the [packet plan](../plans/document-sessions.md)
and implementation status for executed validation and limits.
