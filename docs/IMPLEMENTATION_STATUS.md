# Programmable Notes implementation status

## Native presentation correction — 26 November 2026

Owner installation feedback showed that the first local-folder testing package
opened the historical engine interface. Native launches now use the current
product presentation with the shared Markdown/math editor, native file grants,
recovery and guarded updates. Preview is the initial mode; a supervised React
window starts only after explicitly choosing Split. Browser storage, service
workers and iframe execution are not used as a native shortcut.

[ADR024](decisions/ADR-024-native-product-presentation.md) records the boundary and
the canonical-undo/render freshness correction found by the new adapter tests.
The replacement package is version 0.1.2. The complete local check passed:
637 unit tests, 84 tooling controls, 150 Chromium cases, 9 local Pages cases and
4 inactive-cloud cases. The keyboard follow-up also passed all 638 unit tests
and the three native-entry cases in Chromium and WebKit/WPE. The [dated correction receipt](security-evidence/2026-11-26-native-presentation/README.md)
distinguishes native-entry browser interaction from unexecuted installed WebKitGTK
acceptance. The draft PR records the verified replacement artifact and hosted
results; the previous package's results do not certify this UI.

## Linux local-editor candidate — 26 November 2026

The owner paused cloud activation and prioritized an installable Linux app using
real local source files. Development adds OS-authorized bounded folder loading,
native Settings, shared literal Markdown/math Visual editing, and signed Debian
update policy with GUI PackageKit installation. React remains in its supervised
native child; no browser workspace or iframe authority is adopted.

The update channel is inactive without a production public key and authorized
signed feed. No key, public release, account or deployment was created. Native
package upload is gated on verified Cargo/Wry/frontend/Rust-runtime notices.
See [local use](LINUX_LOCAL_EDITOR.md),
[ADR023](decisions/ADR-023-linux-local-folders-and-updates.md) and
[native notices](NATIVE_NOTICES.md). The corrected native CI job passed and
produced an [installable testing download](LINUX_LOCAL_EDITOR.md#download-and-install).
The [dated receipt](security-evidence/2026-11-26-linux-local/README.md) separates
package inspection, executed recovery controls and unexecuted installed GUI /
PackageKit acceptance. Earlier results below do not certify this package.

Literal-dollar corrections preserve neighboring formatting, deliberate escapes
and canonical undo. [ADR022](decisions/ADR-022-typed-dollar-provenance.md) records
conservative history/reopen limits. The inactive cloud code/research remain
reviewable; provisioning and token requests are paused.

## Current acceptance and stabilization

[The accepted daily-use receipt](DAILY_USE_STATUS.md#current-accepted-browser-delivery)
binds the live browser application to source `52c86c4`, its real interaction
results and downloadable media. It passed **543 unit tests, 71 tooling controls,
143 Chromium cases and 9 local Pages cases**, plus 21 focused WebKit repetitions.
Hosted Chromium/Firefox/WebKit acceptance passed **411 cases /18 intentional
skips**, zero flaky/retry acceptance, and 27 local Pages cases. Both immutable and
actual public-origin acceptance passed 27 cases with exact worker/entry bytes.

The source-preserving engine handles same-document math/prose, local invalid TeX,
ordinary Markdown authoring, recovery and conservative unprivileged React reuse.
New corrections align Trash fallback selection with execution, preserve entities
and wikilinks, edit quote/list continuations through parser-owned source spans,
and anchor repeated entity/EOL edits to their actual editor transaction. See
[ADR018](decisions/ADR-018-retained-edits-and-stabilization.md),
[ADR019](decisions/ADR-019-island-dependency-witnesses.md) and
[ADR020](decisions/ADR-020-container-and-text-edit-provenance.md).

Changes after `52c86c4` concern infrastructure observation, its tests and receipts;
application/browser/build/security inputs are unchanged. Both required CI jobs
passed at observer head `632c94e`; its full local check also passed. The separate
native preflight failed before payload delivery because effective private
networking was unavailable. Its read-only metadata additionally observed disabled
child controllers in the occupied original job cgroup; device policy is unverified.
No VM or weaker policy was used.

Native exact-package GUI/security/startup/Stop and installed editor parity remain
open. Native redistribution notices are now verified for the candidate above.
Hidden-prefix boundaries and unsupported structural/IME
rewrites stay conservative in Visual editing; Source remains available. Physical
GPU/Wayland/IME and browser CPU/memory quotas are not certified. Older results
below are historical, not later-package claims.

## Engineering feedback workflow

Repository-local development skills now define a short outcome/invariants/witness/done contract, affected-engine feedback loops, explicit worker/watch ownership and milestone evidence review. [The operating protocols](AGENT_WORKFLOW.md) and [primary-source research/evaluation](research/2026-11-25-agent-feedback.md) record their scope and limits. The dependency-free evidence checker validates record consistency only; actual execution and security still require observed results. No application behavior, native authority or sandbox policy changes are part of this workflow work. Same-ref CI mode separation is implemented; hosted overlap/supersession evidence is tracked separately. Shared build reuse remains deferred.

## Unified document text and mathematical editing

The current development change replaces Preview's nested math CodeMirror view
with editable child text inside the owning ProseMirror document. Complete valid
formulas render outside the selection; invalid closed TeX remains red source;
unfinished delimiters are ordinary paragraph text with unchanged focus geometry.
The metadata title is passive text, renamed with the existing explicit command.
Source provenance prevents generated whitespace entities leaking through literal
math reclassification and maps exact carets across merged spans.

One canonical history and source authority remain. A mathematical IME operation
keeps its same-view text through final native input; pending state synchronously
guards navigation. If editing becomes unavailable, only that existing operation
finishes its provisional DOM read, then its whole attempt is retained without a
canonical write and the surface becomes read-only. Source revisions, opaque JSX,
filesystem/IPC grants, disabled history and recovery guards remain mandatory.

The final complete fresh local `npm run check` passed: **428 unit tests /48 files,
14 tooling (zero skips), 128 Chromium browser cases and 8 Pages-policy cases**,
plus formatting, lint, strict TypeScript and production build. Pages fingerprint:
`ba3b18a42210f424`, 77 assets. The seven focused real-browser math/navigation
cases also passed with zero retries. Failed checkpoints and their causes remain
in the dated verification record.

The final gate used matching Playwright Chromium 1255 (Chrome for Testing
159.0.8154.6). A separate system-Chromium 156 run produced one absent security
probe report; it remains recorded, not accepted or silently retried. The unchanged
probe passed 20/20 matching-browser repetitions and the full matching gate.
An unchanged system-browser control also passed 20/20; neither control establishes
the cause of the earlier missing report.
The hosted candidate also exposed Firefox paragraph LF normalization and a real
Chromium stale-native-selection write into a heading; both have deterministic
regressions. The corrected browser scenario passed 20/20 repetitions, zero retries.

The broader repeated matrix caught a real WebKit internal-caret failure even
after the first candidate passed. Actual local WebKit reproduced the stationary
caret in all three runs; bounded observation ruled out a merely early assertion.
Selection-driven node decorations now reveal source before native caret
synchronization. The exact case then passed three runs with no retries; all seven WebKit cases
also passed three repetitions (**21/21**). Native diagnostics show immediately
correct caret positions. Collapsed/Shift ordering regressions pass. Full final-head acceptance remains
required; earlier successful runs do not substitute for it.

Hosted clean-checkout CI, repeated Chromium/Firefox/WebKit diagnostics and actual
Cloudflare candidate/principal-origin acceptance remain required before promotion.
Their final head, results and downloadable reports are tracked in
[draft PR #9](https://github.com/TomasDelon/programmable-notes/pull/9), avoiding
repeated documentation-only builds. A source push is not deployment proof.

See [ADR 017](decisions/ADR-017-unified-mathematical-text.md),
[design](superpowers/specs/2026-11-25-unified-math-text.md), and
[verification record](recovery/2026-11-25-unified-math-text.md).
The earlier nested-input approach and its independent math draft history below
are historical and superseded for the web Preview. Native `/engine` retains its
existing interface; no new packaged-native GUI or physical-keyboard evidence is
claimed by this web change.

## Incomplete mathematical delimiters: implementation and verification

Unpaired dollars now remain editable literal text, without red feedback, math
notices or a global editing barrier. Completed invalid TeX remains raw/red and
correctable. ADR 016 records the shared source/compiler/link-index parser, exact
raw-span patches, JSX preservation and editor-owned first-dollar mapping.

The initial implementation passed a clean-checkout mandatory CI and repeated
three-browser workflow at `eb03c8d`, plus actual Cloudflare candidate acceptance.
It was not promoted while a speculative-parser work-limit follow-up was completed.
That follow-up bounds repeated unfinished fences and possible JSX-tag lookahead;
exhaustion retains exact source and the existing Source fallback, with no write or
sandbox relaxation.

The final native-caret repair passed the complete fresh local gate: **385 unit
tests /46 files, 14 tooling (zero skips), 118 Chromium and 8 Pages-policy cases**,
including format/lint/typecheck/build. Pages fingerprint: `48651d19f9e47b91`, 77 assets.
Its two production source-navigation cases passed 40 matching-Chromium repetitions.

A deterministic real-editor regression reproduced CodeMirror holding the requested
position while the native caret stayed at zero. Source navigation now rechecks the
owned target after focus and explicitly synchronizes the native selection through
public DOM APIs. Source snapshots, history and filesystem authority remain intact.
Home/End similarly synchronizes only a proven single-visual-line text selection.
The adversarial analysis-budget regression verifies its genuine resource refusal
and exact recovery; ordinary unmatched/invalid mathematics still requires no notices.

The old product failed one of forty hosted source repetitions. Development-only
StrictMode replay focus loss was separately confirmed on its unchanged baseline;
layout experiments were reverted and that issue remains a follow-up. Details and
all genuine failed checkpoints are retained in the verification record.

The final head's clean-checkout, hosted acceptance and deployment state are
tracked in [draft PR #9](https://github.com/TomasDelon/programmable-notes/pull/9)
and its checks. Promotion requires mandatory CI, repeated browser diagnostics and
actual candidate/principal-origin acceptance; a pushed source commit is not proof
of deployment. Older deployment hashes below describe historical checkpoints.
Details, including genuine failed checkpoints and downloadable reports, are in the
[verification record](recovery/2026-11-25-core-plugins.md).

## Core plugins, hidden setup and recoverable LaTeX

The web workspace now has static bundled Mathematics and React core modules with
validated, persistent Settings toggles. No community loader or optional security
kernel is introduced. Imports/exports/comments are invisible by default; the
Workspace setting can show escaped ordinary code alongside live JSX. Setup labels
and source-edit buttons are removed. Hidden code is protected against visual
Backspace and selection replacement, including canonical undo/redo.

Invalid TeX within valid math delimiters saves as red raw source without notices
or blocking other text. Correction clears feedback and renders on exit. Unsafe
boundaries/stale revisions still retain explicit recovery. This supersedes the
older invalid-LaTeX refusal described below. The actual native `/engine` interface
is unchanged. See [ADR 015](decisions/ADR-015-core-plugins-and-preview-source.md)
and the [verification record](recovery/2026-11-25-core-plugins.md).
The final local full gate passed **359 unit /45 files, 14 tooling (zero skips),
116 Chromium and 6 Pages-policy cases**, including format/lint/type/build.
After cross-browser selection corrections, the full local gate passed again
with the same counts. Pages fingerprint: `2924a01765a41438`, 77 assets. CI now
refuses flaky acceptance even if a retry passes. The first hosted candidate
passed 18 actual-origin cases but failed repeated selection diagnostics and was
not promoted. A later repeat still found Firefox Undo and WebKit input-commit failures, so
promotion remains blocked. Explicit beforeinput/input-only ownership has now
passed a fresh local gate: **361 unit, 14 tooling, 116 Chromium and 7 Pages-policy**;
Pages fingerprint `2df713071e4a8c04`. Focused hosted diagnostics are pending and
the deployed app remains `7628521`. The next focused run isolated Firefox
composition Undo; forwarding host composition phases now passes **363 unit,
14 tooling, 116 Chromium and 7 Pages-policy cases** locally (Pages fingerprint
`a02f5abbd04aa496`). The focused hosted three-browser repeated workflow passed at `2cd021d`
([45658934348](https://github.com/TomasDelon/programmable-notes/actions/runs/45658934348));
mandatory check/native-check also passed ([45657518609](https://github.com/TomasDelon/programmable-notes/actions/runs/45657518609)).
The missing-delimiter follow-up still needs its own final acceptance. Full failed/passed checkpoints are in the verification record.

## Caret-based mathematics

Web Preview mathematical editing now uses an unframed source surface at the
caret, with no input/textarea or Done/Cancel controls. Arrow entry/exit, ordinary
display newlines, local draft undo/redo and canonical source history retain the
existing revision and lossless-patch guards. Hover does not activate equations.
The same original source reappears on entry, including dollar delimiters.
Multiline CRLF/CR comparison and composition completion/focus ordering were
corrected. Stale/unsafe-mapping drafts remain protected and memory-only until resolved;
ordinary TeX errors now follow ADR 015.
The native `/engine` interface and all preview authority boundaries are unchanged.
The corrected application commit `7628521` is deployed at
https://programmable-notes.pages.dev/. Local checks passed 346 unit, 14 tooling,
107 Chromium and 5 Pages-policy cases. Current check/native-check CI passed;
zero-retry repeated three-browser diagnostics passed 123 cases (30 explicit
Chrome-only IME skips), and actual candidate/principal-origin checks each passed
15/15. Downloadable desktop/mobile and source/rendered screenshots are linked
in the [verification record](recovery/2026-11-25-caret-math.md).
Physical Android keyboards and native GUI runtime were not tested here.

## Preview keyboard authoring repair

The corrected web beta is deployed at https://programmable-notes.pages.dev/
(application commit `854f304`, draft PR #9). Final local gates passed 343 unit,
14 tooling and 101 Chromium cases. Current zero-retry three-browser diagnostics
passed 63/63, including real app updates; actual production URL acceptance passed
12/12. Check/native-check CI passed. Downloadable screenshots and exact failed/
passed checkpoints are in the [verification log](recovery/2026-11-24-preview-markdown-input.md).
Native runtime acceptance remains separate.

The web Preview removes its formatting toolbar and uses Markdown input, keyboard
shortcuts and trusted palette commands. Prefix typing, empty nested lists,
trailing spaces and bold input are covered by regression tests. Compact animated
notifications replace inline editor errors. Explicit recovery retains the first
refused raw candidate, blocks later mutations, and offers an exact-byte download.
Source revision checks, semantic reparsing and JSX opacity remain mandatory.
Measured excessive horizontal whitespace uses the existing Source-only work
budget; refused visual candidates retain an explicit exact-source recovery path.
See the [verification log](recovery/2026-11-24-preview-markdown-input.md) and
[ADR 013](decisions/ADR-013-rendered-document-editing.md).

## Permanent web testing preparation

A separate Cloudflare preparation branch adds a static Pages build target,
transport/cache metadata and real browser acceptance under those headers.
See the [owner setup guide](CLOUDFLARE_PAGES.md). The owner has connected the
Pages testing project. The repository fixes its published directory to `dist`
through Pages configuration; no backend or privileged services are introduced.
Executed deployment results and failed checkpoints are recorded in the
[verification log](recovery/2026-11-24-cloudflare-preparation.md) and
[draft PR #8](https://github.com/TomasDelon/programmable-notes/pull/8).
Hosting adds no synchronization: each origin is a separate local browser
workspace. The custom domain's DNS/TLS still requires separate verification.
Local full checks passed 287 unit, 14 tooling and 90 Chromium cases, including
Pages canonical-redirect/offline regression coverage. See the
[verification record](recovery/2026-11-24-cloudflare-preparation.md).
Native package/runtime acceptance remains separate and is not certified by web
hosting. The app UI, document authority and native capabilities are unchanged.

## Current web application

The integrated browser beta remains on `main`. Draft PR #6 adds a two-mode
web selector: **Source** retains canonical CodeMirror transactions, while
**Preview** edits rendered Markdown directly, including formatting, lists,
tasks, tables, attachments and in-place dollar-delimited LaTeX. The separate
Live web mode is removed and old `live` preferences migrate to Preview.
The native `/engine` retains its separate existing interface.
See [ADR 013](decisions/ADR-013-rendered-document-editing.md) for the source
preservation contract, isolated React islands, full-document runtime and the
cross-tab persistence fix. This does not add cross-device synchronization or
change the native security model.

The resumed 23 November audit found and corrected unfinished equation loss through
document-wide deletion and stale Preview after equation cancellation. Nearby
document changes are now refused while a math field remains open; an existing
link URL is retained when submission is blocked. The canonical source guard and
React sandbox are unchanged. See the
[resumed audit and verification](recovery/2026-11-23-resumed-engineering-audit.md)
for actual results, infrastructure failures and the ordered continuation roadmap.

The independent continuation adds [opt-in hosted three-browser QA](BROWSER_QA.md)
and a real pending-field/focus-read race regression. A native startup diagnostic
also now reuses the bounded cleanup observer, correcting premature refusal and
late/repopulated-group acceptance in the test harness. See the
[startup observer review](recovery/2026-11-23-startup-observer-review.md).

Current-package disposable Linux testing then reproduced a source-input defect:
Tauri's style nonce blocked CodeMirror's unnonced runtime CSS, collapsing spaces.
SourceEditor now supplies the existing authorized nonce through CodeMirror's
supported facet; CSP directives and preview privileges remain unchanged. Browser
and installed native regression tests passed exact ASCII/NBSP, BOM/CRLF,
save/history/reopen and continued unauthorized-style refusal. The unchanged full
fidelity/recovery suite passed on a fresh retry; the preceding intermittent
React preview availability failure remains retained. Exact results are recorded in the [24 November package evidence](security-evidence/2026-11-24-current-package/README.md).
The installed production IPC, file persistence and separate versioned-recovery
suites also passed. The complete current resource run exited1: five cases passed,
CPU Stop attribution overlapped earliest expiry. Separate CPU and heap edit/save runs exceeded
the5s budget despite exact saved bytes. Missing OCR initially blocked heap
observation; existing workspace tools resolved it without a package download,
and the real marker then passed. The complete heap run still failed latency. No security/timing assertion was relaxed. These results
are not a renderer-crash fix or full native security acceptance.

## Historical native implementation record

The following record describes the earlier `feat/mdx-react-engine` work. PR #1
was subsequently included in the integrated browser beta. Historical evidence
and limitations below remain scoped to their original builds.

Original status: development branch `feat/mdx-react-engine`; PR #1 draft. No public release
or production security-readiness claim. The specifications/research in
`docs/handoff` are supporting material; executable evidence below defines verified
behavior. The provisional design ZIP is reference only and has not replaced the
application or its persistence model. See [progress log](AGENT_PROGRESS.md) for the
next executable action and individual commits.

## Current editing behavior

Real unsaved MDX/React runs from a memory-backed compiler with JSX, local imports,
hooks, state and events. Explicitly chosen TSX/JS modules and pinned clsx work;
inline TypeScript in MDX and runtime package installation do not. The preview is
untrusted execution, not a Markdown sanitizer.

Source mode shows CodeMirror; Split shows source and interactive React output;
Visual shows the editor-owned Markdown surface and collapsed opaque blocks.
Changing modes preserves React state. Modified inline text is guarded until
Enter applies or Escape cancels: document switching/replacement and saving cannot
discard it or claim it was saved. It participates in native/browser dirty-close
protection. If source editing invalidates its mapping, the pending value remains
accessible for copying/cancellation and stale patches still fail. It is memory-only
until applied; automatic recovery continues storing actual document source.
[Browser/native red-green evidence](security-evidence/2026-11-19-pending-inline/README.md).
Changing modes preserves React state. Applying source changes rebuilds the artifact and restarts the
isolated runtime. Literal paragraphs with punctuation/soft line breaks, ATX and
Setext headings, simple list items and literal quoted paragraphs support in-place editing. Enter applies,
Shift+Enter inserts a soft break and Escape cancels. Arbitrary JSX, imports,
comments, fences, formatted/nested Markdown and mapping-style metadata stay opaque. Quote markers,
indentation and endings are preserved byte-for-byte. Explicit multiline quoted
paragraphs keep their line count; lazy/nested/formatted/JSX quotes and structural
changes stay in Source. [Browser/installed quote, disk/history/restart and driver
red-green evidence](security-evidence/2026-11-19-literal-quotes/README.md).

Explicit multiline quote logical text excludes continuation markup while its raw
patch span retains every prefix. Exact context/candidate checks and no-op/history
preservation passed actual browser export/reopen and installed native disk/restart/
recovery acceptance. [ADR010](decisions/ADR-010-multiline-quote-editing.md) and
[exact scope, initial failure and driver regression controls](security-evidence/2026-11-19-multiline-quotes/README.md).

Expanded opaque blocks now offer **Show in Source** on the trusted surface. It
focuses the exact original offset without modifying source or restarting React.
Captured document/revision checks and pending/busy guards prevent stale navigation
or discarded inline text. Preview messages cannot authorize navigation or edits.
[Browser and installed acceptance](security-evidence/2026-11-19-opaque-source-navigation/README.md).

Patches validate the full captured source revision, parser-owned spans, text and
block context, then reparse the candidate. Ordinary leading-BOM documents now map at their original offsets without
indenting imports/JSX or changing compilation. [Red/green and installed validation](security-evidence/2026-11-19-leading-bom/README.md).
Untouched spans, BOM, Unicode, markers and whitespace are preserved.
Internal mixed LF/CRLF breaks are now retained for ordinary visual edits and
normalization-only input adds no undo step. Changed-count edits preserve raw equal
prefix/suffix; ambiguous mixed middles/repeated-line alignments are refused with
pending text retained for Source. Some safe periodic edits are conservatively
unsupported. [Real browser and installed disk red/green](security-evidence/2026-11-19-internal-eol/README.md). CodeMirror provides per-document
undo/redo and selection histories. Preview messages cannot choose spans, change
source or authorize saves. One bounded exact-source AST avoids repeated analysis;
all validators still run. See [ADR-005](decisions/ADR-005-paragraph-editing.md),
[ADR-007](decisions/ADR-007-unified-workspace.md) and the mapping benchmark.

Long literal inputs now use a bounded scrollable viewport without truncating text.
Actual Chromium typing/export/history passed. Installed native geometry/disk/history
and a debugger-observed strong reopen passed, but two other runs suffered WebKit
renderer SIGSEGV while entering Visual. This remains an unresolved native
reliability blocker; no parser/security change was guessed from the crashes.
[Exact failures, diagnostics and package scope](security-evidence/2026-11-19-long-inline/README.md).

A bounded installed-app diagnostic now records requested/completed long-document
mode transitions before its unchanged editing/disk/history/reopen gates. One
ordinary and one five-transition current-package run passed; an intentional
missing-observation control retained failure/phase/count and unchanged original
bytes after cleanup. These do not explain or fix earlier renderer crashes.
[Exact scope](security-evidence/2026-11-19-long-transition/README.md).

Visual analysis now conservatively falls back to one exact escaped read-only
source block above4096 raw square-bracket/greater-than markers or the existing
500000UTF16-unit bound. Source navigation remains trusted; patches/candidate growth
above the budget fail closed. This targets measured dense-syntax stalls: one actual
100KB browser probe improved5074ms→68ms transition/2944ms→24ms heartbeat gap. These
are single observations, not universal parser deadlines or native crash repairs.
Normal source/compiler/save limits still apply.86unit/34browser and the full
new installed editing/recovery suite passed. A real directory-write refusal
verified the new Save acknowledgment oracle cannot infer success from unchanged
bytes. [Budget, exact artifacts and limitations](security-evidence/2026-11-19-visual-analysis-budget/README.md).

## Native session feedback

Compilation feedback is separate from the native wait connection. The editor
reports starting, connected, ended/disconnected or unknown, with explicit manual
rebuild guidance. One editor-only argument-free read retains supervisor cleanup
ownership; preview capabilities remain empty. Serial polling is bounded across
rebuilds and never restarts execution automatically. A connected wait handle does
not prove renderer health or an empty cgroup. Installed actual counter/expiry/
manual rebuild/UI-only Stop and unchanged-file checks passed on the recorded
production binary. Startup/rebuild failures remain preserved and unresolved.
See [ADR009](decisions/ADR-009-native-session-feedback.md) and
[exact scope and failed controls](security-evidence/2026-11-19-session-status/README.md).

Native Stop now waits for native confirmation and reports failure. When an artifact
has already been removed, another trusted Stop click issues a fresh serialized
retry. Newer requests/rebuilds supersede old completion/error feedback; there are
no automatic retries or expanded permissions. Actual injected native exec failure
then UI retry/cgroup cleanup before expiry passed on the recorded production ELF.
[Stop recovery, race tests and retained failures](security-evidence/2026-11-19-stop-retry/README.md).

Same-named sources now have distinct numbered choices. Numbers are current list
positions; underlying keys, native grants and histories are unchanged. Selecting
a closed/unknown/inherited key is rejected against the latest workspace without
changing source/entry. Real browser and installed separate-directory file edits,
independent exact saves/history/reopen plus the full native recovery/IPC suites
passed. [90 unit /35 browser checks and exact package scope](security-evidence/2026-11-19-safe-source-selection/README.md).

## Original-document Save interruption

A production-library integration test now kills an owned native writer after
actual temporary write, file fsync, atomic publication and parent-directory
fsync. Ordinary Ubuntu UID1000 execution passed all four stages with exact
old/new BOM/Unicode/mixed-ending bytes, mode0640, untouched sibling, fresh Store
reopen and subsequent explicit Save. Writer identity/syscall/descriptor/name
receipts and the initial rename-observer failure are retained. A pre-publication
crash can leave an orphan temporary; the application neither promotes nor
arbitrarily scavenges it. This is process interruption, not power loss or a new
packaged-GUI restart test. CI adds a mandatory timeout and explicit stage checks;
public hosted CI was subsequently restored (see PUBLIC_READINESS.md).114unit/37browser and ordinary Rust39document/
7policy passed; the new ignored integration case was manually executed separately.
[Exact results and limits](security-evidence/2026-11-19-document-save-crashes/README.md).

## Browser import budgets

Browser Open preflights the existing workspace and selection metadata before
reading files:32 total files,500KB each,8MiB total UTF8 bytes. Strict UTF8/BOM and
latest-workspace validation still run after reads. Rejections preserve dirty
buffers/history; no partial import or native authority change. Exact-limit and
async growth regressions plus real zero-read/refusal/recovery/export passed.
[83unit/33browser full-check evidence and scope](security-evidence/2026-11-19-browser-import-budget/README.md).

## Documents and recovery

Selected dirty/save status is independent of other buffers. Dirty siblings have
a separate count; aggregate native/browser close protection still includes every
buffer and unapplied visual input. Notices capture the exact source and document
key, so delayed saves cannot label another or newer source saved. A selected
file's durability warning remains available with dirty siblings. Real native
picker/save/reopen/dirty-close and browser transport regressions passed
([results and screenshots](security-evidence/2026-11-19-document-status/README.md)).

Focus the editor workspace and use Ctrl/Cmd+S to save; Shift requests native
Save As. Synthetic/repeated/composing input and pending/busy states cannot save.
Browser exact-export/delayed-read and real Linux Ctrl/Shift chooser cases passed
([keyboard evidence](security-evidence/2026-11-19-keyboard-save/README.md)).

New note creates a separate empty unsaved MDX buffer in Source mode without a
file grant. It preserves queued input, sibling source and histories, and respects
the 32-document limit. Save As remains explicit. [Browser/native acceptance](security-evidence/2026-11-19-new-notes/README.md)
passed cancellation, exact saving and reopening without changing the original.

Native paths come only from editor-side OS pickers. Commands use unpredictable
grants and expected revisions, never renderer-supplied authorization paths.
Atomic saves preserve exact UTF-8, modes and POSIX ACLs. Save As cancellation,
read-only failures, conflicting external changes and edits during asynchronous
operations retain source. Unselected neighboring files are not imported.

Native recovery uses private immutable checksummed/schema-versioned records,
parent revisions and no original paths or reusable grants. Automatic snapshots
cover all dirty buffers after a two-second idle debounce, with one bounded batch
in flight. Independent buffer/session lineages prevent same-path buffers from
pruning one another. Errors visibly pause automatic recovery; Resume is explicit.
Limits are five versions per lineage, 64 records and 8 MiB globally. At capacity,
refuse writes rather than discard another lineage. Failed publication never
removes an earlier version. Corrupt records remain visible; valid older versions
can be restored. Legacy migration preserves the old source.

Restore always opens a separate dirty buffer without an original-file grant.
Saving to disk remains an explicit action. Browser drafts are separately opt-in.
The installed production app also passed automatic recovery of two entirely
unbound new notes across actual SIGKILL/restart: null baselines, independent
retention, exact source, explicit restoration, cancelled Save As and exact saving
without modifying the sentinel original. The original-file variant passed again.
[Package hashes, raw results and reproduction](security-evidence/2026-11-19-unbound-recovery/README.md).
Actual SIGKILL and ENOSPC evidence is linked below. The recovery guard explicitly
unlocks on drop so a forked child retaining a descriptor cannot cause a false busy
error. See [ADR-008](decisions/ADR-008-versioned-recovery.md).

## Verified checks and evidence

| Layer                              | Executed evidence                                                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current local application checks   | Formatting, ESLint, strict TypeScript, 98 unit and 37 Chromium tests passed, including extension-only import mismatch and simultaneous case-distinct TSX modules.                                                                            |
| Native document backend            | 39 ordinary Rust tests passed; four infrastructure-only cases are excluded from that count. Earlier 15 snapshot tests were repeated ten times. Real tmpfs ENOSPC and four real writer SIGKILL stages passed separately.                      |
| Mixed MDX browser behavior         | Exact import/export/reopen, stale revision rejection, opaque JSX/metadata/fences, multiline edits, undo/redo and React interaction; desktop/tablet/mobile viewports.                                                                         |
| Installed source fidelity          | Optimized Ubuntu/WebKitGTK package passed BOM/CRLF no-op save, heading/paragraph/list edits, undo/redo, mode 0640, reopen, actual React interaction and recovery. [Exact scope](security-evidence/2026-11-19-source-fidelity/README.md).     |
| Automatic native recovery          | Real independent histories, retention, restart, discovery, explicit restore/save, GUI ENOSPC/pause/Resume and original Save while recovery storage was full. [Evidence](security-evidence/2026-11-19-automatic-recovery/README.md).          |
| Process crashes and lock fix       | Actual writer SIGKILL at write/fsync/rename/directory-fsync, red/green inherited-lock test, rebuilt installed-app SIGKILL/restart and exact restoration. [Evidence and hashes](security-evidence/2026-11-19-process-crashes/README.md).      |
| Native IPC and filesystem boundary | Production registered-command denial, recovery-action denial, parent DOM/storage isolation, HTTP/file denial, private profile/network and Stop. [Recovery UI evidence](security-evidence/2026-11-19-recovery-ui/README.md).                  |
| Production resource stress         | CPU throttling, whole-group Stop, 512 MiB OOM, 60-second expiry, parent-death backstop and exact disk saves under attack. [Original package scope](security-evidence/2026-11-18/README.md); not rerun for every frontend commit.             |
| Hosted GitHub CI                   | Both jobs actually passed for public head `8a8e44c`, run 44694104501, including native package inspection. Earlier private-account billing refusals remain historical evidence. Revised workflow results are tracked in PUBLIC_READINESS.md. |

Compilation/package inspection is not native runtime evidence. CI builds and
uploads the Debian testing package and browser demo but does not execute the
full-system desktop matrix. Each dated record retains exact package/source hashes,
failed attempts and limitations; earlier results do not certify later binaries.
Historical Actions artifact re-download returned HTTP 403 in this cloud. The
PR-accessible [portable browser review ZIP](demo/README.md) has dated exact-hash
validation evidence, including source-blob download checks. It includes
a working offline-capable build, responsive screenshots and a recorded walkthrough;
no public release or site was published.

New native preview windows now start unfocused. Actual packaged testing proved
continued source keyboard input and normal explicit preview keyboard interaction,
with native IPC/policy denials repeated. [Red/green evidence](security-evidence/2026-11-19-native-focus/README.md).
This is an input-focus fix, not a claim that startup reliability is resolved.

## Native download boundary

The preview now explicitly rejects native WebKit downloads. Pinned Wry defaults
permit a filesystem destination independently of IPC capabilities. A separate
real native callback harness passed an exact-write default positive control and
cancellation with the shared production callback; omission of that callback was
correctly rejected by the test. The installed optimized package also passed
ordinary supervised MDX automatic/clicked data/Blob attempts with no canaries,
unchanged effective limits/private networking and automation disabled. Strict
Stop cleanup finished at 51.29 seconds, before earliest expiry; registered-command,
recovery, DOM/storage, HTTP/file and Counter regressions passed. This is defense
in depth, not a demonstrated iframe escape or a new full resource-matrix pass.
[Exact hashes, failed probes and reproduction](security-evidence/2026-11-19-native-downloads/README.md).

## Native editor termination feedback

Actual Linux editor-renderer death now produces a native recovery notice with
warned Quit / Keep actions. Only the trusted editor installs this callback;
preview capabilities and lifecycle remain unchanged. Renderer loss invalidates
stale frontend busy hints while actual Rust operations and dirty confirmation
remain. The notice uses the same native dialog guard as file pickers, waits for
them to finish and holds the guard through dismissal. No automatic reload,
restoration or document write is added.

The old blank/stale-close failure and an intermediate concurrent-modal bug were
reproduced with real owned-renderer kills. On the new optimized installed ELF
837d2ab9…, native Quit, crash during an open picker, Keep/dirty-close cancellation,
actual restart, explicit version restoration and exact separate Save As passed.
Independent IPC, filesystem hashes/modes and cleanup passed. Full packaged editing/fidelity acceptance with all seven flags also passed; this
is not an underlying engine-crash fix. Exact scope is recorded in the [dated evidence](security-evidence/2026-11-19-native-editor-failure/README.md), with an actual GTK screenshot.
[ADR011](decisions/ADR-011-native-editor-termination.md) explains the boundary.
This is recovery feedback, not a JSC fix or a live-hang watchdog.

## Security boundary and release blockers

The browser preview uses an opaque origin, sandbox and hash CSP. Linux uses a
separate capability-denied preview process, clean environment, verified private
networking, fixed cgroup limits and mandatory WebKit sandboxing via a small Wry
fork. Production child automation and inspection remain disabled. WebDriver probes
change WebKit networking, so normal production namespace/seccomp observations are
recorded separately. No security check was relaxed to pass tests.

The threat model covers untrusted document JavaScript, not arbitrary compromised
native code. Session DBus, authenticated X11, devices, same-user malicious native
writers and WebKit vulnerabilities remain risks. Before broad distribution,
establish a supported distribution-specific namespace policy, review/maintain the
Wry fork and repeat the production isolation matrix on each supported stack.
Hardened Ubuntu requires reviewed administrator namespace configuration; the
package installs only its own AppArmor profile and no global executor opt-in.
A confirmed capability/filesystem/network escape or missing enforced resource
limit is a security stop.

Recovery can lag within debounce or unfinished writes. Checksums detect corruption,
not hostile same-user rewriting. Advisory locks coordinate cooperating instances;
a noncooperating same-user writer can race the final original-file conflict check
and rename. Actual separate-process contention now also verifies busy denial, one successor,
stale conflicts, exact prior/winner bytes and valid retry in five-round cloud and
Ubuntu VM runs ([evidence](security-evidence/2026-11-19-process-contention/README.md)).
Actual process-kill tests do not prove storage power-loss durability.
External own-child syscall injection now verifies file-fsync failure,
publication-directory uncertainty and retention-directory warnings without
production failpoints. Prior bytes, exact restoration and explicit retry passed
in the disposable Ubuntu VM; this is error-path validation, not real disk failure
or power-loss evidence. [Executed scope](security-evidence/2026-11-19-sync-errors/README.md).
Snapshot capacity exhaustion requires explicit cleanup. These constrain durability
claims, not permission to continue editor-side source-preserving work.

The latest complete installed six-case matrix exited1: CPU/Stop, original full-fill
allocation OOM, expiry, editor SIGKILL/recovery and window-close passed. The added
resident-page workload expired with528297984-byte peak/zero swap before its required
OOM cause, so that case failed. Both memory cases now require trusted structured
systemd sender/unit/result evidence, not broad OOM text. Original OOM peaked at
512MiB with a manager kill notification59.339s after Started; all11recorded units
were empty/gone and known identities terminal. A preceding selected page workload
on the identical ELF/artifact did OOM and recover; it does not repair the failed
full run. Prior original-memory expiry and intermittent blank failures remain
retained, without an inferred timing fix. [Exact scope, failed gate and reproduction](security-evidence/2026-11-19-memory-pages/README.md).

A separate current-binary startup diagnostic measured a JavaScript-free static
button at 40.54 s and real React Counter at 43.88 s under identical production
limits. Both were heavily CPU-throttled; actual interaction and Stop before expiry
passed. This narrows common emulated startup cost but does not resolve the earlier
editor-crash blank case. [Raw comparison and failed harness attempt](security-evidence/2026-11-19-startup-probe/README.md).

The intermittent browser first-counter click has no established cause. A bounded
investigation passed100 warm-context and20 cold-browser clicks across system156
and matching Playwright159; a deliberate missing-input control retained failure
after a second real click worked. Read-only event/mutation/navigation diagnostics
are now reproducible, with exact probe versions and original failed traces retained.
This is not a production fix or evidence of a React reset.
[Executed scope](security-evidence/2026-11-19-counter-input/README.md).

Software rendering passed normal and stricter AppArmor desktop tests. Default
llvmpipe failed on QEMU/Xvfb; physical GPU, Wayland, IME and other distributions
remain untested compatibility targets. They do not block independent editor work.
Non-Linux native persistence/resource backends fail closed. Mixed line-ending bytes are preserved in tested transactions, but CodeMirror
gutter line counts can differ from physical lines. Full runtime exception
source-map composition remains deferred; compiler locations support explicit original-source navigation with captured
revision/offset validation ([executed evidence](security-evidence/2026-11-19-source-navigation/README.md)). The
fixed 60-second preview lifetime still requires explicit rebuilding for longer
sessions. No custom grammar, AI, marketplace, telemetry or synchronization work.

## Resume and reproduce

Run `npm ci`, then `npm run check` (runtime generation is an explicit prerequisite).
Use [Linux testing](LINUX_DESKTOP_TESTING.md) and [security contract](NATIVE_SECURITY.md)
for disposable native validation. Browser demo: build, start preview on loopback
port 4188, then `node scripts/demo-editor.mjs`; CI's `playable-editor-demo` contains
the runnable build, screenshots, WebM and exact saved MDX. An existing artifact is
linked in PR #1. Public hosted CI now executes successfully. New browser artifacts
are opt-in workflow dispatches with `review_artifacts`; native installer uploads
are paused pending complete native redistribution notices.

The current [downloadable review](demo/README.md) binds engine 54c41a7 and includes
Source navigation, dense read-only fallback, multiline quote edits, exact exports,
structural refusal, desktop/tablet/mobile screenshots and a paced 27.64-second walkthrough. Its archive and clean-extracted browser/media
checks are independent of native acceptance.

Native fidelity flags now fail closed on unknown options before prerequisites
or fixture creation ([live refusal evidence](security-evidence/2026-11-19-fidelity-options/README.md)).
ASCII case variants of the existing six source extensions now share consistent
entry, compiler-loader, visual/draft and native-file handling. Original paths,
module identities, filenames and source bytes retain exact case; wrong-case
imports still fail. Unsupported browser formats reject before reading. Native
snapshot names and picker filters follow the same narrow format policy.
[Verification and native failure evidence](security-evidence/2026-11-19-source-extension-case/README.md).

The new production package ff7d4bab… passed actual `.MdX` picker/React/unchanged
save/mode checks, then two fresh-fixture full fidelity commands failed at the same heading Undo.
WebKitWebProcess logged an internal DFG-to-FTL tier-up diagnostic and disappeared
while the Root survived. Original bytes/mode were independently preserved. The
bounded repeat retained the same internal diagnostic; no JIT or sandbox setting was changed,
and no general native crash fix is claimed. The same binary passed the full lowercase control and the shorter uppercase
editing/history/save/restart/recovery command. Both failed primed combinations
remain failures. The diagnostic code hash matches a CodeMirror gutter-loop
candidate; pure default-JSC calls did not reproduce it. No exclusive cause or
identity with the earlier SIGSEGV is established.

Independent IPC passed on this exact ELF; the complete malicious-pressure
matrix was not repeated. The same production ELF now also passed automatic versioned recovery for
mixed-case names across actual SIGKILL/restart: independent histories/retention,
exact metadata baselines and bytes, explicit unsaved restoration, cancelled Save As
and acknowledged exact saving to a new `.MdX` copy with mode0600. The original
retained mode0640 and its exact source. [Executed scope and strict option controls](security-evidence/2026-11-19-uppercase-auto-recovery/README.md).
A fresh local clone of a40ea74 passed offline locked npm installation and the
ordinary full check from an absent runtime:96 unit/37 Chromium tests, plus39
ordinary document Rust tests and7 policy tests in new targets. The frontend
bundle matches the production builder exactly and tracked state remained clean.
Wry verification passed with its explicit pinned offline archive after a DNS
failure; no online verification pass is claimed. [Clean-checkout evidence](security-evidence/2026-11-19-clean-recovery-checkout/README.md).
The namespace-correct debugger diagnostic did not reproduce the older failure;
its instrumented pass is not a crash fix. Native termination feedback and actual
restart recovery now passed on ELF837d2ab9… with the full fidelity suite.
Interactive preview-renderer loss exposed a native connection that outlived the
dead renderer. A Linux child-only native signal now exits its own preview process;
the editor retains Stop/manual rebuild authority and gains no child capability.
On optimized ELFa6d00cbb…, the bounded actual counter/kill/restart/Stop probe
passed with unchanged pre-expiry deadlines and Root responsiveness. The first
corrected attempt missed its conservative Stop reservation and remains a failure.
Native IPC denial and99unit/37browser checks passed. The unchanged full pressure
matrix on this ELF passed CPU Stop, memory-fill with trustedOOM, expiry and
window-close; it failed resident-page descendant-exit observation and editor-crash
startup before the kill point. The first has actual trustedOOM evidence but is
not a whole-case pass; its precise process teardown remains under investigation.
The original full-matrix result remains four passed/two failed. Separate fresh
targeted runs then passed resident-page strictOOM/recovery (the live-PID failure
was not reproduced) and actual editor-SIGKILL/independent expiry/new editor/Counter2.
These do not relabel the original failures or establish repeatability.
The external cleanup observer now requires both group emptiness and historical
identity termination within one original absolute monotonic deadline, with final
confirmation and retained live-location observations.15 controlled regressions
and114unit/37browser checks passed. A fresh current-ELF six-case native run then
passed all cases, including both strictOOM workloads, actual editorSIGKILL,
expiry/Stop/windowclose and real Counter2 recovery. Independent96-identity/Root/
unit cleanup passed. This changes the original instantaneous observer semantics;
no policy or application authority changed, and the earlier failed results stay
failed. No matching-live observation recurred in this run, so no original kernel
teardown cause or absence of temporary escape is inferred.
[Bounded observer evidence](security-evidence/2026-11-19-bounded-cleanup/README.md). Healthy connection
still does not prove arbitrary React responsiveness. [ADR012](decisions/ADR-012-preview-renderer-termination.md)
and [exact observations](security-evidence/2026-11-19-preview-renderer-loss/README.md).
Keep the unresolved engine/resource failures explicit. The portable review is remote-verified
and pinned to its earlier engine 54c41a7. A cancellable visual-analysis worker remains a future stronger bound.
At that checkpoint, native blank/startup, renderer SIGSEGV and the failed
memory-pressure matrix remained open. The later 24 November installed-package
run passed both memory workloads but failed CPU Stop attribution against the
fixed expiry; its complete command failed. See [the current native contract](NATIVE_SECURITY.md)
for exact binary scope. Public standard hosted CI has since passed; physical
GPU/Wayland compatibility can proceed independently.
No production security readiness is claimed.

## Public repository remediation (2026-11-20)

Public visibility is the intentional owner baseline. Current private-source pointer
withheld, future commits use GitHub noreply, complete browser/font notices added,
and redacted history/ZIP credential scanning is mandatory. Historical metadata,
project license and supplied-material rights remain owner decisions. See
[scope, actual hosted results and residual risks](PUBLIC_READINESS.md). Native
installer redistribution notices are incomplete, so automatic installer upload is
paused while mandatory production build/inspection continue. No runtime security
restriction or document behavior was changed for this remediation.

## Original Save sync-error gate (2026-11-20)

A new external own-child Linux tracer tests actual Store Save handling when a
successful file or post-publication directory fsync return is substituted with
EIO. Exact original/new bytes, mode0640, unchanged sibling, no handled-error orphan,
public error/new revision with durable=false, fresh reopen and explicit re-save
all passed. This tests error reporting after successful kernel fsync, not physical
media failure or power loss. The old helper's missing reporting mode failed first;
no production Store correction was necessary. Late-terminal cleanup now records
reaping before rejecting a missed deadline, with an ordinary regression. The
four-stage real SIGKILL gate passed again. [Evidence and reproduction](security-evidence/2026-11-20-document-save-sync-errors/README.md).

## Original Save real ENOSPC gate (2026-11-20)

On a dedicated2MB tmpfs in the restored disposable UbuntuVM, an unprivileged
standalone Store test verified real Save ENOSPC, exact original bytes/mode0640,
sibling preservation, temporary cleanup, reuse of the existing grant/revision
after freeing space, and fresh exact reopen. Explicit mountinfo guards refuse
shared subtree bind mounts; that refusal also passed in the actual VM. CI now
runs this alongside recovery ENOSPC. No production behavior changed. [Evidence](security-evidence/2026-11-20-document-save-enospc/README.md).

## Resumed production-desktop acceptance (2026-11-20)

The restored Ubuntu/WebKitGTK VM passed twenty Visual transitions and a separate
fresh-profile full seven-option fidelity command, including actual process
restart, explicit recovery, invalid draft refusal and original preservation.
Independent postcheck verified all four exact file hashes/modes, both Roots gone
and recovery cleanup. This used the recorded a6d00cbb production ELF, not a new
notice-bearing installer. [Scope, first harness prerequisite failure and results](security-evidence/2026-11-20-native-resume/README.md).
Both hosted jobs actually passed on367626f/run44699786688 including new original
Save EIO and real ENOSPC gates. Later documentation-only heads need their own
workflow result; consult PR #1. Historical intermittent crashes remain unresolved.

## Packaged original Save disk-full recovery (2026-11-20)

Actual optimized Ubuntu GUI acceptance now verifies visible real Save ENOSPC with
original bytes/mode/sibling unchanged, edited Visual text and dirty state retained,
working Undo/Redo, explicit retry after freeing space, exact reopen and clean exit.
A new external-only command reproduces this on a guarded tiny tmpfs; its bounded
filler and pidfd cleanup cannot grant authority to document code. The first input
observer failed before storage filling and is retained alongside the corrected
exact-value wait and successful command. [Evidence and screenshot](security-evidence/2026-11-20-native-save-enospc/README.md).
No application behavior, isolation, resource limit or UI design changed.
