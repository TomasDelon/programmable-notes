# Core plugins and forgiving mathematical preview

**Goal:** Independently render invalid LaTeX as editable red source, hide executable setup by default, and introduce trusted built-in plugin modules with persistent toggles.

**Design:** Markdown/source transactions, persistence and sandbox enforcement remain mandatory infrastructure. Optional functionality starts with statically bundled Mathematics and React core plugins. No community loader, runtime registration, remote code or permission configuration is introduced. Plugin modules own mathematical rendering/compiler configuration and React source classification/island setup. Settings are validated, backward-compatible workspace preferences; toggling never rewrites document source.

**Preview:** Hide ESM/setup and all source-action buttons. Render executable JSX only inside existing isolated frames. The Show component source preference displays escaped ordinary code blocks alongside rendered components. Disabling React terminates its previews; disabling Mathematics leaves mathematical source visible without KaTeX. Source opacity/revision checks remain mandatory in all modes.

**LaTeX:** Mathematical rendering validity does not authorize source patches. Closed MDX math with invalid TeX commits through the existing exact-span planner and is displayed raw/red, without notifications. Correction clears red feedback live; leaving renders valid math again. Genuine stale/unsafe source patches retain explicit recovery guards.

- [x] Reproduce invalid-math correction/continued typing with failing real-browser and unit regressions; implement independent red raw fallback.
- [x] Extract trusted core math/React modules and static registry; validate/persist toggles and source visibility preferences, retaining cross-tab/backup guarantees.
- [x] Wire preview/compiler lifecycle and settings; verify hidden setup, escaped optional source, real components and disabled plugin cleanup.
- [ ] Run full local/browser/security checks, hosted three-browser tests and actual deployed acceptance. Record executed evidence and limitations.
- [ ] Push coherent commits, update existing draft PR and verified beta; no merge or public release.

The owner has explicitly opted out of routine questions and authorized implementation. Defaults: both core plugins enabled, component source hidden. No speculative migration of unrelated infrastructure.
