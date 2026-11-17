# MDX engine validation and next milestone

Baseline: `f531ddf`; development branch `feat/mdx-react-engine`. The original handoff is preserved under `docs/handoff` as supporting specifications/research, not proof that its architectural suggestions work. Historical claims about Rust esbuild, generic TS syntax in MDX, native isolation from missing globals, and generic inverse React editing are not adopted.

## Acceptance matrix

| Criterion                                                      | Result / evidence                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Real MDX inline hooks, events, two-click counter               | Passed in Chromium production preview                                                |
| Unsaved CodeMirror text changes preview                        | Passed                                                                               |
| Local imported TSX, including newly opened modules             | Passed                                                                               |
| Pinned clsx package                                            | Passed; no runtime package fetch/installation                                        |
| Syntax error and runtime crash recovery                        | Passed, source remains editable                                                      |
| Rapid edits / outdated build cancellation                      | Passed latest-heading and Stop regression                                            |
| Save/download/reopen and mixed-source bytes                    | Passed UTF-8 fixtures; CRLF no-op save regression                                    |
| Parent DOM/storage, popup, top navigation, fetch, resource CSP | Passed Chromium negative tests                                                       |
| Forged host message                                            | Ignored in browser test                                                              |
| Self-navigation                                                | Initial child-only policy failed; parent frame-src restriction passed retained probe |
| Infinite-loop parent responsiveness                            | Observed responsive in disposable Chromium probe; not a portable resource limit      |
| High-memory pressure / hard quotas                             | Unrun, security blocker                                                              |
| Native Tauri IPC/capability scopes and Linux WebKitGTK         | Unrun, security blocker; browser missing-global probe is not equivalent              |
| TypeScript inside MDX                                          | Unsupported; use imported TSX                                                        |
| Full MDX source-map composition/runtime symbolication          | Not implemented                                                                      |
| Visual editing (Spike C)                                       | Deferred until complete A/B gates pass                                               |
| GitHub-hosted CI                                               | Not inferred from local runs                                                         |

## Reproduce

Use Node from `.nvmrc`; `npm ci`. `npm run dev` and `npm run build` generate the pinned preview runtime before Vite starts. `npm run check` runs format/lint/typecheck/unit/browser integration. In this cloud, export `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; CI uses Playwright's matching browser.

The additional bounded security gate requires a production build and preview on port 4180:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4180 --strictPort
# In another shell:
node scripts/security-gates.mjs
```

That probe starts its own disposable browser server, intercepts and aborts any test navigation before external egress, tests the policy invariant, then probes an infinite-loop document and kills its browser process. It exits nonzero on navigation escape, host unresponsiveness, or probe error. It does not test high-memory exhaustion. Retain test logs with the PR; browser traces on failures are generated under ignored test-results.

## Next milestone, in order

1. Native isolation and availability: separate unprivileged preview process/webview, capability denial for manually crafted IPC, OS memory/CPU budgets, reliable termination, Linux WebKitGTK regression suite. Keep this gate blocking hostile-document use.
2. Native/browser workspace adapter: explicit file authorization, nested module selection, atomic save, dirty state, close/reopen recovery, encoding/line-ending policy, independent file undo histories.
3. Compose MDX source maps, source-located runtime diagnostics, typed-source policy, performance budgets and lazy compiler loading.
4. Only after security passes, Spike C: uniquely mapped Markdown paragraph patches, stale-map rejection, no-op byte identity, JSX opacity, undo/redo golden tests. No broad DOM-to-MDX serialization.

No custom grammar, AI, Git synchronization, marketplace, or native packaging is included in this PR.
