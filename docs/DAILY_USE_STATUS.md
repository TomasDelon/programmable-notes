# Daily-use acceptance receipt

This is the development status for the 26 November 2026 stabilization plan. It separates identified behavior from version-specific evidence. The draft PR contains final current-head run/artifact links; dated records remain historical.

## Current accepted browser delivery

The [live browser editor](https://programmable-notes.pages.dev/) runs tested
application source `52c86c474c5492021ad6062423ffd1c5d99be394`. Subsequent development
at `632c94e` adds a read-only native-infrastructure observer and its controls;
application source, browser tests, build inputs and browser security policies are
unchanged. The checkpoints below this section are historical.

- Complete local check: **543 unit tests /56 files, 71 tooling controls, 143 Chromium cases and 9 local Pages-policy cases passed**, plus all format/lint/type/build gates. The seven focused source-fidelity journeys passed **21 WebKit repetitions**, zero retries.
- [Complete hosted editor acceptance](https://github.com/TomasDelon/programmable-notes/actions/runs/45758877564): **411 passed, 18 intentional skips**, zero flaky/retry acceptance, across Chromium, Firefox and WebKit; **27 local Pages-policy cases** also passed.
- [Mandatory CI at the application source](https://github.com/TomasDelon/programmable-notes/actions/runs/45758809047) and [subsequent observer head](https://github.com/TomasDelon/programmable-notes/actions/runs/45760502608): both required jobs passed, including production native compilation/inspection and backend fault injection. This is not installed native GUI acceptance.
- [Immutable deployment](https://github.com/TomasDelon/programmable-notes/actions/runs/45759171087) and [actual public origin after promotion](https://github.com/TomasDelon/programmable-notes/actions/runs/45761897633): **27 passed each** across all three engines, with exact worker and entry bytes, online reloads and offline reopening.
- [Download the walkthrough, screenshots and portable build](https://github.com/TomasDelon/programmable-notes/actions/runs/45758877564/artifacts/15089977069), plus [browser report](https://github.com/TomasDelon/programmable-notes/actions/runs/45758877564/artifacts/15089957509). Capture, eleven rejected mutations and clean-extracted offline editing, React interaction, exact export and reopening passed. Artifacts have seven-day retention.

Ordinary/Pages fingerprints: `542e03021b4d266b` / `9d64b02a1204796b`. Actual public
worker SHA-256: `0144d3c15f60825bf514bce876d0e91531310f0ec7d06b79e1bfc30500c6cbb4`.
The downloaded demo archive is 7,770,163 bytes with SHA-256
`64980e990673566fc8e8c70d7375aec13d2c20f9fdef6ca467cc959a4853f5c0`.

Existing tabs can use **Settings → Workspace → Save and update app**. Do not clear
browser storage to update: workspace data is local to that browser. Existing
intentionally escaped source is not silently rewritten; recovery is explicit.

This delivery fixes local/remote Trash selection, entity-adjacent links, ordinary
quote/list continuation punctuation and exact ownership of repeated raw entity
or EOL spellings. Hidden-prefix edges, crossing structural edits and unsupported
ambiguous IME snapshots still use Source or retain the attempted text. It is not
complete visual editing of every possible Markdown structure.

Native readiness remains blocked. [Actual Ubuntu observation](security-evidence/2026-11-26-hosted-preflight/README.md#actual-original-job-snapshot)
retains unavailable private networking and the occupied original job domain with
child controllers disabled. No guest was launched and no host policy was relaxed.
Current-package startup/Stop/security, native UI parity and native redistribution
notices remain separate gates. Browser React has no CPU/memory quota claim.
Physical GPU, Wayland and physical IME evidence are separate compatibility targets.
PR #9 remains draft; no main merge, release or production-security certification.

## Verified starting point

- Development: `3c36ae2`, [successful mandatory CI](https://github.com/TomasDelon/programmable-notes/actions/runs/45716862799), PR #9 draft/unmerged.
- Deployed application: `d2838be`, [24 principal-origin cases across Chromium, Firefox and WebKit](https://github.com/TomasDelon/programmable-notes/actions/runs/45711771472).
- Same application revision: [327 repeated cases passed, 42 intentional skips, zero retries](https://github.com/TomasDelon/programmable-notes/actions/runs/45709208038).
- The protocol-only development change had 428 unit /44 tooling /128 Chromium /8 local Pages-policy passes. It did not change application build inputs or certify a new native binary.

## Stabilization work

| Requirement                                                      | Existing witness                                 | Newly reproduced issue / development state                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unified document text; no nested math fields                     | `web-unified-math.spec.ts` and ADR 017           | Working baseline; preserve architecture.                                                                                                                                                                                                                                                                                                          |
| Ordinary list/prose/math editing without source corruption       | Individual browser/unit fixtures                 | Combined journey reproduced real paste-to-next-block and WebKit whitespace-click-to-heading caret failures. Corrections passed combined Chromium/WebKit acceptance and the final local Chromium suite.                                                                                                                                            |
| Invalid TeX remains local/red; incomplete dollars are plain text | Core-plugin and unified-math cases               | Combined mathematics journey passed the frozen baseline in Chromium/WebKit.                                                                                                                                                                                                                                                                       |
| Exact untouched source, history, saves, reopening                | BOM/EOL/JSX export/reopen fixtures               | Generated escapes inside authored ranges are distinct from visible corruption; unchanged source bytes remain mandatory.                                                                                                                                                                                                                           |
| Retain refused text across restart                               | Previously in-memory retained draft              | Reproduced loss after unmount/reopen. Bounded, checksummed separate recovery snapshots and explicit new-copy restoration passed unit and actual Chromium crash/restart acceptance.                                                                                                                                                                |
| Source/IME must stop canonical writes during conflict            | Unit protections and new two-tab browser witness | Reproduced editable DOM and filter-bypassing CodeMirror history. Explicit read-only/history and content-mutation guards passed unit and actual two-tab browser acceptance.                                                                                                                                                                        |
| Recovery actions preserve a copy until acknowledged              | New storage/model and UI witnesses               | Reviewed Keep/Discard races, stale inventory and other-tab deletion; serialized verified handoff and version-checked restoration passed focused tests and integrated browser acceptance.                                                                                                                                                          |
| Unchanged executable islands preserve temporary state            | Existing island tests                            | Delimiter reclassification reproducibly remounts an untouched Counter; identity-preserving lifecycle repair passed units and real Counter continuity acceptance. Full-document/source-driven rebuild resets remain intentional. Review also required explicit Rebuild to restart active islands and request-owned output to mask stale artifacts. |
| Core modules toggle safely                                       | Fixed registry/settings/backup tests             | No loader/permissions expansion. Source authority and isolation remain mandatory.                                                                                                                                                                                                                                                                 |
| Native persistence, resource isolation and recovery              | Version-specific real Linux records              | Current recorded complete stress command failed Stop attribution; startup remains a separate reliability issue. New matching-package evidence is required.                                                                                                                                                                                        |
| Native/web feature parity                                        | Separate `App` / `WebApp` routing                | Native still uses the older surface. A static boundary review identified compiler/math, source-freshness and recovery differences; no native UI implementation or matching-package proof is claimed. Browser runtime code must never be embedded in the privileged native host to simulate parity.                                                |

## Delivery boundary

### Integrated candidate evidence

The second frozen ordinary production build (`5792119cad2798cf`) passed six
combined authoring cases on pinned Chromium and WebKit, with zero retries.
They cover ordinary list and prose input, actual caret placement, paste followed
by typing, math corrections, exact source export/history/reopen, React interaction
and explicit Rebuild/Pause/Resume. Local Firefox could not create its profile;
hosted execution is required, rather than an isolation workaround.

Two Chromium recovery cases passed against that build. A genuine two-tab source
conflict interrupted synthetic Unicode composition in prose and mixed math/prose.
After recovery acknowledgement, a renderer crash and a fresh browser process using
the same profile, the exact retained text was downloadable and explicitly restored
as a new note. Original competing-tab source remained unchanged. This is not a
physical IME or power-loss guarantee.

The third candidate additionally fixes consecutive completed IME sessions sharing
an undo group. Three deterministic regressions verify both final-input event
orders and a conflict between sessions; an independent scoped review found the
reported defect resolved. The first full fresh gate passed 476 unit, 44 tooling and 131 browser cases,
but failed two browser diagnostic checks. Their traces are retained. Disabling
unused compilation had also removed malformed-MDX and parser work-limit notices.
The fourth candidate (`66ef4a52e574f7f7`) restores those notices from the existing
trusted parser pass; both unchanged browser regressions then passed with zero
retries. Ordinary invalid TeX remains local and silent. The complete corrected local gate passed: **478 unit tests /55 files, 44 tooling
controls, 133 Chromium browser cases and 8 local Pages-policy cases**, with zero
retries, plus formatting, lint, strict TypeScript and production build. Ordinary
build fingerprint: `66ef4a52e574f7f7`; Pages fingerprint: `785751561a3f8842`.
Final source-head hosted and deployment receipts are maintained in draft PR #9;
local success does not substitute for hosted Firefox/WebKit or live deployment
acceptance.

For the five measured neighboring math edits, the corrected runtime made zero
unused whole-document requests and zero island requests, and preserved the
acknowledged Counter instance. The baseline made five whole-document and two
island requests when each delayed request was observed before the next edit.
These are fixture-specific counts, not a general latency benchmark.

The local gate is complete; no local or earlier-candidate result is a passing production claim. The integrator freezes relevant source/tests/configuration, runs the required full check and hosted acceptance, retains failure evidence, and updates draft PR #9 before beta promotion. One identified candidate and one validation owner are used for each gate.

Native GUI, CPU/Stop/expiry/OOM and filesystem results require the actual installed binary in an appropriate disposable Linux system. Physical GPU, Wayland and device-keyboard evidence remain separate compatibility targets. Neither browser tests nor successful compilation substitute for native runtime validation.

### Native continuation gate

The current cloud shell lacks a working systemd user manager and delegated
writable cgroups. The retained disposable full-system guest was offline at the
last confirmed observation. Its launch approval was canceled; no new
installed-package result is claimed. The November 24 CPU Stop-attribution failure
and startup uncertainty remain open. Follow
[the hosted Linux acceptance plan](plans/2026-11-24-native-hosted-acceptance.md)
or the disposable-desktop procedure in
[Linux desktop testing](LINUX_DESKTOP_TESTING.md), retaining exact package/ELF
identity and the unchanged lifetime, quotas, namespace and cleanup assertions.

A static native-adapter review is complete, but implementation is gated on real
native validation. Tauri still routes to `App`, not `WebApp`. A future continuous
native Markdown/math surface must exclude browser React islands from the trusted
host; all document React stays in `NativePreview`'s separately supervised process.
It also needs an authoritative synchronous source witness, pending-draft guards,
native snapshot handoff for refused text, and explicit compiler math settings.
Reusing the browser UI wholesale would not satisfy those boundaries. No new native
filesystem permission or document-to-host edit channel is required.

## Review artifacts

The opt-in CI review capture now targets the current web workspace rather than
the legacy engine interface. A fixed `web-editor` profile retains allowlists,
complete build/media hashes, embedded notices, ZIP integrity and eleven rejected
mutations. The current capture, all controls and clean-extracted offline editing,
Counter interaction, byte-exact export and reopening passed locally. The legacy
profile also passed its eleven controls using its matching historical inputs.

Review additionally found that the verifier reread mutable metadata after its
positive baseline and could select different temporary paths. It now constructs
each negative fixture from the validated in-memory receipt and verified immutable
archive bytes. A controlled replacement failed before the fix and passed after
it. Downloadable hosted artifacts and their retention are documented in
[the web guide](WEB_APP.md#download-a-verified-browser-walkthrough).

## Late source-history review

After the integrated browser gates passed at `ab0e426`, a separate real-CodeMirror
regression reproduced a remaining live-validation bypass: with editing still
visibly enabled, a synchronous model refusal did not prevent history's
`filter:false` transaction. Canonical data stayed intact, but visible source
changed and history was consumed. This blocked beta promotion.

The correction authorizes every raw transition at dispatch, before applying the
batch, and keeps physical-ending-only history under the same check. Six new
regressions failed before the fix; the focused 85-test suite passed afterward.
The corrected complete local gate passed **484 unit tests /55 files, 47 tooling
checks, 133 Chromium browser cases and 8 local Pages-policy cases**, with zero
retries, plus formatting, lint, strict TypeScript and the fresh production build.
Ordinary/Pages fingerprints: `6a004170ca68b158` / `3f6b19e0f9f49046`. Fresh hosted
source-head results remain a separate gate recorded in draft PR #9. The native
infrastructure-only changes are separate from this application fix.

## Observed browser save latency

An observation-only pinned Chromium run on the `6a004170ca68b158` ordinary build
made three trusted-key edits in each fixture, with exact exports and the same
interactive Counter instance throughout. The cloud was free of other local test
browsers during collection. Values are medians in milliseconds:

| Synthetic note       | UTF-8 bytes | Input → matching IndexedDB put | Input → visible saved acknowledgement |
| -------------------- | ----------: | -----------------------------: | ------------------------------------: |
| Small mixed MDX      |         430 |                          260.8 |                                 263.0 |
| Long supported prose |      40,006 |                          300.0 |                                 302.3 |

Put → transaction completion was 0.4–0.8 ms across six samples; completion → visible
saved status was 1.4–2.0 ms. The pre-put interval includes the configured 250 ms
autosave debounce. It does not measure immediate internal canonical acceptance.
No debounce/storage change or general device-performance claim follows from this
small experiment. Physical-device and cross-engine performance remain separate.

[The first actual hosted native probe](security-evidence/2026-11-26-hosted-preflight/README.md)
records its failed observer and correction independently of browser acceptance.

## Hosted interaction verification follow-up

The full three-browser run at `8c36580`
([45730772678](https://github.com/TomasDelon/programmable-notes/actions/runs/45730772678))
ended with 379 passed, 18 skipped, one failed Chromium authoring case and one
flaky Firefox case. It was not accepted, and beta promotion remained on hold.

A deterministic probe reproduced the Chromium failure without changing the
application: the test's DOM Range selected a paragraph while ProseMirror still
held the preceding selection; the immediately dispatched synthetic paste used
that older state. The test now selects through native keyboard controls and uses
actual Copy/Paste. Its visible text and complete byte-exact export assertions are
unchanged. Chromium passed five consecutive runs and WebKit passed the complete
journey with zero retries on the frozen build.

The legacy long-paragraph test sampled browser scrolling immediately after
Ctrl+End. It now polls the same positive-scroll predicate with the default
deadline, retaining geometry, exact tail export, undo and redo checks. Actual
WebKit observation placed scroll delivery after the first post-key sample; local
Chromium/WebKit checks passed at that checkpoint. The subsequent hosted Firefox
repetition passed all 20 cases, as recorded below.
The optional `editing_scope=authoring` diagnostic selects these four journeys for
five repetitions without retries. It does not replace complete CI or acceptance.

## Hosted web checkpoint at `0c56878`

The corrected application at `0c56878` passed the
[complete hosted browser gate](https://github.com/TomasDelon/programmable-notes/actions/runs/45734745990):
**381 passed, 18 intentional skips, zero retries**, across Chromium, Firefox and
WebKit, plus **24 local Pages-policy cases**. The separate
[Firefox repetition gate](https://github.com/TomasDelon/programmable-notes/actions/runs/45734746231)
passed all 20 authoring cases across five repetitions. Mandatory CI also passed
at `0c56878` and infrastructure-only `502b483`.

The [verified `0c56878` walkthrough](https://github.com/TomasDelon/programmable-notes/actions/runs/45734745990/artifacts/15079287449)
contains the playable recording, desktop/tablet/mobile screenshots, exact example
and portable build. Its positive offline journey and eleven rejection controls
passed. Artifacts expire after seven days; this is neither an installer nor a
public release.

The tested `0c56878` was fast-forwarded to the Cloudflare beta branch. The
[immutable candidate check](https://github.com/TomasDelon/programmable-notes/actions/runs/45736289730)
passed eight Chromium cases. Earlier candidate dispatches did not select
`browser_qa=true`; they must not be described as 24-case deployment checks.
Principal-origin promotion acceptance is a separate gate. It now builds the
expected Pages output, waits for the exact service-worker SHA-256, and checks
that identity again during browser acceptance. This prevents an older working
site from satisfying the new revision's deployment gate. It verifies build
consistency over HTTPS, not resistance to a compromised hosting account.

The delivery-identity correction passed the complete local check: **484 unit
cases /55 files, 58 tooling controls, 133 Chromium cases and 9 local Pages-policy
cases**, zero retries, plus formatting, lint, strict TypeScript and production
build. Independent review additionally tightened partial APT-index failure
handling and sanitized navigation-origin failures; the affected final static and
58-control tooling checks were repeated successfully. Application build identities
remain unchanged. Hosted principal-origin and native results remain separate.

Principal-origin verification subsequently passed at `5a15943`:
[27 deployment cases](https://github.com/TomasDelon/programmable-notes/actions/runs/45738903565)
across Chromium, Firefox and WebKit, zero retries. The actual worker matched
release `3f6b19e0f9f49046` and SHA-256
`0221191054443494e174dca3f2a1284666c5a13b06d0008ff67f02110611221c`;
interaction navigations, online reloads and offline reopening matched expected
entry HTML. That deployment receipt identifies `0c56878`; delivery-infrastructure changes
did not alter its build inputs. Later application changes require their own
acceptance; current source-head and deployment receipts are maintained in draft
PR #9.

## Follow-up dependency and recovery usability correction

A two-tab browser regression on the accepted web build showed that saving an
unused Markdown sibling in the same import group reset a live Counter. The
active note and its actual TSX dependency remained byte-identical. The same test
verified that an actual dependency change correctly rebuilt and stayed
interactive. This is a newly reproduced lifecycle issue, not source loss.

The follow-up candidate uses bounded trusted compiler dependency witnesses for
editable islands. It validates all workspace budgets, exact loaded sources and
current import resolutions before preserving a frame. Transitive edits,
extension shadowing, missing modules, uncertain evidence and explicit lifecycle
changes retain conservative rebuilds. See [ADR 019](decisions/ADR-019-island-dependency-witnesses.md).

Recovery now offers new-note restoration only for supported Markdown/MDX drafts;
module drafts remain downloadable and discardable. Thirteen focused UI tests
passed, including exact BOM/Unicode/CRLF downloads for retained TSX. Help and new
workspace examples distinguish editable Preview from full-document execution.
Existing notes are not migrated or rewritten. The preceding principal-origin
receipt covers `0c56878` only; current-head deployment evidence is maintained in
draft PR #9.

The follow-up complete local gate passed **515 unit tests /56 files, 58 tooling
controls, 134 Chromium cases and 9 Pages-policy cases**, zero retries, plus
formatting, lint, strict TypeScript and a fresh production build. Pinned WebKit
27.2 passed the new two-tab production regression independently: unused sibling
kept the same Counter at 5; the changed TSX import replaced it at 9, then a click
acknowledged 10. All exact source checks passed. The immutable ordinary build
fingerprint is `afc89d287b038a18`; hosted all-engine and deployment acceptance
remain distinct evidence, linked from the draft PR. This does not certify a
native binary or physical keyboard/device.

## Compressed cached navigation correction

The complete hosted follow-up at `5f5b7a8`
([45741189077](https://github.com/TomasDelon/programmable-notes/actions/runs/45741189077))
passed all **384 editor cases /18 intentional skips**. Its subsequent local Pages
suite failed six Firefox reload checks and passed 21 cases: Playwright could not
retrieve cached navigation bodies (`NS_ERROR_INVALID_CONTENT_ENCODING`). The
complete command failed, no new walkthrough was captured, and beta promotion
remained on hold. The immutable Cloudflare candidate separately passed all 27
cases. Neither result establishes note corruption or a visible page failure.

A real loopback redirect/gzip fixture reproduced decoded response bytes retaining
compressed network headers. The service worker had copied those headers while
wrapping a redirected cached response. Two regressions failed before correction;
three transport controls then passed with exact decoded HTML and unchanged
security policies. Only reconstructed navigation responses remove Content-Encoding
and Content-Length; direct cached responses retain their original identity.
Service-worker script bytes change independently of the asset-based cache label;
the deployment verifier checks their full SHA-256.

For inexpensive reproduction, the existing optional diagnostic job now accepts
`editing_scope=pages`. It prepares the actual local Pages policies and repeats
all cases three times with zero retries. For example:

```sh
gh workflow run ci.yml --repo TomasDelon/programmable-notes \
  --ref fix/preview-markdown-input -f editing_qa=true \
  -f editing_scope=pages -f editing_browser=firefox
```

This does not replace mandatory CI, full browser acceptance or actual deployment
checks. Four shell-command controls preserve browser selection and existing
core-only/authoring behavior. Current corrected Firefox and full-matrix receipts
are maintained in draft PR #9; the failed checkpoint remains failed.

The corrected transport and diagnostic candidate passed the complete local gate:
**515 unit /56 files, 65 tooling, 134 Chromium and 9 Pages-policy cases**, zero
retries, plus all mandatory static/build checks. The earlier first attempt stopped
at a lint-only regex-spacing error before tests; it was corrected and this full
run passed. Ordinary/Pages asset fingerprints remain `afc89d287b038a18` /
`19f503362f07b8c6`; the corrected Pages worker SHA-256 is
`dac35a0103e6dae7e161cdb1481d2fc8112485de92e805bef2de82125f6d3ed2`.
This is local evidence; the Firefox diagnostic and fresh hosted full gate remain
separate receipts in the draft PR.

## Navigation consistency follow-up

Review after browser delivery reproduced a separate selection bug: trashing a
selected imported module could show Welcome while full-document execution still
compiled the prior note from another group. Clean cross-tab adoption could
independently produce the same mismatch. Existing source bytes were unaffected.

Trash now selects the fallback note and entry together. Remote adoption derives
entry from the effective note selection; surviving module selections keep their
previous valid note entry. Historical saved mismatches are normalized in memory
on load without rewriting stored content or revision. Explicit backup/recovery
replacement normalizes navigation only after confirmation; cancellation keeps the
existing workspace. No source or preview-to-host authority is added.

The direct model and actual hook refresh/startup regressions failed before their
respective corrections. Focused workspace tests pass, and two actual Chromium
journeys verify local/remote Trash, the visible fallback, full-document iframe
execution, exact source downloads and reopening. Independent scoped review found
no issues. Required complete/hosted checks and deployment of this follow-up are
separate from the accepted live `1442e58` receipt above.

The complete fresh local gate for this navigation correction passed **522 unit
tests /56 files, 71 tooling controls, 136 Chromium cases and 9 local Pages-policy
cases**, zero retries, plus formatting, lint, strict TypeScript and production
builds. WebKit passed both actual Trash journeys over three repetitions (**6/6**,
zero retries). Ordinary/Pages fingerprints: `a77d244e1d3208f2` /
`cc7dce21803b9dc6`. Hosted acceptance and beta promotion remain separate gates.

## Entity and wikilink source provenance follow-up

A bounded production-API review found a separate real source-fidelity defect:
adding punctuation near `&amp;` could rewrite an existing `[[Other]]` as escaped
plain text, removing its navigation/backlink target. Without an authored entity,
generated whitespace references could instead make the same ordinary edit fail.
Both actual Chromium journeys failed on the frozen navigation candidate; five
real ProseMirror regressions also failed before correction. Beta promotion was
held despite successful navigation-only mandatory and immutable-deployment gates.

The bridge now uses the Markdown parser's own pinned decoder and verified
UTF-16-to-source boundaries for text around authored links. It preserves raw
entity spellings and untouched source rather than reserializing a paragraph.
Caret mapping refuses invented positions inside indivisible references; edits to
one decoded constituent replace only the complete corresponding token. Decoded
CR/LF normalization composes its source map, including separate references.
Unfinished math retains its existing literal path and JSX remains opaque.

If multiline container syntax prevents a reliable map for an existing link,
ordinary prose stays visible. Verified adjacent sparse edits can proceed;
rewriting/removing that ambiguous block requires Source mode. No source-block
form or hidden prose is introduced. This conservative limitation prevents semantic
loss; it is not complete visual support for every Markdown container.

Existing saved source is not automatically unescaped or rewritten: intentionally
literal brackets cannot be distinguished from earlier corruption. Use the
canonical undo history or explicitly restore a verified recovery version/backup
if a note was already affected.

Current-candidate full, hosted and deployment receipts must follow this change;
earlier passing navigation runs do not certify the corrected bridge.

The frozen correction passed **532 unit tests /56 files, 71 tooling controls,
138 Chromium cases and 9 local Pages-policy cases**, plus every required static
check and production build. Both entity/plain-text browser journeys passed in
Chromium and six repeated WebKit runs, with zero retries. Independent frozen-diff
review found no further issue. Ordinary/Pages fingerprints: `8117e4701091ddd2` /
`881caf5c948a5b13`. These local results do not substitute for the next hosted gate.

The preceding navigation-only revision `bbdb389` separately passed mandatory CI,
390 editor cases /18 intentional skips and 27 local Pages cases, plus 27 actual
immutable-deployment cases. Its walkthrough is historical. It was never promoted:
the subsequently reproduced entity/link defect blocked release of that candidate.
The [390-case run](https://github.com/TomasDelon/programmable-notes/actions/runs/45753577071)
and [immutable check](https://github.com/TomasDelon/programmable-notes/actions/runs/45753709465)
remain scoped to their original inputs.

## Container prefixes and actual edit ownership

The next bounded correction supports ordinary punctuation in multiline quote,
list and nested quote/list continuations containing wikilinks. Three actual
Chromium baseline cases refused input; four real bridge cases also failed before
implementation. The existing parser now supplies bounded per-parse continuation
prefix witnesses without changing its grammar or adding a parse. Separate source
parts preserve hidden prefix bytes, and complete decoded content must match the
AST before those parts are accepted.

Review additionally reproduced two source-spelling failures: deleting the first
of identical rendered entity characters could remove the wrong raw reference,
and deleting a repeated line could retain the wrong physical EOL. The actual
browser distinguished the entity failure from a passing second-deletion control;
the mixed-EOL bridge and unwitnessed snapshot controls failed independently.
Verified ProseMirror replacement ranges now identify the authored source part
before trimming unchanged text. Unknown ranges cannot guess between different
source spellings. Literal code and mathematics retain their existing handling.

Seven actual corrected Chromium journeys passed with exact source exports,
links/backlinks, canonical Undo/Redo and reopening. The frozen source passed 219
focused tests and independent review. Full repository/hosted acceptance remains
a separate gate. Cross-prefix boundaries and unsupported structural/IME changes
still require Source or retain the attempted edit; no hidden prose or per-block
input is introduced. See [ADR020](decisions/ADR-020-container-and-text-edit-provenance.md).

The earlier `82bd530` candidate is not promoted: its successful mandatory and
immutable-deployment checks do not certify the source-spelling correction above.
Existing note source is never silently migrated or unescaped.

The complete frozen container/ownership candidate passed **543 unit tests /56
files, 71 tooling controls, 143 Chromium cases and 9 local Pages-policy cases**,
plus all required formatting/lint/type/build checks. The seven targeted journeys
also passed **21 WebKit repetitions**, zero retries. Ordinary/Pages fingerprints:
`542e03021b4d266b` / `9d64b02a1204796b`. Independent frozen-diff review approved the
same source. Hosted current-source acceptance and promotion remain separate.

The preceding `82bd530` run completed with396 editor passes /18 intentional
skips,27 local Pages passes and a verified walkthrough. Those receipts remain
historical; the candidate was held after the additional raw-spelling bugs were
reproduced. No earlier positive result is assigned to the newer parser/ownership
implementation.
