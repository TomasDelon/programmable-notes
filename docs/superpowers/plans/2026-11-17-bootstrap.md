# Project Bootstrap Implementation Plan

> Execute inline in the existing isolated cloud checkout. The user's bootstrap request is the specification and authorizes sensible defaults, source scaffolding, validation, commit, and push.

**Goal:** Prepare the requested React/TypeScript/Vite development toolchain without application features.

**Architecture:** One npm package, a minimal React/MDX placeholder, CodeMirror exercised only by integration smoke tests. Unit tests use jsdom; Playwright tests the production preview.

**Tech stack:** Node 24, npm, React, TypeScript, Vite, CodeMirror 6, MDX, Vitest, Playwright, ESLint, Prettier, GitHub Actions.

## Constraints and review focus

- Preserve the README's project intent and principles; defer editor features and product architecture to the technical handoff.
- Commit the lockfile; use frozen installation in CI and cloud setup.
- Typecheck browser, test, and configuration files; lint and format the entire supported source tree.
- Verify MDX rendering and CodeMirror state/view dependencies, not just package installation.
- Exercise a built page in a real browser and fail on browser errors.
- Keep environment caches and generated output ignored; save restart instructions because live processes do not survive snapshots.

## Tasks

- [x] Install dependencies and configure Vite, TypeScript, ESLint, Prettier, Vitest, and Playwright.
- [x] Add a minimal React/MDX shell and smoke tests; avoid editor functionality.
- [x] Document scripts, structure, scope, and cloud setup in README and AGENTS.md; add CI with the same checks.
- [x] Run a repeatable npm ci, formatting, linting, typechecking, unit tests, build, and browser tests; fix configuration failures.
- [x] Review the complete diff and save tested cloud installation/start instructions. Commit/push and remote SHA verification are the final execution steps, reported in the handoff.

## Validation and decisions

- Repeated `npm ci`; formatting, lint, typecheck, two Vitest smoke tests, production build, and one Playwright test passed. Development mode also passed a real-browser React/MDX smoke check.
- MDX must run with `enforce: pre` before Vite JavaScript transformation. The initial unit test exposed this ordering requirement.
- The cloud npm cache is project-local because the default home cache is unwritable.
- Cloud validation explicitly uses preinstalled Chromium 156. CI installs Playwright’s matching Chromium. Browser-download domains were saved in the environment draft; the current policy still denies the download.
- Final independent review found no important issues. Node type definitions were aligned to runtime major 24 after review.
- No product behavior, persistence, or user-document execution was implemented.
