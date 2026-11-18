# Working on Programmable Notes

## Current scope

The technical handoff is preserved in `docs/handoff`; current implementation and limits are in `docs/IMPLEMENTATION_STATUS.md` and `docs/decisions`. MDX/React source authoring is the priority. Keep visual editing gated on the runtime and full security matrix. Treat the original research as supporting evidence, not validated decisions.

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

## Native Linux work

Read `docs/NATIVE_SECURITY.md`, `docs/LINUX_DESKTOP_TESTING.md` and ADR-004 before changing native authority or packaging. `npm run native:package` builds an optimized Debian testing artifact without `security-test`. Native document paths come only from editor-side OS dialogs; renderer commands use opaque grants/revisions. Never add a generic filesystem permission for preview code.

Actual native validation requires a disposable full-system Linux desktop/VM with systemd, cgroup delegation, working namespaces and WebKitGTK. Compilation and package inspection do not prove runtime behavior. Keep production child automation/inspector disabled, resource limits fixed and failed observations in the dated evidence. WebDriver changes WebKit's networking configuration; verify normal production namespace/seccomp behavior separately from automated ACL probes. No public release or PR readiness change is implied by a passing local suite.

## Code conventions

Use TypeScript with strict checks and functional React components. Keep code close to its tests and follow ESLint and Prettier configuration. Keep the scaffold small; create additional directories and abstractions only when the handoff needs them.

## Cloud snapshots

Dependencies and browser binaries can persist in the filesystem snapshot; servers do not. Restart Vite as needed and verify readiness. Cloud configuration saves, snapshot publication, Git push, and CI execution are separate operations: report only outcomes that were actually verified.
