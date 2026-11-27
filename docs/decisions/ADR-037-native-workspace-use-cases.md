# ADR-037: native workspace use cases

Date: 27 November 2026. Status: application foundation tested;
shared UI/installed integration pending.
Requirements: PRODUCT-01, DATA-01/02, EDIT-01, SECURITY-01; supports A03/A04/A06/A07/A10.

Compose the existing [native vault service](ADR-030-editor-vault-service.md),
[private grant binding](ADR-033-private-native-session-binding.md) and
[DocumentSessions controller](ADR-032-document-session-controller.md) in
`createNativeWorkspace`. Inject the narrow native
ports and a trusted globally unique host-session ID supplier. Native imports are
type-only; no direct invoke, path I/O, browser persistence, runtime capability or
second source/history authority belongs in this module.

Inventory remains independent of loaded-source budgets. Serialize structural
operations while accepted-source persistence for known sessions continues through
the existing controller. Preserve copied observations, origin vault/session IDs,
late receipts, newer deliberate selection and retained/unapplied text. Reuse an
already loaded path instead of creating another grant. Refuse vault replacement
until sessions are closed and cleanup is resolved; never silently close buffers.

An acknowledged create is a real file baseline, not an unsaved virtual note.
Attachment failure may close only a positively identified fresh grant; it must
retain the file and protect existing or cross-aliased identities. Failed cleanup
retains ownership and blocks further acquisitions. Successful close retires the
association only after the existing controller's flush/acknowledgement checks;
close uncertainty and late failed editor text retain their owner.

An untyped rejected open/create promise cannot establish that acquisition or
publication did not happen. Conservatively retain an uncertain-acquisition count
and block new acquisition/vault replacement. Do not parse native error strings to
guess that retry is safe. Known source text remains retained; this decision does
not supply unknown-outcome reconciliation or a recovery resolution API.

Follow-up transport outcomes distinguish resolved `acquired` receipts from exact
resolved `refused` receipts. A refusal must echo the originating vault and exact
requested path(s), with a fixed `rejected`, `io` or `conflict` code. Validate own
data fields and the complete shape before permitting another acquisition. A
refusal-shaped rejected promise, malformed/foreign response or unknown tag stays
uncertain. No cleanup or source mutation is authorized by a refusal.

Only the reviewed Store result is mapped to a refusal: open validates/reads the
whole batch before publishing grants; create performs its fallible checks before
target publication. Failed non-collision rename attempts have the distinct
`PublicationUncertain` error and remain rejected. Successful directory-sync
warnings stay acquired. Authorization, operation admission, captured-vault lookup,
mutex and worker-join failures stay outside the conversion and remain rejected.
The guarantee is no new target publication/document grant, not absence of all
auxiliary temporary-file activity. IPC capabilities and editor-only authorization
are unchanged.

Root's targeted receipt is 37 workspace tests and 108 combined targeted tests.
These use injected transport boundaries and do not attest actual Tauri caller
authorization or installed user journeys. Root also passed a separate actual
Store open/save/close scenario with synthetic chooser/inventory: exact accepted
BOM/CRLF/opaque JSX and invalid MDX bytes were observed before flush, close/reopen
used a fresh session, and conflicting external bytes/mode0640 remained intact
while local text was retained. No real creation or GUI behavior is claimed by
that case. The initial full-check evidence is in the implementation status;
four contained Tauri outcome tests await hosted execution because local GLib
development packages are absent. No guest success, active desktop autosave or
product parity is implied. The existing
native interface remains rejected; one shared product tree, native dirty/busy
acknowledgement, durable recovery and installed security/lifecycle acceptance are
still required.
