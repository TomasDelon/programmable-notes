# Cloudflare Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare a tested permanent static-hosting target and one-time owner connection procedure.
**Architecture:** Keep the existing app unchanged. Generate Pages transport metadata, preserve offline release integrity, and validate the real build under its headers.
**Tech Stack:** Existing Vite/React/Node24.22.1/npm11.9.0/Playwright; no new dependencies.
**Spec:** `docs/superpowers/specs/2026-11-24-cloudflare-testing.md`.

## Global Constraints

- No deployment, account/DNS/permissions/billing change, merge, release or readiness change.
- Preserve native/default builds, source bytes, workspace recovery and preview isolation.
- Repository-only inline execution; one read-only final review, no coding agents.

## Review Focus

- Consumed hosting files must not prevent offline installation.
- Header-only changes must invalidate the offline release.
- Inherited host CSP must preserve React and enforced preview restrictions.
- Stable-origin storage and explicit migration must be explained to the owner.
- Actual Cloudflare/DNS/TLS acceptance remains unverified until connected.

### Task1: Build target and offline integrity

Files: `scripts/cloudflare-config.ts`, `scripts/cloudflare-assets.mjs`,
`scripts/web-offline.mjs`, `package.json`, `tests/tooling/cloudflare-build.test.mjs`.
Interface: `cloudflareHeaders()` produces the deterministic `_headers` text;
`headersForPath(pathname)` produces the same matching response headers.

- [x] Add a real fixture build test excluding consumed files from offline ASSETS while changing their bytes changes CACHE.
- [x] Run it RED against the current generator.
- [x] Implement shared header rules, the Pages metadata CLI and control-file handling.
- [x] Run tooling GREEN; preserve native/default generation.

### Task2: Real-browser hosting acceptance

Files: `scripts/preview-cloudflare.mjs`, `playwright.cloudflare.config.ts`,
`tests/deployment/cloudflare.spec.ts`, `package.json`, `.github/workflows/ci.yml`.
Interface: localhost4174 serves the existing dist with verified generated headers;
`PN_DEPLOYMENT_URL` selects an explicit HTTPS root for later acceptance.

- [x] Add a browser regression asserting real HTTP headers and functioning React/sandbox; run RED against ordinary preview.
- [x] Implement the Pages-compatible preview and accept only valid root origins.
- [x] Cover exact source history/save/reload and successful offline installation/reopen.
- [x] Reuse the existing CI build for local hosting checks; separate report/output folders. Add an optional deployment_url dispatch to the existing CI workflow for fresh-profile live acceptance, skipping duplicate local/native jobs only for that dispatch.
- [x] Pin npm11.9.0 in both ordinary CI jobs, without changing runner/token permissions.
- [x] Run full check and Cloudflare target; record actual counts and limits.

### Task3: Owner handoff and publication

Files: `docs/CLOUDFLARE_PAGES.md`, README command reference, progress log.

- [x] Document exact project/branch/build/output/Node/skip-install settings and the custom-domain association order.
- [x] Explain stable origins, backups, promotion/rollback and unexecuted live checks.
- [x] Obtain read-only whole-branch review, fix concrete issues, scan credentials before push.
- [ ] Commit/push coherent work to a separate draft PR based on PR7; no automatic deployment.
- [ ] Give the owner the single account connection/project creation step only after configuration/tests are concrete.
