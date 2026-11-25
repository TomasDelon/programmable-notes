# Core plugins and forgiving LaTeX verification — 25 November 2026

## Changes and authority

The web workspace introduces bundled Mathematics/React core modules and validated
persistent settings. Executable setup is hidden by default; an explicit setting
shows escaped ordinary code alongside live components. No setup disclosure/edit
buttons remain. Disabling React terminates isolated execution; disabling math
keeps literal dollar source. No community loader or new document permissions.

Invalid closed LaTeX is saved as editable red source without notices or a global
write barrier. Only unsafe delimiters, stale revisions or ambiguous source patches
retain the existing explicit recovery guard. See ADR 015.

## Reproduced failures and corrections

- The original malformed-TeX browser regression reproduced the global editing
  lock. TeX validity now affects presentation, not source-write authorization.
- Invalid focused fields lost their red feedback; activation retains validation.
- Runtime preference refresh and offset-only updates detached a formula's click
  target. Presentation refresh now avoids replacing unchanged targets.
- Disabled mathematical compilation originally let TeX braces become executable
  MDX expressions. Keeping the parser active while converting math to literal AST
  text fixes this. BOM-prefixed source exposed a separate offset mismatch; source
  presentation now accounts for the parser's BOM removal.
- Independent review reproduced invisible setup deletion with boundary Backspace.
  Hidden-source transactions now protect the original atoms. Select All replacement
  retains edge setup; interleaved hidden code refuses safely with recoverable text.
  Native browser selection over hidden atoms can collapse; editor-owned text input
  honors the actual document selection instead.
- Mobile Settings initially overflowed the 390px viewport; responsive wrapping
  fixed the failing real geometry/keyboard regression.
- An intermediate full run passed 109 Chromium cases and failed a moving-equation
  interaction. Another passed 111 and failed an iframe-transition assertion.
  These are failed checkpoints, not final passing gates. The latter now explicitly
  waits for actual old-island cleanup before addressing full-document execution.

## Executed checks

Targeted Chromium regressions passed after the fixes, including actual React
interaction, setting persistence, exact BOM/CRLF export, malformed formulas,
correction/reload, hidden-source Backspace and Select All replacement, canonical
undo/redo, interleaved hidden-comment refusal and React-disabled deletion.
The final local `npm run check` exited **0**: **359 unit cases /45 files,
14 tooling (zero skips), 116 Chromium cases and 6 Pages-policy browser cases**
passed, with format/lint/strict TypeScript/fresh production build. The Pages
fingerprint is `f5c1e68720ba977f`, 77 assets. This used Node 24.22.1, npm 11.9.0,
system Chromium, two workers and the pinned scanner via `PN_GITLEAKS_BIN`.
Full-history/archive secret scans found zero findings before this checkpoint.
The independent read-only follow-up found the hidden-source issue closed and no
further concrete security/semantics findings, including the full-document invalid
math transform. It did not run tests.

Hosted cross-browser results and actual deployment are pending at this checkpoint.

## Reproduction and limitations

Run `npm ci`, then `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check`
with the system browser available, or use the ordinary Playwright-installed browser.
The optional `editing_qa` workflow repeats interaction regressions three times in
Chromium, Firefox and WebKit with zero retries. `deployment_url` runs acceptance
against an actual Pages origin. Keep output/artifacts separate from source data.

Native `/engine` GUI and physical Android keyboards were not executed here.
No native runtime security readiness, community-plugin support, arbitrary JSX
reverse editing or component-state persistence is claimed. Source visibility in
full-document execution can rebuild its shared runtime and reset temporary state.

## Hosted checkpoint and cross-browser correction

Application checkpoint `8bf4dd6` passed mandatory check/native-check in
[run 45606392318](https://github.com/TomasDelon/programmable-notes/actions/runs/45606392318).
The browser check had **115 passed plus one flaky boundary-keyboard test** (the
retry passed); it was not a zero-retry clean result. Its failure removed the final
visible heading character, while hidden setup remained present. The same fixture
passed 17 subsequent matching-Chromium local repetitions, zero retries. The
boundary test now asserts the native caret is actually at the heading start
before sending Backspace; the exact exported-byte assertion remains mandatory.

The immutable Pages candidate passed **18/18 actual-origin cases** in Chromium,
Firefox and WebKit in [run 45606693009](https://github.com/TomasDelon/programmable-notes/actions/runs/45606693009).
[Candidate screenshots/report](https://github.com/TomasDelon/programmable-notes/actions/runs/45606693009/artifacts/15018801246)
retain the workflow's seven-day lifetime. This did not authorize promotion:
[zero-retry repeated diagnostics](https://github.com/TomasDelon/programmable-notes/actions/runs/45606402462)
then reported **190 passed, 14 failed, 30 explicit Chromium-only skips**. That
candidate was not promoted to the principal origin.

Firefox/WebKit normalize native Select All ranges around hidden/noneditable
atoms, losing the actual AllSelection before text input. This left trailing JSX
outside replacement and bypassed the intended interleaved-selection refusal.
The centralized hidden-source guard still protected setup. Preserve the explicit
host selection through native reconciliation, and cancel intent on actual pointer,
focus or keyboard navigation, source refresh and accepted document mutation.
Navigation collapses the actual editor selection to editable text; source
history/external refresh cannot carry old selection intent into a new revision.
A PageDown/undo-then-typing regression failed against the initial intent handling
and passed after the lifecycle correction. Independent read-only follow-up
review found both cleanup gaps addressed and no additional concrete findings.

Other failures exposed test preparation races: toggles must reach the existing
saved feedback before reload, and raw CRLF fixtures must enter through exact-byte
file import rather than browser contenteditable `fill`, which WebKit normalizes.
No expected-byte, sandbox or hidden-source assertions were removed. These are
fixture corrections, not a claim that arbitrary browser `fill` preserves physical
line endings.

Local all-browser attempts could not execute Firefox (profile-folder launch
failure) or WebKit (missing GTK4/Graphene/Harfbuzz-ICU/Manette/Hyphen/GLES libraries).
These are infrastructure failures, not passing tests. Hosted Ubuntu runners remain
the reproducible environment: run the optional `editing_qa` workflow with
`editing_browser=all`; matching browsers and OS dependencies are installed there.
The corrected final full gate/hosted runs and promotion remain pending here.

CI now enables Playwright `failOnFlakyTests`: retries can collect diagnostics,
but a retried failure cannot silently turn acceptance green. The existing failed-
job artifact upload therefore retains traces for future flaky failures as well.
Mandatory checks and all sandbox assertions remain enabled. A newly added import-
ready assertion initially read title text rather than its input value, causing
8 fixture-setup failures; it was corrected to assert the actual Document title
value. That failed local gate was stopped (59 passed, 2 interrupted, 47 not run;
Pages phase did not execute). The corrected targeted plugin suite passed **8/8**
with matching Chromium, zero retries, before rerunning the entire gate.

## Corrected local gate

The corrected `npm run check` exited **0**: **359 unit /45 files, 14 tooling
(zero skips), 116 Chromium and 6 Pages-policy cases passed**, including format,
lint, strict TypeScript and a fresh production build. The Pages fingerprint is
`2924a01765a41438` (77 assets). Matching Chromium separately passed the corrected
plugin/lifecycle suite **8/8** with zero retries. The stricter CI flaky-test policy was
also typechecked; local runs leave `CI` unset, while hosted acceptance exercises
that policy. Final hosted verification/promotion is still pending here.

## Input ownership and remaining browser diagnostics

At `23aeea9`, mandatory check/native-check passed cleanly in
[run 45611308853](https://github.com/TomasDelon/programmable-notes/actions/runs/45611308853)
(**116 Chromium plus 6 Pages-policy**, no flaky result). The immutable candidate
passed **18/18** in [run 45611521638](https://github.com/TomasDelon/programmable-notes/actions/runs/45611521638).
However [repeat 45611370970](https://github.com/TomasDelon/programmable-notes/actions/runs/45611370970)
reported **195 passed, 9 failed, 30 skips for Chromium-only IME fixtures**. Firefox
replacement now preserved setup and removed selected JSX but Undo failed to restore
the heading. WebKit showed replacement in DOM without committing canonical source.
The principal origin was not updated.

Own AllSelection text input in both cancellable `beforeinput` and input-only
insertion paths, always through the existing source guards. Two unit regressions
failed before their corresponding handlers and passed afterwards; the rendered
unit suite passed **17/17**. Failure diagnostics capture only synthetic fixture
source and event metadata, distinguishing canonical Undo from a deferred visual
refresh. No document-controlled debug API is added to the production application.

The fresh complete local gate exited **0**: **361 unit /45 files, 14 tooling
(zero skips), 116 Chromium and 7 Pages-policy cases passed**, plus format/lint/type/
build. Pages fingerprint: `2df713071e4a8c04`, 77 assets. The new actual-origin
acceptance case verifies selection replacement, exact hidden setup, undo/redo,
saving and reopening. Hosted verification of this correction remains pending.

Optional `editing_core_only=true` narrows the existing diagnostics job to the
core-plugin interaction file; it still repeats three times without retries.
Default diagnostics and all mandatory PR tests/security/package checks are intact.
This provides shorter reproducible debugging on standard hosted Ubuntu runners,
without requiring a new service or weakening acceptance.

Local Firefox investigation found a read-only default configuration directory;
an isolated writable XDG configuration allowed startup, then content processes
failed with `Sandbox: writing /proc/self/uid_map: EROFS`. The permitted isolated
startup outside the command sandbox opened a blank page successfully; the actual
outside-sandbox application test was aborted before execution and is not a pass.
Do not disable Firefox's sandbox. Hosted Ubuntu is the available full-browser
validation environment. Raw artifact download was Forbidden in this workspace;
GitHub artifact links remain the owner-accessible reproduction/evidence route.

## Canonical composition-history correction

Focused [run 45651644305](https://github.com/TomasDelon/programmable-notes/actions/runs/45651644305)
reported **69 passed, 3 Firefox failures**, zero retries. All WebKit cases passed
with explicit input ownership. [Actual candidate 45651807415](https://github.com/TomasDelon/programmable-notes/actions/runs/45651807415)
reported **20 passed, 1 Firefox failure** in the added undo case. Neither checkpoint
was promoted. Captured canonical source after Undo contained setup plus an empty
body; metadata showed `insertCompositionText`, a delivered/prevented Ctrl+z and
successful canonical source change. This ruled out a mere deferred visual refresh.

ProseMirror deletes a non-textblock selection during compositionstart, before
insertion. Those two source transactions had become separate isolated history
events. The real controlled SourceEditor/RenderedEditor integration regression
reproduced exactly the prefix-only result on Undo. Forward host composition
history metadata to the canonical source: `input.type.compose.start` with public
`isolateHistory('before')`, then `input.type.compose`. This reuses CodeMirror's
existing native-composition grouping semantics. Snapshot acceptance, source maps,
semantic reparse and recovery checks still run for every transaction.

The integration test now passes exact BOM/CRLF Undo/Redo and a second composition
after Redo. A separate regression reproduced stale AllSelection ownership after
blur; input handlers now require the still-active host selection intent. Targeted
rendered/source composition suites passed **22/22**. Independent read-only review
found no additional concrete history/phase-safety issue.

The complete corrected local `npm run check` exited **0**: **363 unit /45 files,
14 tooling (zero skips), 116 Chromium and 7 Pages-policy cases** plus format/lint/
type/build. Pages fingerprint: `a02f5abbd04aa496`, 77 assets. Hosted verification of
this history correction remains pending. The user additionally clarified that
missing math delimiters must demote to ordinary text, not a protected math error;
that follow-up is pending and supersedes the earlier delimiter-refusal UX.

## Literal delimiter authoring follow-up

The user explicitly superseded the old delimiter-refusal UX: missing dollars are
ordinary text; only invalid completed mathematics is raw/red. ADR 016 records the
paired-only flow parser, literal draft tokens, exact raw-source patch validation,
opaque MDX protection and editor-owned first-dollar mapping.

The new regressions initially reproduced parser failures for incomplete display
blocks and MDX argument braces. Six parser tests then passed; the expanded targeted
parser/editor suites passed **31/31**. Targeted real Chromium acceptance passed
**3/3**: the supplied display example survives exact export/reload and correction
with undo/redo; removing a dollar does not block editing elsewhere; typing a first
dollar in prose creates editable literal source before completing mathematics.
The first browser attempt exposed a test-fixture JavaScript replacement-string
`$$` substitution; using a callback made the expectation reflect the actual exact
source. No application source was changed to accommodate that test mistake.

Independent static review identified dollar promotion during IME reconciliation as
a composition-history risk. Promotion now declines while the editor is composing;
the established guarded composition path remains responsible for that DOM read.

The preceding composition-history correction `2cd021d` passed mandatory
[check/native-check 45657518609](https://github.com/TomasDelon/programmable-notes/actions/runs/45657518609)
and the focused repeated three-browser [45658934348](https://github.com/TomasDelon/programmable-notes/actions/runs/45658934348).
Raw job logs/artifact downloads remain Forbidden in this workspace. Workflow/job
conclusions are available through GitHub metadata; downloadable evidence remains
on GitHub. The final combined follow-up still needs its own full verification.

A further structural-edit regression reproduced invented dollar delimiters when a
paragraph containing literal math was converted to a heading. The projection now
marks literal math atoms explicitly and the serializer emits their literal value,
without generating mathematical wrappers. The red test passed after that change;
the source-bridge and math-authoring suites passed **84/84**. The final combined
build must include this correction before delivery.

The link index still used the old implicit-end-of-file math parser. A new red test
showed a link in a subsequent paragraph disappearing after an unfinished display
fence. Reusing the same core math parser fixes that inconsistency. Its first pass
exposed an existing literal-currency/wikilink regression; literal-dollar tokens now
stop before a wikilink boundary. The authoring and link integration suites passed
**24/24**, preserving ordinary currency, opaque code and following links. A fresh
complete gate is required for this final shared-parser change.

## Local verification before submitting literal authoring

The complete local `npm run check` exited **0** after the literal projection and
structural-serialization fix: **377 unit /46 files, 14 tooling (zero skips),
117 Chromium and 8 Pages-policy cases**, plus format/lint/typecheck/fresh build.

The final shared link-parser follow-up then passed fresh format/lint/typecheck and
**all 378 unit tests /46 files**. Its fresh production build passed **14/14** real
Chromium math/source/history/link/attachment cases and **8/8** Pages-policy cases.
This explicitly distinguishes the full earlier gate from the later focused browser
rerun; hosted CI must still run the entire gate from a clean checkout of this head.
Final Pages fingerprint: `b1fd47147dd08115`, 77 assets. No native GUI or physical
Android runtime result is implied. Independent static review found no further
concrete source-loss or composition issue after the final guards and literal
serializer changes. Full cross-browser and actual-origin acceptance remain pending.
