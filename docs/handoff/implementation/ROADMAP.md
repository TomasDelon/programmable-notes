# Implementation Roadmap

Dates and durations are intentionally not committed. Progress is gated by tests and security, not optimistic calendar estimates.

## Phase 0: Repository readiness

- Inspect existing Codex Cloud bootstrap. Verify `main`, package manager, scripts, `.gitignore`, `AGENTS.md`, CI and pending work.
- Add this handoff to an agreed repo location or retain as attached reference, avoiding duplicate docs.
- Record the actual repository status in a new ADR/issue.

## Phase 1: MDX/React runtime foundation (first engineering milestone)

- Minimal React/Vite/TypeScript shell with CodeMirror 6.
- Compile an **unsaved** `.mdx` buffer; render interactive Counter with hooks/events.
- Import local `.tsx` module and one pinned dependency.
- React error boundary, diagnostics, cancellation/outdated build handling.
- Isolate preview from privileged origin and run negative tests.
- Save/open files where available in the chosen prototype environment; keep source byte identity.

**Exit:** `implementation/SPIKES_AND_ACCEPTANCE.md` P0 gates pass and run logs are attached.

## Phase 2: Daily-use editor

- Reliable local workspace navigation, saving/reopening, autosave and recovery.
- Tauri 2 Linux packaging and real system WebView test, with validated capability file scope.
- Git status/history/commit support, optional GitHub remote integration.
- Editing ergonomics, themes, shortcuts, accessibility, performance budgets.

## Phase 3: Source-preserving rendered editing

- Establish AST/source-span mapping on representative fixtures.
- Allow surgical Markdown paragraph/headline edits with byte-preserving tests.
- Introduce atom selection and component editing adapters in a controlled library.
- Test undo, copy/paste, cursor boundaries, malformed MDX, multi-line/nested cases.

## Phase 4: AI-native editing, execution, rich media

- Permissioned AI change proposals, diffs, reversible edits and repo-aware operations.
- Explicitly authorized code execution in independently sandboxed runtimes.
- PDF/media/math/diagram adapters, lazy loading and reliable attachment handling.

## Phase 5: Cross-platform and future grammar

- Browser storage/sync, macOS/Windows and mobile validation.
- Custom reusable components, component registry/versioning.
- Declarative programmable Markdown extensions lowering into existing MDX/React runtime; syntax grammar comes AFTER a stable core.

## Scope discipline

No public marketplace, arbitrary grammar override, full drag-and-drop component builder, shared cloud database or collaboration requirement should block the first runtime milestone.
