# Private cloud storage

The optional cloud build saves notes to a private D1 database through same-origin
Pages Functions. The normal build and the currently deployed browser workspace
remain browser-backed until a configured cloud deployment is separately accepted.
Native document saving is unchanged.

This is a single-owner store. Authentication is mandatory; there is no public
notes API, server MDX execution, arbitrary filesystem bridge, community plugin
authority or paid service. See [ADR021](decisions/ADR-021-private-cloud-storage.md)
and the [provider research](research/2026-11-26-private-backend.md).

## Save and recovery behavior

Set `VITE_STORAGE_BACKEND=cloud` at build time. URL parameters, document code and
preview messages cannot select a storage backend. Cloud mode never opens the
IndexedDB workspace or silently falls back to it. Notes in an already-open tab
remain in memory while offline; saving and opening require a connection and a
valid owner login. Keep the tab open or download a backup after failed saves.
**Sign in** opens an authenticated handoff in a separate tab, preserving the live
draft. After login, return to the original tab and retry. The handoff returns no
note data and never mutates storage.

Autosave waits two seconds after changes and serializes publications. **Saved to
cloud** requires acknowledgement for the actual saved generation. An unpublished
upload cannot replace the committed workspace. Expected revisions protect
competing devices; conflicts retain local edits and require explicit resolution.
Exact manifest replay can recover a lost acknowledgement without another revision.
A later device's publication is never rolled back. Backup restoration uses the
reviewed tab's acknowledged revision and refuses failed/conflicted saves.
This is optimistic whole-workspace persistence, not collaborative editing or
automatic merging.

An inventory includes the current state, the existing five bounded recovery
checkpoints and the separate retained-edit inventory. Restore, imported recovery
and consuming a retained edit publish atomically. Clients verify chunk and whole
inventory checksums, state, source bounds, attachment identities and media before
adopting data. The server stores opaque bytes and independently verifies uploaded
chunk identities, sizes, ownership and atomic publication.

Binary chunks are at most 1 MiB; one inventory is at most 96 MiB UTF-8, without
relaxing the existing per-source, workspace, attachment and recovery limits.
Staged uploads expire after ten minutes, with four concurrent stages maximum.
Stored chunk bytes are bounded to 256 MiB. Exhaustion fails rather than discarding
canonical data, silently upgrading a plan, or pretending an in-memory edit saved.
Large workspaces can cost many requests and allocations; local tests do not prove
the hosted Free CPU quota. Near-limit hosted performance remains a deployment gate.

Checksums detect corruption, not malicious changes by someone who controls the
Cloudflare account. D1 is not end-to-end encrypted. Access controls protect the
API; Cloudflare and authorized account administrators remain trusted storage
operators. Portable backups outside Cloudflare remain necessary.

JWKS entries are cached for at most sixty seconds. A newly rotated signing key
may be denied until expiry; this temporary failure preserves the live draft.

## Reproduce local acceptance

With Node/npm pinned by the repository and Playwright Chromium installed:

```sh
npm ci
npm run test:tooling
npm run test:cloud:local
```

The tooling test executes the deployed Function adapter in **workerd**, with real
local D1 SQLite and a synthetic signed Access identity. It exercises authorization,
binary storage, incomplete upload refusal, atomic publication and stale CAS.
Browser acceptance builds a separate cloud-mode artifact, serves it on loopback
HTTPS and verifies save, exact source/undo/reopen in a fresh profile, failed-save
retry, no IndexedDB fallback and opaque-origin denial. An ephemeral self-signed
certificate is trusted only by the disposable Playwright fixture. Tests never
weaken production authentication or require account credentials.

`scripts/cloud-test-runtime.mjs` and `scripts/preview-cloud-storage.mjs` are test
tooling, **not deployable identity services**. Their synthetic cookie/JWKS shim is
never included in Pages Functions. Production uses Cloudflare Access at the edge
and independently validates its signed JWT inside the Function.

## Provision and deploy, on Free only

Account operations are pending authentication. Do not paste API tokens into a
note, source file, issue, PR, screenshot, shell command history or public log.
Use an approved secret-injection/login mechanism. The deployment token needs
only the account-scoped permissions actually used; never use the global API key.

1. Confirm Workers/Pages and D1 are on Free and inspect existing account usage.
   Create a separate D1 database for disposable deployed acceptance; initialize
   `backend/migrations/0001.sql`. Do not reuse or reset an existing document DB.
2. Configure a self-hosted Access application for the API on the permanent HTTPS
   application hostname, an owner-only allow policy and no bypass/service-token
   policy. The server requires the pinned issuer, application audience and exact
   verified owner `sub`. The initial owner subject must come from a verified Access
   identity, not an unverified JWT decoder or request header.
3. Supply `NOTES_DB`, `APP_ORIGIN`, `ACCESS_ISSUER`, `ACCESS_AUD` and
   `OWNER_SUBJECT`. Use the reviewed template `wrangler.pages.example.jsonc` or
   Pages deployment settings. Configure production and preview bindings separately;
   previews must not inherit access to production notes. Never commit the owner's
   identity or a real deployment configuration containing private account details.
4. Build with `VITE_STORAGE_BACKEND=cloud npm run build:cloudflare`. The generated
   `_routes.json` invokes Functions only for `/api/storage` and descendants.
   Function responses set their own no-store and security headers. Static Pages
   `_headers` alone does not protect dynamic API responses.
5. Configure Access/Pages to **fail closed** when Free limits are reached. Verify
   authenticated owner access, unauthenticated/foreign/opaque-origin denial and
   direct `pages.dev`/preview-host bypass denial. The API pins the application
   origin and still requires a valid signed JWT on every route.
6. Measure ordinary and near-limit uploads under the actual Free CPU quota, stage
   expiry, partial uploads, two authenticated-device conflicts and recovery.
   Record source/deployment identities, actual results and failures. Local workerd
   is not hosted quota, edge policy or live-login validation.
7. Only after deployed acceptance, connect a production DB and promote the cloud
   build. This changes the storage authority and requires an explicit migration.
   It does not authorize a Git merge, public release or paid plan.

Cloudflare's documented Free Access onboarding may require payment details even
while stating the Free plan is not charged. An API token alone does not establish
that onboarding or owner authentication is available. If the account cannot meet
the free-only requirement, stop provisioning and report that constraint; do not
select a paid plan or deploy an unprotected substitute.

## Preserve existing browser notes

Before switching the permanent site's build, export a complete workspace backup
and separately download any **Retained edits** from the browser-backed deployment.
Verify those files exist outside browser storage. The new cloud build does not
read, delete or upload the old IndexedDB catalog. Restore the reviewed backup
explicitly in the authenticated cloud build, after checking whether the remote
workspace already contains notes. Import/restore confirmation and revision checks
remain mandatory. Reopen in a fresh authenticated browser profile and compare
exported source/attachments. Keep the original backup and browser data until that
acceptance succeeds. Rolling back application assets never restores deleted data.

## Current evidence boundary

Implementation tests and local runtime/browser observations are recorded in the
dated implementation status. No live Cloudflare account, billing, Access login,
production database or hosted Free CPU observation is implied by compilation or
local test success. Production cloud promotion stays blocked until those checks
are performed with owner authentication.
