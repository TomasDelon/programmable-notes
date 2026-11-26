# ADR024: Product presentation for the native editor

Status: implemented; installed-package interaction acceptance remains separate.

## Problem

The first Linux local-folder package selected `App` and `styles.css` for every
Tauri launch. That preserved native authority but exposed the historical engine
test interface, not the document workspace developed for the product. Successful
compilation and backend tests did not establish presentation parity. Owner desktop
feedback exposed this delivery error.

## Decision

Native launches use a presentation-only `NativeWorkspaceShell` with the existing
product stylesheet, typography, document canvas, passive title, collapsible
navigation, mode controls and inspector. The shared `SourceEditor` and rendered
Markdown engine remain the actual editor. File, recovery, update and preview
ownership stay in the existing native controller; this is not a second document
model or a browser workspace hidden in a desktop window.

Do not route Tauri directly to `WebApp`: that entry eagerly initializes browser
persistence, offline behavior and iframe-based React execution. Native launches
skip the legacy engine stylesheet and the service worker. `/engine` remains an
explicit regression fixture with its historical interface.

Native opens in Preview with a local-use Welcome document. It does not launch a
second window automatically. Choosing Split explicitly starts the existing
supervised native React child. Source and Preview do not execute document React
inside the privileged editor. The child remains a separate window: embedding it
by adopting browser iframe execution would change the security boundary.

The native compiler opts into the shared Markdown/math transforms too; enabling
the editor alone left ordinary Welcome mathematics invalid in the old compiler
path. The child displays the generated MathML using the system renderer and hides
the duplicate HTML branch. Its font, network, worker and frame CSP directives stay
`'none'`; browser data-font permissions are not adopted.

Settings retains native update guards and always-mounted recovery snapshots.
Appearance changes are in memory; no browser database is introduced. Browser-only
workspace operations such as attachment storage and Trash are not silently
substituted for native file semantics. Folder authority still comes exclusively
from the OS chooser; saving still uses opaque grants, revisions and atomic writes.

## History freshness correction

New regression coverage exposed a source-witness ordering bug: canonical undo
could restore exact source while the rendered document retained its old text.
Descendant layout effects can run before `useDocuments` publishes its committed
workspace ref. Source changes now synchronously publish their accepted bytes to
that witness, while the actual state update remains functional to preserve queued
save/binding changes. The revision guard remains intact; queued callbacks stay
bound to their original file and retain late edits without overwriting a newly
selected document. A failing-then-passing test covers synchronous successive
edits, and native-adapter interaction tests retain exact undo/save assertions.

## Acceptance

Tests must enter through the real native routing decision, not render a new shell
in isolation and call that an installed application. Browser adapter acceptance
uses synthetic native IPC to test navigation, live editing, history, exact source
preservation, save/reopen, Settings and explicit preview startup. It asserts no
IndexedDB open, no iframe, and no preview startup in the default mode, and captures
desktop/tablet/mobile views. This does not prove GTK rendering, native pickers,
physical disk I/O, systemd containment or PackageKit installation. Those require
the exact production package on a compatible disposable Linux desktop.

The updater channel remains inactive without its real compiled verification key
and permanent signed feed. A no-key testing installer cannot be activated remotely;
one real-key bootstrap installation will be necessary before future Settings
updates. No release publication or sandbox relaxation follows from this decision.
