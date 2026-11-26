# Daily-use acceptance receipt

This is the development status for the 26 November 2026 stabilization plan. It separates identified behavior from version-specific evidence. The draft PR contains final current-head run/artifact links; dated records remain historical.

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

## Current hosted web acceptance

The corrected application at `0c56878` passed the
[complete hosted browser gate](https://github.com/TomasDelon/programmable-notes/actions/runs/45734745990):
**381 passed, 18 intentional skips, zero retries**, across Chromium, Firefox and
WebKit, plus **24 local Pages-policy cases**. The separate
[Firefox repetition gate](https://github.com/TomasDelon/programmable-notes/actions/runs/45734746231)
passed all 20 authoring cases across five repetitions. Mandatory CI also passed
at `0c56878` and infrastructure-only `502b483`.

The [verified current walkthrough](https://github.com/TomasDelon/programmable-notes/actions/runs/45734745990/artifacts/15079287449)
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
