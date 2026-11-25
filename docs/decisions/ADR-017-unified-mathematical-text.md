# ADR 017: Mathematical source belongs to the document editor

Status: accepted and implemented; deployment remains gated on executed acceptance evidence.

## Problem

ADR 016 kept unfinished dollar syntax literal in the parser but still projected it into atomic math nodes. Entering those nodes created a nested CodeMirror view, independent history/focus and Tab handling. Different source/render font metrics also shifted surrounding text on focus. The metadata title was separately presented as a permanent input resembling a document heading.

A second reproducible defect exposed generated trailing-space entities. Ordinary text serialization can encode a trailing space as `&#32;`; removing a closing math dollar can reclassify that range as literal source and show the internal entity spelling. Three ignored diagnostic tests reproduced generation, ordinary decoding and visible leakage using the real source bridge/renderer. This is distinct from evidence of Unicode encoding corruption; the user's entire keystroke sequence is not known.

## Existing solutions reviewed

- [prosemirror-math](https://github.com/benrbray/prosemirror-math/blob/master/lib/math-nodeview.ts) supports cursor-based source revealing, but creates an inner ProseMirror editor. Adopting it unchanged retains a separate selection surface.
- [Milkdown Crepe math](https://github.com/Milkdown/milkdown/tree/main/packages/crepe/src/feature/latex) uses atomic inline math and an inner editing tooltip with an update button. Its interaction does not meet the approved requirement.
- [SilverBullet markup visibility](https://github.com/silverbulletmd/silverbullet/blob/main/client/codemirror/syntax/hide_mark.ts) derives syntax visibility from selection over document text.
- [CodeMirror decoration example](https://github.com/codemirror/website/blob/main/site/examples/decoration/index.md) separates stored source text from replacement presentation. It supports the general approach, not an automatic drop-in MDX/source-fidelity guarantee.

Obsidian is not open source; no claim is made about its internal implementation. No upstream code is copied or dependency added merely to claim reuse. Existing maintained ProseMirror editing and KaTeX rendering primitives remain the reusable foundations.

## Decision

Keep the owning ProseMirror view and canonical source history. Complete mathematical nodes contain editable raw dollar-delimited child text; a NodeView exposes contentDOM in that same view and an inert KaTeX presentation. Selection within a range reveals its source. Invalid closed TeX remains red source; unmatched delimiters project as normal document text. Presentation changes are source-neutral and do not create history entries. No math textbox, nested view, button role or extra Tab stop is introduced.

Preserve source-aware parsing to shield unfinished TeX braces from MDX evaluation. Map decoded display characters to exact original source offsets; preserve existing raw entities/escapes where untouched. Treat new raw mathematical characters explicitly rather than escaping them as generic Markdown. Never globally decode source entities or inject user HTML. Full-range reclassification must preserve unrelated source and opaque JSX, and reject stale/ambiguous mapping.

An already-owned mathematical IME operation may have provisional text whose
structure changes when a dollar is removed. Keep its composing DOM in the same
view until the final native read, and report pending state synchronously to the
workspace. If editing becomes unavailable during that operation, defer the DOM's
noneditable switch until composition finalization so the normal observer can
read all selected text, including prose/math boundaries. Canonical source writes
remain forbidden while unavailable; final text is retained for explicit recovery.
Canonical undo/redo must also remain blocked during this deferred operation.
Explicitly refresh the view's cached editable state when the operation ends.
This is an atomic keyboard-input lifecycle, not a filesystem/IPC or source grant.
A pinned single-span DOM recovery snapshot was rejected because a native
selection replacement can detach or cross that span.

Horizontal inline entry explicitly consumes one source delimiter character and
preserves a Shift anchor. Display-block entry uses the owning view's public
`endOfTextblock` witness and an adjacent math block; wrapped text, modified/word
movement and movement within or out of source retain native behavior. These
selection-only bridges repair browser skipping of hidden source without creating
history events or adding field focus.

Metadata title is a passive heading. Existing Rename command/dialog remains the explicit metadata operation and does not rewrite a Markdown H1. Real links, task controls and isolated React UI retain their actual keyboard semantics.

## Acceptance and limitations

Tests must cover shared cursor/history, continuous selection, complete/incomplete/invalid transitions, focus-neutral incomplete geometry, IME, CRLF/BOM, entity spelling, JSX, saving/reopening and revisions. Chromium/Firefox/WebKit browser evidence is required before web promotion. Build checks do not establish packaged native GUI behavior. Rendering a valid equation can inherently change geometry relative to its source; the forbidden jump is changing the same unrendered text merely because it receives focus.

All existing IPC, filesystem, compiler budget, runtime and recovery restrictions remain mandatory.
