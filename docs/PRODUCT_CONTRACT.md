# Current product contract

Updated: 26 November 2026. This is the authoritative entry point for current owner
requirements. It describes the desired product, not a claim that the current app
satisfies it. Original handoffs remain unchanged as historical provenance. Later
explicit owner corrections govern over agent plans, ADRs and earlier proposals.

## Purpose and product identity — PRODUCT-01

Programmable Notes is a coherent, local-first document application for authoring
Markdown and real MDX/React. A note is a real file that remains usable without the
application. Interactive components extend the document rather than replacing
normal writing with a programming demo or independent forms.

The global architecture comes first. Keep the existing implementation/evidence
safe while evaluating it. Reuse compatible parts; refactor or replace incompatible
parts deliberately. Neither preserving every current web implementation detail
nor building another native lookalike is the goal. The web experience is a useful
behavior/design reference, not an architectural constraint that overrides sound
engineering. Do not create an Obsidian clone: the owner's comparison concerns
local-vault file persistence, not copying its interface or product scope.

One shared product/core with explicit platform services is the engineering target.
Platform differences must not produce unrelated applications. Linux desktop is
first; design the shared architecture for web/mobile without claiming those
platforms work before actual target validation.

Provenance: owner's rejection of the separate native UI and setup-form answers,
26 November: “la prioridad es que la arquitectura esté bien”; Linux-first answer.
The separate NativeWorkspaceShell remains a rejected implementation, not an
approved baseline. Reuse decisions must cite architectural fit and evidence.

## Source and Preview experience — UX-01, EDIT-01

- Source and Preview are the document modes. No Split mode or close X in the
  selector. Hover, keyboard/focus and appropriate touch interaction must work.
  The owner initially asked to record the picker bug for later; setup work does
  not itself authorize patching that application behavior.
- Preview edits supported Markdown directly in one owning document surface.
  Headings and mathematics are ordinary document nodes, not standalone inputs,
  textareas, nested editors or additional Tab stops.
- Use one canonical source/history authority. Validated source spans and source
  revisions authorize lossless patches. Preserve unrelated bytes, BOM, CRLF,
  whitespace, imports, comments and nested JSX. Reject stale/ambiguous patches;
  retain unapplied user text safely instead of silently losing it.
- Typing, ordinary Markdown punctuation/shortcuts, multiline editing, navigation,
  undo/redo and error recovery must work together. Do not accept a mockup or a
  separate button-and-form editing panel as direct editing.
- Unknown JSX/components remain opaque to visual source modification. Runtime
  button/state interaction is not source editing and cannot authorize file writes.
- The metadata title is passive text. User-authored Markdown headings remain
  editable through the owning document surface.
- Significant operational errors use the existing minimal notification approach;
  do not insert large error/recovery forms into the normal document body.

Provenance: repeated owner editing/input/character-corruption reports, the picker
report, [original visual contract](handoff/architecture/VISUAL_EDITING_CONTRACT.md)
and [later unified math intent](superpowers/specs/2026-11-25-unified-math-text.md).
The original overlay/control suggestions do not override later no-input rules.

## Mathematics — MATH-01

A dollar is ordinary text until the required complete nonempty delimiters exist.
Support inline `$...$`, `$$...$$` and multiline display delimiters. Incomplete or
unbalanced delimiters remain ordinary editable text; this is not a LaTeX error.
The owner's examples require literal-dollar intent to survive ordinary editing;
any underlying escaping remains invisible in Preview.

A closed expression with invalid TeX stays visible as raw red source locally.
Correction restores rendering. It causes no notification, global editing lock or
loss of other text. Entering the expression with the document selection reveals
its dollar-delimited source in that same surface; leaving renders valid math.
Literal unfinished text must not change geometry merely on focus/selection.
Preserve deliberate source escapes; an unresolved intent/history/reopening case
is a declared gap, not permission to guess and corrupt source.

Provenance: owner's dollar-transition examples and corrections of nested math
inputs, blocking errors and changed spacing.

## Real React inside the document — REACT-01, SECURITY-01

Author real MDX/JSX, imports, hooks, state and events. Definitions, variables and
imports are hidden by default; component instances render and remain interactive.
Settings can show raw component source without replacing the rendered instance
with setup/edit-source forms. Standard `.md` remains ordinary Markdown; React
execution belongs to MDX, not a silently redefined Markdown grammar.

Interactive React belongs inside the same document and application window. A
separate preview window is not an accepted substitute. Compilation must use live
unsaved/just-edited source, with bounded stale-build/error handling. Preserve
unrelated component state where safe; actual code/dependency changes may require
a documented rebuild/reset. Do not promise generic reverse editing of React.

Rendering untrusted code grants no filesystem, shell, native IPC, application
secrets or unauthorized network access. Ordinary component interaction cannot
modify notes. Future source-editing contracts must be explicit, editor-owned,
revision-validated and separately authorized. Do not adopt browser iframes as a
native CPU/memory containment proof or weaken existing isolation to fit the UI.

Native same-window inline execution is a required engineering proof, currently
unresolved. If it cannot be demonstrated under the security contract, record the
milestone as blocked; do not deliver a different product or privileged execution.

Provenance: original [product spec](handoff/product/CURRENT_PRODUCT_SPEC.md), later
component-display instructions, and setup-form confirmations of same-window inline
React and no rendering privileges, 26 November.

## A completely local vault — DATA-01, DATA-02

The user selects/creates a local folder as a vault. Notes are real `.md`/`.mdx`
files there; related local modules are files too. The app is an interface to those
files. During normal writing, accepted document edits automatically write to the
actual file, so another editor can observe the new contents. Explicit Save is not
the primary persistence workflow, and a browser database is not authoritative.
No cloud note backend, account or content upload is required for this phase.

Each accepted source transaction schedules persistence promptly. Serialize writes
and retain the latest pending source; coalescing superseded in-flight work must
not lose the newest edit. Measure the normal edit-to-disk latency rather than
inventing a zero-latency guarantee. Source persistence is independent of successful
React compilation or valid TeX. Undo/redo are source changes and autosave too.
Only accepted canonical edits write originals; unsafe/unapplied visual drafts do
not silently become file contents.

Use scoped native authority, atomic writes, revisions, permission preservation and
external-change detection. Do not overwrite a competing external edit silently.
Write failure must remain visible and retain user text; normal close must not
pretend pending/failed writes are durable. Recovery is a secondary safety mechanism,
not the main workflow or something the user must manage in order to save notes.

Rename/move acts on real vault files/directories. Delete uses recoverable Trash,
with safe restoration and collision handling. Module/link references and external
changes need an explicit safe operation strategy, not a global textual rewrite.
UI metadata/preferences may be local auxiliary data; they do not replace note
files as truth. A vault's inventory is distinct from the bounded compiler graph;
do not accidentally limit the whole library to the current 32-source bundle cap.

Provenance: owner setup answers, 26 November: “en local 100%”, “una carpeta ... tu
baúl”, changes automatically visible in the file; real rename/move/Trash confirmed.
This supersedes earlier proposals centered on manual Save plus recovery copies.

## Modular core and distribution — PLUGIN-01, UPDATE-01

Core content capabilities are modular, first-party plugins that can be enabled or
disabled without corrupting source. No community plugin system or marketplace now.
Local modules and explicitly supported pinned dependencies remain the initial
React import capability; arbitrary installation is not silently enabled.

Updates should be available from Settings using authenticated/version-verified
signed packages and free infrastructure. Update traffic must not upload notes.
Key custody, a permanent feed and actual upgrade/cancellation acceptance are still
missing; the current no-key installer cannot be activated remotely. Do not claim
working automatic updates before those gates pass.

## Scope and authority — SCOPE-01

Linux/local-vault usability is first. Cloud activation remains paused. Do not add
custom grammar, AI integrations, Git synchronization, general code execution,
marketplaces or speculative features to solve the current problem. A vault may be
a Git repository without the application implementing Git operations.

Routine engineering stays autonomous after the architecture/acceptance gates are
satisfied. Do not change repository visibility, rewrite shared history, merge,
publish a public release, incur paid commitments or weaken security without the
required authorization. No user's files/evidence are deleted as a setup step.

## Confirmed setup decisions and remaining work

All six product questions asked on 26 November are answered:

1. Architecture quality first; conditional reuse rather than unconditional web preservation.
2. Interactive React in the same document/window.
3. Fully local vault and automatic writes to originals; recovery is secondary.
4. Rename/move/delete real files; deletion is recoverable.
5. Linux first; shared architecture for later platforms, no unverified platform claim.
6. Rendering has no file/privileged access; editing contracts are explicit/future.

No additional user decision is required to write the architecture and validation
plan. Renderer embedding/containment, filesystem operations, persistence latency,
package resolution and implementation technology are engineering investigations.
Ask only if their concrete outcomes expose a consequential unresolved product or
security choice; do not ask the owner to select libraries or debug infrastructure.

Maintain this contract when the owner changes a requirement, with reason and
provenance. Keep confirmed instructions, engineering proposals and observed results
separate. [Acceptance](PRODUCT_ACCEPTANCE.md) defines what must be demonstrated;
[target architecture](ARCHITECTURE_TARGET.md) and [the living plan](plans/unified-local-vault.md)
record the engineering work. Status/evidence never substitute for owner intent.
