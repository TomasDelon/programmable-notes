# Programmable Notes

Programmable Notes is a local-first, cross-platform Markdown/MDX editor designed for writing and rendering real interactive React components directly in documents.

## Status

Experimental MDX/React editing engine: edit unsaved CodeMirror buffers, compile in a browser worker, interact with React hooks in an isolated preview, open local module files, and download source. The Linux desktop build adds native picker-authorized opening, atomic saving and reopening. See [implementation status](docs/IMPLEMENTATION_STATUS.md) and [runtime ADR](docs/decisions/ADR-001-runtime-build.md). This is not yet approved for hostile documents: the prior Linux native isolation/resource tests passed, and Milestone 3 production validation has its own [evidence record](docs/security-evidence/2026-11-18/README.md). Visual editing is deferred.

## Principles

- Direct MDX, JSX/TSX, and React authoring is the foundation.
- Documents are stored locally and can be versioned with Git.
- Previewing document code must not grant it privileged application access.
- Visual editing, AI-assisted editing, rich media, and programmable Markdown extensions will be developed incrementally.

## Requirements and quick start

Use Node **24.22.1** (`nvm use` if nvm is available) and npm **11.9.0**. Exact dependency versions are recorded in `package-lock.json`. No environment variables, credentials, database, or backend service are required.

```sh
npm ci
npx playwright install chromium
npm run dev
```

The Vite development server listens on port 5173. On a fresh Linux machine, Playwright may also need system libraries: use `npx playwright install --with-deps chromium` with the appropriate system permissions. CI installs those libraries explicitly.

The repository's `.npmrc` keeps npm's cache in ignored `.cache/npm`, which works in restricted cloud workspaces. Codex Cloud already provides Chromium. Use it explicitly for browser checks:

```sh
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
npm run check
```

CI uses Playwright's matching downloaded browser; cloud validation uses the system Chromium version. To install Playwright browsers in a writable cloud path instead, set `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` for both installation and tests. Browser downloads require the network domains saved in the cloud configuration draft to be active. Neither override is required on ordinary local machines.

## Commands

| Command                | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `npm run dev`          | Start Vite with hot reload                                                 |
| `npm run build`        | Typecheck and create production output in `dist/`                          |
| `npm run preview`      | Serve an existing production build on port 4173                            |
| `npm run typecheck`    | Check application, tests, and TypeScript configuration files               |
| `npm run lint`         | ESLint with zero warnings allowed                                          |
| `npm run format`       | Apply Prettier formatting                                                  |
| `npm run format:check` | Verify formatting without changing files                                   |
| `npm test`             | Run Vitest smoke tests once                                                |
| `npm run test:watch`   | Run Vitest interactively                                                   |
| `npm run test:e2e`     | Build, start a production preview, and run Chromium smoke tests            |
| `npm run check`        | Run formatting, lint, typecheck, unit tests, and production browser checks |

`test:e2e` owns its preview server and requires port 4173 to be free. It shuts the server down when the run completes. Browser integration tests exercise actual compilation, React hooks, error recovery, source fidelity, offline rebuilds and negative security probes. Intentional sandbox violations and runtime-error fixtures produce expected console errors. Chromium is the baseline browser; Firefox and WebKit coverage are deferred.

## Structure

```text
src/
  App.tsx             Memory workspace and build scheduling
  compiler/           Browser worker and memory-only resolver
  documents/          Workspace snapshots and native grant-backed persistence
  editor/             CodeMirror source editing
  preview/            Hash-CSP document and sandbox frame
  bootstrap.mdx       Trusted, build-time MDX placeholder
  main.tsx            React entry point
  styles.css          Minimal global styles
  vite-env.d.ts       Vite and MDX module types
tests/
  unit/               Vitest and jsdom toolchain smoke tests
  e2e/                Playwright production smoke tests
  setup.ts            Testing Library setup and cleanup
src-tauri/            Native editor, unprivileged preview shell and Linux packaging
native-documents/     Capability-scoped atomic source-file store
native-policy/        Fail-closed Linux resource supervisor
.github/workflows/    GitHub Actions CI
scripts/              Pinned runtime asset generation and security gates
docs/                 Handoff, ADRs, implementation status and validation
```

Vite compiles application assets; a separate MDX/esbuild-WASM worker compiles author buffers. Generated code runs only in the opaque-origin preview. See [preview boundary and unresolved risks](docs/decisions/ADR-002-preview-isolation.md).

## CI and cloud environment

GitHub Actions runs `npm ci`, installs Chromium and Linux libraries, then runs `npm run check` for pushes to `main` and pull requests. Browser failure artifacts are retained for seven days.

Codex Cloud installation and restart instructions are saved in the environment configuration. Package downloads require `registry.npmjs.org`; Playwright downloads use `cdn.playwright.dev` and its download destinations. Git uses the platform's existing GitHub authentication. No project secrets are needed. Publication of a prepared cloud snapshot is performed through environment settings, separately from Git commits.

## Experimental native security integration

`npm run native:build` builds the Tauri 2 application when Rust and Linux WebKitGTK dependencies are installed. Preview uses a separate, capability-denied process under verified cgroup resource limits; unsupported resource environments refuse preview instead of falling back. `native:dev` opens the editor but preview requires an embedded-asset build. Real Linux WebKitGTK IPC and cgroup stress validation ran in a full cloud VM; retained logs and outstanding gates are linked from [NATIVE_SECURITY.md](docs/NATIVE_SECURITY.md). Repeat its procedure on the target Linux stack before considering hostile-document use. Visual editing remains deferred.

## Linux desktop testing

`npm run native:package` builds an optimized Debian package without test features. Follow [installation and desktop checks](docs/LINUX_DESKTOP_TESTING.md). Native source files are authorized through OS pickers; document code receives no filesystem capability. Conflicts, read-only errors and cancelled dialogs preserve the editor buffer. No autosave or crash draft recovery is implemented. The native preview requires actual network namespaces and delegated cgroup controllers and fails closed when unavailable.

CI builds and inspects the package and uploads a temporary testing artifact. It does not run the full-system native security matrix; retained runtime evidence and unresolved risks are recorded separately.
