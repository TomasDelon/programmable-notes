# Programmable Notes

Programmable Notes is a local-first, cross-platform Markdown/MDX editor designed for writing and rendering real interactive React components directly in documents.

## Web workspace

The browser app at `/` combines the approved UI Lab interface with the existing
MDX/React engine. It provides Source and editable Preview modes, notes and
folders, full-text search, stable Recent shortcuts, in-place LaTeX editing,
wikilinks, backlinks, and interactive React documents. Validated images and
PDFs retain their original bytes. Notes autosave to IndexedDB in the current browser, with
checksummed backups that include attachments and recovery checkpoints, Trash,
and explicit handling of conflicting tabs.

Production builds can reopen offline after their application assets finish
caching. Notes stay in the current browser profile; there is no account or
cross-device synchronization. Export workspace backups to keep an independent
copy. Read the [web app guide](docs/WEB_APP.md) for daily use, imports, storage,
supported code, and current limits. The [integration record](docs/DAILY_USE_INTEGRATION.md)
documents the agent audit and corrected source provenance.

To try the browser app at a permanent HTTPS address, follow the
[Cloudflare Pages setup guide](docs/CLOUDFLARE_PAGES.md). Static hosting is included;
no personal server is needed. Hosting does not synchronize notes between browsers.

An optional [private cloud storage build](docs/PRIVATE_CLOUD_STORAGE.md) adds
authenticated Pages Functions and D1, server-confirmed autosave, revision checks
and recovery. It has local runtime/browser tests; account provisioning, real
Access login and hosted Free-quota acceptance are still pending. The existing
website is not switched to cloud storage automatically.

## Original engine and native status

Experimental MDX/React editing engine: edit unsaved CodeMirror buffers, compile
in a browser worker, use JSX/imports/hooks/events in an isolated preview and
save exact source. Linux adds picker-authorized opening, atomic saving/reopening
and bounded versioned recovery with explicit unsaved restoration.

Source, Split and Visual modes separate source authoring, React execution and
trusted in-place Markdown editing. Literal paragraphs, headings, simple lists
and quoted paragraphs support checked, undoable text patches. Explicit multiline
quotes keep their line count, every marker and each original LF/CRLF ending;
use Source to change structure. React, formatted and ambiguous blocks remain
opaque; expand a read-only block and choose **Show in Source** to focus its
original position without changing the document. See the [workspace decision](docs/decisions/ADR-007-unified-workspace.md)
and [quote contract](docs/decisions/ADR-010-multiline-quote-editing.md).

This remains experimental and is not approved for hostile documents or production
security readiness. [Implementation status](docs/IMPLEMENTATION_STATUS.md) links
exact successful checks, failed acceptance gates and unresolved native risks;
compilation, browser tests and packaged runtime evidence have distinct scopes.

[Download the current browser review demo, screenshots and walkthrough](docs/demo/README.md).

New note creates an independent empty buffer. Focus the editor workspace and use
Ctrl/Cmd+S to save; Shift requests native Save As. Enter applies a visual text edit
and Escape cancels it. Modified inline text stays protected against closing or
switching documents, but remains memory-only until applied. Native automatic
versioned recovery stores applied source separately from originals. Current
package-specific successes and failed acceptance gates are recorded in the
[implementation status](docs/IMPLEMENTATION_STATUS.md).

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

The web workspace opens at `/`. The original engine remains at `/engine` for
regression testing and is selected automatically by the native application.

The repository's `.npmrc` keeps npm's cache in ignored `.cache/npm`, which works in restricted cloud workspaces. Codex Cloud already provides Chromium. Use it explicitly for browser checks:

```sh
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
npm run check
```

CI uses Playwright's matching downloaded browser; cloud validation uses the system Chromium version. To install Playwright browsers in a writable cloud path instead, set `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` for both installation and tests. Browser downloads require the network domains saved in the cloud configuration draft to be active. Neither override is required on ordinary local machines.

## Commands

| Command                    | Purpose                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`              | Start Vite with hot reload                                                            |
| `npm run build`            | Typecheck and create production output in `dist/`                                     |
| `npm run preview`          | Serve an existing production build on port 4173                                       |
| `npm run typecheck`        | Check application, tests, and TypeScript configuration files                          |
| `npm run lint`             | ESLint with zero warnings allowed                                                     |
| `npm run format`           | Apply Prettier formatting                                                             |
| `npm run format:check`     | Verify formatting without changing files                                              |
| `npm test`                 | Run Vitest unit and regression tests                                                  |
| `npm run test:watch`       | Run Vitest interactively                                                              |
| `npm run test:e2e`         | Build, start a production preview, and run Chromium integration tests                 |
| `npm run check`            | Run formatting, lint, typecheck, unit tests, and production browser checks            |
| `npm run build:cloudflare` | Build static Pages output and transport policy in `dist/`                             |
| `npm run test:cloudflare`  | Build and test hosting policy, React isolation, source fidelity and offline reopening |

`test:e2e` owns its preview server and requires port 4173 to be free. It shuts the server down when the run completes. Browser integration tests exercise actual compilation, React hooks, error recovery, source fidelity, offline rebuilds and negative security probes. Intentional sandbox violations and runtime-error fixtures produce expected console errors. Chromium is the baseline browser; opt-in hosted QA also runs Firefox and WebKit (see [browser QA](docs/BROWSER_QA.md)).

Set `PLAYWRIGHT_WORKERS=1` when running the full checks on a constrained shared
runner. This changes concurrency without skipping tests or adding retries.

## Structure

```text
src/
  App.tsx             Memory workspace and build scheduling
  compiler/           Browser worker and memory-only resolver
  documents/          Workspace snapshots and native grant-backed persistence
  editor/             CodeMirror history and trusted Markdown source patches
  preview/            Hash-CSP document and sandbox frame
  web/                Browser workspace, durable local storage, and UI Lab shell
  bootstrap.mdx       Trusted, build-time MDX placeholder
  main.tsx            React entry point
  styles.css          Responsive workspace styles
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

`npm run native:build` builds the Tauri 2 application when Rust and Linux WebKitGTK dependencies are installed. Preview uses a separate, capability-denied process under verified cgroup resource limits; unsupported resource environments refuse preview instead of falling back. `native:dev` opens the editor but preview requires an embedded-asset build. Real Linux WebKitGTK IPC and cgroup stress validation ran in a full cloud VM; retained logs and outstanding gates are linked from [NATIVE_SECURITY.md](docs/NATIVE_SECURITY.md). Repeat its procedure on the target Linux stack before considering hostile-document use. Source-preserving visual editing is implemented on an editor-owned surface; arbitrary React remains opaque.

## Linux desktop testing

`npm run native:package` builds an optimized Debian package without test features. Follow [installation and desktop checks](docs/LINUX_DESKTOP_TESTING.md). Native source files are authorized through OS pickers; document code receives no filesystem capability. Conflicts, read-only errors and cancelled dialogs preserve the editor buffer. Automatic private versioned recovery snapshots are implemented, with explicit unsaved restoration and no automatic writes to original files; see [ADR-008](docs/decisions/ADR-008-versioned-recovery.md). The native preview requires actual network namespaces and delegated cgroup controllers and fails closed when unavailable.

CI builds and inspects the production package. Both jobs actually passed on public head `8a8e44c`; the earlier private-account billing refusal is no longer blocking that run. Automatic native installer uploads are paused until the full native redistribution notice inventory is complete. CI does not run the full-system native security matrix; retained runtime evidence and unresolved risks are recorded separately.

## Public repository and licensing

This repository is public. No project open-source license has been selected;
visibility alone does not grant a general reuse license. Existing upstream
licenses remain applicable. Browser builds include `THIRD_PARTY_NOTICES.txt`;
[the preserved review demo notices](docs/demo/THIRD_PARTY_NOTICES.txt) and
[design font license](docs/design-reference/2026-11-18/FONT_LICENSES.txt) accompany
older materials. Native binary redistribution notices remain incomplete.

See [public remediation and owner decisions](docs/PUBLIC_READINESS.md) and
[security reporting](SECURITY.md). Standard public Ubuntu Actions compute is free;
artifact/storage allowances are separate. No paid infrastructure is required.

Development and preview commands bind to `127.0.0.1` by default. Approved cloud
forwarding can opt in with `--host 0.0.0.0`; the source server is a development
tool, not an authenticated deployment. Vite explicitly denies private audit and
scanner directories while retaining every installed upstream secret-file deny
pattern. Gitignore alone does not protect files from source serving.
