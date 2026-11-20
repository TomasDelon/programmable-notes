# Source Quality, Corrections and Verification

This document annotates the historical Deep Research reports. It does not rewrite their original wording.

## Important corrections / qualification

1. **esbuild implementation language:** The broad report says an MDX/esbuild plugin offers "Rust-based speed". That is inaccurate: **esbuild is implemented in Go**, while SWC is Rust-based. Do not propagate the broad report's claim.
2. **Vite vs unsaved buffer:** Vite's `@mdx-js/rollup` integration proves compile-time MDX support, but not a packaged editor's ability to compile an arbitrary unsaved buffer plus local/npm imports with no dev server.
3. **JSX vs typed TypeScript within `.mdx`:** JSX and JS expressions work via the MDX grammar; native TS syntax inside MDX is not simply equivalent to importing `.tsx`. Test actual typed source and the proposed transform before promising it.
4. **MDX `compile` vs `evaluate`:** `compile` produces JavaScript. `evaluate`/`run` executes code and requires a trusted environment or sandbox. Compiler output is not safe simply because it came from MDX.
5. **iframe sandbox:** `allow-scripts` without `allow-same-origin` creates an opaque origin, but does not automatically forbid every network request, `postMessage`, CPU exhaustion or all possible browser vulnerabilities. CSP and isolated runtime are separate controls.
6. **Tauri IPC:** The absence of Tauri API imports or `window.__TAURI__` is not a complete security boundary. Correct capabilities, scopes, custom command restrictions and actual webview/window identities matter; overlapping capabilities effectively merge permissions.
7. **Browser security versus native security:** Passing tests in Chromium/Playwright does not establish equivalent WebKitGTK/macOS or mobile WebView protections.
8. **Visual edit claims:** A project's "round-trip JSX as opaque atoms" is NOT a general inverse renderer for arbitrary React components. Generic source fidelity remains unproven.
9. **Performance/size statistics:** Previous estimates about Tauri, Electron, CodeMirror bundle size/memory are not benchmarks of this project. Measure real builds before making claims.
10. **React state preservation:** Live full-frame replacement may reset hooks state. Treat HMR/state preservation as an independent UX choice and test; interactive correctness comes first.
11. **Source index:** Original numbered citations can point to less authoritative blogs or fragments. They are preserved for provenance, not promoted to verified design rules.

## Primary official documentation checked during handoff compilation (2026-11-17)

- MDX core compiler: https://mdxjs.com/packages/mdx/ (compilation vs evaluation)
- MDX esbuild plugin: https://mdxjs.com/packages/esbuild/ (real `esbuild.build` integration)
- MDX packages index: https://mdxjs.com/packages/
- Tauri capability permissions: https://v2.tauri.app/security/capabilities/ (capabilities apply to webviews/windows; overlapping grants merge)
- Tauri capability ACL reference: https://v2.tauri.app/reference/acl/capability/
- Tauri runtime authority: https://v2.tauri.app/security/runtime-authority/
- MDN iframe sandbox: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- MDN srcdoc security: https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/srcdoc
- MDN CSP sandbox: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox

**Verification boundary:** These references were checked for documentation statements, not used to execute a working application, audit a browser, inspect private repo configuration or benchmark a prototype.
