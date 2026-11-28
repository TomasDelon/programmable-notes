# Shared product integration preflight — 26 November 2026

Read-only source assessment at `f9d8007`, `fix/preview-markdown-input`.
This assessment itself changes no source, tests, dependencies, IPC or product routes.
Later foundation packets are recorded in implementation status; API gaps below
describe this report's original source snapshot. The governing requirements are PRODUCT-01, EDIT-01, DATA-01/02,
REACT-01 and SECURITY-01; relevant acceptance is A01–A12.

## Smallest maintainable vertical slice

Extract the compatible presentation and editor interactions from
`src/web/WebApp.tsx` into the **one shared product tree**, initialized with
application services. Start with authorized vault selection, metadata inventory,
opening existing notes, Source/Markdown Preview, document switching, canonical
undo/redo, automatic real-file writes and truthful failure/close state. This is
an intermediate integration slice, not the dependable Linux milestone: inline
React and the remaining real-file lifecycle gates still have to pass.

Do not copy WorkspaceApp into a third interface, route native through the rejected
NativeWorkspaceShell, or implement a second native document controller. Different
browser/native bootstraps can initialize the same product; filename parity is
irrelevant. Browser-specific migration/storage UI can remain in its bootstrap or
adapter. The shared tree must not initialize browser storage as a fallback when a
native vault fails to open.

## Concrete current coupling and treatment

| Current seam                                    | Actual behavior/dependency                                                                                                                                                                                                                                                                                      | Integration treatment                                                                                                                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebApp` → `WorkspaceApp`                       | WebApp initializes `useWebWorkspace`; WorkspaceApp's model type is its entire return type and state is `WebState`. Loading/failure paths offer browser/cloud workspace creation, backup and recovery.                                                                                                           | Extract the existing presentation around a narrow shared application model. Introduce vault authorization/loading/failure states; avoid an adapter that pretends every browser command exists.                                                           |
| `WorkspaceApp` editor wiring (around line 2116) | One SourceEditor keyed by selected path; shared immutable history map and command ref; synchronous `canUpdateSource` / `updateSource`; string-only freshness; pending draft blocks navigation/mode changes; callbacks capture originating selected key.                                                         | Preserve interactions and editor ownership. Use session identity for mount/history keys, retain logical path separately for syntax/imports. Bind callbacks to their originating session, not current selection.                                          |
| `useWebWorkspace` persistence                   | Initializes `readWorkspace`/`createWebState` and retained-attempt reads on mount; whole-state CAS revision, generation including preferences/navigation, timer autosave, focus/visibility reread, beforeunload guard; `saveNow` also requests browser persistent-storage permission.                            | Replace native authoritative orchestration with accepted-source sessions plus AutosaveCoordinator. Browser generation/database revision are not editor/disk revisions. Do not import the hook and merely replace `writeWorkspace`.                       |
| SourceEditor                                    | `dispatchTransactions` validates proposed raw changes before consuming history; update listener publishes `rawSource(update.state)`; external prop echoes are freshness-checked and excluded from accepted change publication. History cache retains actual CodeMirror historyField and custom inverse effects. | Keep this authority and byte path. Extend the existing transaction/projection boundary with identity and monotonic editor revision; do not add an independent persistence history or serialize CodeMirror history to JSON.                               |
| Browser runtime #1                              | WorkspaceApp eagerly invokes `useWebPreview` for full-document execution and directly renders `WebPreview`.                                                                                                                                                                                                     | Inject runtime session/presentation, including when disabled. Moving only the frame JSX is insufficient because the hook constructs browser workers/HTML lifecycle.                                                                                      |
| Browser runtime #2                              | SourceEditor → RenderedEditor node views → RenderedRuntime directly imports `useWebPreview` and `WebPreview`; node views create separate React roots, stop events and ignore mutations. Runtime context changes rerender those roots.                                                                           | Supply the same runtime service explicitly through context/props into these roots. A provider surrounding WorkspaceApp alone does not automatically cross separately created roots. Native must never reach either browser frame path.                   |
| Presentation side effects                       | Theme/document title, hover/pointer listeners, keyboard commands, focus restoration, selection history, notifications, draft guards and source-location navigation are in WorkspaceApp. It also directly invokes offline/service-worker updates, downloads, uploads and browser persistence/cloud labels.       | Retain compatible DOM interactions. Move platform lifecycle/update/download authority behind small explicit services/capabilities; keep significant operational failures in existing notifications. No privileged services reach runtime props.          |
| Inventory/search/links                          | Sidebar filters and link index read every `workspace.files` source; active/trash lists and folders come from virtual metadata. `compilerFiles` consumes loaded groups.                                                                                                                                          | Separate inventory entries from loaded buffers and bounded compiler snapshots. Initial search must truthfully describe available scope; do not load every note just to satisfy the old WebState shape or apply its 1,000-note/24 MiB model to the vault. |
| File and auxiliary actions                      | `createNote`, folder creation, rename/move/reorder/Trash/restore mutate WebState; attachment import adds catalog blobs and appends Markdown; retained edits/recovery/backup restore read/write browser storage, sometimes replacing a whole workspace.                                                          | Enable each control only with real semantics. Never wire virtual metadata operations to vault controls. Recovery is separate from originals; attachment/import/backup formats and source-changing insertions require deliberate follow-up.               |
| Boot                                            | main mounts EditorEntry, which chooses App for Tauri and WebApp for browser; App reaches rejected native shell.                                                                                                                                                                                                 | After adapter and interaction acceptance, both supported product boots mount the extracted shared tree. Keep legacy engine fixtures as explicit evidence routes, not automatic fallback.                                                                 |

## Minimal interfaces and ordering

Use a small session/application boundary, not a generic filesystem provider.
The shared controller owns `sessionId`, logical path, exact source,
`editorRevision`, pending visual attempt and per-document persistence state.
The native adapter privately maps session IDs to authorized Store grants. A
session ID is never reused after close/replacement, including reopening the same
path. Inventory paths are observations, not write authority.

1. **Vault selection/index/open:** an editor-only chooser returns an opaque vault
   handle; `index(vault)` returns metadata without source/grants;
   `open(vault, validatedRelativePaths)` returns source and opaque bindings.
   Distinguish vault handle, document session ID, module path and disk revision.
   Current Rust `Vault::inventory` and `Store::open_vault` are suitable backend
   building blocks, not an existing IPC/UI implementation. `open_vault` still has
   bounded loaded-source/Store capacity; manage loaded sessions explicitly rather
   than treating inventory as a compiler bundle. Close only after flush/release;
   reopening must not invalidate another still-active late callback.
2. **Editor acceptance:** preflight validates a candidate against captured
   `{sessionId, editorRevision}` and source budgets without side effects. The
   accepted CodeMirror transition publishes exact raw bytes synchronously,
   advances the monotonic revision and schedules autosave before dependent
   rendered layout effects read its witness. Keep validation/publication in the
   existing synchronous dispatch path; do not await storage between them. A
   boolean `acceptChange(next)` and later `onChange(next)` are not by themselves
   a revision contract. Define and test their atomic handoff, including multi-
   transaction batches, rather than incrementing revisions during preflight.
3. **Freshness:** deferred prop echoes, visual patches, analysis diagnostics and
   source-location callbacks carry session + revision + expected bytes. String
   equality alone cannot reject an old projection after edit/undo returns to the
   same bytes. A still-open originating document can accept its valid late edit
   after selection switches; a retired/replaced session cannot. Keep unapplied
   user text outside the original-file queue.
4. **Autosave:** reuse `src/application/autosave.ts`'s `attach`, `accept`, `state`,
   `retry`, `flush`, `release` and DocumentWriter contract. Writer maps the private
   binding to existing `save_document`; maps returned revision/durability exactly.
   Add a narrow observable status/subscription bridge: the current coordinator
   exposes snapshots but emits no completion notifications, so React must not
   claim saved merely because `accept` returned. Do not poll a whole workspace or
   debounce accepted edits behind browser-state persistence. Conflicts/uncertain
   completion retain latest text and require reread/reconciliation before retry.
5. **Lifecycle/recovery:** platform close requests await flush and account for
   pending visual drafts; failure blocks normal close with retained text. Browser
   beforeunload alone cannot await native writes. Keep recovery/attempt storage
   a distinct small service with provenance; never invoke browser retained-attempt
   storage from native as a silent substitute. External observation/reread needs
   a separate use case guarded by session, editor and disk witnesses; current
   writer conflict checks do not prove proactive watch/reconciliation.

Create is a subsequent narrow use case: await collision-safe backend creation,
receive the actual grant/revision, attach the baseline, then select/mount it.
Do not create an autosaveable unbound buffer with the old synchronous
`createNote(): string | null` API. The separately assigned `create_vault` work
must be reviewed on its actual result before integration. Rename/move/Trash,
restore, references and restart reauthorization remain separate operations.

## Runtime seam without authority leakage

Use a read-only runtime request containing session/revision/build identity,
bounded virtual source snapshot, entry/island source, pinned dependency policy,
theme and approved assets. Keep compilation generation/deadline and verified
dependency-read witnesses; preserve unaffected island state only when those
witnesses permit it. `webMode: true` currently selects product compiler transforms;
extract that product policy deliberately rather than inheriting legacy native
grammar. Compilation never decides whether accepted source saves.

The runtime service creates a lease with bounded status/error observations,
presentation attachment and explicit stop/dispose. Whole-document and island
surfaces use that service; adapter owns DOM iframe or native surface attachment,
geometry/focus/scroll integration and supervisor lifecycle. No source mutation,
grant, absolute path, writer, chooser or native invoke object is in the request,
events or rendered author code. Native islands must share an enforced aggregate
resource budget. A React component factory is only a presentation seam; it is not
security containment. Do not change native authority to make it fit this API.

While native execution is unproved, extract/type/test the seam using explicit
unavailable/fake adapters. Keep actual React activation blocked. Do not substitute
the browser iframe, a separate window or privileged host execution. Fixed HTML
painting via Wry GTK Socket/Plug under the unchanged Supervisor is partial
presentation evidence; input, React, pre-expiry Stop, geometry/lifecycle and the
full A11 matrix remain unresolved.

## Work that can proceed independently and its witnesses

1. Extract shared presentation/model and session/revision acceptance; preserve
   SourceEditor raw/history/retained-draft regression fixtures (A01/A07/A08/A12).
2. Connect/test coordinator lifecycle and observable status with a controlled
   writer; stale replies, slow writes, undo-to-identical-bytes and selected-note
   switches must preserve originating session and latest revision (A04/A07).
3. Define/test narrow vault index/open and writer adapters against existing Rust
   semantics, before any IPC activation. Add trusted IPC only in a separately
   reviewed change with negative authority/path tests (A03/A04/A10).
4. Extract both runtime paths behind one lease/presentation contract; verify no
   browser runtime dependency is reachable in the native product graph and no
   writer is reachable in runtime requests (A01/A10 structural witnesses).

These are domain/backend/structural witnesses. Actual installed Linux gates must
still demonstrate real typing-to-disk latency, bytes after restart, filesystem
failures, independent external edits and truthful close (A03–A07), plus native
input/math behavior and interactive inline React/security (A02/A08–A12). Neither
passing mocked adapters nor backend unit tests establish those UI gates.

**Test that rejects another lookalike:** boot the actual Linux entry against an
authorized disposable vault containing a BOM/mixed-EOL MDX fixture and another
note. Verify that the product's owning SourceEditor and shared application
controller receive the adapter (structural import/route assertions accompany
behavior). Edit a Markdown node in Preview, switch notes and back, undo/redo via
keyboard while writes are delayed; observe exact real-file bytes
without Save, including invalid MDX/TeX. Inject an older same-byte projection
after edit/undo and a late callback after session retirement: both must be
rejected while a valid late callback for a still-open originating note survives.
Then interact with a stateful imported React component in that same document,
confirm no disk/source change from its button, Stop before expiry and type/save
again; assert child cleanup and denied forged write/IPC/network requests. Assert
no NativeWorkspaceShell route or native browser iframe fallback. A screen with
matching styling or a separate native form cannot satisfy this journey. Until
the native runtime proof exists, the last portion is explicitly blocked, not
reported passing.

Subsequent evidence: `485de38` supplies guarded autosave subscriptions and native
creation; the current editor-only vault adapter is a separately reviewed packet.
The newer input diagnostic supplies pointer/targeted Stop observations only;
normal keyboard, React and full installed acceptance remain open. See
[implementation status](../IMPLEMENTATION_STATUS.md) for current evidence instead
of treating this snapshot as an unchanging backlog.
