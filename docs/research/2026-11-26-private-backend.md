# Private Cloudflare storage research — 26 November 2026

Status: design research, not deployed or a claim that account provisioning succeeded.
This document records the parent task's explicit requirement: cloud mode is
server-authoritative, automatically saved, and never silently falls back to a
browser-primary database. Implementation and deployment are authorized only on
entirely free services. No infrastructure was changed by this research.

Outcome: privately open and edit the same authoritative workspace on two devices.
Invariants: exact source/attachment bytes; authenticated server authority; atomic
revisions and conflicts; no paid service or implicit data replacement.
Witness: fresh authenticated devices, exact reopen, denied malicious requests,
interrupted/stale publication, and observed Free-plan CPU/storage/request limits.
Done: reviewed design plus separately recorded implementation and deployed tests.

## Existing application contract

- `src/web/workspace.ts`: version-1 `WebState`; at most 1,000 documents,
  500 KiB per source, 24 MiB aggregate source bytes, connected groups at most
  32 files/8 MiB. Its serialized workspace backup must fit 32 MiB. Web validation
  rejects native saved-source maps and filesystem grants.
- `src/assets/catalog.ts`: PNG/JPEG/WebP/PDF only; SHA-256 content identities,
  original bytes encoded as base64, 256 attachments/16 MiB aggregate; individual
  raster image 4 MiB, PDF 8 MiB, image 24 million pixels. SHA and media validation
  are mandatory before adoption. Attachment filenames are display metadata.
- `src/web/persistence.ts`: IndexedDB currently owns revision/checksum/size and
  saves current state, up to five recovery checkpoints under a 32 MiB aggregate
  recovery budget, and a separate retained-edit inventory bounded to five entries
  and 32 MiB serialized bytes. It atomically compares the expected revision and
  preserves drafts on conflicts. This module is the storage seam; editor/source
  ownership and native stores must not be replaced.
- `src/backup/portable.ts`: portable version-2 backups deduplicate attachments
  across current/recovery snapshots, verify checksums and validate all restored
  state. Existing explicit imports/exports stay compatible. Retained edits are
  separate from the portable backup and must not silently disappear in cloud mode.
- `src/web/useWebWorkspace.ts`: currently autosaves locally and manages conflicts,
  pending editor drafts, explicit replacement epochs and retained edits. Cloud
  save acknowledgement must refer to the exact published generation, not a later
  in-memory edit. Startup failure cannot become an empty new workspace.
- `src/web/WebPreview.tsx` and `previewDocument.ts`: untrusted React runs in an
  opaque `sandbox="allow-scripts"` srcdoc; hash-script CSP, `connect-src 'none'`,
  `form-action 'none'` and strict parent message validation. No preview message
  grants document mutation. Cloud storage must preserve these boundaries.

## Approaches and selected design

1. **Same-origin Pages Functions plus D1 (recommended and directed by parent).**
   Keep the existing Pages app and permanent hostname, add only `/api/storage`
   routes and one D1 binding. No CORS trust or additional runtime domain. Functions
   and D1 are available on Workers Free. The existing Wrangler Pages configuration
   can declare the database binding. Access supplies identity, with independent
   JWT validation inside every storage route.
2. **Separate Worker with D1 and a same-origin route.** Technically viable on a
   Cloudflare-managed proxied zone, but adds route configuration, another service
   and alternate endpoints to secure. Cross-origin Worker URLs additionally need
   CORS/cookie decisions. No benefit for this one app; not the first choice.
3. **Direct GitHub OAuth plus D1.** Uses the owner's existing GitHub account,
   but requires an OAuth app, callback/state validation, secret/code exchange,
   server sessions, logout/revocation and stable numeric GitHub owner-ID checks.
   This is a possible fallback if Access onboarding cannot meet account/billing
   constraints; it is a different auth implementation, not a reason to deploy
   unauthenticated storage. Access can alternatively use GitHub as its IdP, but
   that also needs an OAuth app/secret and grants email/org read permissions.

Explicit checkpoint-only uploads and IndexedDB autosave are insufficient for the
requested cloud mode. No CRDT, merge engine, public sharing, multi-user tenancy,
server compilation, R2, KV, Durable Objects, queues or paid Workers plan is needed.
Local mode may remain explicitly available, but a cloud-mode error never switches
modes, creates a replacement catalog or acknowledges a browser-only save.

## Verified free limits and their consequences

Official Cloudflare documentation source was fetched from `cloudflare/cloudflare-docs`
`production` on 2026-11-26. Links below identify the exact files; primary site
availability and account entitlements were not inferred from a successful fetch.

| Resource                  | Verified Free limit                                                                    | Design consequence                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers / Pages Functions | 100,000 dynamic requests/day, shared account-wide; reset 00:00 UTC                     | Narrow invocation routes to API only; account for other Workers.                                                                                |
| Workers CPU / memory      | 10 ms CPU/invocation; 128 MB/isolate                                                   | Never assemble/parse a complete inventory on the server. Benchmark JWT plus 1 MiB hash/binding conversions on Free.                             |
| Worker incoming body      | Free-zone request ceiling 100 MB                                                       | This is not a safe memory/CPU budget. Enforce much smaller endpoint bounds while streaming.                                                     |
| D1 per value/row          | 2,000,000 bytes, decimal                                                               | Use binary chunks at most 1,048,576 bytes; never one workspace row or base64 SQL literal.                                                       |
| D1 database/account       | 500 MB/database; 5 GB account; 10 databases                                            | One production DB and optionally a separate test DB fit, subject to current usage.                                                              |
| D1 daily queries          | 5 million rows read; 100,000 rows written                                              | Use indexed keys; writes/deletes/index maintenance all consume rows.                                                                            |
| D1 invocation/query       | 50 queries/Free invocation; 100 bound parameters/statement; 100 KB SQL; 30 s SQL/batch | Bounded manifests; parameterized SQL. Current docs say a batch counts as one invocation query, but each SQL statement still has its own limits. |
| D1 transfer               | No D1 egress or throughput charges                                                     | Network availability/performance remain separate acceptance concerns.                                                                           |
| D1 recovery               | Time Travel 7 days on Free, always on; no added history/restore charge                 | Additional disaster recovery only; restore overwrites DB and is an explicit owner operation.                                                    |

Free D1 usage exhaustion returns errors; it does not automatically authorize an
upgrade. Workers Free exhaustion returns an error/Pages configured fail behavior.
Keep account/project on Free, configure Pages **fail closed**, do not enable paid
plans, subscriptions, R2 or limit increases. A budget dashboard on a paid plan is
not equivalent to this requirement. Check existing account plan and usage before
provisioning. Quotas are shared and can prevent saves; the UI must say unsaved,
retain the live draft and offer exact download rather than claim durability.

### Practical autosave cost

Parent-selected first transport: 1 MiB chunks, a maximum 96 MiB UTF-8 inventory,
a 2-second trailing save debounce and one in-flight publication. The inventory
contains the current workspace plus bounded recovery and retained-edit records;
all existing per-record limits remain enforced. The transport cap is not a larger
note/attachment limit or a promise that all three independently maximal records
fit with JSON envelope overhead. Reject oversize before upload, without truncation.

A maximum-sized upload needs 96 chunk requests plus bounded begin/commit/status
requests. With no reusable chunks, 1,800 saves/hour at a continuous 2-second rate
would exceed 170,000 dynamic requests/hour, before reads: Free cannot support
that worst case. A 2-second debounce is not permission to continually reupload an
unchanged inventory. Coalesce edits, skip byte-identical inventory, serialize
saves and expose quota failures. Content-addressed reuse can reduce traffic but
fixed chunks after an insertion may all change; do not claim delta-sync costs.
Do not poll/download the whole workspace every two seconds. Revalidate only head
metadata on visibility/focus and reasonable bounded intervals while active;
fetch content only for a changed revision and adopt it only when safe.

This is feasible for bounded single-owner usage, not unrestricted free throughput.
Measure real typical and near-limit uploads before claiming it meets daily-use
latency. If the first implementation cannot stay within Free CPU/quotas, optimize
serialization/chunk references or reduce request work before deployment; do not
raise spending or weaken preservation/security to force a pass.

## Authentication, authorization and browser isolation

Create a self-hosted Access application for the storage API at the existing
permanent hostname. Use an allow policy for exactly the owner and no bypass or
service-token policy. Prefer the existing Cloudflare identity provider or explicit
email OTP; these do not require another provider account. The owner's email and
Access subject are private deployment configuration, not committed example data.
Configure session duration deliberately; reauthentication is expected.

**Account prerequisite, not yet verified:** official Zero Trust onboarding says
select a plan **and enter payment details even for Zero Trust Free**, while
stating Free is not charged. Thus a Cloudflare API token alone may not complete
initial organization onboarding. No paid enrollment is authorized. Confirm the
organization is already Free or let the owner complete the Free account step;
if payment-details enrollment is unacceptable, stop Access provisioning and
reconsider the documented OAuth alternative. No verified 50-seat pricing claim
is necessary for this one-owner design; check the current Free dashboard terms.

Every API request, including alternate Pages preview/`pages.dev` addresses, must
fail closed in application code unless all configured authentication checks pass:

- Require `Cf-Access-Jwt-Assertion`; reject missing/oversized/malformed tokens.
  Do not trust caller-provided email headers or a decoded payload alone.
- Pin an administrator-configured HTTPS team issuer, exact application AUD and
  `RS256`; reject `none`, HS256 and algorithm/key-type confusion. Validate a
  signature against RSA signing keys from that pinned issuer's
  `/cdn-cgi/access/certs`; select by bounded `kid` and never follow token `jku`,
  `x5u` or issuer-supplied URLs. A maintained JWT library is preferred to custom
  signature/parser code; audit and pin any new dependency.
- Require `iss`, `aud`, numeric finite `exp` and a human `sub`; enforce expiration
  and `nbf` when present with a small explicit clock tolerance. Restrict the
  verified identity to configured owner `sub`, optionally also exact email.
  Do not bootstrap the owner from the first arbitrary authenticated request.
- Cache bounded JWKS/key material with expiry; refresh once for an unknown key
  under a cooldown; fail closed on verification/fetch failure. Access rotates
  keys (documented default six weeks, prior keys valid seven more days).
- Require the deployment's configured hostname and expected browser provenance.
  All data reads and mutations require a fixed custom client header, no wildcard
  CORS, and deny `Origin: null`/foreign origins. Mutations additionally require
  exact same-origin `Origin`, appropriate non-simple content type and allowed
  HTTP method. A same-origin GET may have no Origin; validate Fetch Metadata and
  the custom header instead of falsely requiring a browser to send that header.
  Reject cross-site fetch metadata and untrusted OPTIONS preflights.
- Login may need a top-level navigation through Access. Restrict any login/return
  endpoint to fixed same-origin locations and return no workspace bytes without
  the normal data-read checks. An expired API session must become an explicit
  authentication-required state, not HTML parsed as a workspace or local fallback.

The opaque srcdoc has no readable parent cookies/token and keeps network denied.
The server's origin/custom-header policy protects even if an iframe attempts a
credentialed cross-origin request. Do not relax the preview CSP or add cloud save
commands to `postMessage`. Keep the host's minimal existing CSP: adding a parent
`default-src`/`script-src` can inherit into srcdoc and break legitimate preview
scripts. API code sets its own `no-store`, JSON/octet MIME, `nosniff`, anti-framing
and referrer headers on successes **and errors**: Pages `_headers` does not apply
to Function-generated responses. Static assets keep their existing policies.

The service worker must explicitly bypass `/api/storage` **before** its generic
navigation fallback. Never cache API responses, Access cookies/JWTs or login HTML.
An old cached shell must not treat API errors as successful saves. Scope the
Function `_routes.json` to API routes only; do not invoke authentication code for
all fonts/compiler assets. If `_routes.json` is shipped in dist, treat it as a
consumed Pages control file in offline asset generation, hash its policy bytes,
and exclude it from precache fetches. Local preview must not pretend an API is
validated merely by returning SPA HTML.

TLS and Cloudflare's infrastructure protections are not end-to-end encryption.
Cloudflare/account administrators can access the stored plaintext inventory.
This design does not promise privacy against a compromised privileged app origin,
owner endpoint or provider. Never log notes, attachment bodies, cookies, tokens,
private identity or raw request/response dumps. Derived status/count witnesses
are sufficient for public acceptance evidence.

## Atomic immutable storage protocol

Store opaque validated-by-client inventory bytes, not executable MDX, in immutable
binary chunks. Never render/compile/import authored source in the backend. A
bounded manifest gives format version, byte count and ordered `{sha256, size}`
entries (at most 96, small enough for a bounded JSON request). Server verifies
chunk byte length and SHA-256 before accepting it and computes a digest of the
canonical manifest. It does not assert that unparsed opaque bytes satisfy the
workspace schema; every client must verify the complete manifest/content and
reuse existing schema/checksum/media validation before displaying/adopting it.

Use a singleton owner head, immutable published manifests, immutable chunk rows,
and bounded staged upload metadata. All identifiers are server-generated or
strict digest/UUID grammar; SQL is parameterized. Bind BLOB bytes, never SQL text
or a large JSON numeric-array protocol. D1 binding APIs may materialize BLOBs as
arrays internally: benchmark these conversions under 10 ms and isolate memory.

A minimal API contract (exact path spelling can be settled by implementer):

1. GET head returns revision, committed manifest identity, byte size and timestamp;
   an empty server is an explicit state, not implicit permission to seed defaults.
2. Begin upload fixes expected remote revision, bounded immutable manifest and a
   short upload ID/expiry; reject excess staged allocation before accepting bytes.
3. PUT each missing chunk bounds the streamed body independently of Content-Length,
   verifies digest/size, and is idempotent for identical content. A different body
   cannot replace a staged/published digest. Retry needs no new upload allocation.
4. Commit verifies every ordered chunk is present with exactly the declared sizes,
   then publishes the manifest and advances head by **one atomic compare-and-swap**
   against the captured revision. Return the committed identity/revision only once
   D1 acknowledges success. A transactionally recorded upload/publication ID makes
   an ambiguous retry return its original outcome; a timeout is never guessed saved.
5. GET an immutable manifest/chunk is bound to an authorized published revision or
   active authorized upload. Validate lengths/hashes before joining on the client;
   all endpoints use private no-store responses. Never expose arbitrary D1 rows.

D1 `batch()` is transactional on SQL error, but a zero-row conditional UPDATE is
not an error. A read-then-write CAS or batch that mutates history/deletes chunks
after a zero-row UPDATE is unsafe. Use either a single conditional publication
statement with no other effects on CAS failure, or enforce failed preconditions
as a constraint failure inside the same batch so all statements roll back. With
a seeded non-null singleton revision, a conditional update assigning NULL on
failed expected-revision/completeness checks is one possible constraint-based
pattern; test it against actual SQLite/D1. Do not rely solely on checking result
`changes` after unrelated statements have committed. Head publication and accounting must form one coherent transaction.

Immutable manifests must stay readable while another device publishes. A reader
captures a head ID and reads that revision, then verifies it; it cannot mix chunks
from two heads. CAS prevents concurrent publishers from overwriting one another.
For stale revision, return conflict and preserve both server head and local live
edits; no last-writer-wins, implicit merge or replacement. Pure metadata changes
must not crowd real document checkpoints out of the existing recovery budget.

### Storage retention and cleanup

A 96 MiB maximum inventory cannot have five additional complete remote copies in
a 500 MB Free database: six copies total 576 MiB before indexes. Preserve the
existing five logical recovery versions **inside** the current inventory; do not
add another independent set of remote snapshots. The parent-selected initial
contract keeps the current published inventory, at most four staged uploads, and
a hard 256 MiB aggregate chunk allocation budget. This budget is shared across
head and stages, not 256 MiB per upload: four 96 MiB stages cannot all fill.
Count unique stored bytes transactionally before accepting a new chunk and
return storage-full without evicting committed data. Inspect actual D1 file size
and index/page overhead against the separate 500 MB platform cap. Stage expiry
permits bounded retry and cleanup; busy/full must never imply an upgrade.

Expiry/garbage collection may delete only expired uncommitted uploads or chunks
unreachable from retained published manifests and active uploads. Coordinate this
with publication in SQL so a check-then-delete race cannot remove a newly
referenced chunk. Protect active reads with a bounded lease or retry an explicitly
expired immutable revision from a newly captured head; never silently join missing
chunks. Preserve at least current head on every cleanup failure. Time Travel is
additional recovery, not ordinary per-note history or independent export backup.

## Cloud-mode adoption and migration

Cloud configuration explicitly selects server authority. Opening a configured
cloud app requires login and a verified remote inventory; a network/auth/integrity
failure shows a blocking actionable state, never a fresh Welcome workspace or
old IndexedDB catalog. Native and deliberately selected local-only mode retain
their old stores. Do not clear, rewrite or auto-import existing browser storage.

For a remote-empty first visit, show a choice to create a new cloud workspace or
explicitly import an existing portable backup/browser workspace. Creating/importing
uses expected remote revision zero; a concurrent creation conflicts. Before import,
export the original browser data independently, show what will be uploaded and
validate bytes/recovery/attachments. An existing remote workspace requires explicit
review and replacement confirmation plus current revision CAS; preserve prior logical recovery within the newly published inventory where the
existing recovery policy permits; export an independent pre-replacement backup. Browser and server revisions are separate namespaces.

Cloud mode autosaves on the selected debounce, with one in-flight generation and
subsequent edits queued. “Saved” means acknowledged server publication. A crash,
closed tab or offline device can lose edits that the server never acknowledged;
show pending/error state and exact download. In-memory unsaved text is not a
browser-primary database. Reauthentication/retry does not discard current edits.
A fresh second device must load the published data without migration rituals.
A conflicting dirty device keeps its draft and offers explicit export/reload;
clean devices may adopt a verified newer head while preserving local view state.
Unapplied editor drafts block automatic replacement, as they do today.

Portable backups remain explicit independent exports with the same format and
limits. Restore publishes a new revision; it never rewinds revision numbers or
implicitly deletes server/current history. Retained-edit creation/consumption and
workspace changes belong to the same cloud inventory publication, preserving the
existing atomic restore semantics. Do not acknowledge recovery saved until that
specific retained attempt is part of a committed remote inventory.

## Required evidence before provisioning/promotion

- Auth unit/integration negatives: forged/expired/missing claim, wrong owner/AUD/
  issuer/algorithm/key ID, key rotation/outage, null/foreign Origin, missing client
  header, cross-site/preflight attempts, direct Pages aliases and untrusted srcdoc.
- Actual D1/SQLite tests: stale and simultaneous CAS, constraint rollback, missing/
  altered/oversize chunk, upload interruption/retry, ambiguous commit response,
  cleanup/publication races, history and retained-edit atomicity. Mocked SQL calls
  alone do not prove transaction semantics.
- Two independent authenticated browser contexts: server-only create/save/edit/
  reload, BOM/mixed EOL/modules, attachments and recovery exact bytes, stale-device
  draft preservation, expired session, offline/limit errors and absent automatic
  IndexedDB fallback. Existing source fidelity/security suite remains mandatory.
- Build evidence: API invocation routes, emitted Function-specific security headers,
  no precached control/API/login files and unchanged opaque preview policies.
- Before production binding: verify account Free status, current usage, Access
  enrollment/no paid add-ons, permanent hostname, production/preview isolation,
  and scoped token permissions. Use separate test D1; previews must not silently
  write production data. Do not commit credentials or put them in browser bundles.
- Live Free acceptance: measured typical and near-limit 1 MiB chunk CPU/memory,
  initial/reopen latency, query/row/request usage, actual denied unauthorized URL,
  acknowledged cross-device save and recovery. If unavailable, label unverified;
  no paid upgrade is an authorized fix. Preserve independent portable exports.

## Official sources and remaining uncertainties

Each GitHub link below was read successfully on 2026-11-26. Source branch is
mutable; cached source and source-tree identity are under ignored
`.cache/private-backend-research/`. These documents establish platform behavior,
not this account's state or an implemented backend's correctness.

1. [D1 limits](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/d1/platform/limits.mdx)
   — 500 MB Free DB, 2,000,000-byte value/row, query/binding limits.
2. [D1 pricing table](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/workers/d1-pricing.mdx)
   — 5 million read/100,000 write rows daily, 5 GB/10 DBs, indexes count, no egress.
3. [D1 pricing FAQ](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/d1/faq-pricing.mdx)
   — Free exhaustion returns errors; paid overages require paid tier.
4. [Workers pricing](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/platform/pricing.mdx)
   and [limits](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/platform/limits.mdx)
   — Free requests/CPU/memory/body ceilings.
5. [Pages Functions pricing](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/functions/pricing.mdx)
   — dynamic allowance shared with Workers; excluded static requests unlimited.
6. [Pages D1 bindings](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/functions/bindings.mdx)
   — same-origin Functions access DB through `context.env`, including local tests.
7. [D1 batch API](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/d1/worker-api/d1-database.mdx)
   — sequential transactional batch rollback on statement failure.
8. [Time Travel](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/d1/reference/time-travel.mdx)
   — Free seven days, no additional cost, destructive owner restore.
9. [JWT validation](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json.mdx)
   — assertion header, pinned issuer/AUD/time/signature, RS256/JWKS rotation.
10. [Access onboarding partial](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/cloudflare-one/choose-team-name.mdx)
    — Free organization still requests payment details; default Cloudflare IdP.
11. [Email OTP](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/cloudflare-one/integrations/identity-providers/one-time-pin.mdx)
    — approved-email login without another IdP.
12. [Access GitHub IdP](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/cloudflare-one/integrations/identity-providers/github.mdx)
    — existing personal GitHub account usable, OAuth registration/secret required.
13. [Pages routing](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/functions/routing.mdx)
    — API-only invocation routes and Free exhaustion fail-closed setting.
14. [Pages headers](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/configuration/headers.mdx)
    — static `_headers` never substitutes for Function response headers.

Unverified: current account plans/Zero Trust enrollment/payment requirements in
that account, exact owner identity/team/AUD, available Free usage, configured
hostname coverage, real Free runtime performance, deployment and successful
cross-device authentication/save. The marketing pricing page was HTTP-blocked;
no unsupported Access seat quota is presented as a verified fact. A token being
available is not evidence that these account/deployment checks passed.
