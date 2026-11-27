# ADR-041: Shared native product startup and permanent authority ownership

Status: development candidate; installed acceptance pending.

## Context

PRODUCT-01 and DATA-01 require the shared document workspace with real local vault
autosave. The rejected legacy App is not an acceptable native substitute. A React
effect cannot own native close negotiation: StrictMode replay and rendering retry
must not construct another host, source/history registry or filesystem authority.
A browser Reload boundary cannot safely recover negotiated authority.

## Decision

One module/window-lifetime owner captures privileged bindings without IPC. Its
sticky start promise preloads the presentation, negotiates the fixed close guard,
then constructs one existing NativeWorkspace/ProductApplication. The native entry
selects this owner before /engine. Its permanent boundary surrounds StrictMode
and startup; the presentation supplies the existing notification provider and
shared ProductRoot. Browser routing, provider, offline startup and /engine remain
separate. EditorEntry refuses accidental native use instead of falling back.

Fatal failure permanently latches the owner before cleanup/retry. No reload,
recreated model, fabricated empty editor barrier or privileged generic quit is
offered. New close resolutions stop; an already dispatched commit cannot be
revoked and remains uncertain. Initial main/static asset failure lies outside any
JavaScript boundary and before guarded authority acquisition.

The candidate uses the existing scoped vault operations and autosave model. It
does not migrate browser data. Native React remains unavailable until the inline
renderer and full containment/input gates pass; no separate window or privileged
iframe fallback is introduced. Signed updater integration and file lifecycle work
remain distinct pending tasks; they are not falsely advertised in the installer.

## Evidence and consequences

Focused actual-entry/bootstrap tests passed15 cases with the real native model
and ProductRoot under controlled IPC. Browser/engine markers are test doubles,
so this is routing evidence rather than browser parity. Held negotiation has no
filesystem activity; malformed negotiation/chunk failure cannot fall back.

Two Safari-detector table-composition cases use real production PM/CM source
handling, exact BOM/CRLF/opaque siblings and undo/redo, with16ms finalization before
the20ms deferred read. They do not execute GTK or physical IME.

Independent source review found no Important/Critical issue. Full repository
checks, hosted compilation and actual installed chooser/autosave/close/restart are
recorded separately in implementation status. The candidate is not an accepted
installer or production security certification. Terminal fatal states may require
OS-level termination; graceful recovery must not bypass unpublished-edit guards.
