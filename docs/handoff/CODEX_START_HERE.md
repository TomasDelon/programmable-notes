# Codex Cloud: start here

You are implementing **Programmable Notes**. Read the complete handoff before making architectural changes. First inspect the existing repository and `AGENTS.md`; the bootstrap task may already have created a scaffold. Do not recreate, delete, overwrite or duplicate working infrastructure.

## Immediate mandate

Implement a **small, testable MDX/React runtime spike**, not a complete app. The user must be able to write normal MDX with inline JSX/ESM definitions and imports, render functional React components with state/hooks/event handlers, edit the source and see the result change, and recover gracefully from syntax/runtime errors.

## Required working principles

1. `@mdx-js/mdx`, React, TypeScript, CodeMirror 6, Vite, and testing tools are strong candidates, not a waiver of real validation.
2. Distinguish compiling an **unsaved buffer** from Vite's normal source-file pipeline.
3. Previewed user or AI-authored code is untrusted. Do not `eval` it in the privileged app/editor origin, or grant it access to native IPC, filesystem, secrets or subprocesses. Do not claim an iframe alone makes execution fully safe.
4. Make no promise of generic, lossless visual editing for arbitrary JSX. Support reliable raw source first, and prove narrowly-scoped source patches later.
5. Do not implement custom `#component()` Markdown grammar, a component marketplace, AI connectors, remote execution, or general visual editing during the first spike.
6. Never silently overwrite user files. Work on a new branch/PR when appropriate; run tests and report exact commands/results.
7. If a chosen architecture requires runtime Node.js in the packaged Tauri app, identify this explicitly rather than hiding it in build tooling.
8. For every rejected design, record evidence and a short ADR; for reversible choices, optimize for a working testable solution.

## Execution order

1. Inspect current repo/branch, package manager, CI, `AGENTS.md`, and any active Codex work; reconcile with this bundle.
2. Read `product/CURRENT_PRODUCT_SPEC.md`, `architecture/DECISIONS_AND_OPEN_QUESTIONS.md`, `architecture/SECURITY_MODEL.md`, `architecture/MDX_BUILD_PIPELINE.md`.
3. Implement **Spike A** of `implementation/SPIKES_AND_ACCEPTANCE.md` using a minimal browser shell. Write a short decision memo identifying the unsaved-buffer module resolution strategy.
4. Implement **Spike B** with an isolated preview and negative security tests. Treat a security failure as a blocker, not a cosmetic issue.
5. Only if the first two are passing, attempt **Spike C** for a surgical rendered-text source edit, without losing MDX bytes outside the modified span.
6. Save test reports, constraints, screenshots/videos if Playwright can produce them, and an actionable next-milestone issue/PR.

## Stop / report conditions

Report clearly if cloud-runner permissions, dependency installation, browser availability, mobile WebView, Tauri IPC, import resolution, runtime isolation or GitHub write rights prevent a test. Never substitute a mock UI test for actual compiled React execution. Do not expand scope silently.

**Output expected:** a PR or branch containing verified code/tests, a concise ADR, security test results, and a table of passed/failed/unrun criteria. Do not declare Milestone 1 complete until its acceptance criteria are met.
