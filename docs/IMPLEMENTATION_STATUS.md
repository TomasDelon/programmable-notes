# MDX engine validation and next milestone

Baseline: `f531ddf`; development branch `feat/mdx-react-engine`. The original handoff is preserved under `docs/handoff` as supporting specifications/research, not proof that its architectural suggestions work. Historical claims about Rust esbuild, generic TS syntax in MDX, native isolation from missing globals, and generic inverse React editing are not adopted.

## Acceptance matrix

| Criterion                                                      | Result / evidence                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Real MDX inline hooks, events, two-click counter               | Passed in Chromium production preview                                                   |
| Unsaved CodeMirror text changes preview                        | Passed                                                                                  |
| Local imported TSX, including newly opened modules             | Passed                                                                                  |
| Pinned clsx package                                            | Passed; no runtime package fetch/installation                                           |
| Syntax error and runtime crash recovery                        | Passed, source remains editable                                                         |
| Rapid edits / outdated build cancellation                      | Passed latest-heading and Stop regression                                               |
| Save/download/reopen and mixed-source bytes                    | Passed UTF-8 fixtures; CRLF no-op save regression                                       |
| Parent DOM/storage, popup, top navigation, fetch, resource CSP | Passed Chromium negative tests                                                          |
| Forged host message                                            | Ignored in browser test                                                                 |
| Self-navigation                                                | Initial child-only policy failed; parent frame-src restriction passed retained probe    |
| Infinite-loop parent responsiveness                            | Observed responsive in disposable Chromium probe; not a portable resource limit         |
| High-memory pressure / hard quotas                             | Passed actual Linux WebKit heap cgroup OOM at 512 MiB; CPU 25%, swap 0, pids 128        |
| Native Tauri IPC/capability scopes and Linux WebKitGTK         | Passed actual registered-command denial, private storage, Counter and DOM/storage tests |
| TypeScript inside MDX                                          | Unsupported; use imported TSX                                                           |
| Full MDX source-map composition/runtime symbolication          | Not implemented                                                                         |
| Visual editing (Spike C)                                       | Deferred until complete A/B gates pass                                                  |
| GitHub-hosted CI                                               | Not inferred from local runs                                                            |

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

1. Finish Linux production-security review and release-build/desktop validation using the retained native matrix. The cloud VM now proves core native IPC and resource behavior, not broad compromised-native-code containment or distribution readiness. Keep hostile-document shipping gated on that review.
2. Native/browser workspace adapter: explicit file authorization, nested module selection, atomic save, dirty state, close/reopen recovery, encoding/line-ending policy, independent file undo histories.
3. Compose MDX source maps, source-located runtime diagnostics, typed-source policy, performance budgets and lazy compiler loading.
4. Only after security passes, Spike C: uniquely mapped Markdown paragraph patches, stale-map rejection, no-op byte identity, JSX opacity, undo/redo golden tests. No broad DOM-to-MDX serialization.

No custom grammar, AI, Git synchronization, marketplace, or native packaging is included in this PR.

## Native security follow-up

Minimal Tauri integration, a no-capability ephemeral preview child, defense-in-depth handler authorization, and a fail-closed Linux systemd/cgroup supervisor are implemented. Resource controllers are verified before sending author HTML. See [ADR-003](decisions/ADR-003-native-runtime.md) and [Linux native validation](NATIVE_SECURITY.md).

Actual Linux native validation ran in a task-local full Ubuntu 24.04 VM with WebKitGTK 2.52.6, systemd 255.4 and delegated cgroup v2. The outer cloud container could not supply those boundaries directly. Native link/build, actual Tauri ACL denial (with editor positive control), incognito profile separation, interactive WebKit Counter, CPU throttling, whole-group Stop, cgroup OOM, fixed lifetime expiry, editor SIGKILL backstop, window-close recovery and missing-controller refusal now have real evidence. See the [dated logs and matrix](security-evidence/2026-11-17/README.md) for exact scope, failures, binaries and outstanding gates.

Validation found and fixed two native issues: Wry’s discarded automation flag in an incognito context (a documented minimal source fork preserves the private profile), and rejection of Tauri’s empty-path editor root URL. Production children explicitly force automation off. The full embedded editor compiles MDX in WebKit; actual CodeMirror edits and exact Save Blob bytes passed under CPU and growing-heap pressure, followed by interactive unsaved Counter rebuilds. Native disk writing remains untested. Resource policy, permissions and CSP were not relaxed.

Local verification includes format/lint/strict TypeScript, six Vitest tests, five Chromium browser tests, four Rust policy tests and the native app navigation regression. CI at baseline `ad9e6fd` passed according to the user; current CI is not inferred from local checks. Non-Linux native preview and Vite native-preview mode still fail closed. Optimized release packaging, native filesystem writes and broader OS threat review remain unverified. No visual editing, custom Markdown syntax or deferred product features were started.
