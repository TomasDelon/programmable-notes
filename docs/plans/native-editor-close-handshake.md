# Quiescent native editor close handshake

Design only; DATA-01/02, EDIT-01, SECURITY-01. Native vault entry activation stays
blocked until implementation, independent review and installed acceptance. No
native run or default-entry activation is performed by this document.

## Concrete gap and reviewed design

The existing documents.rs close callback permits a clean OS close from boolean
hints and can destroy a dirty editor after its legacy discard dialog. An async
set_documents_dirty acknowledgement is not aggregate editor admission. The new
nativeProduct therefore keeps protection asserted and refuses final release.

Read-only integration review on 27 November established an additional frontend
constraint. RenderedEditor intentionally permits an active composition while
readOnly, and its finalizer is deferred to an animation frame. Its ordinary
cleanup cancels that frame and clears the pending report. Blindly unmounting or
setting readOnly can therefore discard text not yet published to canonical source.

The smallest proposed path is **clean synchronous editor detachment, aggregate
flush, then one exact native close commit**. A generation CAS or additional RPC
cannot protect an editor producer still running after irreversible window close.
This replaces the earlier six-command prepare/invalidate design; no commands have
been implemented or enabled by either design.

## Frontend barrier

1. Add an imperative detachIfClean operation to the existing owning editor. Refuse
   active or ending composition, pending/unapplied/link/retained text, publication
   failure/in-progress, unresolved recovery work and tracked deferred producers.
   Use immediate owning refs and the public composition observations, not only
   state from the last React render.
2. Observe character-data and child-list mutations in each owning editable DOM
   with an application-owned MutationObserver. Refuse detachment if takeRecords
   contains unprocessed DOM changes. This observer neither edits source nor
   replaces the editors' observers. Avoid private version-specific library APIs.
3. Scope this reasoning to supported Linux engines: ordinary mutation processing
   completes at the task's microtask checkpoint, while composition must be gated
   explicitly. An empty observer queue or a delay is not a cross-platform proof.
4. On clean detachment, synchronously retire editor callbacks/commands, snapshot
   the existing immutable CodeMirror history/selection, cancel harmless owned
   timers and destroy both owning views. Make disposal idempotent. Captured old
   callbacks must not publish or retarget newly mounted sessions afterward.
5. In the same JavaScript task obtain the existing aggregate session admission.
   If admission refuses, remount from the same source/history. Otherwise hold the
   admission, flush originals and relevant recovery acknowledgements, recheck all
   exact witnesses, then request native commit. No fallback browser persistence.
6. On a proved precommit refusal, abort admission and remount exact sessions/history.
   A lost/malformed commit response remains uncertain: retain closed admission and
   identities, and never blindly retry or pretend saved data is safe.

This barrier retires the actual editor producers. It does not claim protection
from arbitrary future trusted application code inventing a new retained draft
after the final seal. Preexisting producer work must finish or force refusal.

## Minimal native protocol

Negotiate before mounting ProductRoot or acquiring any vault/file authority. Check
real editor label and !Host.child before state access. Latch authority use before
legacy acquisition so negotiation cannot race a chooser. Lost/malformed bootstrap
acknowledgement blocks mounting; it must not fall back to the legacy close path.

Only three fixed editor-only commands are proposed, without source/path/grant
arguments or generic event/window permissions:

- enable_editor_close_guard({version:1}) -> opaque lifetime-bound epoch.
- editor_close_state({epoch}) -> native phase and current opaque request identity.
- resolve_editor_close({epoch,request,action:'cancel'|'commit'}) -> exact echoed
  identities and typed resolved/refused state.

Guarded mode is irreversible for this window. Every ordinary CloseRequested is
vetoed and creates/coalesces a request; booleans never authorize release. The
frontend owns bounded polling of the fixed state, not a generic event permission.
A renderer restart cannot inherit a permit or silently renegotiate an acquired
workspace. The mode is checked again by queued legacy discard callbacks, so an
old confirmation cannot destroy a newly guarded editor.

Commit verifies the exact current epoch/request and zero active operations,
dialogs/update and stopped renderer under one native reservation gate. In the
same gate it freezes new operations and arms one one-shot close permit, then
queues native window.close rather than destroy. The next CloseRequested consumes
that stored permit only after rechecking its conditions. WindowEvent has no
request token: do not invent an event identity. Duplicate/stale requests cannot
rearm permits. Existing operation completion remains allowed; prepare the flush
before commit, never check atomics and reserve later. Lock poison fails closed.

A matching acknowledged cancel before commit releases the request. An uncertain
commit remains protected/read-only in frontend; state reconciliation may report
only recorded facts. Preserve existing install/reservation ordering and include
guarded close in install admission. Legacy callers that never negotiate retain
their reference behavior; no filesystem grants or renderer permissions expand.

## Required implementation and verification

- Frontend: SourceEditor/RenderedEditor lifecycle and commands, ProductRoot's
  barrier orchestration, nativeProduct/native services, exact native wire records
  and native bootstrap. Reuse existing source/history and aggregate phases.
- Rust: documents.rs state/reservation/close callback, main/build command
  registration and editor-only ACL. Existing Store semantics remain unchanged.
- Same-stack raw DOM mutation then close refuses without losing text; normal
  next-task close after publication detaches and flushes.
- Active IME, compositionend before finalizer, link/unapplied/retained draft,
  publication failure and pending recovery each refuse detachment.
- Captured format/insert/reveal callbacks after detachment cannot publish. Hold
  native commit while real DOM/keyboard input is attempted; no new accepted text.
- Test in-flight saves, external conflicts, abort/remount with exact undo/selection,
  duplicate/stale/wrong-epoch close, lost commit acknowledgement, operation/dialog/
  update races, renderer death and a queued legacy discard callback.
- Test actual Rust guards, editor registration and preview/child denial before
  effects. Run focused/full checks, real hosted Tauri compilation and independent
  data-safety review before native entry activation.
- Installed Linux remains a separate gate: mixed-EOL typing/immediate OS-close,
  pending composition, conflict, failed recovery, repeated/no-change close,
  restart/reopen and preserved legacy reference behavior. Mocks and a compilation
  pass cannot satisfy installed filesystem or runtime security acceptance.

## Prerequisite implementation checkpoint

The owning editor barrier and native state/command guard are implemented as an
inactive prerequisite packet. Focused editor controls passed52 cases; pure native
state controls passed11. Registration mocks and exact capability controls passed;
actual native Documents reservation/update tests passed hosted run46003547608
on97d3aab. Independent
source review found no Important/Critical defect in that bounded packet. No native
entry or frontend OS-close orchestration is activated by these results.

## Next frontend integration packet

- Make the native product bootstrap async and negotiate before constructing a
  model that can issue dirty/recovery/filesystem calls. Capture the epoch privately;
  validate the exact fixed native wire records and fail closed on malformed replies.
- Extend the existing native product service with a narrow closeGuard observer and
  cancel/commit operation. Start one serial bounded polling lifecycle on the first
  product subscriber and stop it on the last; ignore retired callbacks. No generic
  event, IPC or lifecycle framework and no duplicated source/history registry.
- Project only closeRequestId/closeUncertain/closing to shared ProductRoot. Keep
  epoch/transport identity private. OS requests, not author preview messages, drive
  the product's close path.
- Track product operations synchronously before their initial protection await;
  workspace.operation can still be null while choose/open/create waits there.
  Refuse before detachment if an operation or retained-resolution action is in
  flight, and keep one private close singleflight.
- prepareClose receives only a trusted synchronous detach callback. Capture request
  scope privately, detach and obtain aggregate admission before any await; flush
  originals and relevant recovery acknowledgements, then assert exact witnesses.
- Drain recovery and hint queues to a stable tail after originals flush; queue
  identity may advance while an await is held. Awaiting a UX-swallowed rejection
  is not a durability receipt. Verify pending work and original-file durability;
  obsolete recovery failure cannot erase retained/unapplied text or fake its Keep
  acknowledgement.
- On a blocked barrier or definite precommit failure, cancel the exact native
  request and prove its acknowledgement before resuming. Return an explicit editing,
  committing or uncertain outcome; unsupported services keep the existing refusal.
  Lost/malformed commit/cancel responses hold identities and publication closed.
- Root handles each application/request once, including StrictMode and late async
  completion. Remount only its owning editor after a proved cancellation AND actual
  clean detachment; never unmount a refused IME. Preserve session/history keys and
  change only a local mount nonce. Committing/uncertain outcomes never remount.
- Test held commit/cancel, real editor producer retirement, late reports, failed
  save/recovery, external writer, no-document close, application replacement and
  exact history after abort. Then run the installed Linux witness; no corrected
  installer claim or default entry activation before its acceptance gate.

Before native activation, explicitly cover table composition with ProseMirror's
Safari detector enabled. Linux WebKitGTK must not be assumed to bypass that
branch: upstream WebKit defaults navigator.vendor to Apple Computer, Inc. Source
review found its deferred table flush guarded by composition state and forced at
compositionend, not a demonstrated false-clean path. Test finalizer-before20ms
ordering with exact source, then observe actual installed vendor/input behavior.
This is a pending target witness, not a reason to weaken composition refusal.

## Frontend integration checkpoint

The fixed epoch-private transport, guarded async factory, application close model
and real ProductRoot barrier/remount flow are implemented. Full frontend check:
956 unit,140 tooling/zero skips,153 Chromium,9 Pages and4 local cloud cases passed.
The controlled real-browser journey passed13 checkpoints, including three close
scenarios. Native responses and storage there are synthetic, not actual OS tests.

Before native entry activation add one module/window-lifetime bootstrap owner
outside React effect replay. Preload required product modules, await guarded host,
then construct exactly one model and render existing ProductRoot. Capture no new
source/history registry and never fall back to the unguarded/legacy App.

The browser RootBoundary is unsuitable for native authority: its reload action
cannot renegotiate after authority use, and unmount is not clean detachment. A
native fatal latch must retain model/host identities, prevent new close resolutions
and show truthful minimal terminal feedback without reload, retry, fake empty
admission, automatic application replacement or a saved assurance. An already
issued commit cannot be revoked by a frontend latch. Graceful exit after lost
bootstrap acknowledgement/fatal failure remains a separate reviewed lifecycle
problem; do not add a generic quit permission as a workaround.

Test one negotiation/model across StrictMode, held/malformed negotiation before
any dirty/recovery/filesystem activity, fatal-before-commit versus already-issued
commit, pending IME/unpublished DOM at fatal, and preserved browser-only reload.
The installed mixed-source/vault journey remains the actual platform gate.

## Bootstrap checkpoint

The inactive window-lifetime bootstrap and permanent fatal boundary are implemented
and independently reviewed. The combined check passed966 unit/143 tooling,153
Chromium/9 Pages/4 local cloud cases; separate shared Root journey13 passed.
Startup captures bindings, preloads presentation, negotiates once and constructs
one model. Fatal failure is permanent, prevents new resolve calls and does not
revoke an already issued commit. Next: wire the real entry to this owner, cover
Safari-detector table composition, then run installed Linux acceptance. Entry
wiring is a development candidate, not evidence of a corrected installed product.
