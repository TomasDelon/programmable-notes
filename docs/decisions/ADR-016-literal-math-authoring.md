# ADR 016: Incomplete math delimiters are ordinary authoring text

Status: accepted, 2026-11-25. Supersedes the delimiter-refusal behavior in ADR 013;
ADR 015's invalid **closed** LaTeX behavior remains in effect.

## Behavior

An unmatched `$` or `$$` does not identify a complete mathematical expression.
Show its literal source with ordinary text styling and allow it to be saved,
reopened and corrected. Do not notify or block the rest of the document. Once a
matching pair exists, valid TeX renders outside the caret; invalid TeX remains raw
and red. Red feedback describes the completed formula, not an unfinished delimiter.

## Implementation and trust boundary

The bundled core math plugin extends the pinned standard micromark mathematics
parser. A side-effect-free closing-fence check prevents the standard flow parser
from treating end-of-file as an implicit mathematical closure. In Markdown text
contexts, unfinished dollars and raw TeX arguments become literal draft tokens.
These tokens preserve braces as text rather than evaluating them as MDX
expressions. Imports, code fences, JSX attributes and executable MDX nodes remain
in their existing parser contexts. Possible JSX tags terminate literal drafts.
The same parser is used by source projection, the link index and isolated full-document compilation. Literal dollar tokens stop before wikilinks so ordinary currency does not suppress navigation.

The editor-owned in-place source surface can replace its entire exact source span,
including delimiters. The planner verifies the original snapshot and span, reparses
the candidate, and verifies that unrelated opaque MDX ranges retain their original
content and shifted offsets. Physical line endings and every byte outside the patch
are retained. Closed and literal representations can change after an accepted patch.
KaTeX validity remains presentation feedback, never write authorization.

First-dollar typing uses an exact mapping from an owned ProseMirror text caret to
source. Ambiguous/unsupported mappings fall back to ordinary guarded text editing.
Promotion is deferred during IME composition; it must not replace unread composing
DOM or bypass canonical composition history. Preview frames supply no editing
messages or filesystem authority. No capability or sandbox restriction changes.

## Limits

Dollar pairing follows standard Markdown mathematics conventions. Ambiguous dollar
runs can therefore pair differently than an author intended; Source mode remains
available. In-place source drafts are memory-only until committed by leaving the
span; genuine stale revisions or unsafe source maps still retain the draft rather
than overwrite source. Physical Android keyboard and native packaged GUI validation
are separate from desktop browser automation.

## Bound speculative lookahead

A benchmark found repeated unfinished display fences could cause quadratic closing-
fence scans: 5,000 short lines (40,000 source units) took about 2.6 seconds before
projection/compiler repetition. Possible JSX-tag checks could rescan an unfinished
line in the same way. Both speculative paths now charge a shared **2,000,000 consume
step** allowance per micromark ParseContext, including rolled-back checks. A weak
map retains only parser keys and counters, never document strings. A new parse has
its own budget. Literal-token consumption itself is linear.

Exhaustion refuses analysis, retaining exact source in the existing opaque/Source
fallback. It does not relax mappings, execute document code, mutate files or erase
a draft. The link index reports bounded analysis failure; compilation retains its
worker/deadline controls. Tests exercise both adversarial paths, subsequent-document
recovery, exact bytes, Source editing and canonical undo/redo. This is a work bound
for these new lookaheads, not a blanket guarantee about every upstream parser path.
