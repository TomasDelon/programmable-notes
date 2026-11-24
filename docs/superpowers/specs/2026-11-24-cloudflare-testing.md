# Stable web testing on Cloudflare Pages

Repository preparation is authorized by the existing autonomous-development
instructions. Account access, project creation, DNS and publication remain an
owner action after the tested configuration is reviewable. No deployment is
claimed here. Keep recovery PR6 and validation PR7 separate from this work.

## Intent and approaches

Provide the real existing application at a stable HTTPS testing origin, proposed
`notes-beta.tomasdelon.com`, using the owner's existing domain. The proposed Pages
project is `programmable-notes-beta`; availability and DNS ownership are not yet
verified. No separate demo, backend, login, synchronization or UI redesign.

- Recommended: Git-integrated Cloudflare Pages, dedicated `deploy/cloudflare-beta` deployment
  branch promoted only after CI success. Static build output is `dist`.
- Local production preview remains useful for development, but the stable hosted
  URL works while the owner's PC is off.
- Native Linux testing remains separate; its historical interface and failed
  resource/latency gates are not certified by web hosting.

This is the engineering recommendation, not an assertion that an external
project/domain binding has been created. A new Pages beta project is distinct
from a production application release or merging draft PRs.

## Build and transport contract

Use Node24.22.1 and npm11.9.0. Official Node24.22.1 bundles npm11.19.1, so Pages
must explicitly use pinned npm through `npx --yes npm@11.9.0`. Skip Pages automatic
installation and use `npx --yes npm@11.9.0 ci && npx --yes npm@11.9.0 run build:cloudflare`.
CI explicitly installs npm11.9.0 as well. No new application dependencies.

The optional Cloudflare build target adds `_headers` after the ordinary build,
then regenerates offline metadata. Native/default builds stay unchanged.
Cloudflare consumes `_headers`/`_redirects`; they must not enter offline ASSETS,
but their contents must affect the cache version so header-only updates propagate.

Use nosniff, no-referrer, anti-framing, restricted unused device permissions and
minimal host CSP (`base-uri 'none'; object-src 'none'; frame-ancestors 'none'`).
Do not add an inherited script policy that blocks legitimate MDX srcdoc scripts
or relax the existing preview hash/CSP/sandbox. Cache hashed assets immutably;
revalidate HTML, service worker and mutable metadata. No Functions, Workers,
secret environment values or zone-wide DNS/security changes are required.

## Validation and ownership

Use a local Pages-compatible production preview serving the exact generated
headers, with consumed configuration files unavailable. Exercise real browser
MDX/React interaction and negative parent/network probes, exact source history,
persistence/reopen and offline reload. A separate config accepts an explicit
HTTPS root URL for later deployed-site acceptance using fresh browser profiles.
Local emulation is not a claim of Cloudflare/TLS/DNS acceptance.

The owner connects Cloudflare to this one GitHub repository and creates the beta
project from a verified beta branch. Disable non-production automatic previews
to conserve builds and avoid treating rotating URLs as the user's workspace.
Only promote CI-successful revisions; do not merge main or mark PRs ready.
Associate the custom hostname in Pages before creating/confirming its CNAME;
leave existing apex/mail records intact. Do not ask for credentials in chat.

The browser workspace is keyed to origin and profile. pages.dev and the custom
hostname do not share notes. Use the final hostname for real notes and existing
explicit backups for any migration. Hosting adds no cross-device synchronization.

Official source consulted: cloudflare/cloudflare-docs Pages build-image,
build-configuration, headers, branch-build-controls, serving-pages and custom-domains
(retrieved from GitHub because public Cloudflare HTTP requests returned403).
Account state, hostname availability, actual build/TLS and published headers must
be verified after owner connection, not inferred from this document.
