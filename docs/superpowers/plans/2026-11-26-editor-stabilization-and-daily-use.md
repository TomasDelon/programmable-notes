# Editor Stabilization and Daily-Use Readiness Plan

> **For agentic workers:** Use the repository's `close-feedback-loop` and `check-delivery-evidence` skills. Execute with bounded parallel subagents and a single integration owner. Steps below are checkable work items, not authorization to weaken policy or expand product scope.

**Goal:** Make the existing editor meet the owner's authoring and reliability requirements through reproducible acceptance, targeted corrections and trustworthy delivery.

**Architecture:** Preserve canonical MDX/CodeMirror history, the trusted ProseMirror editing surface, lossless revision-checked patches and opaque executable source. React execution remains unprivileged; native execution retains its existing separate supervised process and resource policy. Reuse working infrastructure and core modules.

**Tech stack:** React, TypeScript, CodeMirror 6, ProseMirror, MDX, KaTeX, Vitest, Playwright, Tauri 2, WebKitGTK, Rust and systemd/cgroups.

**Spec:** The owner's current requirements, the acceptance contract below, ADR 015–019, `docs/WEB_APP.md`, `docs/NATIVE_SECURITY.md`, and the handoff's visual-editing/security contracts. Later owner requirements supersede historical overlay/input proposals. The handoff's later AI/Git/marketplace roadmap is not this milestone's scope.

## Accepted web checkpoint

The deployed web application is `1442e589a57f107944c2e6588e8e915e065b7b39`. Its ordinary and Pages asset fingerprints are `afc89d287b038a18` and `19f503362f07b8c6`. The corrected Pages service-worker SHA-256 is `dac35a0103e6dae7e161cdb1481d2fc8112485de92e805bef2de82125f6d3ed2`. [Daily-use receipt](../../DAILY_USE_STATUS.md)

- Mandatory CI passed at `1442e58`. The complete pinned Chromium, Firefox and WebKit run passed **384 editor cases with 18 intentional skips** and **27 local Pages-policy cases**, with zero retries accepted. The focused Firefox Pages run passed all 27 cases across three repetitions with zero retries. [Mandatory CI](https://github.com/TomasDelon/programmable-notes/actions/runs/45744910801) · [Full browser run](https://github.com/TomasDelon/programmable-notes/actions/runs/45745493590) · [Firefox repetitions](https://github.com/TomasDelon/programmable-notes/actions/runs/45745225173)
- The immutable Cloudflare candidate passed 27 deployment cases before the beta fast-forward. The public principal origin then passed all 27 cases across the same three browsers, with exact worker and entry identity. [Candidate verification](https://github.com/TomasDelon/programmable-notes/actions/runs/45745410831) · [Principal-origin verification](https://github.com/TomasDelon/programmable-notes/actions/runs/45747704986)
- The current walkthrough includes desktop, tablet and mobile captures, a playable recording and an exact MDX export. The portable archive passed offline browser verification and eleven integrity controls. [Hosted walkthrough](https://github.com/TomasDelon/programmable-notes/actions/runs/45745493590/artifacts/15083762891)

This checkpoint covers the web track. Native startup, Stop attribution, matching-package runtime acceptance and native editor integration remain blocked. Physical IME and hardware compatibility require separate observations. [Hosted native preflight evidence](../../security-evidence/2026-11-26-hosted-preflight/README.md)

## Recorded baseline — 26 November 2026, Europe/Paris

- Development branch `fix/preview-markdown-input` started at `3c36ae21c60bd46b66cdbb8e2258209c1fa3b3de`. PR #9 was open, draft and unmerged.
- [Head CI](https://github.com/TomasDelon/programmable-notes/actions/runs/45716862799) completed successfully. The skill/tooling change passed 428 unit, 44 tooling, 128 Chromium and 8 Pages-policy cases locally; these are existing results, not tests executed to write this plan.
- Production branch `deploy/cloudflare-beta` was at `d2838be7427e14839999c05366c3cec8d7ad9800`. At that application revision, main-origin acceptance passed 24 cases across three browsers and repeated diagnostics passed 327 cases with 42 intentional skips and zero retries. [Main-origin acceptance](https://github.com/TomasDelon/programmable-notes/actions/runs/45711771472) · [Repeated diagnostics](https://github.com/TomasDelon/programmable-notes/actions/runs/45709208038)
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

- [x] Record the baseline above, including the successful development CI and separately verified deployed application.
- [x] Label superseded math, input and mode descriptions as historical and scope tooling counts to their respective checkpoints.
- [x] Explicitly distinguish browser workspace durability, unapplied drafts, native file grants, native UI parity and physical compatibility.
- [x] Inspect existing screenshots and tests for the requested sequences and record their evidence and limitations. [Daily-use receipt](../../DAILY_USE_STATUS.md)

**Exit:** No unsupported current “pending,” “fixed,” “safe,” or native-parity claim. Do not rerun old acceptance merely to refresh documentation.

## Task 1 — Verify concurrency and remove same-ref interference

**Files:** `.github/workflows/ci.yml`; update `docs/AGENT_WORKFLOW.md` after observed behavior changes.

**Interface:** Distinct concurrency classes `build`, `editing`, `browser-qa`, `deployment` for modes whose actual overlap needs separation; keep required job names, conditions and security checks.

- [x] Record actual events, refs and resolved groups, including the old same-ref manual selector collision and the distinct automatic PR ref.
- [x] Separate same-ref groups and retain cancellation of superseded runs within each class. Keep one owner for repeated editing dispatches.
- [x] Validate workflow routing and observe hosted same-ref browser-QA/editing overlap with editing supersession. [Concurrency evidence](../../AGENT_WORKFLOW.md#2-validation-and-execution-ownership)
- [x] Preserve the full credential scan, synthetic scanner control, native package inspection, fault injection and browser failure-on-flaky behavior.
- [x] Record observed phase durations and generation prerequisites.
- [ ] Establish a matched before/after critical-path comparison for mandatory and optional work. The hosted same-ref witness covers browser QA and editing. Historical cross-class cancellation and quantified savings remain unconfirmed.

**Exit:** Actual eligible checks overlap on standard hosted Linux runners with recorded event/ref/group identity; supersession remains scoped correctly. No dropped tests, permission expansion, paid runners or passing-retry substitution. Measure saved critical-path time; no assumed eight-minute improvement.

**Defer:** A shared build-artifact pipeline until it is worthwhile. Pages preparation mutates `dist`; native packaging must not silently consume that variant. Future reuse needs immutable base artifacts, separate copies, exact input/config/toolchain identity and complete file hashes.

## Task 2 — Prove the ordinary authoring journey; repair only real failures

**Files:** New `tests/e2e/web-authoring-acceptance.spec.ts`; reuse `tests/e2e/helpers/math-text.ts`. Possible fixes under one owner: `src/editor/rendered/RenderedEditor.tsx`, `src/editor/rendered/sourceBridge.ts`, `src/editor/rendered/schema.ts`, `src/editor/math/mathSource.ts`, `src/editor/rendered/rendered.css`.

- [x] Add one realistic BOM/mixed-EOL fixture containing headings, paragraphs, punctuation, lists, comments/imports, nested JSX and a live Counter.
- [x] Type `1. ` and `- ` through ordinary keys, continue/nest/exit lists, insert soft/hard breaks and edit heading/prose text without form controls.
- [x] Exercise valid → incomplete → valid mathematics, several independent invalid formulas, raw correction and moving the same caret across boundaries. Check geometry when the same unrendered text gains/loses focus.
- [x] Assert no generated entity spelling appears as accidental visible text, no ordinary TeX error toast, no extra mathematical focus surface, and exact unrelated bytes.
- [x] Exercise canonical undo/redo, source/Preview switching, note switching, acknowledged save, reload/reopen and exact export. Keep React interaction working and source-visibility/core toggles source-neutral.
- [x] Retain event and selection evidence for the pasted-paragraph caret and WebKit refocus defects, and rerun the affected witnesses. The later hosted test-ordering failure was reproduced separately and the acceptance journey now uses native keyboard selection, Copy and Paste. [Authoring evidence](../../DAILY_USE_STATUS.md#hosted-interaction-verification-follow-up)

**Exit:** Real combined authoring works in pinned Chromium, Firefox and WebKit. No editor/library replacement or wholesale serialization to make a fixture pass.

## Task 3 — Close input-finalization and crash-recovery gaps

**Files:** `tests/e2e/web-math-composition.spec.ts`, workspace/recovery tests; existing `src/web/persistence.ts`, `src/web/useWebWorkspace.ts`, `src/web/WebApp.tsx`, and editor pending-draft callbacks only as needed.

- [x] Exercise synthetic final Unicode composition in prose and mixed prose/math during a real two-tab conflict, with canonical source and history guarded and the DOM read-only after the final input.
- [x] Retain save-in-flight, tab-CAS, quota, corrupt-startup and restore checks. Verify acknowledged canonical source and separately acknowledged retained text in a fresh browser process using the same profile.
- [x] Reproduce page-local attempt loss after unmount/reopen and exercise a real Chromium renderer crash before unloading.
- [x] Store a separately identified, checksummed retained edit with captured source provenance. Restore Markdown/MDX as an explicit new copy and preserve exact module downloads. Keep hard storage failures recoverable. [ADR 018](../../decisions/ADR-018-retained-edits-and-stabilization.md)
- [x] Cover browser reload/restart, invalid snapshots, cancellation, newer canonical source, conflicting tabs and undo after explicit restoration.

**Exit:** Clear, truthful saved/pending/recovered states; tested exact durable source; no discarded final input or silent replacement. No universal power-loss guarantee. Physical IME evidence remains separate from synthetic browser composition tests.

## Task 4 — Make runtime lifecycle predictable and optimize measured delays

**Files:** `src/web/useWebPreview.ts`, `src/web/WebPreview.tsx`, `src/editor/rendered/RenderedRuntime.tsx`, `src/web/WebApp.tsx`; preview lifecycle unit/browser tests. Keep shared editor source under root ownership.

- [x] Cover the lifecycle matrix in focused unit and browser cases, including unrelated prose/math, changed executable inputs, mode/theme/source visibility, navigation, plugin disable, Pause and Rebuild.
- [x] Verify island continuity under unrelated edits and deterministic replacement for changed executable input, with request-owned publication rejecting stale work. The two-tab dependency witness distinguishes an unused grouped file from the imported TSX dependency. [ADR 019](../../decisions/ADR-019-island-dependency-witnesses.md)
- [x] Measure repeated unnecessary builds and sample the trusted-input-to-saved path on small and large supported fixtures. The `6a004170ca68b158` timing probe also measured initial compiler request to observed Counter click acknowledgment.
- [ ] Measure immediate in-memory canonical acceptance and isolate compiler-to-interactive-render time. The current autosave interval includes the debounce and the Counter interval includes automation and click delay. [Timing scope](../../DAILY_USE_STATUS.md#observed-browser-save-latency)
- [x] Remove demonstrated redundant compilation and preserve lifecycle ownership, source identity and compiler budgets. Restore the parser diagnostics that the integrated gate caught. [ADR 018](../../decisions/ADR-018-retained-edits-and-stabilization.md)
- [x] Retain the unexplained historical first-click failure separately. Its cause remains unresolved; investigate a new trace if it recurs. [First-click evidence](../../security-evidence/2026-11-19-counter-input/README.md)

**Exit:** Predictable, documented temporary state and responsive authoring with retained source guarantees. Arbitrary React hot-state persistence/HMR and reverse editing remain out of scope.

## Task 5 — Close the real native startup/Stop/security gate

**Files:** `scripts/native-startup.mjs`, `scripts/native-stress.mjs`, lifecycle/fidelity/persistence observers, `docs/NATIVE_SECURITY.md`, dated evidence. Native implementation changes require reproduced defects.

- [x] Probe hosted Linux prerequisites and retain failures. Stock hosted runners reached the namespace check and refused document code before payload launch. [Hosted preflight evidence](../../security-evidence/2026-11-26-hosted-preflight/README.md)
- [ ] Establish a disposable full-system target with a systemd user manager, cgroup delegation, effective private namespaces, WebKitGTK, a regular graphical session and trusted journal observations.
- [ ] Bind every observation to one installed optimized package/ELF and fresh fixture/profile. Retain failed cases.
- [ ] Diagnose startup phases and CPU Stop attribution using monotonic timings, trusted service/termination cause, actual CPU/throttle evidence and cleanup. Establish Stop under load before the fixed expiry; do not extend lifetime, relax quotas, replace fixtures or accept an authored marker as the termination oracle.
- [ ] If startup remains too slow/unobservable, record a precise failed or blocked result and improve the demonstrated bottleneck or use suitable infrastructure. A subsequent unchanged passing retry does not explain the failure.
- [ ] After an actual correction, run the complete six-case production stress command, actual editor CPU/heap disk-save checks, IPC denial, picker/save/conflict/permissions, dirty close, SIGKILL/restart and explicit recovery on the same candidate.

**Exit:** All required commands exit 0 with trusted causes and exact binary identity. Otherwise native hostile-document readiness remains blocked. Software-rendered Ubuntu evidence does not certify physical GPU, Wayland or other distributions.

**Blocked.** The recorded CPU Stop-attribution failure and startup uncertainty remain open. The API-only KVM role step reported API 12 and verified cleanup, while the enclosing preflight failed private-network setup. Disposable guest startup and matching installed-package runtime acceptance remain pending. [API-only role and preflight run](https://github.com/TomasDelon/programmable-notes/actions/runs/45752003519)

## Task 6 — Bring the native editing experience forward safely

**Files:** `src/web/EditorEntry.tsx`, `src/App.tsx`, `src/editor/rendered/RenderedEditor.tsx`, existing `src/documents/native.ts`/`useDocuments.ts`; routing, native fidelity and persistence tests.

- [x] Map trusted Markdown/math reuse and identify the compiler settings, authoritative source checks and recovery handoff needed at the native boundary. [Native continuation gate](../../DAILY_USE_STATUS.md#native-continuation-gate)
- [ ] Prototype the smallest adapter boundary in isolation; native saves keep existing opaque grants/revisions, atomic writes and recovery. Core preference validation remains a fixed allowlist.
- [ ] Bring continuous trusted text/math editing and consistent feedback into the native host only after that boundary is proven.
- [ ] Preserve React execution in the existing separately supervised unprivileged process. Do not mount web preview code in the native host to obtain superficial same-window parity.
- [ ] Repeat the affected package/native fidelity/security gates on the new binary. Broader single-window React presentation requires a separate isolation design and consequential product decision, not a silent migration.

**Exit:** Explicitly supported native authoring behavior with unchanged native authority/resource boundaries. Web delivery need not wait for this independent integration; native-parity claims must wait for its actual tests.

**Blocked.** Adapter implementation and matching-package revalidation follow the open native runtime gate.

## Task 7 — Freeze, verify and deliver one coherent candidate

**Files:** Current status/ADR/evidence links, existing demo/artifact scripts, workflow delivery metadata. Root is the only gate/deployment owner.

- [x] Freeze web source, tests and build configuration, with recorded build identity, engines, intentional skips and repetition scope.
- [x] Run targeted witnesses and the required full `npm run check` after stabilization, with affected gates repeated after fixes.
- [x] Overlap independently owned mandatory and optional jobs, with one server, build and watcher owner per environment. The measured concurrency comparison remains scoped under Task 1.
- [x] Pass three-engine editor and hosting acceptance and the targeted zero-retry repetitions. Preserve the failed hosted authoring and compressed navigation checkpoints.
- [x] Verify the immutable Cloudflare candidate, fast-forward beta and verify the actual principal origin against the expected worker and entry. Exercise Save and update with preserved data.
- [x] Publish current desktop, tablet and mobile captures and a verified playable web artifact with byte manifests and clean-extracted browser acceptance. Native installer acceptance stays in its own gate.
- [x] Validate the accepted web evidence record with `scripts/check-agent-evidence.mjs` and inspect the actual run receipts. The checker verifies record consistency; native gates and execution evidence have their own receipts.
- [x] Update the web receipt and draft PR evidence, verify noreply identity, complete the history/archive credential scan before the verified push, and retain the draft PR. [Draft PR #9](https://github.com/TomasDelon/programmable-notes/pull/9)

**Web exit:** Required authoring/math/JSX/plugin/history/save/recovery/security journeys pass on the identified candidate and actual origin, with downloadable evidence and truthful limits.

**Native exit:** Separate exact-package functional, persistence, resource and IPC gates pass; unresolved startup/Stop observations or redistribution obligations remain explicit blockers to the corresponding native claim.

## Execution order and efficiency limits

Start Task 0 and independent work for Tasks 1–3 together. Native feasibility/diagnosis proceeds in parallel when a suitable environment is available. Integrate demonstrated editor/recovery failures under one writer, then address measured lifecycle issues and freeze the web candidate. Execute native UI integration only after its isolation boundary is settled and revalidate the resulting package.

Use short reviewable commits, not a commit per tiny experiment. Required precommit checks remain; retain targeted failing/passing evidence and consolidate changes before the final gate. A documentation-only planning artifact does not justify rebuilding the app or restarting CI. This plan is saved for implementation, without a planning-only push or application change.

No credible completion-time or zero-defect promise is made before reproducing remaining failures. Track time to first witness, failed correction cycles, duplicate builds/polls, gate duration and escaped regressions. Shorten the measured critical path while retaining every security and source-fidelity requirement.
