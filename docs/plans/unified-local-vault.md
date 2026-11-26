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

- [x] Owner's six questions answered; architecture-first reuse, inline React,
      local autosave, real file operations/Trash, Linux-first and rendering privileges
      recorded separately from engineering choices.
- [x] Existing handoff and web/native seams inspected; rejected shell and stale
      authority recorded. No application redesign/fix performed during setup.
- [x] Initial target architecture, acceptance gates and ordered work defined.
- [x] Read-only AST entry audit and fixture tests implemented; informational
      divergence cannot be presented as product readiness.
- [ ] Finish setup validation, commit/push the process/specification changes and
      verify the draft PR state and CI results. No replacement app download is implied.
- [ ] Assess existing modules against the target and record concrete interfaces.
- [ ] Prove isolated native inline presentation and resource/lifecycle ownership.
- [ ] Extract shared product/use cases and platform ports without a second UI.
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
