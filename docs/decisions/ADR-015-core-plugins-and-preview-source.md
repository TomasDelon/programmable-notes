# ADR 015: Trusted core plugins and forgiving mathematical presentation

Status: accepted, 25 November 2026. Applies to the web workspace; the native
`/engine` interface is unchanged.

## Decision

Optional functionality starts with two statically bundled core plugins:
Mathematics and React components. Their modules own mathematical rendering,
compiler configuration, component classification and isolated island source
selection. A fixed registry exposes validated, persistent enable/disable settings.
There is no community plugin loader, remote registration or permission switch.
Source transactions, persistence, recovery, revision validation and sandbox
policies remain mandatory application infrastructure, never optional plugins.
Future optional capabilities should use this boundary rather than expanding a
runtime extension API before one is needed.

Preferences round-trip through the existing versioned workspace/backup format.
Older workspaces default to both plugins enabled and source hidden. Cross-tab
rebasing preserves the current tab's preferences while adopting verified content;
preferences cannot authorize a competing document write. Unknown plugin identifiers
and nonboolean preferences are rejected during restore/import.

Imports, exports and comment-only expressions have no preview controls or labels.
Executable JSX/expressions run only inside the existing unprivileged preview.
Settings → Workspace → Show component source in Preview reveals escaped ordinary
code, alongside the rendered component. It never grants reverse editing authority.
Disabling React terminates its frames/worker and exits full-document execution.
Disabling Mathematics leaves dollar-delimited source visible. Its syntax parser
remains active so TeX braces cannot become executable MDX expressions.

Invisible source atoms are protected from visual transactions that would discard
or change them. Boundary deletion must be source-neutral. Select All replacement
retains hidden setup at the document edges; a selection crossing interleaved hidden
code fails closed with recoverable attempted text. Actual deletion of hidden setup
requires explicit Source editing. This protects code bytes as well as rendering.

## Mathematical errors are local feedback

This supersedes ADR 013's earlier refusal of invalid LaTeX. Invalid TeX inside
valid MDX mathematical delimiters commits through the same exact-span/revision
planner as valid TeX. It remains escaped raw source in red, without a notification,
and does not block other formulas or surrounding text. Valid correction clears
red feedback immediately and renders on caret exit. Multiple errors survive saves
and reloads. KaTeX remains bounded and untrusted (`trust: false`).

Missing/changed dollar boundaries, stale revisions and unsafe source mappings
still retain the original attempted draft and refuse source mutation. They are
source-integrity failures, distinct from an ordinary TeX rendering error.
IME completion and canonical undo/redo continue through the existing source
transaction path; no preview message grants write or filesystem authority.

## Limits

Component state is temporary. Toggling source visibility preserves unaffected
editable-preview React islands. Full-document compilation preference changes may
rebuild the shared context and reset component state. Native GUI runtime and
physical mobile keyboards require separate validation; web tests do not certify
them. Community plugins and arbitrary JSX reverse editing remain out of scope.
