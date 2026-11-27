# Shared ProductRoot and local-vault slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The coordinator assigns exclusive files and requests independent contract review before implementation; this document alone does not activate an entry point or authorize a native experiment.

**Goal:** In the actual Linux application, choose a vault, open/create a note, edit it through the existing Source/Preview document surface, and observe automatic exact writes to its real file through one product controller and ProductRoot.

**Architecture:** Move compatible existing WebApp product interaction and chrome into a platform-independent ProductRoot; compose it with the existing nativeWorkspace, DocumentSessions and SourceSession authority. Select platform services before mounting. Native React is explicitly unavailable until the separate native runtime gates pass; no browser execution or storage fallback is installed.

**Tech Stack:** Existing React/TypeScript, CodeMirror/ProseMirror, built-in plugins, nativeDocuments IPC and descriptor-based Rust Store. No new editor, dependency, community loader or filesystem permission.

**Spec:** [PRODUCT_CONTRACT](../PRODUCT_CONTRACT.md), [ARCHITECTURE_TARGET](../ARCHITECTURE_TARGET.md), [PRODUCT_ACCEPTANCE](../PRODUCT_ACCEPTANCE.md), and the existing [migration plan](unified-local-vault.md). Contract IDs: PRODUCT-01, UX-01, EDIT-01, MATH-01, DATA-01/02, REACT-01, SECURITY-01, PLUGIN-01, SCOPE-01.

## Task contract and global constraints

- **Outcome:** The installed Linux entry uses the extracted product interaction to edit an authorized vault file; normal typing, undo and redo write to disk without Save.
- **Invariants:** One canonical source/history authority; exact bytes and source/session/disk revisions; pending-draft and close admission; retained failures; existing editor/runtime isolation; no deletion or silent migration of browser data.
- **Witness:** Choose a disposable folder in the real OS dialog, open its mixed-EOL note, type in the document, and read the changed file independently while the application remains open.
- **Done:** The slice passes its installed file journey, independent contract review and required checks. Runtime containment, full file lifecycle and additional platforms remain separately blocked/unimplemented; passing this slice does not establish A01–A12 completion.
- Architecture quality first; reuse compatible behavior rather than cloning the rejected NativeWorkspaceShell or preserving browser coupling wholesale.
- Source and Preview only. No Split/X selector, math subeditor, metadata-title input, manual-Save primary workflow, native separate-preview substitute, cloud activation or new backend scope.
- Linux first. Existing browser reference behavior/data remains accessible during migration. Do not claim web/mobile vault support or production-root convergence before actual entry composition and target evidence.
- No native GUI, VM provisioning, runtime execution, deployment or permission change is authorized by this plan. The coordinator schedules existing approved validation separately.

## Review focus

1. A late save/open callback belongs to its original session, even after selection changes; it cannot update the newly selected note.
2. A pending IME/unapplied draft or failed write must survive navigation and attempted close; the native dirty/busy protocol cannot briefly advertise false durability.
3. An external writer wins disk ownership until explicit resolution; Retry must never silently adopt a competing baseline.
4. An existing browser installation may contain assets, Trash and retained attempts as well as notes; extracting chrome must neither clear nor silently hide its recovery path.
5. A large inventory may exceed the loaded/compiler graph budget; opening another note must not reinterpret the vault as a 32-note library or evict unsaved text.

## Boundaries and exact ownership

| File                                                                                                    | Responsibility in this packet                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create `src/product/ProductRoot.tsx`                                                                    | Own product navigation, selected-document interaction, command admission, Source/Preview selector, passive title, settings/notifications and DocumentSurface composition. Move compatible code from WorkspaceBody; do not copy its visual design into a new native shell. No `isTauri`, invoke, WebState, browser persistence or platform-app render slots. |
| Create `src/product/productApplication.ts`                                                              | Typed application observations/commands below; presentation preferences are not document contents. This is a port, not a serialized workspace or second source store.                                                                                                                                                                                       |
| Create `src/product/useProductApplication.ts`                                                           | Cached structural subscription, with render-to-subscribe reread and retirement semantics matching `useDocumentSession`. Observe the selected session through the existing hook rather than mirror source into React state.                                                                                                                                  |
| Create `src/application/nativeProduct.ts`                                                               | Compose existing nativeWorkspace and session controller into the product port; map inventory to navigation and aggregate all loaded-session save/draft/close state. Own lifecycle admission, not another history or native grant registry.                                                                                                                  |
| Create `src/desktop/nativeProductServices.ts`                                                           | Capture existing nativeDocuments ports, private identity generation, existing native dirty/busy and recovery services. Native grants stay here/inside existing native bindings. No generic path I/O, new IPC command or runtime adapter.                                                                                                                    |
| Modify `src/web/WebApp.tsx`                                                                             | Extract compatible actual markup/handlers and imports into ProductRoot. Preserve browser-only storage/attachment/backup/Trash behavior in the reference until its own real adapter is accepted. Record precisely which interactions moved and which remain reference-only.                                                                                  |
| Modify `src/web/EditorEntry.tsx`, `src/main.tsx`                                                        | Compose bootstrap services before ProductRoot initialization and, only after the activation gate, select the native product composition. Preserve `/engine` as explicitly historical regression coverage and the browser reference entry/data. Do not conceal divergence behind one import or wrapper.                                                      |
| Adapt `src/application/nativeWorkspace.ts`, `src/application/documentSessions.ts`                       | Only missing slice use cases: explicit retry, truthful aggregate close admission and retained-attempt resolution after recovery acknowledgement. Keep existing scoped acquisition/refusal and uncertain-close semantics.                                                                                                                                    |
| Reuse `src/workspace/DocumentSurface.tsx`, `DocumentNavigationRow.tsx`, `useDocumentSession.ts`         | Existing presentation/observation; no additional leaf-only extraction milestone.                                                                                                                                                                                                                                                                            |
| Adapt `src/editor/SourceEditor.tsx`; reuse `src/editor/sourceWitness.ts`, `src/application/autosave.ts` | Add `sourcePath?: string` for logical syntax identity; existing session-backed history already uses `sessionId ?? documentKey`. Preserve that history behavior, accepted receipts and serial latest-write scheduling.                                                                                                                                       |
| Tests                                                                                                   | Create `tests/unit/native-product.test.ts`, `tests/unit/product-root.test.tsx`, `tests/e2e/shared-product-vault.spec.ts`; extend native workspace/session controls and existing installed document-fidelity driver for the exact app entry.                                                                                                                 |

### Auditable extraction, including both real callers

The following table fixes the extraction boundary against the current `src/web/WebApp.tsx`; function names and interaction labels are the anchors when line numbers move. Create these shared implementations inside Task1 and replace the original browser implementations with imports in that same packet. Both WebApp's reference composition and ProductRoot must consume the actual implementations below. Sharing passive chrome or CSS alone does not satisfy this task; do not add `WorkspaceChrome` as a facade or accept platform-app/panel slots.

| Existing WebApp implementation                                                                                                                                                                 | Shared destination and typed inputs                                                                                                                                                                                                                                                                                                                                                                                                                                | Both callers' use and required witness                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WorkspaceBody `canLeaveDraft`, `switchMode`, `openDocument`, `moveHistory`, pending-location source reveal, and mode focus ownership                                                           | `src/product/useWorkspaceInteraction.ts`: `useWorkspaceInteraction(input: WorkspaceInteractionInput)` owns admission, mode/selection history and reveal/focus sequencing. Inputs: current document identity/path, synchronous `canLeave(): boolean`, `open(id): Promise<void>`, `selectLoaded(id): void`, `setMode(mode): void`, editor commands/source-panel refs and source-witness validator. Output: the named shared handlers plus back/forward availability. | Browser supplies narrow callbacks into its existing model; native supplies ProductApplication commands. Neither copies these handlers. Run the same pending-draft, switch/open, stale-source navigation and Source/Preview focus cases through both callers.           |
| WorkspaceBody hover effect using `createHoverIntentController`, `closePeek`, `openLeft`, `openRight`, mode-island/handle focus-pointer-touch handlers, floating panel buttons and mobile scrim | `src/product/WorkspaceNavigation.tsx` owns these handlers and their existing markup. Inputs: mode/availability, shared interaction handlers, side-panel open state and setters; no storage model or arbitrary React children.                                                                                                                                                                                                                                      | Both callers render this component and use the same pointer/keyboard/touch lifecycle. Existing hover controller remains unchanged. Source/Preview only, with no Split/X or duplicated native controls.                                                                 |
| `DocumentTitle` and owning header's selected path/title behavior                                                                                                                               | `src/product/DocumentHeader.tsx`: passive title/path and existing editor-action callbacks, with concrete read-only/save-status inputs.                                                                                                                                                                                                                                                                                                                             | Browser derives display title from existing metadata; native derives it from immutable loaded-session metadata. Neither adds title editing or independent history.                                                                                                     |
| WorkspaceBody command result selection, `runCommand` dispatch, command-dialog keyboard navigation and focus restoration                                                                        | `src/product/DocumentCommandPalette.tsx` plus filtering/format-action helpers in `useWorkspaceInteraction.ts`: `commands: readonly { id: string; label: string; description: string; enabled: boolean; run(): void }[]`, document-open results and the shared interaction handlers. Move `Dialog` to `src/ui/ProductDialog.tsx` for the same focus trap/restore implementation.                                                                                    | Both callers use the same filtering/keyboard/dispatch implementation. Browser-only commands are explicit extra command records in the reference; absent native capabilities create no command/no successful no-op. Storage-specific command bodies stay browser-owned. |
| Settings Core plugins/Appearance source-visibility controls and existing theme/plugin handlers                                                                                                 | `src/product/CorePluginSettings.tsx`: theme, CorePluginSettings, PreviewPreferences and typed setters; `onReactDisabled(): void` retires the explicit runtime request.                                                                                                                                                                                                                                                                                             | Both callers consume the actual controls/handlers. Browser storage/recovery/Trash/update settings remain in the reference; native settings expose only implemented services. Toggles do not edit source/history.                                                       |
| WorkspaceBody's existing DocumentSurface editor bindings, shared DocumentNavigationRow selection actions and minimal notification presentation                                                 | ProductRoot composes the existing DocumentSurface/rows with SourceSession and `useWorkspaceInteraction`; WebApp replaces common interaction calls with the shared handlers while retaining its existing storage binding. Notifications continue through the existing provider.                                                                                                                                                                                     | Assert no second native editor/controller, no native copies of shared handlers, and no WebState/native conversion. Exact source/undo and notification tests exercise the actual callers, not isolated lookalike fixtures.                                              |

Browser-only tree drag/reorder, attachment import/gallery, virtual folder/Trash/reference rewriting, browser/cloud recovery/storage/update operations and their command bodies remain in WebApp. Do not pretend those are real vault operations. Extraction must preserve their existing reference tests and data. Additional shared files in this table belong to the integrated Task1 ownership set; they are not separate leaf milestones.

The browser reference is a protected migration asset, not an alternative new product. This packet must not make it use native file semantics or feed nativeProduct a fake WebState. Keeping it temporarily on its existing entry is an explicit incomplete convergence state. A future browser adapter must use ProductRoot/application contracts and actual browser authority; only then may the reference production route be retired after data acceptance. Do not count the informational entry audit as proof of that work.

## Application interfaces

Use domain observations, not `ReturnType<typeof useWebWorkspace>`:

```ts
interface ProductNavigationEntry {
  logicalPath: string; // validated vault-relative display/open identity, never a grant
  bytes: number;
  loadedSessionId: string | null;
}
interface LoadedProductDocument {
  readonly sessionId: string;
  readonly logicalPath: string;
}
interface ProductSnapshot {
  vaultLabel: string | null;
  entries: readonly ProductNavigationEntry[];
  loadedDocuments: readonly LoadedProductDocument[];
  selectedSessionId: string | null;
  operation: 'choose' | 'index' | 'open' | 'create' | 'close' | null;
  error: string | null;
  unresolvedCleanup: number;
  closing: boolean;
}
interface ProductApplication {
  snapshot(): ProductSnapshot;
  subscribe(changed: () => void): () => void;
  readonly documents: Pick<
    DocumentSessions,
    'state' | 'subscribe' | 'setUnapplied'
  >;
  session(sessionId: string): SourceSession;
  loadedDocument(sessionId: string): LoadedProductDocument;
  chooseVault(): Promise<void>;
  refreshInventory(): Promise<void>;
  open(logicalPath: string): Promise<void>;
  create(logicalPath: string, initialSource: string): Promise<void>;
  select(sessionId: string): void;
  retrySave(sessionId: string): Promise<void>;
  retainAttempt(sessionId: string, batch: SourceBatch): Promise<void>;
  resolveAttempt(
    sessionId: string,
    batch: SourceBatch,
    action: 'keep' | 'discard',
  ): Promise<void>;
  closeDocument(sessionId: string): Promise<void>;
  prepareClose(): Promise<void>;
}
interface NativeProductServices {
  setCloseState(state: { dirty: boolean; busy: boolean }): Promise<void>;
  preserveAttempt(input: {
    sessionId: string;
    logicalPath: string;
    batch: SourceBatch;
  }): Promise<{ durable: boolean }>;
}
interface AggregateCloseAdmission {
  flush(): Promise<void>;
  assertCurrent(): void;
  abort(): void;
}
```

`nativeProduct` observes nativeWorkspace rather than allocating another canonical files map. `snapshot()` returns a stable cached object until a structural change; session save/source notifications stay on `documents`. Derive immutable `loadedDocuments`/`loadedDocument(id)` from the existing `NativeWorkspaceAssociation` records, independent of inventory rows; return copies/readonly values and reject retired IDs. A refresh may remove a row but must not remove or retarget an already-loaded session. ProductRoot obtains the syntax path, passive filename and recovery identity from `loadedDocument(id)`, never from `entries.find(...)`. A reopened file receives a fresh session identity; editor history is keyed by session, syntax by its captured logical path. Real rename/move must later explicitly update this association under its own operation contract.

`ProductRoot({ application, services })` receives trusted preferences/lifecycle services and optional explicit runtime renderer seams. Preferences contain mode/theme/core-plugin/source-visibility settings, never note content. The native bootstrap supplies no runtime renderer. Whole-document execution controls are unavailable and JSX islands use the existing unavailable presentation; supported Markdown/math Preview remains editable. Module files open in Source. No dependency enumeration/loading for an inactive runtime is necessary in this packet.

SourceEditor already keys session-backed history by `sessionId ?? documentKey`; syntax previously fell back to `documentKey`. Add only `sourcePath?: string` with `const path = sourcePath ?? documentKey ?? 'note.mdx'`; preserve existing callers' defaults. ProductRoot supplies `source` from the observed witness, `session: application.session(id)`, `documentKey: id`, `sourcePath: logicalPath`, and shared histories. The outer DocumentSurface mount key is also the session ID. `onChange` is observational only; it must not publish the accepted edit a second time. Bind pending callbacks to the captured session ID through `documents.setUnapplied`, not the current selection. Failed publication remains a retained SourceBatch; preview/runtime messages never receive these commands.

## Task 1: Compose the actual product interaction with real native sessions

**Files:** ProductRoot/application/hook/nativeProduct/services and the existing WebApp/surface/session tests listed above. No native entry activation yet.

**Interfaces:** Consume `createNativeWorkspace(ports, newSessionId)`, its `session(id)`/controller observations, and existing SourceEditor session support. Produce `createNativeProduct(workspace, services): ProductApplication` and `ProductRoot` with the interface above.

- [ ] Record baseline actions and screens from the existing reference: choose/open navigation affordances, keyboard command admission, Source/Preview hover/focus/touch behavior, passive title, plugin settings and minimal notices. Review against UX-01, not the rejected native shell's tests.
- [ ] Add failing `product-root` tests that mount the real ProductRoot with a nativeProduct/controller and held native save port: choose → inventory → open → Preview edit must publish through SourceSession and schedule save without a Save action. Assert no browser database opens, no native runtime starts, and no copied source state/onChange second publication exists.
- [ ] Extract the compatible current interaction and compose the complete flow. Keep unsupported browser-only operations out of the active native command set; do not install successful no-op handlers for rename/move/Trash/attachments. Create uses an explicit validated relative filename and existing collision-safe native creation.
- [ ] Complete every row of the extraction table in both actual callers; remove the original shared handler bodies from WebApp. Independent review traces imports and events from browser and native compositions and rejects duplicated native handlers, passive-chrome-only sharing or a panel-slot wrapper even if screenshots match.
- [ ] Add selection/history witnesses: switching retains each loaded session's exact undo state; stale callbacks cannot retarget writes; unapplied math/IME/recovery text blocks selection; switching Source/Preview preserves the owning editor and introduces no independent math field or Tab stop.
- [ ] Pin separate identity semantics: an opaque session ID with logical path `plain.md` keeps braces/imports ordinary Markdown; `component.mdx` retains MDX parsing; reopen under a fresh session cannot inherit the retired session's history even when path/source bytes match. Implement the `sourcePath` prop without changing legacy defaults.
- [ ] Refresh inventory so the selected loaded note's row disappears, while its session remains open. SourcePath, Preview parsing, Source/Preview history, pending-draft admission and recovery filename must still use the captured association. The loaded note remains reachable as an open session; no inventory lookup can replace its identity or discard it.
- [ ] Add large-inventory witness with more than32 entries and a bounded loaded set. Inventory navigation works; a capacity refusal retains current notes and explains how to close a durably saved session. No automatic eviction of pending/failed sessions.
- [ ] Run `npx vitest run tests/unit/product-root.test.tsx tests/unit/native-product.test.ts tests/unit/document-surface.test.tsx tests/unit/native-workspace.test.ts`, plus strict types/lint for affected files. Expected: no failures. Review the moved interaction against baseline and owner contract before committing this coherent packet.

## Task 2: Complete close, conflict and recovery admission before native activation

**Files:** nativeProduct/services; only necessary controller extensions in nativeWorkspace/documentSessions; focused tests. Existing native IPC and Store remain the backend. If existing lifecycle primitives cannot meet the witness, stop entry activation and bring the concrete gap to independent review; this plan does not authorize an improvised backend/permission expansion.

**Interfaces:** `retrySave(id)` reuses `AutosaveCoordinator.retry` through a narrow controller method; it keeps the current expected disk revision. `prepareClose()` is an aggregate admission transaction, not a UI-only `closing` flag. Per-document close continues through nativeWorkspace/controller ownership.

**Existing gates and the concrete gap:** `DocumentSessions.validate()` already rejects publication unless `entry.phase === 'open'`; `close(id)` sets that phase to `closing` synchronously before its first await and rechecks unapplied/retained text before and after native close. `setUnapplied()` and `retainFailure()` can still record work during a held close, correctly invalidating its clean assumptions. However, the existing API cannot synchronously put _all_ sessions through that admission gate: nativeWorkspace serializes individual operations, and looping `flush()` alone leaves direct editor `SourceSession.publish()` callable. The existing native `set_documents_dirty` booleans also do not themselves constitute an aggregate acknowledged-close transaction. These are explicit preactivation gaps, not assumed capabilities.

Add `DocumentSessions.beginAggregateClose(): AggregateCloseAdmission`, using its existing entry phases and validation rather than a parallel source gate. It must synchronously snapshot the loaded identities and put every admitted open entry into `closing` before any flush/IPC await. The admission exposes `flush(): Promise<void>`, `assertCurrent(): void`, and `abort(): void`; it remains held through all native close-state acknowledgements. SourceSession validation/publication then rejects even a direct call bypassing ProductRoot. Pending/draft reports and retained failures are still captured; any arrival invalidates `assertCurrent()` and prevents clean release. Do not reject/drop the report merely to keep a close token valid. New acquisition, selection replacement and unrelated lifecycle operations are refused while the admission is held.

`nativeProduct.prepareClose()` obtains that admission before flushing. It keeps native close protection asserted until successful flush, unchanged identities/revisions, no drafts/retained failures/durability errors, and the corresponding native acknowledgement have all been verified. The editor stays mounted/read-only until admission is resolved. If failure occurs before any native release, abort restores the exact sessions to open and retains edits/drafts. A lost/rejected acknowledgement after possible native release is uncertain: keep affected sessions and close protection, expose uncertainty and do not reuse/rebind grants or silently reopen them. A frontend command flag, React readOnly prop, or pre-await state check does not satisfy this contract.

Implementation must demonstrate a safe release using the _existing_ editor-only dirty/busy/native-close protocol, including late draft arrivals during its acknowledgement. If that protocol cannot prevent a clean/closable native state while such an arrival remains unresolved, stop native entry activation and bring that concrete handshake gap to independent review. This packet does not authorize a new native command, broad write freeze, permission or best-effort close workaround. Tests passing only controller flush do not close this gap.

- [ ] Write held-write tests: acknowledge revision1 while revision2/3 arrive; only the written revision becomes persisted and the latest source is eventually written. Verify undo/redo autosave, and blocked writes do not stop edits to an unrelated note.
- [ ] Write external-conflict tests using the existing real Store session harness: another writer changes the original; the next autosave refuses and preserves both disk contents and the edited buffer. Retry cannot silently rebase/overwrite. Expose retained source and explicit safe retry; do not offer an unimplemented overwrite or false reload resolution.
- [ ] Implement the aggregate phase admission and bind all loaded-session pending/writing/blocked/durability states, drafts, retained attempts and unresolved grant cleanup to the existing editor-only native dirty/busy/close protection. Verify the immediate edit → OS-close race, not only a delayed click after React effects. Do not clear protection merely because the selected note is saved.
- [ ] Connect existing versioned native recovery to accepted pending/blocked snapshots and retained attempts with session/revision association. Recovery is secondary to autosave. An acknowledged original-file save may retire its obsolete recovery record; a failed or uncertain recovery acknowledgement cannot authorize draft discard or claim durability. Reopening/restoring recovery is explicit and never silently overwrites an external file.
- [ ] Provide `resolveAttempt(id, batch, action)` through existing minimal notification/recovery UI. `keep` calls `preserveAttempt` and clears only the matching retained SourceBatch after a durable acknowledgement; failed/uncertain acknowledgement leaves it retained. `discard` requires the explicit warned user action and clears only that exact batch. Download remains available without implying that an unacknowledged download is durable recovery. Neither action changes canonical source or clears other sessions' failures.
- [ ] While aggregate flush is held, call an already-issued `SourceSession.publish()` directly and assert rejection/no writer call; do not test only disabled product commands. Call `setUnapplied(id, true)` and `retainFailure(batch)` for another loaded session during the same hold and assert the reports survive, close aborts, and no clean native hint is sent. Existing sources/history must remain exact after rollback.
- [ ] Hold the native close-state acknowledgement after flush, then deliver an edit attempt/unapplied report. Assert no source publication or grant release, no clean/closable hint while the attempt is unresolved, and retained text remains accessible. Cover pre-release refusal versus lost/post-release acknowledgement separately: only the former restores open phases; the latter remains explicitly uncertain with identities retained. Include a successful all-session close and a no-change close control.
- [ ] Test close during a rejected save, unapplied IME, recovery failure, uncertain close, and a clean successful flush. Normal close either finishes safely or visibly blocks; explicit discard remains an explicit warned action. Preserve original acquisition/cleanup refusal controls. If the held-native-ack test exposes the existing protocol gap above, mark activation blocked rather than weakening its assertion.
- [ ] Run the focused tests above plus the relevant existing autosave/session/native-binding/recovery controls, then obtain independent data-safety review. Do not activate the native entry with a known close/conflict/recovery gap.

This slice detects competing external writes through existing revision-checked Store publication and offers explicit inventory refresh/reopen only where safe. Continuous watching and automatic adoption of clean external changes are not implemented by that mechanism; A05 remains partial until their own real observation/reconciliation flow is accepted. No silent overwrite is acceptable during this interim.

## Task 3: Activate and verify the installed vault-to-disk slice

**Files:** EditorEntry/main bootstrap, product tests, existing installed fidelity driver, migration status/evidence. No separate native shell, browser fallback or general MDX activation.

- [ ] Add an entry-level failing test that follows the actual native bootstrap into ProductRoot and the real nativeProduct composition. Assert the rejected NativeWorkspaceShell/legacy App are not the native product fallback; preserve `/engine` only as historical regression coverage.
- [ ] Activate native composition after Tasks1–2 review. Before touching browser routing, seed its existing reference with notes, assets, Trash and retained attempts and verify exact portable backup/export and reopening before/after the extraction. Keep storage keys/databases and the original origin intact; no startup clear, implicit conversion or cleanup.
- [ ] Run the real product flow in the pinned browser with controlled native transport to distinguish product semantics from OS I/O. Test same-session Source/Preview/history, long inventory, rejected operation admission, unavailable native runtime and absent browser-storage fallback. This is not installed/native evidence.
- [ ] Freeze relevant inputs and run `npm run check`, the existing affected Rust document checks, and `npm run product:audit`. Report direct entry divergence honestly; do not change the audit to bless a wrapper or treat its exit zero as convergence.
- [ ] When the coordinator has an approved disposable Linux validation slot, launch the exact installed candidate through its real entry. Select a disposable vault with the real OS chooser; inventory >32 notes; open a BOM/CRLF/Unicode/import/comment/JSX fixture; type in Source and supported Preview and independently read exact file bytes without Save. Repeat invalid TeX/MDX, rapid edits, undo/redo, switching notes, new file creation and actual restart/reopen. Record edit-to-disk latency and exact artifact/input identity.
- [ ] In that same platform scope, use an independent external writer and an approved filesystem failure fixture to verify conflict/no-overwrite, write-error retention, safe retry, permission/sibling preservation, pending-close refusal and explicit recovery. A mocked IPC response or prior Store pass does not satisfy this witness. Preserve failures; do not retry into a declared pass or relax sandbox/permissions.
- [ ] Independent review compares actual actions/screens/bytes with A01–A08/A12 and this scope, then updates status and the living migration plan. State separately: native local-vault slice proven/unproven; browser reference preserved/unproven; root convergence incomplete/complete by actual composition; A09/A11 still blocked; real rename/move/Trash and continuous external observation still pending.

## Completion and next boundary

The deliverable is a usable, source-safe local-vault slice using actual extracted product interaction, with exact installed evidence or an explicit activation blocker. It is not another leaf milestone or an accepted replacement product. The next product work is real file lifecycle and eventual browser composition through this same application contract; native React activation still requires repeatable startup/input/geometry and the complete denial/resource/security matrix. All six owner decisions already authorize this design direction. Ask again only if an engineering result would require changing those product/security requirements.

## Task1 implementation checkpoint — 27 November 2026

The UI packet now implements ProductRoot with actual nativeProduct/DocumentSessions/SourceSession bindings and both callers consuming the shared extraction table. WebApp retains browser-specific storage, attachments, Trash and backup commands; entrypoints remain unchanged. SourceEditor history was not refactored: its independently tested sourcePath addition separates logical parsing from the existing session history key.

Observed development witnesses: the initial real ProductRoot/controller test failed before ProductRoot existed, then passed choose/open/SourceEditor receipt/autosave with a held injected OS writer and exact BOM/CRLF. A shared command-list/filtering test failed before extraction and passed afterward. An awaited-open test reproduced stale application history after replacement and passed with scope/request retirement. The supported per-document close/reopen command also had a failing missing-command witness before implementation.

Latest focused run: `npx vitest run tests/unit/product-root.test.tsx tests/unit/shared-workspace-interaction.test.tsx tests/unit/document-surface.test.tsx tests/unit/source-editor-source-path.test.tsx tests/unit/native-product.test.ts tests/unit/native-workspace.test.ts` — **94 passed**, six files. This includes eight actual ProductRoot flows and seven shared interaction/control cases, direct Preview DOM text publication, loaded identity after inventory disappearance, 40-note inventory, synchronous IME draft admission, exact history, fresh reopened session identity, and a refused visual edit whose recovery is not labelled saved without a durable receipt. OS ports are injected; this is not actual native dialog/filesystem or installed acceptance.

Independent source trace review found no concrete blocking extraction/source issue. Strict TypeScript, owned-file ESLint, formatting and diff whitespace checks passed after the final helper extraction. Root-owned browser/full checks remain separate gates. No default entry activation, native runtime, server, installed test, deployment, or production-root convergence is claimed by this checkpoint. Whole-application native close remains blocked on the reviewed handshake gap; ProductRoot does not invoke or advertise successful aggregate prepareClose.
