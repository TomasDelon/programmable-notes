# Shared code fit assessment — 26 November 2026

Bounded source inspection at `dc60a3d` on `fix/preview-markdown-input`.
This report changes no application behavior, dependencies or security authority.
It supports PRODUCT-01, EDIT-01, MATH-01, REACT-01, SECURITY-01 and DATA-01/02;
acceptance remains A01–A12 in [PRODUCT_ACCEPTANCE](../PRODUCT_ACCEPTANCE.md).
The [product contract](../PRODUCT_CONTRACT.md) and
[target architecture](../ARCHITECTURE_TARGET.md) govern the recommendations.
The current [status](../IMPLEMENTATION_STATUS.md) explicitly rejects the separate
native shell and records manual saving/separate-window execution as gaps.

## Dependency-level treatment

| Area and actual dependencies                                                                                                                                                                                                                                                                            | Treatment and concrete boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [rawSource.ts](../../src/editor/live/rawSource.ts), [sourceCoordinates.ts](../../src/editor/live/sourceCoordinates.ts), [compositionHistory.ts](../../src/editor/live/compositionHistory.ts): CodeMirror state/text, inverse history effects and exact physical line-break maps                         | **Reuse.** The LF editor document is a projection; `rawSourceField` carries exact source. Keep custom inverse effects and immutable history objects. JSON history serialization loses those effects. These modules require no filesystem or browser database.                                                                                                                                                                                                                                                                                                                              |
| [SourceEditor.tsx](../../src/editor/SourceEditor.tsx): CodeMirror, MarkdownEditor, rendered editor, math helpers, links, portals                                                                                                                                                                        | **Reuse/adapt.** It already routes source, rendered patches and undo/redo through the owning CodeMirror history and checks candidate acceptance before publishing. Its current API has `onChange(string)`, `acceptChange(string)` and string freshness witnesses, not a typed accepted source revision. Add identity/revision at this host boundary; do not introduce a second history in persistence. Keep accepted-byte publication synchronous before dependent rendered layout effects.                                                                                                |
| [markdownEdits.ts](../../src/editor/markdownEdits.ts), [sourceBridge.ts](../../src/editor/rendered/sourceBridge.ts), [RenderedEditor.tsx](../../src/editor/rendered/RenderedEditor.tsx)                                                                                                                 | **Reuse/adapt.** Parser-owned spans, conservative serialization and protected opaque nodes are valuable. Keep source/context validation, analysis limits and retention of unapplied attempts. Make a projection's source witness include document identity/editor revision; equal source strings after undo are insufficient history identity. Do not persist ProseMirror output independently of the accepted raw transition.                                                                                                                                                             |
| [mathSource.ts](../../src/editor/math/mathSource.ts), [mathSyntax.ts](../../src/plugins/core/mathSyntax.ts), [math.ts](../../src/plugins/core/math.ts), [coreRegistry.ts](../../src/plugins/coreRegistry.ts)                                                                                            | **Reuse.** Shared source analysis and trusted built-in allowlist fit the target. KaTeX validity is presentation feedback, never save permission. Retain incomplete-dollar handling, invalid raw/red display and safe KaTeX limits. Literal-dollar provenance/reopening limits remain declared gaps; do not derive intent from saved-byte equality.                                                                                                                                                                                                                                         |
| [react.ts](../../src/plugins/core/react.ts), [compileDocumentSource.ts](../../src/compiler/compileDocumentSource.ts), [compiler.worker.ts](../../src/compiler/compiler.worker.ts), [resolve.ts](../../src/compiler/resolve.ts), [workspaceDependencies.ts](../../src/compiler/workspaceDependencies.ts) | **Reuse/adapt.** Host AST chooses island source; compiler resolves virtual local modules and pinned runtime packages. Keep `.md` ordinary Markdown, exact case-sensitive module identity and dependency-read/resolution witnesses. Product transforms currently depend on `webMode`; rename/extract this policy deliberately when sharing compilation rather than allowing the legacy/native path to silently choose another grammar. Compiler snapshots must be read-only and independent of autosave.                                                                                    |
| [workspace.ts](../../src/documents/workspace.ts), [useDocuments.ts](../../src/documents/useDocuments.ts), [native.ts](../../src/documents/native.ts)                                                                                                                                                    | **Extract/adapt.** Native `Binding.id/revision` and `completeSave(snapshot, expectedId)` already protect a captured save from marking later bytes saved or rebinding another grant. `change` publishes accepted bytes synchronously and captures the originating key. Replace manual-save orchestration and scattered `isTauri()` selection with injected services. `Workspace.sequence`, `opened-N/...` keys, grouping and the 32-file limit describe opened/compiler buffers, not durable vault identity or inventory.                                                                   |
| [useWebWorkspace.ts](../../src/web/useWebWorkspace.ts), [web/workspace.ts](../../src/web/workspace.ts), [storage.ts](../../src/web/storage.ts), [persistence.ts](../../src/web/persistence.ts)                                                                                                          | **Extract compatible use cases; replace authoritative persistence.** The hook's serialized drain, latest pending snapshot and conflict/draft guards are useful behavior references. It also owns whole-workspace browser/cloud CAS, backups, attachments, metadata and view persistence. Its `generation` includes navigation/preferences; `revision` is a database revision. Neither is a per-document source revision. Metadata rename/move/Trash in `web/workspace.ts` do not perform real file operations; importing those functions as a vault adapter would falsely satisfy DATA-02. |
| [native-documents/lib.rs](../../native-documents/src/lib.rs), [linux.rs](../../native-documents/src/linux.rs), [vault.rs](../../native-documents/src/vault.rs), [Tauri documents.rs](../../src-tauri/src/documents.rs)                                                                                  | **Reuse writer/grants; extend vault services separately.** The Store exposes grant/revision CAS and Linux descriptor-relative atomic writes. Folder loading currently collects all bounded sources and publishes per-file grants, rather than keeping a reusable root capability plus independent inventory/read/watch operations. Add those operations behind trusted editor authorization with negative tests. Do not expose absolute-path IPC or relax walker checks to make a larger vault load.                                                                                       |
| Full browser runtime: [WebApp.tsx](../../src/web/WebApp.tsx) → [useWebPreview.ts](../../src/web/useWebPreview.ts) → compiler worker/HTML builder → [WebPreview.tsx](../../src/web/WebPreview.tsx)                                                                                                       | **Adapt behind runtime services.** The hook owns 300 ms compile coalescing, a 15 s deadline, worker leases, stale generation rejection and error locations. The frame owns bounded presentation-only messages and opaque-origin isolation. Keep these as browser adapter behavior, not imports from shared product presentation.                                                                                                                                                                                                                                                           |
| Inline browser islands: [SourceEditor.tsx](../../src/editor/SourceEditor.tsx) → RenderedEditor → [RenderedRuntime.tsx](../../src/editor/rendered/RenderedRuntime.tsx) → `useWebPreview`/`WebPreview`                                                                                                    | **Adapt at the same runtime boundary.** This is a second direct browser execution path. Migrating WebApp's whole-document preview alone leaves browser iframes inside the native editor. Preserve the verified dependency witness used to retain unaffected island state, with bounded reset on code/dependency changes. Multiple native islands must share the enforced aggregate resource budget.                                                                                                                                                                                        |
| Native runtime: [NativePreview.tsx](../../src/preview/NativePreview.tsx), [native-operations.ts](../../src/preview/native-operations.ts), native supervisor/policy                                                                                                                                      | **Retain containment/evidence; presentation fit unresolved.** Ordered native start/stop and polling are useful. A supervised separate window does not meet A09. An adapter interface does not prove same-window containment/input/focus or A11; preserve that blocker.                                                                                                                                                                                                                                                                                                                     |
| Boot/presentation: [main.tsx](../../src/main.tsx), [EditorEntry.tsx](../../src/web/EditorEntry.tsx), [App.tsx](../../src/App.tsx), [WebApp.tsx](../../src/web/WebApp.tsx), [NativeWorkspaceShell.tsx](../../src/desktop/NativeWorkspaceShell.tsx)                                                       | **Converge after accepted seams exist.** Native currently selects App, browser selects WebApp, and App uses the rejected shell. Extract compatible presentation/use cases into one product tree initialized with adapters. Retire rejected product routes only after migration acceptance; retain test/evidence fixtures. Do not build a third shell or treat native-looking screenshots as A01.                                                                                                                                                                                           |

## Smallest useful typed persistence boundary

Introduce only the types required by the first autosave slice. They describe
semantics, not a new framework or a claim that backend operations already exist:

```ts
type DocumentId = string; // stable session identity; survives selection/path changes
type EditorRevision = number; // monotonic accepted transition, including undo/redo
type DiskRevision = string; // opaque adapter CAS token; never ordered by the editor

interface AcceptedSource {
  documentId: DocumentId;
  editorRevision: EditorRevision;
  source: string; // exact canonical raw string; no normalization/serialization
}
interface SourceWrite extends AcceptedSource {
  expectedDiskRevision: DiskRevision;
}
interface SourceWritten {
  diskRevision: DiskRevision;
  durable: boolean;
}
interface SourceWriter {
  write(input: SourceWrite): Promise<SourceWritten>;
}
```

The adapter maps `documentId` to its private authorized binding, invokes the
existing native grant writer, and returns its revision/durability result. It
must not accept an arbitrary filesystem path or receive document-runtime
messages. A closed/replaced binding invalidates that mapping. A document session
identity must never be reused for a later opening while an old write/callback
could complete. Native grant IDs may be mapped separately; Save As can change
the grant without changing the editor session. Brand the three types if needed
to prevent accidental interchange, without forcing broad migration now.

The shared coordinator needs one registered persisted baseline per document,
one in-flight exact snapshot, and its latest accepted pending snapshot. At actual
dispatch, use the disk revision returned by the preceding successful write;
do not retain the enqueue-time CAS token for the next write. Acknowledgement
advances only the written snapshot's baseline. It cannot mark a newer editor
revision saved, remove newer pending text, alter selection or discard another
document's late edit. Coalesce only superseded pending work. Compilation, TeX
validation and React interaction never enter this path.

Distinguish a failed write from `durable: false`: the latter means publication
occurred and returns a new disk revision, but crash durability is unconfirmed.
Keep an explicit warning/unsatisfied durability state; retry must use the new
disk token. Failure/conflict retains source and pending state, requires a
deliberate retry/resolution, and cannot make flush/close report success. A
transport rejection after a write may be an uncertain completion; re-read and
reconcile rather than blindly replaying with assumed authority.

Do not model an unbound newly created buffer as an autosaveable original. Real
create must produce a scoped binding/collision-safe file first. For subsequent
vault work, add opaque `VaultId`, validated root-relative path values and
separate `index`, `read`, `watch`, `create`, `rename/move`, `trash/restore` methods
as their concrete use cases land. Inventory must not embed all note text. Watch
events must cause trusted reread/revision validation and distinguish self-writes
from external versions; no unconditional replacement of dirty source. Avoid a
large speculative filesystem interface before those semantics are implemented.

## Invariants and migration hazards

- Preserve valid UTF-8 source exactly, including BOM, CRLF/mixed physical endings,
  whitespace, imports/comments and unknown JSX. Source offsets are UTF-16; file
  budgets are UTF-8 bytes. Do not round-trip canonical source through normalized
  CodeMirror text, rendered HTML, AST serialization or metadata JSON.
- Keep immutable per-document CodeMirror history and existing raw inverse
  effects. Undo/redo create accepted editor revisions and autosave; returning to
  identical bytes does not revive an old projection/revision. The current string
  witnesses are useful guards but do not solve this identity distinction alone.
- Preserve native ownership/read-only checks, no-follow descriptor traversal,
  regular-file/UTF-8 refusal, digest/inode conflict detection, mode/group/xattr/ACL
  preservation, temporary cleanup, file fsync and post-rename directory fsync
  reporting. Existing hardlink/race/error tests constrain reuse. The writer has
  a documented final-check/rename race against noncooperating same-user writers;
  do not claim a watcher or coordinator removes it.
- Native folder collection currently has depth/entry/source-count/byte budgets.
  Keep those protections while separating bounded compiler graphs from complete
  vault inventory. Raising `MAX_FILES` globally would conflate independent limits.
- Browser iframe messages accept only bounded error/size presentation data from
  the current null-origin frame; hash CSP denies network and other resources.
  Preserve this rule and the lack of any write/edit message. Browser sandboxing
  is not Linux CPU/memory/process containment evidence. Native IPC remains
  editor-only; native download denial, private networking, cgroup limits and
  mandatory WebKit sandboxing cannot be bypassed to embed React.
- Pending visual attempts belong to recovery, not original-file autosave. Keep
  drafts/diagnostics and accepted source separate; errors must not erase text.
  Browser auxiliary metadata or recovery storage cannot silently replace real
  vault files. Browser/cloud behavior is reference evidence only for this phase.
- Rename/move needs real path changes plus a safe explicit link/module strategy.
  Current virtual metadata updates and wikilink rewrites must not be activated
  as if atomic filesystem transactions. Revalidate remembered grants on restart.

## Next evidence

The isolated shared coordinator can be tested now without UI/native changes:
slow in-flight edits coalesce to the newest accepted revision; callbacks stay
bound through selection switches; per-document queues are independent; stale
acknowledgements and failed/uncertain durability cannot mark newer text saved;
undo/redo revisions persist even when bytes recur; conflicts retain both versions.
Existing regression anchors include
[raw-source-ending](../../tests/unit/raw-source-ending.test.ts),
[source-editor-conflict](../../tests/unit/source-editor-conflict.test.tsx),
[native-source-witness](../../tests/unit/native-source-witness.test.ts),
[rendered-source-bridge](../../tests/unit/rendered-source-bridge.test.ts),
[island lifecycle](../../tests/unit/rendered-island-lifecycle.test.tsx), and
[native Store tests](../../native-documents/tests/store.rs).

Subsequent adapter acceptance must observe real Linux files after typing,
undo/redo and invalid MDX/TeX, independently measure edit-to-disk latency, inject
permission/ENOSPC/fsync failures, exercise external writers and verify truthful
close. These are A03–A07 evidence, not consequences of passing controller tests.
No installed runtime, autosave latency, security or product-parity test was run
for this read-only assessment. Native inline React remains A09/A11 blocked until
the actual selected renderer proves the required journey and containment.
