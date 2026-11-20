# ADR-001: Unsaved-buffer document compilation

Status: experimental, browser-tested; packaging not validated.

Keep the existing React/TypeScript/Vite application build. Document builds are separate: raw CodeMirror buffers and explicitly opened modules go into a disposable compiler worker. MDX produces JavaScript; esbuild-wasm bundles that JavaScript and TSX from an in-memory filesystem. No document code runs during compilation. A 300 ms debounce, worker termination, active-build guard, and 15-second compilation deadline prevent stale completion from replacing current content.

A build-time esbuild script packages one production React/ReactDOM/JSX runtime and clsx from the lockfile. The document resolver maps only `react`, `react/jsx-runtime`, and `clsx` to that runtime. Relative imports can access only supplied workspace text, with extension resolution and root-escape rejection. Dynamic unknown imports, Node APIs, URLs, CSS/assets, and arbitrary package installs are unsupported. This is intentionally a finite package allowlist, not a general npm installation service.

The runtime compiler requires no Node server. Node esbuild is used only when preparing application assets. Vite inline worker assets and a cached compiled WebAssembly module permit repeat document builds after the browser goes offline; first loading the app still requires its local/static assets. This is not yet a service-worker/PWA installation.

Vite's original MDX plugin was treating `?raw` handoff imports as components: its filter receives the path with query stripped. Restricting its include to application `src/**/*.mdx` preserves application infrastructure and gives document fixtures to the runtime compiler unchanged. MDX dependencies also need the `worker` export condition before `browser`, otherwise their entity decoder accesses `document` in the compiler worker. Both failures were observed in production-browser tests.

Rejected for this spike: Vite virtual document modules require a runtime development server; a Node document-build service hides a packaged-runtime dependency; MDX evaluate in the editor origin executes untrusted code with host privileges. Browser WASM was tested instead of assuming the research's Node proposal is the final architecture.

Limits: JavaScript/JSX inside MDX; TypeScript annotations belong in imported `.tsx`/`.ts` files. Each successful edit reloads the preview and resets React state. esbuild embeds generated-JS/TSX source maps; MDX generated lines are not composed back to original Markdown lines and runtime stacks are not symbolicated. MDX parser diagnostics include the logical source file and parser location; this is not full source-mapped debugging.

Open/save is browser file upload/download, not autosave or a native workspace adapter. Each opened batch is kept under a fresh memory-workspace prefix, preserving earlier unsaved buffers even when filenames collide. Select a note and its relative modules together. Multiple selected files form a memory workspace; files with nested paths can be supplied through browser file metadata, but there is no directory navigator. Source is authoritative. Opening and previewing retain raw text; per-file editors prevent undo crossing files. Per-file undo history is currently discarded when switching files. Mixed line-ending and non-UTF-8 encodings require additional work before a lossless general file adapter.

## Original-source compiler navigation

Compiler failures may offer an editor-owned action to open an existing source at
its original physical line. MDX locations come from its compiler's source error;
esbuild locations are offered only for original TS/JS modules. Generated MDX
JavaScript locations and runtime exception strings are not reverse-mapped by
parsing text. The worker supplies structured file/line data, and the editor
captures the compiled source revision. Clicking checks that revision again;
CodeMirror validates its current bytes before moving the caret. Navigation is a
selection transaction, never a source patch or save. It reveals Source mode,
preserves history and maps mixed CR/LF/CRLF physical offsets to UTF-16 positions. JavaScript additionally counts U+2028/U+2029
line terminators; MDX uses CR/LF rules. The worker computes an original offset
using the appropriate rules; the editor validates its bounds against that snapshot.
Preview messages cannot create targets. Columns and composed runtime source maps
remain separate work; do not present a generated-code location as author source.
