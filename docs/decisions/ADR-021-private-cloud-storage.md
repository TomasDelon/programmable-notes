# ADR021: Server-authoritative private Cloudflare storage

Status: proposed implementation design; account provisioning and deployed
acceptance remain separate evidence. No infrastructure was changed by this ADR.

## Context

The owner requires automatic private server storage rather than browser-primary
notes. The current web store is IndexedDB, with source/attachment validation,
optimistic revision checks, five bounded recovery checkpoints and separate
retained edits. Existing browser data must not be overwritten or silently migrated.
The native store and untrusted-document isolation remain independent boundaries.
Only entirely free services are authorized; no paid upgrades or R2 enrollment.

## Decision

Use the existing permanent app origin and Pages project with narrowly routed
`/api/storage` Pages Functions, one D1 binding, and single-owner Cloudflare Access
identity. Independently validate every API JWT: pinned HTTPS team issuer/AUD,
RS256 signature with pinned-source rotating JWKS, required expiration/subject,
not-before when present and the configured owner identity. Deny missing config,
forged tokens, foreign/null origins and unsupported direct origins. Require a
custom client header for data access and exact same-origin Origin for mutations;
never trust caller email headers or preview messages. No wildcard CORS.

Access can use the existing Cloudflare account or approved-email OTP. Official
onboarding currently requires payment details even on Free, while stating Free
is not charged; account readiness is not established by an API token. No paid
plan is authorized. If this Free enrollment cannot be completed, retain the
blocking state and reconsider direct GitHub OAuth as a separate auth decision.
Do not substitute an unauthenticated endpoint or a shared browser API secret.

Cloud mode makes server publication authoritative, with a two-second trailing
autosave debounce, one in-flight publication and explicit queued generations.
“Saved” means D1 acknowledged that exact revision. Network/auth/quota/conflict
failures preserve the live draft, show an actionable unsaved state and never
switch to IndexedDB or an empty Welcome workspace. Existing local mode, if kept,
is explicitly selected; native persistence is unchanged. New devices authenticate
and load the verified cloud inventory directly.

Serialize a bounded inventory containing current workspace, recovery and retained
edits, preserving existing source/media/backup limits and checksum semantics.
Use immutable binary chunks of at most 1 MiB, an at-most-96-entry ordered manifest
and a transport envelope at most 96 MiB UTF-8. The envelope ceiling does not relax
individual data limits or promise all maximal components fit with JSON overhead.
Never truncate or normalize source/attachment bytes to fit.

D1's row/value ceiling is 2,000,000 bytes; Workers Free has 10 ms CPU and 128 MB
memory. The server checks chunk hashes/sizes, bounded metadata and authenticated
ownership without joining/parsing the full inventory. Clients verify complete
content, then reuse workspace, recovery, retained-edit and media validation before
adopting data. Opaque storage is not server certification of workspace semantics.
No MDX or uploaded code executes on the backend.

Stage uploads independently of head. Publish only complete immutable manifests
with an atomic expected-revision compare-and-swap; retain idempotent publication
identity for retry after ambiguous responses. A failed CAS changes no canonical
state, history or accounting. D1 batches roll back on SQL errors, not on zero-row
UPDATEs: use a single conditional publication or a constraint-enforced atomic
batch and test actual SQL failure/rollback. Concurrent dirty devices conflict;
there is no silent merge or last-writer-wins.

Preserve existing five logical recovery checkpoints within the current inventory;
do not add another set of remote whole-inventory history. Bound staging to four
uploads and aggregate allocated chunk bytes to 256 MiB across head and all stages.
Four maximal 96 MiB stages cannot all fill: enforce allocation accounting atomically
and return full/busy rather than evict committed data. This leaves headroom under
the separate Free 500 MB database cap, but actual database/index/page overhead
still needs inspection. Cleanup must be coordinated with publication and reads,
never deleting head-referenced chunks. Readers of an obsolete manifest must retry
from a fresh head if its lease expired; they never mix revisions.
Free seven-day D1 Time Travel adds disaster recovery, not independent backups.

Creation/import/replacement is explicit. Remote-empty state offers new creation
or reviewed import using revision-zero CAS. Existing browser catalogs are kept
intact and independently exportable; an existing remote catalog cannot be
silently replaced. Portable imports/exports keep their current format and limits.
Restoring or consuming retained edits publishes one coherent new revision.

Keep the sandbox opaque, network denied and parent message surface presentation
only. API code emits its own no-store/security headers on all paths because
Pages `_headers` applies only to static responses. Service workers bypass API
and login requests before navigation fallback and never cache private responses.
API-only Function routes keep static assets outside dynamic Free quotas. Any new
consumed Pages routing metadata is excluded from offline precache but contributes
to the release digest. Preview deployments use an isolated test database or fail
closed without a production binding.

## Alternatives

A separate Worker plus same-origin route adds service/route configuration without
a benefit to this Pages app. Direct GitHub OAuth avoids Access organization setup
but adds OAuth callbacks, server sessions and secret/revocation logic. Explicit
checkpoint uploads or browser autosave do not meet the server-authority request.
R2, paid Workers, CRDTs, sharing and server rendering are outside this decision.

## Consequences and validation

Free is a hard account/service-plan constraint, not unlimited availability.
Workers/Functions share 100,000 dynamic requests/day; D1 Free provides 5 million
read rows and 100,000 written rows/day, 500 MB per database and 5 GB account total.
Index maintenance/deletion also uses quotas. A 96-chunk save every two seconds
cannot fit those request limits under continuous editing. Coalesce/skip identical
saves and measure actual usage; content-addressed reuse cannot promise every
insertion is cheap. Exhaustion must fail closed without paid upgrades or falsely
acknowledged saves. Benchmark JWT verification and 1 MiB D1 BLOB/hash conversions
under the real Free CPU limit before promotion. If they fail, optimize request
work/chunk sizing within Free rather than change the billing constraint.

Required gates include hostile JWT/browser provenance cases, actual SQL CAS and
rollback/concurrency, interrupted uploads and bounded cleanup, two authenticated
fresh devices, exact source/media/history/retained-edit reopening, pending-draft
and offline preservation, no local fallback, unchanged preview isolation and the
full existing check. Account Free status, Access identity/policy, production/test
bindings and deployed Free resource usage remain unverified until observed.

Cloudflare can access plaintext stored data; this is not end-to-end encryption.
TLS/access control do not defend a compromised privileged app origin. Log only
bounded status/count evidence, never content, tokens or private identities.

Verified source URLs, quota evidence, implementation details and remaining
uncertainties: [research record](../research/2026-11-26-private-backend.md).
