# ADR-031: accepted-source session receipts

Date: 26 November 2026. Status: optional editor protocol; product integration pending.
Requirements: EDIT-01, MATH-01, DATA-01, SECURITY-01; supports A04/A07/A08/A10.

String equality cannot distinguish a current visual mapping from one captured
before editing and undoing to identical bytes. React props can also lag successive
keystrokes. Add an optional trusted session protocol to the existing SourceEditor,
not another history, editor or persistence queue.

The application owns a session identity, monotonic editor revision and exact raw
source. Side-effect-free validation checks a proposed batch before application.
CodeMirror remains the canonical history authority. Its synchronous update listener
publishes one final receipt per accepted batch, including a net-zero raw batch or
history traversal. Selection/reconfiguration does not invent a revision. Real
physical-ending/raw-source fields and inverse history effects remain unchanged.
Publication happens after CM state/plugins/DOM update and before dispatch returns;
it is not promised to precede CM view plugins.

RenderedEditor keeps the returned witness beside its projection/source immediately.
All three apply paths use that receipt before refreshing node views, so rapid
Markdown and mathematics input does not depend on a React echo. Older echoes cannot
rewind it. A current newer same-byte witness refreshes provenance without another
publication. Captured link, composition and source-location intents retain their
origin witness; source-equal edit/undo cycles cannot revive them.

Protocol mode/session identity is immutable for a mount. A change requires an
explicit remount; stale commands/currentness checks must fail closed instead of
falling back to a legacy callback. Session history keys stay distinct from logical
paths. Released origins cannot edit reopened sessions. A still-open originating
session may accept its valid callback after selection switches.

The publisher must be synchronous and non-reentrant. Throwing or returning an
invalid receipt after CM advanced leaves the exact attempted text retained,
latches pending/close refusal and calls the owner's separate failure-retention
port. Later child pending(false) signals cannot clear that failure. The failed
state is excluded from ordinary accepted-history caching. No fake receipt or
successful command result is returned. The owner must reconcile this state before
normal disposal; retention callback failure is not durable recovery. A publisher
that advanced its own state before throwing may already have scheduled persistence;
the editor cannot infer rollback or whether original-file publication happened.

Existing session-free callers keep their legacy API. The optional protocol covers
owning Source/Rendered Preview only; old alternate live/form editors are excluded
by props types. Current production callers are not activated here. No writer,
native invoke, filesystem grant or application service is passed to document code.
These callbacks are trusted application orchestration, not a runtime security
boundary. Native autosave, close/restart behavior and inline runtime acceptance
remain separate integration gates.

The test-only browser host is bundled in memory and intercepted by Playwright;
its runtime stub never enters a shipped route. Real keyboard tests exercise
delayed props and stale same-byte intents. They establish editor interaction,
not full installed-file fidelity or native containment. The existing serializer
can encode newly typed spaces in source while displaying ordinary spaces; this
packet preserves that behavior rather than claiming a new Markdown serializer.
See the [packet plan](../plans/source-witness.md) and implementation status for
actual final validation and outstanding product work.
