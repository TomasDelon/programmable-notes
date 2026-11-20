# Architecture: Decisions, Recommendations and Open Questions

Use three labels: **Confirmed (C)** is a user requirement; **Recommended (R)** is a technical choice requiring validation; **Deferred (D)** is intentionally outside the first runtime milestone.

| ID | State | Decision / rationale |
|---|---|---|
| ADR-001 | C | MDX-first direct JSX/React authoring. Custom syntax is an optional later layer. |
| ADR-002 | C | Local files authoritative, optional Git and GitHub sync. |
| ADR-003 | R | `.mdx` native authored format; `.md` accepted separately for normal Markdown. Exact bytes are preserved by the source editor. |
| ADR-004 | R | React/TypeScript/Vite shell, CodeMirror 6 source editor. These are mature candidates, not already benchmarked in this project. |
| ADR-005 | R | `@mdx-js/mdx` compiler + one explicit module/dependency bundling strategy. Vite dev-server HMR alone is insufficient for arbitrary unsaved buffers in a packaged application. |
| ADR-006 | C | User JSX/React is untrusted by default; isolate preview from privileged editor/OS APIs. Explicit capability boundaries. |
| ADR-007 | R | Initial preview in a sandboxed, separate-origin context with a restrictive CSP, and independent capability/IPC review in Tauri. Security is tested, not presumed. |
| ADR-008 | C | Dual source/visual editing desired; source-text preservation is non-negotiable. JSX without an editing adapter is atomic in visual mode. |
| ADR-009 | R | Incremental/surgical edits to original source span for supported rendered text instead of whole-document AST reserialization. Prove with no-op byte identity and golden fixtures. |
| ADR-010 | R | Tauri 2 later for native desktop with WebView-specific testing; browser-compatible core first. Avoid assuming desktop Node availability. |
| ADR-011 | D | Programmable Markdown shorthand, parser precedence and custom grammar implementation. |
| ADR-012 | D | Complete AI agent integrations, PDF annotation, generalized code runners, cloud sync and component marketplace. |

## Decisions the ENGINEER owns

- Concrete build service: `@mdx-js/mdx` + esbuild plugins/virtual modules versus Vite-mediated in-memory module loading.
- How live compilation from **unsaved buffers** resolves relative project files and lockfile-pinned dependencies.
- Preview process/origin/CSP and Tauri ACL wiring, proven through negative tests.
- Compiler diagnostics, error recovery, source maps, cached build invalidation.
- Test runner integration and reproducible CI.

## High-risk questions requiring spikes

1. **Running untrusted React safely:** can a preview avoid parent DOM, filesystem, Tauri IPC, secrets, unauthorized network, process spawning? An iframe is a mitigation, not a security proof.
2. **Bundling and module resolution:** how does an edit in an unsaved `.mdx` buffer refresh the preview when it imports a local `.tsx` or lockfile dependency?
3. **Offline distribution:** can the runtime compile/render on a packaged Tauri app WITHOUT a hidden Node development server? Prototype browser `esbuild-wasm` or a clearly isolated native/sidecar service.
4. **Source-preserving edit:** can a rendered paragraph edit patch precisely one source span without changing JSX, whitespace, comments, imports, lists or nearby formatting?
5. **Availability / performance:** how does an infinite loop impact the main UI? How does incremental build scale on low-RAM Linux?

## Things intentionally NOT decided by user

Specific `.mdx` bundler, Tauri versus Electron implementation details, choice of visual-editor package, renderer isolation architecture and AST source-patching design are engineering responsibilities. Record evidence instead of making the user vote on low-level implementation.
