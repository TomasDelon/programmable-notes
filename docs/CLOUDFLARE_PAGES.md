# Trying the web editor on Cloudflare Pages

Cloudflare Pages supplies static hosting. A domain registration is sufficient;
no personal server, tunnel, paid runner or application backend is needed. This
prepares an **experimental web beta**, not production security certification or
a native installer. The current browser interface is at `/`; Linux still selects
the older `/engine` interface.

## Data and security boundaries

- Notes and attachments stay in this browser profile's IndexedDB, identified by
  the exact origin (scheme, hostname and port). Hosting does not add accounts,
  synchronization or cloud document storage.
- Export a workspace backup before changing hostnames, clearing site data or
  changing browsers. Import explicitly at the destination. A `pages.dev` visit
  and `notes-beta.tomasdelon.com` have separate workspaces.
- Choose one permanent hostname for real testing. Private browsing and storage
  eviction can lose browser data; independent backups remain necessary.
- Preview code keeps the existing opaque-origin sandbox and restrictive CSP.
  Public access to the application does not authorize access to local notes.
  `noindex` discourages indexing; it is not authentication. Do not put secrets in
  the source tree or uploaded build files.
- Assets can be cached offline. A successfully cached app can reopen without
  network access; first installation and application updates need connectivity.

## One-time owner setup

The owner has connected the testing project `programmable-notes`. The steps
below document a fresh setup; do not recreate or overwrite an existing project.
Account operations require signing in directly; never send a password or API
token through chat. Deployment evidence and failed acceptance checkpoints are
recorded in [the verification log](recovery/2026-11-24-cloudflare-preparation.md).

1. In Cloudflare **Workers & Pages**, create a **Pages** project using **Connect
   to Git**. Authorize the GitHub integration for **only**
   `TomasDelon/programmable-notes`. Do not grant access to every repository.
2. Use project name `programmable-notes`, matching `wrangler.toml`. For a fork,
   choose an available name and update that file to match before deploying. Set the
   production branch to **`deploy/cloudflare-beta`**. This dedicated branch must
   point at an explicitly verified commit before creating the deployment; it
   does not require merging draft PRs into `main`.
3. Select no framework preset and set:

   `wrangler.toml` also fixes the published directory to `./dist`, preventing
   an empty dashboard output field from publishing the repository's uncompiled
   `index.html`. This is static Pages configuration, with no Worker entry point
   or service bindings. The build command remains a dashboard setting.

   | Setting                | Value                                                                  |
   | ---------------------- | ---------------------------------------------------------------------- |
   | Build system           | v3                                                                     |
   | Root directory         | Repository root (blank/default)                                        |
   | Build command          | `npx --yes npm@11.9.0 ci && npx --yes npm@11.9.0 run build:cloudflare` |
   | Build output directory | `dist`                                                                 |
   | Environment variable   | `NODE_VERSION=24.22.1`                                                 |
   | Environment variable   | `SKIP_DEPENDENCY_INSTALL=1`                                            |

   Set both variables for the production environment. Node's bundled npm can
   differ from the repository's pinned version; the explicit commands use npm
   11.9.0 for installation and build. No secrets are required.

4. In branch deployment controls, enable automatic production deployments from
   that dedicated branch and set preview deployments to **None**. Do not use
   ephemeral preview URLs as the owner's daily workspace. Creating/saving the
   project starts the initial deployment: do this only when ready to publish
   the web beta. Keep the free plan; do not enable paid add-ons or raise spending limits.
5. Inspect the deployment's Git SHA and successful build before adding a custom
   domain. In that Pages project's **Custom domains**, add
   **`notes-beta.tomasdelon.com` first**, then follow its DNS instructions. A bare
   CNAME without the Pages association can produce a 522 error.
6. If Cloudflare manages this domain's DNS in the same account, the UI can offer
   to create the CNAME. Otherwise add only the requested subdomain CNAME at the
   current DNS provider. The domain need not move nameservers merely to use
   this subdomain. Do not change apex, mail, existing records, zone-wide caching
   or other services. If the proposed hostname is already used, stop and choose
   a free dedicated hostname rather than replace it.
7. Wait for the custom domain to show active TLS, then use
   `https://notes-beta.tomasdelon.com/`. Confirm the exact SHA in the Pages
   deployment screen and run the live checks below.

The custom hostname remains a proposal. DNS provider/records, account limits
and custom-domain certificate issuance have not been verified. A successful
Pages upload alone does not prove that the editor works; require the live
acceptance below before treating a deployment as validated.

## Verification and updates

Before promotion, run complete repository checks and check GitHub Actions for
that **exact** candidate SHA. An ordinary deployment branch push does not itself
run the repository's PR checks. Advance the dedicated branch only to an
already-green candidate, without force-pushing or overwriting an unrelated
branch. Cloudflare's Git integration then builds that commit. Keep PRs draft;
deployment does not authorize a merge or public release.

Local commands:

```sh
npm ci
npm run check
npm run test:cloudflare
```

`check` reuses its production build for the three local hosting tests.
`test:cloudflare` explicitly builds the Cloudflare target and starts a separate
localhost preview with the same generated headers. The ordinary/native build
does not acquire hosting-specific metadata. `_headers` and `_redirects` are
consumed by Pages, so they are excluded from offline fetches; their bytes still
participate in the offline release hash.

After deployment, manually run the existing **CI** workflow on the configuration
branch with `deployment_url` set to the HTTPS origin and `browser_qa` enabled:

```sh
gh workflow run ci.yml --ref feat/cloudflare-pages-testing \
  -f deployment_url=https://notes-beta.tomasdelon.com -f browser_qa=true
```

This runs Chromium, Firefox and WebKit acceptance against the actual site in
fresh browser profiles, skips duplicate local/native builds for that dispatch,
and retains the `cloudflare-deployment-check` report for seven days. It imports
only synthetic notes into those fresh profiles; it cannot touch an owner's
existing local workspace. It verifies transport headers, compiler WASM MIME,
React state/events, parent/network denial, ignored forged save requests, visual
and source edits, exact BOM/CRLF exports, undo/redo, saved reopening and offline
reopening. It tests the served app, not the account dashboard's SHA identity;
verify that separately above. Cloudflare challenges or access controls may
require separate configuration; do not weaken the app sandbox to pass a test.

For local invocation against an already-live origin:

```sh
PN_DEPLOYMENT_URL=https://notes-beta.tomasdelon.com npm run test:cloudflare:built
```

To roll back the **application**, use Pages' deployment rollback and verify the
chosen SHA and service-worker update in a new tab. This never restores or rolls
back user notes. Export backups before deliberate upgrades; do not clear
IndexedDB as an update procedure. Keep the hostname stable across rollbacks.

## Hosting policy and limits

`scripts/cloudflare-config.ts` defines transport hardening and cache policy.
Mutable entry points/service workers revalidate; content-hashed assets are
immutable. The host CSP deliberately avoids `script-src`/`default-src` rules
that would break the inherited `srcdoc` policy; the preview retains its
independent hash CSP and restrictions. Do not add a zone cache rule or script
rewriter that overrides these responses. No Pages Functions, Workers backend,
analytics, database, tunnel or billing commitment is introduced.

Local emulation cannot prove Pages routing, edge headers, account build quotas,
DNS/TLS, a particular browser's storage retention or production security
readiness. Real Cloudflare acceptance remains pending owner connection. Existing
native resource/startup gates remain in `docs/IMPLEMENTATION_STATUS.md`; they do
not prevent independent browser testing.

Configuration was checked against Cloudflare's official documentation sources:
[build environment](https://developers.cloudflare.com/pages/configuration/build-image/),
[headers](https://developers.cloudflare.com/pages/configuration/headers/),
[branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
and [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
The dashboard wording can change; preserve the values and authorization boundaries.
