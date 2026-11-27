# Living plan: coherent local-vault application

Updated: 26 November 2026. Scope: setup and subsequent architecture-led migration.
Requirements: [PRODUCT_CONTRACT](../PRODUCT_CONTRACT.md); engineering boundaries:
[ARCHITECTURE_TARGET](../ARCHITECTURE_TARGET.md); exit gates:
[PRODUCT_ACCEPTANCE](../PRODUCT_ACCEPTANCE.md). This plan does not authorize public
release, merge, paid services, history rewriting or weaker isolation.

## Purpose

Deliver one coherent application whose document is the actual local file, whose
accepted edits autosave, and whose real React components are interactive inline
without privileged execution. Linux first. Existing code is reused only where it
fits the architecture. Obsidian explains the local-vault persistence expectation;
it is not a UI/product to clone.

## Progress

- [x] Compose native vault selection, inventory, selective open/create and
      close in shared application use cases, reusing the canonical session and
      autosave owners. Unit controls and a real Store open/save/close/conflict
      witness pass. Confirmed no-effect acquisition refusals are typed; UI activation, uncertain
      outcome reconciliation and installed acceptance remain incomplete; see ADR037.
- [x] Implement/review share-free preparation and fixed OS-admission tooling;
      real image assembly, layout and complete hosted guest OS admission passed.
      The first native profile failed desktop startup before both cases; authored
      native interaction and full application acceptance remain pending.
- [x] Isolate inline editor execution behind an explicit trusted runtime renderer;
      web supplies its adapter and the shared default is unavailable. The explicit
      whole-document browser boundary is implemented too. Native adapters
      and the shared product workspace remain incomplete.
- [x] Owner's six questions answered; architecture-first reuse, inline React,
      local autosave, real file operations/Trash, Linux-first and rendering privileges
      recorded separately from engineering choices.
- [x] Existing handoff and web/native seams inspected; rejected shell and stale
      authority recorded. No application redesign/fix performed during setup.
- [x] Initial target architecture, acceptance gates and ordered work defined.
- [x] Read-only AST entry audit and fixture tests implemented; informational
      divergence cannot be presented as product readiness.
- [x] Local setup checks passed: 638 unit tests, 92 tooling controls, 150
      Chromium cases, 9 local Pages cases and 4 inactive-cloud cases. Current
      publication/head-CI evidence is tracked in draft PR #9; this is not
      application acceptance or a replacement app download.
- [x] Assess existing modules against the target and record concrete interfaces;
      see the dated shared code-fit report.
- [ ] Prove isolated native inline presentation and resource/lifecycle ownership.
- [x] Extract and verify the existing document panels as one shared leaf (ADR038);
      controlled native-session bindings and actual browser interactions pass.
      This is not a shared root or installed native acceptance.
- [ ] Extract the remaining shared product/use cases and platform ports without a
      second UI. Live session projection, navigation/storage/root composition
      remain separate work.
- [ ] Implement scoped local vault/index/file lifecycle and genuine autosave.
- [ ] Adapt both inline and full-document execution paths to platform services.
- [ ] Execute reusable interaction/fidelity acceptance and exact-package native
      persistence/security journeys; only then deliver the accepted editor candidate.
- [ ] Complete separately authorized signed distribution and installed updates.

## First autonomous work packet after setup

Read the contract and record the outcome, invariants, witness and done gates using
requirement/acceptance IDs. Build a dependency/fit map of the current SourceEditor,
patch/history engine, plugins, compiler, workspace controller, native file store
and both runtime paths. Record reuse/refactor/replace choices with reasons.
Specify the smallest typed interfaces necessary for that map; do not build a
speculative plugin marketplace or generalized backend framework.

In parallel, investigate native inline presentation with a bounded engineering
spike. Use actual React interactions and process/containment witnesses; do not
substitute a screenshot, ordinary iframe or a separate-window demo. Reuse current
supervision where it fits. Compare a narrowly scoped alternative only if evidence
shows the current host cannot satisfy the architecture. Stop unsuccessful design
loops, record the failed hypothesis and revise the approach before another patch.

This spike is not a user-facing application release. If suitable native
infrastructure is unavailable, record the precise blocker and proceed with safe
independent domain/adapter work; do not mark native inline/security acceptance done.

## Migration packets

1. **Shared domain and application ports.** Keep one canonical source/history
   authority, vault identities and use cases. Isolate browser storage/download/
   lifecycle assumptions and native IPC behind services selected before startup.
   Preserve useful behavior rather than preserving incompatible controller code.
2. **Local vault vertical slice.** Choose a vault, create/open a real note, type,
   observe automatic atomic persistence, switch and restart. Add watcher/conflict
   handling, latest-write scheduling, close protection and safe failure retention.
   Index the vault independently of bounded loaded/compiler files.
3. **Real file operations.** Add rename/move/Trash/restoration with scoped grants,
   external-writer/revision checks, reference strategy and collision-safe recovery.
   Do not activate controls backed only by browser metadata or no-op adapters.
4. **Runtime adapter integration.** Adapt both inline islands and full-document
   execution to the proven host service. Preserve same-window presentation,
   input/focus/scroll semantics and aggregate resource policies. Rendering never
   acquires document/file authority.
5. **Shared product integration.** Reuse/refactor compatible presentation into one
   product root/use-case flow. Implement Source/Preview/hover and other specified
   interactions in that product, then retire rejected production routing safely.
   Migrate useful fidelity/security cases from legacy shell tests; their current
   Split/X and fork-specific selectors are implementation history, not requirements.
6. **Exact installed acceptance.** Run A01–A12 on the exact candidate. Reproduce
   errors rather than accepting retries or deleting negative controls. Protect
   existing owner data during any migration/installation. Mobile/web compatibility
   remains a separate actual-target gate.

Packets may overlap only with independent file ownership, interfaces and test/server
ownership. Prefer a small number of useful workers with concise requirement-linked
briefs. The coordinator owns requirement reconciliation and integration, not merely
aggregation of workers that share the same untested premise.

## Validation and delivery discipline

Use a failing witness for a concrete bug and the cheapest discriminating probe.
Run the relevant engine/platform early. Run the required final checks after source
inputs stabilize; preserve unchanged-input evidence. Record commands, revisions,
artifact identity, observed results and missing gates. Keep one watcher per run.

The entry audit is deliberately narrow. Different bootstraps can wrap one product;
a common module can also hide divergence. Its strict flag checks direct identity
only. Extend/adapt audit fixtures to the reviewed architecture when necessary;
never restructure the product merely to satisfy a filename/entry heuristic.
Functional, semantic and native-security acceptance remain independent.

Before a user-facing delivery, inspect the actual boot route, artifact and the
acceptance matrix. Reject a different interface, hidden capability loss, lack of
autosave, separate-window substitute or a mock/native evidence substitution.
Update the contract, status and decision log together. If a required gate is
blocked, say so and continue safe independent work rather than declare success.

## Decision log

- 26 November, owner: architecture quality governs conditional reuse; preserve
  existing material for evaluation, not every implementation choice indefinitely.
- 26 November, owner: same-document/window React is required; untrusted rendering
  has no filesystem or privileged access.
- 26 November, owner: vault files are fully local and writing autosaves to real
  files; recovery is secondary; Obsidian is not a cloning brief.
- 26 November, owner: real rename/move/delete with recoverable Trash; Linux first.
- 26 November, engineering: source/core/file-safety work may advance independently
  while native inline feasibility is blocked, but cannot establish A09/A11.

## Discoveries and unresolved risks

Current boot chooses legacy App/native shell versus WebApp. Browser-specific
runtime dependencies exist in both WebApp and RenderedRuntime. Browser workspace
metadata/save semantics differ from a real vault; replacing a hook name is not an
adapter design. The current native window/expiry model does not yet prove inline
parity. Current green tests do not establish the new product contract.

## Outcomes and handoff

Setup is a specification/workflow deliverable, not application completion. Keep
this section and Progress current after each packet. Record actual commit/run
identities and remaining blockers; avoid replaying the whole chat. No future
agent should infer product approval from an implemented ADR or a green build.

## Active packet — 26 November 2026

- **Outcome:** DATA-01/A04 shared persistence coordination retains accepted source
  revisions and automatically schedules serialized writes through an injected
  document writer. This is a domain implementation, not activation in the rejected UI.
- **Invariants:** editor revision, document identity and disk CAS remain distinct;
  no normalization of source, no preview authority, no silent retries or overwrites
  after write uncertainty, no false durability or dropped in-flight edits.
- **Witness:** gated writer tests reproduce rapid edits, undo during an in-flight
  save, separate-document callbacks, stale revisions, conflicts and non-durable
  receipts. Native writer adapter retains existing opaque grants and CAS semantics.
- **Done:** bounded code-fit/native feasibility reports, tested coordinator and
  adapter, independent review, required full checks and a coherent pushed commit.
  Actual installed autosave and inline security remain separate uncompleted gates.

Engineering choice: implement a platform-independent coordinator before wiring a
shared product. Adapting the rejected shell directly would preserve the wrong
product boundary; embedding native execution without a containment proof would
violate A09/A11. Existing owner authorization covers this implementation packet;
no additional library/product-choice question is needed.

Packet observations: shared coordinator tests exposed and fixed uncertain-write/undo
and retired-session callback hazards. The real native Store harness passes and
its omitted-scheduling negative control fails as required. This validates backend
coordination, not active application autosave or installed A03–A05. A native CI
step now runs the harness. Final complete-check/run evidence belongs in the PR
and the dated receipt; no native inline acceptance is inferred.

Packet validation: full npm check exit 0 (663 unit, 150 Chromium, 9 Pages,
4 inactive-cloud); scanner-enabled tooling rerun 92 passed/zero skips; native
Store ordinary suite 51 passed/7 existing ignored; actual Store autosave and
post-publication lost-reply CAS controls passed. The negative scheduling control
failed exactly as required. See dated receipts under security-evidence.

Native inline outcome: two actual disposable Ubuntu GTK/WebKit diagnostics failed
to render before the fixed deadline. The new VM/container are stopped; failed
observations and exact small probes are retained. No parity/security gate is
checked off. Next work: an actual pinned-Wry embedding/lifecycle proof, while
shared vault/session/controller adapters can advance independently. Do not begin
a third shell or activate browser storage as local vault truth.

Inventory subpacket now implements the Rust retained-root metadata boundary with
11 filesystem tests and independent review; source loading keeps its old budgets.
See [its packet plan](vault-inventory.md) and ADR026. This completes an indexing
substep, not the whole vault lifecycle or any installed application gate.

Scoped lazy opening is implemented as another Rust-only substep (ADR027): 9 new
filesystem tests/71 native crate tests passed; independent review found no blocker.
No IPC/UI activation. The actual-Wry follow-up establishes partial same-window
GtkSocket/Plug painting, while input/React/Stop remain unproven. Next runtime probe
needs explicit readiness/input receipts, not another assumed-success screenshot.

Creation and status-observation subpacket completed at `485de38`: atomic scoped
no-replace creation, guarded asynchronous persistence subscriptions, 79 native
crate tests and the final full 673/92/150/9/4 check passed. These are foundations,
not active native product behavior. The follow-up Wry input packet established
ordinary pointer input and valid pre-expiry Stop; normal keyboard focus and real
React remain blocked. See the dated input receipt. Next independent source work
is the editor-only vault adapter and explicit source-session/revision receipts;
shared UI integration must not invent a third shell or activate privileged React.

Editor-only native vault service implemented: OS chooser plus token-scoped
inventory/open/create reuse the existing Store and captured descriptor root.
Cancellation/replacement/guard tests and independent review passed; final full
check 676 unit/96 tooling/150 Chromium/9 Pages/4 inactive-cloud passed. Actual
new-command GUI/ACL acceptance remains unexecuted and is a pre-activation gate;
see ADR030 and its receipt. Shared source-revision receipt work follows with
production callers disabled until its complete protocol is reviewed and tested.

Hosted CI at `32b1cd4` passed both required jobs (`45882998330`); dispatch-only
preview/native-preflight/deployment jobs were skipped, not executed. The subsequent
one-case normal-focus diagnostic missed readiness by its declared 44-second
window, so no component input or React ran. Trusted pre-expiry Stop completed in
0.83 seconds with working host input. Exact evidence preserves this bounded
outcome, infrastructure prerequisite correction and unknown cause. New VM/runtime
resources were removed. Native-adapter build scratch cleanup was interrupted;
its private temporary source/target is not application data or published evidence.
No new VM retry is planned without a discriminating hypothesis.

Optional editor receipts and the shared DocumentSessions controller now have
independent review and a final combined check: exit 0, 726 unit, 96 tooling/zero
skips, 152 Chromium, 9 Pages and 4 inactive-cloud passed. Source/test hashes bind
those receipts. Neither protocol nor controller is activated in production UI.
Next: bind private native grants, exercise controller publication against real
Store/files, then extract the single shared product/controller boundary. Preserve
native close/dirty acknowledgements and separate recovery; do not treat controlled
writer tests as installed autosave or inline runtime/security acceptance.

Private native-session binding now connects the existing controller to exact
save/close ports, with real Store publication observed before flush and explicit
close/reopen/external-conflict witnesses. Original harness/negative controls remain.
Root final check passed 735 unit/96 tooling/152 Chromium/9 Pages/4 inactive-cloud,
plus 79 Rust document tests and formatting; independent review found no blocker.
No UI or registered Tauri GUI/ACL activation is implied. Next shared-product work
can use this tested seam; native inline keyboard/geometry/full security remains
an independent release gate. A separate bounded actual-React pointer question
is being investigated without weakening the failed keyboard/startup results.

The one actual React pointer diagnostic reached Count 2, but its infrastructure
violated the explicit no-host-share invariant by including a task-generated guest
transport key in a writable synthetic share. All new runtime/key resources were
removed; no owner credentials/notes were involved. The observation is excluded
from VM/full security acceptance. Stop cleanup also remains unproven after ESRCH.
Before more native tests, correct/version/review share-free provisioning with
negative preflight controls. Shared UI/data work can remain independent; do not
promote another installer or treat these partial observations as product readiness.
