# ADR-038: One document surface with host-owned sessions

Status: implemented and locally verified; native product activation remains pending.

## Context

PRODUCT-01, EDIT-01, DATA-01 and REACT-01 require one document application with
explicit platform services. The rejected native shell is not a fallback. The
existing browser document panels already contain useful source/visual editing,
focus, history and runtime presentation behavior. Reimplementing those panels
for a native workspace would recreate the divergence the owner rejected.

## Decision

Extract the existing SourceEditor and whole-document preview panels into
`workspace/DocumentSurface.tsx`. Preserve their DOM, classes and hidden-state
behavior. SourceEditor props retain their existing types; the surface adds no
source model, history, persistence or runtime compiler. The host owns session
lifecycle, canonical source transactions, commands/history refs, diagnostics and
explicit trusted runtime selection.

Keep editor mount identity separate from logical document path. Browser hosts can
retain the existing selection identity; a native host uses its opaque session
identity so late events or reopened paths cannot acquire a new document session.
Workspace structural notifications and individual document notifications remain
separate subscriptions. React snapshots project the controller's state; they do
not become a second source authority.

WebApp composes the extracted surface using its existing model and adapters.
Controlled tests may compose that same surface with NativeWorkspace and injected
save ports. They must not introduce another UI, browser-storage fallback, native
invoke dependency or untrusted-message editing capability. Runtime absence keeps
the existing unavailable behavior and creates no iframe automatically.

## Consequences and acceptance limits

The extraction is a shared product-tree leaf, not a complete shared application
root. Browser navigation/storage and native lifecycle, picker, real filesystem
operations, recovery and close acknowledgement still need platform integration.
Actual GtkSocket/Plug input/security testing is independent of this React
composition change and cannot be inferred from DOM tests.

Required witnesses are unchanged actual browser interactions and focused controls
for panel/focus identity, Source/Preview transitions, canonical edits, per-session
history, stale callbacks, retained failures and explicit runtime absence. Injected
writer tests verify the shared composition/authority path; existing real Store
I/O evidence remains separate. Neither proves accepted installed autosave or
permits promoting a corrected installer.

## Live session observation

`workspace/useDocumentSession.ts` observes only the existing controller's
`state`/`subscribe` port. It caches snapshots for React rather than repeatedly
returning the controller's newly allocated copies. Each binding belongs to one
controller and opaque session ID; null selection has no subscription. It rereads
after subscribing, rejects callbacks after cleanup, and propagates unknown
controller errors through the React error path instead of silently returning
empty or stale source.

The controlled surface host separately observes structural selection and document
state. Autosave writing-to-saved, draft/failure state and rapid source receipts
refresh without manual rerenders. Closing successfully retires the controller
entry without a terminal notification; selection and fresh reopened identities
remain host-owned. This observation cache is a projection, never another source,
history or persistence authority. Browser production composition and native boot
routing remain unchanged by the hook packet.
