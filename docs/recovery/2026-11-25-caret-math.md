# Caret-based mathematical editing

## Scope and implementation

The web Preview now reveals mathematical source in place at the editor caret,
with no form controls or action buttons. The existing installed CodeMirror
provides selection, text input and local undo/redo. Arrow entry respects the side
of entry; boundary arrows/Tab return to surrounding prose. Clicking elsewhere
renders a valid mathematical draft automatically. Hover does not activate it.
Display equations retain dollar delimiters and normal multiline Enter behavior.

Canonical history, raw-source coordinates, revision comparison and the existing
pending-draft barrier remain authoritative. JSX/runtime, network, filesystem and
IPC isolation are unchanged. Physical CRLF/CR breaks and unrelated source bytes
remain preserved; a new parser comparison regression exposed and corrected a
pre-existing refusal of multiline CRLF/CR math. Invalid syntax or stale edits
remain retained, with notifications; Escape explicitly discards the draft.
Uncommitted mathematical drafts remain memory-only, and pending drafts must be
resolved before saving/exporting/navigating. Native `/engine` is unchanged.

## Executed checkpoints

- The first new Chromium test failed on the previous INPUT element, as intended.
- The first replacement passed that keyboard/history/source-fidelity case.
- A broader initial run exposed an inline-span hit-testing problem; the run was
  explicitly interrupted after reproducing it. An inline-block math target fixed
  actual pointer hit testing, without forcing clicks or disabling assertions.
- Corrected contenteditable display assertions use visible multiline innerText;
  raw downloaded bytes remain the source-fidelity assertion.
- A strengthened arrow-entry regression failed at caret offset 4 instead of 0;
  direction-aware host entry now chooses the correct source endpoint.
- Multiline display browser acceptance then refused a valid CRLF patch. Unit
  regressions reproduced failure for CRLF and CR (LF already passed). Both
  operands of the parser-only comparison now normalize physical breaks; raw
  patches still preserve the original break convention.
- One intermediate build failed strict TypeScript on a duplicate local name;
  the parameter was renamed before rerunning acceptance.
- An initial full check stopped at formatting; formatting was corrected before
  the full verification run. These failures are not counted as passing tests.

Final local/hosted results and the exact deployed commit will be recorded after
execution. Compilation is not native runtime or production security validation.

## Hosted-policy history diagnostic

The first full gate passed 346 unit, 12 tooling (two scanner controls skipped)
and 100 Chromium cases, then the
new Pages-policy case failed its second history action. It reproduced three
consecutive times. Test-only key/transaction observation showed that Playwright's
`Control+Shift+z` emitted lowercase `event.key="z"`, with Shift held. CodeMirror's
character-key matching tried ordinary Undo first; with two independent history
events left, that succeeded. Earlier one-event tests masked this because Undo
returned false before the shifted fallback ran. The new tests now use
`Control+Shift+Z`, matching a physical shifted Z. Exact original/intermediate/
redone byte assertions remain unchanged; no production history guard was altered.
The temporary diagnostic observers were removed from the test.

## Review-driven composition correction

A read-only review identified a real closing race in the first nested-editor
implementation. `composing` excludes the phase before first input, and a
compositionend microtask can precede Android's deferred DOM read. Every commit
path now waits on `compositionStarted` and a pending completion frame. Native
IME keystrokes retain their default behavior without invoking editor
commit/cancel commands. During composition, native focus still moves, but the
ordinary CodeMirror blur observer is deferred so its focus redraw cannot replace
unread text. After the final read, normal blur cleanup/guarded commit resumes.

Modern Android uses the browser's public EditContext EventTarget rather than
necessarily dispatching DOM composition events. A matching completion listener
is installed after CodeMirror's own listener and removed on close/destroy.
No private observer flush or synchronization API is used.

The final browser integration fixtures explicitly distinguish the Chrome <126
DOM compatibility path from modern EditContext. They retain the composing text
node, verify an earlier insertion actually reached CodeMirror, cover both
compositionend/blur orders and preserve exact downloaded bytes. The EditContext
case first failed by leaving a blurred equation pending, then was corrected.
Synthetic IME events in actual Chromium exercise integration scheduling; they
are **not physical Android/IME hardware acceptance**. The initial DOM-only
fixture used an EditContext-enabled user agent and was corrected to avoid
mislabeling that unsupported event simulation as runtime evidence. Earlier focus
redraw timing remains a residual platform concern; do not claim universal IME
coverage or native desktop runtime certification.

The explicit pinned-scanner tooling rerun executed **14/14 passed, zero skipped**.
The ordinary local full command skips the two scanner controls unless
`PN_GITLEAKS_BIN` is supplied; CI runs those controls explicitly as a mandatory
security step. No skipped test is counted as a passing execution.

## Final local verification

`npm run check` exited **0** using Node 24.22.1, npm 11.9.0, system Chromium
and two workers: **346 unit cases / 44 files**, **105 Chromium end-to-end cases**
and **5 Pages-policy browser cases** passed. Format, lint, strict TypeScript and
the production build passed. Tooling in that command had 12 passes/two explicit
scanner skips; the separate pinned-scanner run passed **14/14, zero skipped**.
The five Chromium IME integration fixtures passed in the final complete run.
An independent final read-only review found no remaining blockers in the change.

The Pages-prepared build fingerprint is `24c424c3000f0d3a` (77 assets). These
local Pages checks use the real production build with policy headers, and are
not claims about an edge deployment. Hosted verification and promotion remain
pending at this implementation checkpoint. The native GUI, physical Android
keyboards, physical GPUs and Wayland were not tested by this milestone.
