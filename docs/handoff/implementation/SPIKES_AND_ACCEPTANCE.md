# Engineering Spikes and Acceptance Tests

**All checkboxes below are UNRUN as of handoff creation.** The recovered research reports are written analysis, not evidence of a working prototype.

## Spike A: Unsaved-buffer MDX + React bundle

**Objective:** demonstrate actual React authored in `.mdx` and a reliable document-specific build pipeline, not a static mockup.

- [ ] Load `samples/fixtures/counter.mdx` into CodeMirror and compile its current editor text (not only a saved file).
- [ ] Render the Counter button in the preview and verify two clicks change `Count: 0` to `Count: 2`.
- [ ] Change label/source in editor; preview updates without a full app reload.
- [ ] Compile/render `samples/fixtures/imported-counter.mdx` and resolve its local `.tsx` import.
- [ ] Demonstrate a genuine lockfile-pinned npm package import and offline repeat build after dependency setup.
- [ ] Invalid MDX triggers a precise diagnostic; source remains intact and editing available.
- [ ] Repeated quick edits cannot display an older stale build as the latest result.
- [ ] MDX source is byte-identical after preview-only operations and save/reopen.
- [ ] Test actual module source maps/error display where supported; document exact limits.
- [ ] Document whether TypeScript annotations inside `.mdx` itself are supported or explicitly out of V1 scope.

**No-go:** React hooks don't work, imports only work from a fixed bundled demo, unsaved-buffer compilation is absent, or diagnostics destroy source.

## Spike B: Preview isolation and malicious fixtures

- [ ] `samples/fixtures/security-attempt.mdx` is **not** allowed to read editor DOM, app tokens or privileged browser storage.
- [ ] Network probes to external and loopback endpoints fail under default preview policy.
- [ ] Native IPC, shell, filesystem and HTTP plugin calls cannot be invoked by preview.
- [ ] Malformed or forged `postMessage` cannot trigger privileged operations.
- [ ] Opening a note never installs dependencies, runs host shells or accesses personal files without authorization.
- [ ] Infinite loop/large memory usage fails safely or is documented as an unresolved blocker; do not mark a hung editor as passing.
- [ ] Preview crash/re-render leaves CodeMirror functional and source retained.
- [ ] Test on at least Chromium plus the actual Linux Tauri WebView before claiming a desktop security pass.

**No-go:** preview can access native privileges or sensitive editor data. Frame isolation alone is not a passing security audit.

## Spike C: Narrow visual-text edit (AFTER A and B)

- [ ] Parse/source-locate a uniquely mapped Markdown paragraph in a mixed MDX fixture.
- [ ] Edit only that paragraph in rendered mode, then verify expected source patch.
- [ ] A no-op visual edit produces identical bytes.
- [ ] JSX code, imports, comments, whitespace and unrelated Markdown blocks are byte-identical after editing.
- [ ] Nested JSX is atomic when no editing adapter exists.
- [ ] Undo/redo and stale mapping are handled without data loss.
- [ ] Ambiguous source selection refuses a visual edit and offers source mode.

**No-go:** broad reserialization modifies unrelated content or JSX, or DOM interaction is incorrectly treated as document editing.

## Test implementation guidance

Use Vitest for compiler/source-patch units, Playwright for actual browser interaction and negative security probes, and native UI smoke tests only when a Tauri build can be launched. CI should record which suites actually ran. Never label an unexecuted platform test as PASSED.

## Deliverables

- A compact PoC branch/PR, tests, fixtures, build instructions and observed logs.
- `docs/decisions/ADR-001-runtime-build.md` explaining selected build pipeline and alternatives.
- `docs/decisions/ADR-002-preview-isolation.md` explaining exact boundaries and unresolved vulnerabilities.
- A pass/fail/unrun matrix, no invented benchmarks, exact environment versions.
- A prioritized implementation issue list for the next milestone.
