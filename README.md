# Programmable Notes

Programmable Notes is a local-first, cross-platform Markdown/MDX editor designed for writing and rendering real interactive React components directly in documents.

## Status

Toolchain bootstrap only. The page is a minimal React/MDX placeholder; editor behavior, storage, document execution, and desktop packaging await the technical handoff. CodeMirror is installed and exercised in a smoke test, without adding an editor feature.

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

`test:e2e` owns its preview server and requires port 4173 to be free. It shuts the server down when the run completes. The browser test fails on page errors or console errors. Tests cover the React/MDX pipeline and CodeMirror state/view creation, editing transactions, and cleanup. Chromium is the baseline browser; Firefox and WebKit coverage are deferred.

## Structure

```text
src/
  App.tsx             Minimal shell
  bootstrap.mdx       Trusted, build-time MDX placeholder
  main.tsx            React entry point
  styles.css          Minimal global styles
  vite-env.d.ts       Vite and MDX module types
tests/
  unit/               Vitest and jsdom toolchain smoke tests
  e2e/                Playwright production smoke tests
  setup.ts            Testing Library setup and cleanup
.github/workflows/    GitHub Actions CI
docs/                 Bootstrap plan and future project documentation
```

Vite compiles trusted repository MDX at build time. This is not an execution sandbox for user-authored documents. The handoff must define that isolation before document execution is implemented.

## CI and cloud environment

GitHub Actions runs `npm ci`, installs Chromium and Linux libraries, then runs `npm run check` for pushes to `main` and pull requests. Browser failure artifacts are retained for seven days.

Codex Cloud installation and restart instructions are saved in the environment configuration. Package downloads require `registry.npmjs.org`; Playwright downloads use `cdn.playwright.dev` and its download destinations. Git uses the platform's existing GitHub authentication. No project secrets are needed. Publication of a prepared cloud snapshot is performed through environment settings, separately from Git commits.
