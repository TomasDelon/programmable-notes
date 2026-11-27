# ADR039: Quiescent editor close and native one-shot permission

Status: implemented prerequisites; frontend orchestration and installed acceptance
pending. This is an engineering decision, not product acceptance or owner approval
of an alternative application. Contract: DATA-01, EDIT-01 and SECURITY-01.

## Problem

An asynchronous dirty/busy hint cannot atomically acknowledge all source, pending
composition and recovery work. Read-only presentation does not stop an already
active ProseMirror composition. Blind unmount cancels its deferred finalizer and
can discard text not yet published. An edit-generation number cannot rescue text
arriving after native window destruction.

## Decision

Retire the actual editor producers before an irreversible native close. The owning
SourceEditor exposes optional detachIfClean; absence or refusal blocks close. It
checks its own and its rendered child's immediate pending states before disposing
either view. Clean disposal preserves the existing immutable CodeMirror history
and selection, retires captured commands and is idempotent.

Application-owned mutation observers conservatively refuse same-stack unprocessed
DOM mutations without inspecting private editor internals. A refusal remains
latched through repeated calls in that stack. Immediate composition/end state and
the rendered finalizer frame are separate gates; an empty observer queue is not
proof that composition or arbitrary deferred work has completed. This reasoning
is scoped to the supported Linux engines and requires actual target validation.

Negotiate a fixed native guard before any document authority acquisition. In that
mode all ordinary OS close requests are vetoed. Three editor-only commands enable
the guard, observe its fixed state and resolve an exact opaque epoch/request with
cancel or commit. Commit shares one reservation gate with document operations and
dialogs, verifies native idle/update/renderer state, freezes further admission and
arms a one-shot native close permit. Queued legacy discard callbacks cannot bypass
a subsequently negotiated guard. Dispatch/renderer uncertainty fails closed. Negotiation still rejects the raw
post-install latch; commit/permit rechecks use the existing active-update predicate,
so an Installed/Unconfirmed result can close and restart while further document
operations remain blocked.

Legacy callers that never negotiate retain their existing close behavior. No
filesystem, shell, network, generic window or event permission is added. Untrusted
preview/child authorization fails before protocol state access. Invalid-version
registration probes deliberately do not negotiate the legacy test application.

## Validation and limits

Nine editor-barrier cases plus existing source/history/composition controls passed
52 focused tests. Eleven pure Rust protocol tests passed; the native Documents unit
cases require actual hosted Tauri compilation/execution. Transport-mocked controls
verify probe behavior, not real IPC denial. CI now schedules headless production-
profile Tauri tests alongside package compilation; that is not GUI validation.

The frontend must still join clean detachment, aggregate admission/flush, recovery
acknowledgements and the exact native request/commit response. Definite precommit
refusal may remount the same sessions/history; uncertain commit must remain held.
No default-entry activation or corrected installer follows from these prerequisites.
Immediate OS close, IME refusal, external conflict, failed recovery and actual
restart/reopen must pass in the installed Linux application before that claim.
