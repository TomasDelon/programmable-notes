# Working on Programmable Notes

## Current scope

This repository currently contains the development toolchain and a minimal placeholder page. Wait for the technical handoff before implementing application features or choosing storage, desktop packaging, or document execution architecture.

Preserve the README's local-first and document-isolation principles. Build-time repository MDX is trusted source code; never treat the MDX compiler as a sandbox for untrusted documents.

## Workspace and tools

- Cloud tasks already use an isolated environment. Use the existing checkout; do not create a Git worktree unless the user explicitly asks for one.
- Run commands from the repository root, `/workspace/programmable-notes` in Codex Cloud.
- Use the Node version in `.nvmrc` and npm version in `package.json`.
- Install with `npm ci`. Keep exact versions and commit `package-lock.json` when intentionally changing dependencies.
- `.npmrc` puts npm's cache in ignored `.cache/npm`. Keep generated output, browser artifacts, credentials, and local environment files out of commits.
- For cloud browser tests, export `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` to use the preinstalled system browser. CI uses Playwright's matching downloaded browser. If installing browsers in the cloud, export `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` before installation and tests; the required download domains must be active.
- No application secrets, backend, or database are required for this scaffold.

## Development and checks

- `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` starts development. Verify an HTTP response and use a browser smoke test for rendered behavior; a listening process alone is not validation.
- Run `npm run check` before committing. It verifies formatting, lint, strict TypeScript, Vitest, and Playwright against a fresh production build.
- `npm run test:e2e` owns a preview on port 4173. Leave that port free and let the runner manage the server lifecycle.
- Use `npm run format` for formatting fixes, then rerun the affected checks.
- Unit tests live in `tests/unit`; browser tests live in `tests/e2e`. Add meaningful tests when implementing behavior. Keep browser and unit test discovery separate.
- Keep changes focused and avoid committing caches, `dist/`, test results, or reports.

## Code conventions

Use TypeScript with strict checks and functional React components. Keep code close to its tests and follow ESLint and Prettier configuration. Keep the scaffold small; create additional directories and abstractions only when the handoff needs them.

## Cloud snapshots

Dependencies and browser binaries can persist in the filesystem snapshot; servers do not. Restart Vite as needed and verify readiness. Cloud configuration saves, snapshot publication, Git push, and CI execution are separate operations: report only outcomes that were actually verified.
