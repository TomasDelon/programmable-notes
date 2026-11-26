# Editor Stabilization and Daily-Use Readiness Plan

> **For agentic workers:** Use the repository's `close-feedback-loop` and `check-delivery-evidence` skills. Execute with bounded parallel subagents and a single integration owner. Steps below are checkable work items, not authorization to weaken policy or expand product scope.

**Goal:** Make the existing editor meet the owner's authoring and reliability requirements through reproducible acceptance, targeted corrections and trustworthy delivery.

**Architecture:** Preserve canonical MDX/CodeMirror history, the trusted ProseMirror editing surface, lossless revision-checked patches and opaque executable source. React execution remains unprivileged; native execution retains its existing separate supervised process and resource policy. Reuse working infrastructure and core modules.

**Tech stack:** React, TypeScript, CodeMirror 6, ProseMirror, MDX, KaTeX, Vitest, Playwright, Tauri 2, WebKitGTK, Rust and systemd/cgroups.

**Spec:** The owner's current requirements, the acceptance contract below, ADR 015–017, `docs/WEB_APP.md`, `docs/NATIVE_SECURITY.md`, and the handoff's visual-editing/security contracts. Later owner requirements supersede historical overlay/input proposals. The handoff's later AI/Git/marketplace roadmap is not this milestone's scope.

## Verified baseline — 26 November 2026, Europe/Paris

- Development branch: `fix/preview-markdown-input`, head `3c36ae21c60bd46b66cdbb8e2258209c1fa3b3de`. Actual current PR: **#9**, open, draft, unmerged.
- [Head CI](https://github.com/TomasDelon/programmable-notes/actions/runs/45716862799) completed successfully. The skill/tooling change passed 428 unit, 44 tooling, 128 Chromium and 8 Pages-policy cases locally; these are existing results, not tests executed to write this plan.
- Production branch `deploy/cloudflare-beta` remains at `d2838be7427e14839999c05366c3cec8d7ad9800`. [Main-origin acceptance](https://github.com/TomasDelon/programmable-notes/actions/runs/45711771472) passed 24 cases across three browsers. [Repeated diagnostics](https://github.com/TomasDelon/programmable-notes/actions/runs/45709208038) passed 327 cases with 42 intentional skips and zero retries at that application revision.
- The newer development commit changed development protocols/tooling, not application source. Ordinary/Pages application fingerprints remain `07379478d76c65a7` / `ba3b18a42210f424`. This does not make arbitrary later commits equivalent.
- The same-editor math/Markdown implementation already exists. This audit established no new confirmed defect in those core behaviors; new code requires a reproduced failure or a demonstrated coverage gap.
- Documentation still contains historical pending statements and old counts. Reconcile these with actual evidence rather than rerunning completed gates to satisfy stale prose.
- Native is a separate product surface: `src/web/EditorEntry.tsx` routes Tauri and `/engine` to `App`, not the newer `WebApp`. The latest recorded native package's complete stress command failed CPU Stop attribution; startup near the fixed expiry obscured the cause. Compilation and old green runs do not close that gate.

## Global constraints and completion contract

1. Work and artifacts are written in English; user-facing final conclusions may be Spanish. Use multiple agents for independent tasks, with exclusive writable ownership.
2. One continuous document editor: headings, prose and mathematical source are document text, with one caret/history, no nested math fields, per-block form controls, extra mathematical Tab stops or permanent formatting toolbar.
3. Unmatched `$`/`$$` is ordinary text with stable typography on focus. Closed invalid TeX is visible raw/red, independently correctable, without an ordinary-error notification or global editing lock. Valid math reveals exact source while selected and renders outside selection.
4. Ordinary Markdown typing, punctuation, lists, newlines, selection, composition, undo/redo, document switching and reopening must work through real interaction.
5. Preserve exact unrelated source, BOM, physical line endings, whitespace, Unicode, entities, comments, imports and nested JSX. Reject stale or unsafe mappings and retain attempted text. Intentional syntax transformations affect only their authorized range.
6. Imports/declarations are invisible by default; the existing source-visibility setting reveals escaped code. Components render interactively. Only bundled core capabilities are toggleable; source authorization, recovery and security are mandatory infrastructure.
7. Preview code cannot authorize source/metadata/settings/filesystem operations. Native file access remains dialog-authorized with opaque grants/revisions, atomic writes, conflicts and explicit recovery.
8. No arbitrary JSX reverse editing, custom grammar, AI integrations, Git synchronization, community marketplace, UI redesign, paid infrastructure, automatic merge, public release or PR readiness change.
9. Native limits—including the fixed 60-second lifetime—and isolation remain unchanged. GPU/Wayland/physical-device limitations are separate from security failures and web usability.
10. “Ready” means the scoped acceptance witnesses and required gates passed on identified inputs. It does not mean mathematical proof of no defects or production-security certification.

## Review focus

- Mixed authoring sequences across math/prose/list boundaries, rather than each feature tested only in isolation.
- IME final input arriving after blur, a document conflict or editing becoming unavailable.
- Confusion between accepted-but-saving source and refused/unapplied text held only in memory.
- Temporary React state versus source-driven rebuilds, stale replies and Stop/plugin termination.
- Native Stop attribution, slow startup, recovery and binary-specific security evidence.

## Work allocation and dependency graph

The root agent owns scope, shared integration points, artifact identity and final delivery. Use at most four active workers plus an independent reviewer when useful; do not saturate a machine with competing browser builds.

| Worker                      | Exclusive responsibility                                                         | Parallel boundary                                                                         |
| --------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A — delivery infrastructure | `.github/workflows/ci.yml`, narrowly related CI validation                       | Can work alongside test authors; owns workflow edits and dispatch policy.                 |
| B — authoring acceptance    | New `tests/e2e/web-authoring-acceptance.spec.ts`, its fixture                    | Can author tests alongside C. Does not independently edit shared editor implementation.   |
| C — input/recovery          | `tests/e2e/web-math-composition.spec.ts`, recovery tests and scoped storage work | Coordinates persistence APIs with root; no concurrent `WebApp.tsx` or editor writes.      |
| D — native evidence         | Native observers, one disposable VM/profile, package/evidence record             | Independent of web work until native UI changes; owns native process/cgroup observations. |
| Reviewer                    | Read-only requirements, source-authority and security review                     | Does not run a second full suite or mutate the tested build.                              |

`baseline receipt → {CI separation || authoring tests || input/recovery tests || native feasibility}`

`reproduced web failures → one editor/persistence integration owner → runtime-lifecycle/performance fixes → frozen web candidate → web delivery`

`native feasibility → startup/Stop diagnosis → exact-package native gates → bounded native UI integration → revalidation`

`physical GPU/Wayland/mobile hardware evidence` proceeds independently when infrastructure exists. A blocked native/hardware track does not block useful web work; it does block the corresponding native readiness claim.

## Task 0 — Reconcile the current requirement and evidence ledger

**Files:** `docs/IMPLEMENTATION_STATUS.md`, `docs/WEB_APP.md`, relevant current recovery record; preserve dated evidence and ADR history.

**Output:** One concise requirement → implementation → witness → limitation table, with current source/deployed/package identities and actual artifact links.

- [ ] Record the baseline above, including the successful new-head CI and separately verified deployed application.
- [ ] Label superseded math/input/mode descriptions as historical; distinguish 44 current tooling tests from the older 14-test checkpoint.
- [ ] Explicitly distinguish browser workspace durability, unapplied drafts, native file grants, native UI parity and physical compatibility.
- [ ] Inspect existing screenshots/tests for the user's sequences; mark each item passed, reproduced failure, coverage gap, blocked or optional.

**Exit:** No unsupported current “pending,” “fixed,” “safe,” or native-parity claim. Do not rerun old acceptance merely to refresh documentation.

## Task 1 — Verify concurrency and remove same-ref interference

**Files:** `.github/workflows/ci.yml`; update `docs/AGENT_WORKFLOW.md` after observed behavior changes.

**Interface:** Distinct concurrency classes `build`, `editing`, `browser-qa`, `deployment` for modes whose actual overlap needs separation; keep required job names, conditions and security checks.

- [ ] Record actual event, Git ref and resolved concurrency group. Same-ref manual editing/browser/ordinary-build dispatches can share the build group; automatic PR refs may already differ. Do not infer that every earlier CI/matrix wait was imposed by GitHub. Demonstrate the interference before changing it.
- [ ] Make the smallest grouping change; retain cancellation of superseded runs within the same class. Keep one owner for repeated editing dispatches.
- [ ] Validate YAML/actions and demonstrate actual same-SHA mandatory/optional overlap without cancellation; demonstrate supersession within one class.
- [ ] Preserve the full credential scan, synthetic scanner control, native package inspection, fault-injection and browser failure-on-flaky behavior.
- [ ] Measure phase durations. Optimize duplicate runtime preparation or artifact transfer only if measurements justify it and generation prerequisites stay explicit.

**Exit:** Actual eligible checks overlap on standard hosted Linux runners with recorded event/ref/group identity; supersession remains scoped correctly. No dropped tests, permission expansion, paid runners or passing-retry substitution. Measure saved critical-path time; no assumed eight-minute improvement.

**Defer:** A shared build-artifact pipeline until it is worthwhile. Pages preparation mutates `dist`; native packaging must not silently consume that variant. Future reuse needs immutable base artifacts, separate copies, exact input/config/toolchain identity and complete file hashes.

## Task 2 — Prove the ordinary authoring journey; repair only real failures

**Files:** New `tests/e2e/web-authoring-acceptance.spec.ts`; reuse `tests/e2e/helpers/math-text.ts`. Possible fixes under one owner: `src/editor/rendered/RenderedEditor.tsx`, `src/editor/rendered/sourceBridge.ts`, `src/editor/rendered/schema.ts`, `src/editor/math/mathSource.ts`, `src/editor/rendered/rendered.css`.

- [ ] Add one realistic BOM/mixed-EOL fixture containing headings, paragraphs, punctuation, lists, comments/imports, nested JSX and a live Counter.
- [ ] Type `1. ` and `- ` through ordinary keys, continue/nest/exit lists, insert soft/hard breaks and edit heading/prose text without form controls.
- [ ] Exercise valid → incomplete → valid mathematics, several independent invalid formulas, raw correction and moving the same caret across boundaries. Check geometry when the same unrendered text gains/loses focus.
- [ ] Assert no generated entity spelling appears as accidental visible text, no ordinary TeX error toast, no extra mathematical focus surface, and exact unrelated bytes.
- [ ] Exercise canonical undo/redo, source/Preview switching, note switching, acknowledged save, reload/reopen and exact export. Keep React interaction working and source-visibility/core toggles source-neutral.
- [ ] If a case fails, capture events/DOM/revision mapping, form one hypothesis, patch minimally, then rerun that same witness in the affected engine before broader regression.

**Exit:** Real combined authoring works in pinned Chromium, Firefox and WebKit. No editor/library replacement or wholesale serialization to make a fixture pass.

## Task 3 — Close input-finalization and crash-recovery gaps

**Files:** `tests/e2e/web-math-composition.spec.ts`, workspace/recovery tests; existing `src/web/persistence.ts`, `src/web/useWebWorkspace.ts`, `src/web/WebApp.tsx`, and editor pending-draft callbacks only as needed.

- [ ] Add a browser witness for a composition spanning prose/math that becomes unavailable through a real document conflict. Assert final Unicode is retained, canonical source/history cannot change while disabled, and the DOM becomes read-only after final native input is read.
- [ ] Reuse existing save-in-flight, tab-CAS, quota, corrupt-startup and restore regressions. Add only missing edit → acknowledged save → fresh context → exact-source and conflict → rescue → explicit restore witnesses.
- [ ] Reproduce what survives hard page/application termination for canonical source versus a refused/unapplied attempt. Existing in-memory retention is not automatically crash durability.
- [ ] If an unapplied-attempt loss is confirmed, persist it through the existing recovery boundary as a separately identified snapshot with document/base-revision provenance. Restore into an explicit recovered copy or revision-checked user action, never automatic overwrite or restored filesystem authority. Keep corrupt data/cancellation/quota failures recoverable.
- [ ] Test reload/restart, invalid snapshot, cancellation, newer canonical source, conflicting tab and undo after explicit restoration. Native snapshots remain behind the existing authorized native adapter.

**Exit:** Clear, truthful saved/pending/recovered states; tested exact durable source; no discarded final input or silent replacement. No universal power-loss guarantee. Physical IME evidence remains separate from synthetic browser composition tests.

## Task 4 — Make runtime lifecycle predictable and optimize measured delays

**Files:** `src/web/useWebPreview.ts`, `src/web/WebPreview.tsx`, `src/editor/rendered/RenderedRuntime.tsx`, `src/web/WebApp.tsx`; preview lifecycle unit/browser tests. Keep shared editor source under root ownership.

- [ ] Pin a lifecycle matrix: unrelated Markdown edit, source/import dependency change, mode/theme/source-visibility change, navigation, plugin disable, Stop and Rebuild.
- [ ] Assert unchanged executable islands preserve state; changed executable input resets deterministically; disabled/stopped/replaced work cannot be resurrected by stale compiler replies.
- [ ] Measure input → canonical update, save acknowledgement, compile → interactive render and repeated unnecessary builds on representative small/large supported fixtures.
- [ ] Fix only measured redundant compilation/rendering or ownership errors. Keep existing cache/source identity and compiler budgets correct.
- [ ] Retain the unexplained first-click failure separately; investigate a newly reproduced trace, not an assumed React-state-reset explanation.

**Exit:** Predictable, documented temporary state and responsive authoring with retained source guarantees. Arbitrary React hot-state persistence/HMR and reverse editing remain out of scope.

## Task 5 — Close the real native startup/Stop/security gate

**Files:** `scripts/native-startup.mjs`, `scripts/native-stress.mjs`, lifecycle/fidelity/persistence observers, `docs/NATIVE_SECURITY.md`, dated evidence. Native implementation changes require reproduced defects.

- [ ] Probe suitable disposable Linux infrastructure: systemd user manager, cgroup delegation, user/network namespaces, WebKitGTK, ordinary graphical session and trusted journal observations. Use existing approved cloud resources; no new paid commitment.
- [ ] Bind every observation to one installed optimized package/ELF and fresh fixture/profile. Retain failed cases.
- [ ] Diagnose startup phases and CPU Stop attribution using monotonic timings, trusted service/termination cause, actual CPU/throttle evidence and cleanup. Establish Stop under load before the fixed expiry; do not extend lifetime, relax quotas, replace fixtures or accept an authored marker as the termination oracle.
- [ ] If startup remains too slow/unobservable, record a precise failed or blocked result and improve the demonstrated bottleneck or use suitable infrastructure. A subsequent unchanged passing retry does not explain the failure.
- [ ] After an actual correction, run the complete six-case production stress command, actual editor CPU/heap disk-save checks, IPC denial, picker/save/conflict/permissions, dirty close, SIGKILL/restart and explicit recovery on the same candidate.

**Exit:** All required commands exit 0 with trusted causes and exact binary identity. Otherwise native hostile-document readiness remains blocked. Software-rendered Ubuntu evidence does not certify physical GPU, Wayland or other distributions.

## Task 6 — Bring the native editing experience forward safely

**Files:** `src/web/EditorEntry.tsx`, `src/App.tsx`, `src/editor/rendered/RenderedEditor.tsx`, existing `src/documents/native.ts`/`useDocuments.ts`; routing, native fidelity and persistence tests.

- [ ] First map which trusted Markdown/math editing pieces can be reused without importing browser persistence or browser-only React islands into the privileged native window.
- [ ] Prototype the smallest adapter boundary in isolation; native saves keep existing opaque grants/revisions, atomic writes and recovery. Core preference validation remains a fixed allowlist.
- [ ] Bring continuous trusted text/math editing and consistent feedback into the native host only after that boundary is proven.
- [ ] Preserve React execution in the existing separately supervised unprivileged process. Do not mount web preview code in the native host to obtain superficial same-window parity.
- [ ] Repeat the affected package/native fidelity/security gates on the new binary. Broader single-window React presentation requires a separate isolation design and consequential product decision, not a silent migration.

**Exit:** Explicitly supported native authoring behavior with unchanged native authority/resource boundaries. Web delivery need not wait for this independent integration; native-parity claims must wait for its actual tests.

## Task 7 — Freeze, verify and deliver one coherent candidate

**Files:** Current status/ADR/evidence links, existing demo/artifact scripts, workflow delivery metadata. Root is the only gate/deployment owner.

- [ ] Freeze relevant code/tests/config and record dirty/input identity, commit, versions, environment and predeclared skips/repetition scopes.
- [ ] Run targeted checks during development. Run the required full `npm run check` once after stabilization; a failure or relevant change justifies rerunning affected gates.
- [ ] With Task 1 complete, overlap independent mandatory CI and optional browser diagnostics on separate runners. Keep one server/build/watcher owner per environment; never have workers rebuild shared `dist` or use port 4173 concurrently.
- [ ] Run the required three-engine editor/security acceptance; repeat demonstrated races with zero retries. Preserve all failed checkpoints and distinguish required runtime tests from compilation.
- [ ] Verify the immutable Cloudflare candidate, then perform the authorized beta fast-forward only after required gates pass. Verify the actual principal origin afterward. Existing tabs retain data through Save and update.
- [ ] Capture desktop/tablet/mobile screenshots and a short real walkthrough from the accepted immutable build. Use existing byte-manifest checks and upload a verified playable/demo artifact; link it from the draft PR. Native installer distribution additionally requires complete redistribution notices.
- [ ] Validate milestone evidence consistency with `scripts/check-agent-evidence.mjs`, then inspect actual logs: the checker is not execution attestation or test-adequacy proof.
- [ ] Update the current receipt and next handoff, verify noreply identity, run the required history/archive credential scan before pushes, push coherent commits and keep PR #9 draft. No merge, release or readiness change.

**Web exit:** Required authoring/math/JSX/plugin/history/save/recovery/security journeys pass on the identified candidate and actual origin, with downloadable evidence and truthful limits.

**Native exit:** Separate exact-package functional, persistence, resource and IPC gates pass; unresolved startup/Stop observations or redistribution obligations remain explicit blockers to the corresponding native claim.

## Execution order and efficiency limits

Start Task 0 and independent work for Tasks 1–3 together. Native feasibility/diagnosis proceeds in parallel when a suitable environment is available. Integrate demonstrated editor/recovery failures under one writer, then address measured lifecycle issues and freeze the web candidate. Execute native UI integration only after its isolation boundary is settled and revalidate the resulting package.

Use short reviewable commits, not a commit per tiny experiment. Required precommit checks remain; retain targeted failing/passing evidence and consolidate changes before the final gate. A documentation-only planning artifact does not justify rebuilding the app or restarting CI. This plan is saved for implementation, without a planning-only push or application change.

No credible completion-time or zero-defect promise is made before reproducing remaining failures. Track time to first witness, failed correction cycles, duplicate builds/polls, gate duration and escaped regressions. Shorten the measured critical path while retaining every security and source-fidelity requirement.
