# Preview Markdown input repair

## Reproduced problems

- Actual keyboard input rejected incomplete `1.` / `+` prefixes before the
  space-triggered list rule; literal quote prefixes could be double-escaped.
- Physical soft breaks, compact quotes and multiple `#` characters needed
  contextual escaping, not a whole-block punctuation replacement.
- CommonMark drops authored trailing spaces, including in nonfinal list items,
  marked text and table cells. Strict semantic validation correctly refused the
  resulting mismatch, but this made ordinary keyboard writing unusable.
- An empty nested dash list was parsed as a Setext heading. A real blank
  separator preserves the intended list without placeholder bytes.
- `**bold*` prematurely matched the single-star emphasis rule.
- Inline error/recovery UI moved the document and exposed a large recovery form.

## Corrections

Use verified punctuation offset maps for minimal raw-span patches, context-aware
literal escaping, references for significant trailing whitespace and safe list
separators. Keep all strict source revision, semantic reparse and JSX isolation
checks. A shared host-owned notification stack replaces the formatting bar and
inline editor/workspace error panels. Explicit recovery retains the first
refused raw candidate; later transactions cannot replace it. Exact source
recovery download preserves BOM/CRLF and never overwrites an original file.
Keyboard and palette commands retain formatting access.

## Verification checkpoints

RED tests were executed for prefix input, multiline/nested prefixes, trailing
spaces, empty nested lists, bold input, recovery snapshot retention, notification
focus/hover pause and nested modal Escape handling. Fixes were followed by targeted
unit and real Chromium interaction tests. The final full-suite and hosted results
are recorded below only after execution. Raw local traces remain ignored.

Native WebKitGTK package/runtime acceptance is separate: these changes do not
modify native authority, capabilities, filesystem grants or renderer isolation.
The native `/engine` presentation is unchanged; this milestone addresses the web
Preview. Native runtime behavior is not certified by a web browser test.

A follow-up source-fidelity regression verifies that typing after an encoded
trailing space preserves sibling `+` list markers and mixed physical endings.
Only emitted space/tab references and verified punctuation escapes get decoded
offset maps; unknown entity forms retain the existing conservative fallback.

## Initial local candidate (before host-work review)

`npm run check` exited 0 with Node 24.22.1, npm 11.9.0, system Chromium and two
Playwright workers. Formatting, lint and strict TypeScript passed. All **333 unit
cases / 43 files**, **14 tooling cases**, **95 browser cases** and **4 Pages-policy
browser cases** passed. The latter four run against a local production build
with Pages response policies; they are not evidence of a live edge deployment.
The Pages-prepared offline release fingerprint was `336fe5f4313defe2` (77 assets).

Actual keyboard coverage includes list prefixes, numbered/bullet continuation,
empty-item nesting and exit, headings, bold/italic/code, link shortcut, exact
cross-mode undo/redo, saving and reopening. Error fixtures verify that React
state survives prose edits, errors do not move the document, details are explicit,
and nested modal Escape/focus behavior works at 1440, 820 and 390px. Screenshots
are attached to those browser test results. Sandbox negative tests remain intact.

Earlier checkpoints are not counted as final passes. In particular, an environment
restart left a runner active; a second invocation collided on port 4173 and its
artifact cleanup produced a missing-trace error in the first runner. Both were
stopped before repeating the complete suite with a single runner. No application
security or test assertion was disabled to get the final pass.

Independent read-only review identified extra prefix and nested whitespace cases;
they were reproduced and corrected. Hosted CI, multi-browser acceptance and live
edge deployment are separate gates; their candidate identities and results are
recorded in the draft PR before promotion. No native runtime result is claimed.

## Follow-up host work review

Before production promotion, a direct benchmark measured the newly added
lookahead-based whitespace matcher at 754ms for 20,000 internal spaces and
3,010ms for 40,000. A complete 100,000-space edit took 27,076ms. Replacing the
matcher with one callback per run removed its quadratic retry pattern, but the
upstream parser independently still took about 8,624ms on that case.

The existing synchronous visual-analysis budget therefore adds a measured
Source-only fallback for individual horizontal whitespace runs above 8,192
characters. It does not discard or normalize source. Strict rebase checks refuse
a visual candidate crossing the limit with an explicit work-budget diagnostic,
retain the exact raw draft and leave the accepted source untouched. Source-only
opening/edit/export and actual recovery-download behavior have browser coverage.
This is a targeted work guard, not a universal host/parser resource-containment
claim. Final follow-up results are recorded after execution.

The complete follow-up `npm run check` exited 0: **336 unit tests / 43 files,
14 tooling tests, 97 Chromium cases and 4 local Pages-policy cases**. Formatting,
lint, TypeScript and a fresh production build passed. Browser tests exercised
Source-only opening/editing/export and a real visual budget refusal, exact
BOM/CRLF/JSX recovery download, explicit discard, unchanged accepted source and
continued editing. The first hosted CI at `122b3ae` passed both check/native-check
([run](https://github.com/TomasDelon/programmable-notes/actions/runs/45470881613));
the follow-up revision requires its own hosted gates before promotion.

Refused visual candidates remain in memory while the app stays open. Download
the retained source before closing; this work does not add crash persistence for
unapplied rich-text transactions. Accepted document persistence is unchanged.
