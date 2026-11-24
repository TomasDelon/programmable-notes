# Programmable Notes on the web

The browser application opens at `/`. It combines the approved UI Lab interface
with Source editing and editable Preview, mathematics, isolated React execution,
wikilinks, backlinks, local attachments, and portable workspace backups. Its
current scope is a single-device beta: notes live in this browser profile, and
there is no authenticated cross-device synchronization.

The original editor remains available at `/engine` for regression testing and is
still selected automatically by the native application. This guide describes
the implementation, not a certification of a particular deployment or native
build. [Daily-use integration](DAILY_USE_INTEGRATION.md) records the recovered
source baseline, agent audit, integration decisions, and remaining scope.

## Start a working session

Open the left navigation panel to see Documents, folders, and Recent. The first
workspace contains a Welcome note and a React playground. Use the new-document
or new-folder controls to create your own material. New notes open in Source.

The title above the document is editable in Source and Preview. Document actions
also offer rename, move, source export, and Move to Trash. Titles and workspace
folders are display metadata; stable source keys and relative module imports
do not change when a note is renamed or moved. Existing resolved wikilinks are
updated atomically when necessary to preserve their target. If safe rewriting
cannot be established, the operation is refused with the original workspace
retained. See [Wikilinks and backlinks](#wikilinks-and-backlinks).

You can also drag files and folders within the Documents tree. Drop above or
below an item to reorder siblings, in the middle of a folder to move inside it,
or onto the Documents divider to return to the workspace root. Folder moves
carry all nested folders and document metadata, and apply the same wikilink
target checks. Order is saved to IndexedDB and included in workspace backups.
The tree supports mouse drag-and-drop; touch-specific drag gestures are not yet
supported.

Search in the sidebar matches document titles, folder paths, and source text.
The command palette searches notes and exposes the main actions without opening
Settings. Connections displays the selected note's outgoing wikilinks and
derived backlinks.

| Shortcut               | Action                                            |
| ---------------------- | ------------------------------------------------- |
| `Ctrl/Cmd + K`         | Search notes and commands                         |
| `Ctrl/Cmd + E`         | Toggle Source and editable Preview                |
| `Ctrl/Cmd + S`         | Save the latest workspace changes in this browser |
| `Ctrl/Cmd + \`         | Toggle navigation                                 |
| `Ctrl/Cmd + Z`         | Undo in the source editor                         |
| `Ctrl/Cmd + Shift + Z` | Redo in the source editor                         |
| `Escape`               | Close the active dialog or open panels            |

Recent is a stable shelf, not a most-recently-used sort. Opening a document adds
its shortcut at the end if absent. Opening it again keeps its position. The ×
removes only the shortcut; the note remains in Documents. Opening a removed note
adds it at the end again. The shelf stores up to 30 shortcuts, with an expandable
initial view, and its order survives reopening the app.

## Write and preview

Source and Preview share the same authoritative Markdown/MDX source and undo history:

| Mode        | Behavior                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Source**  | Edit the original Markdown, LaTeX, MDX, or module text in CodeMirror.                                                          |
| **Preview** | Edit rendered Markdown directly, including headings, formatting, lists, tasks, tables, wikilinks and mathematical expressions. |

Preview is an editable, trusted ProseMirror projection. Supported Markdown
changes become guarded edits to the canonical CodeMirror source; arbitrary
HTML, JSX, imports and executable code are not rewritten through this surface.
Unsupported or ambiguous syntax remains opaque or falls back to Source.
The source mapping preserves BOMs, Unicode and unchanged mixed line endings,
while deliberate structural changes may reserialize the affected block.

The right inspector's **Run full document** command executes the original
MDX/React document in a separate sandboxed runtime, including shared module
state. **Edit rendered document** returns to editable Preview. These execution
modes are distinct from the two-way document mode selector.

A source change triggers a preview rebuild after a short debounce. Compile
errors retain the source and can provide locations to reveal in the editor.
Stop invalidates pending work and removes the current preview; Rebuild starts a
fresh one. Results from an obsolete source revision cannot replace a newer
preview. The build deadline includes worker initialization and preview-document
preparation.

Imported `.md` files use ordinary Markdown. Braces and JavaScript-like text stay
literal. `.mdx` files can also contain JSX, exports, React components, and allowed
imports. New notes use MDX. JavaScript and TypeScript module files open in Source
and are not standalone note previews.

The web renderer includes Markdown tables, task lists, strikethrough, and KaTeX
mathematics. Inline math uses `$...$`; display math uses `$$...$$` on separate
lines. For example:

```md
The sequence is $a_n = 1/n$.

$$
\lim_{n \to \infty} a_n = 0.
$$
```

In Preview, click an inline `$...$` or display `$$...$$` equation to reveal
its original dollar-delimited LaTeX **in place**, including on mobile. No
separate equation dialog is used. `Enter` applies inline edits;
`Ctrl/Cmd + Enter` applies display edits; **Done** or leaving the field also
attempts to apply. `Escape` or **Cancel** discards the draft. Invalid LaTeX,
removed delimiters or stale source revisions keep the editable draft and show
an error instead of overwriting the source. Resolve an unfinished draft before
switching documents, exporting, restoring or changing the surrounding document.
If validation fails, nearby deletion and formatting cannot discard the equation;
finish it or cancel explicitly before continuing. Cancelling a stale field shows
the latest canonical source again. Unapplied drafts are memory-only
and are not included in saved notes or backups.

The React playground provides an interactive counter. Editing ordinary Markdown
in Preview preserves unaffected isolated React islands. **Run full document**
starts a separate shared-module execution context; returning to **Edit rendered
document** or changing executable source may restart that context. Component
state is temporary and is not part of a note backup.

The compiler uses the pinned React runtime and its import allowlist. Related
local `.md`, `.mdx`, `.js`, `.jsx`, `.ts`, and `.tsx` sources can be imported
together. The package allowlist includes React and `clsx`; it is not a general
npm installation facility. Network requests, remote images, and audio/video
media are not supported by the preview. Validated local raster attachments have
a separate rendering path described below. Fonts and mathematical rendering
assets are bundled with the application.

## Wikilinks and backlinks

Write a wikilink in ordinary note text:

| Source                    | Meaning                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `[[Title]]`               | Open the unique live note with this exact, case-sensitive title. |
| `[[Folder/Title]]`        | Open the note at this workspace folder path and title.           |
| `[[Title\|Display text]]` | Resolve `Title` while displaying an alias.                       |

Folder paths are relative to the workspace root. Resolution uses stable note
IDs after matching titles and folders. It never chooses a duplicate by catalog
order. Missing targets, multiple live matches, and targets found only in Trash
are displayed as distinct unresolved states. They do not silently create or
open a different note.

Use a resolved Live wikilink or **Connections → Outgoing links** to navigate.
**Connections → Backlinks** lists live notes whose parsed wikilinks resolve to
the selected note. These relationships are recomputed from source, including
after edits, rename, move, Trash, and restore. Plain title mentions are not
backlinks. Wikilink-like text inside code, math, imports, JSX, frontmatter,
ordinary Markdown links, or escaped syntax is excluded. Invalid MDX or a syntax
analysis limit is reported instead of producing speculative links.

Rename and move inspect the old and proposed catalogs before applying source
patches. They preserve aliases and unrelated source bytes, use a qualified
target when required, and refuse changes that would redirect an existing
resolved link or leave its intended target ambiguous. A source that cannot be
parsed safely can also prevent such a rewrite. This is note-to-note navigation;
a knowledge graph, automatic note creation, heading targets, and block targets
are outside the current feature set.

## Import existing notes and modules

Use **Settings → Workspace → Import files**, **Import folder**, or the matching
command-palette action. Select related files together so their relative imports
belong to the same compile group. Folder import retains the selected directory's
relative paths. A folder containing unsupported files is rejected as a whole;
prepare a source-only folder or choose the supported files directly.

Imports are copied into the browser workspace. They are not live connections to
the original filesystem. Editing, renaming, or moving a browser note does not
write back to the original file. Import validates the entire selection before
adding it, rejects invalid UTF-8 and duplicate paths, and preserves valid source
text, including a UTF-8 BOM and existing line endings.

Two separate import operations create separate compile groups. A note cannot
silently reach sources from another group. Display folders can organize notes
from different groups without changing those import boundaries.

## Images and PDF attachments

Use **Add image or PDF** in the command palette or document actions, or paste or
drop files into the selected note. PNG, JPEG, WebP, and PDF are supported. The
whole selection must pass validation before any source or asset is added. Image
validation includes container inspection, size and dimension limits, a SHA-256
content identity, and decoding by the browser. Invalid or unsupported files are
rejected with the existing note intact.

Import retains the original bytes and appends ordinary Markdown references such
as `![Diagram](attachment:sha256:...)` or
`[Reference.pdf](attachment:sha256:...)`. Identical content shares its stored
asset. These internal references do not fetch a URL. Moving a note to Trash or
deleting an attachment reference does not delete the underlying stored bytes;
the catalog remains subject to its size limits.

The note's attachment section displays referenced images and provides original
file downloads, including PDFs. Preview renders referenced raster images on a
canvas from the validated bytes. Only the selected note's referenced images
are included in its preview payload. PDFs stay as host-side downloads and are
not executed or embedded in the preview. Missing attachment IDs are shown as
missing rather than replaced with network requests. Arbitrary JSX image URLs,
remote media, SVG, and other attachment formats are not enabled by this feature.

## Understand saving and backups

Autosave writes the whole workspace to IndexedDB approximately 250 ms after a
change. **Saved in this browser** appears only after the storage transaction
commits. The save loop includes newer input entered while an earlier write was
in progress. Closing or reloading with unsaved changes requests the browser's
normal pending-change confirmation.

Storage belongs to this website in this browser profile on this device. There
is no account, server-side note database, or synchronization between browsers or
devices. Clearing site data removes the workspace and its local recovery
history. Private browsing and browser storage policies can also affect
retention. Use **Protect browser storage** to request the browser's persistent
storage option; a refusal does not prevent ordinary local saving.

The two export actions serve different purposes:

| Action                      | What the downloaded file contains                                                                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Export current source**   | The selected file's exact source text, with its original source filename. It does not prepend the display title or serialize runtime component state.                                                                                                                         |
| **Export workspace backup** | A version 2 JSON backup of all source files, titles, folders, compiler groups, tree order, Recent shortcuts, appearance, selection, Trash, original attachment bytes, and retained recovery checkpoints. It captures current in-memory source even if the latest save failed. |

Keep workspace backups outside the browser, such as in a normal files folder or
an independently backed-up location. A download request is not confirmation
that the operating system saved the file, so check that the file appears in
your downloads.

The version 2 backup covers its contents with a SHA-256 checksum and deduplicates
attachment bytes across the current workspace and checkpoints. Source text and
each snapshot's attachment metadata remain intact. The checksum detects changes
or corruption; it does not encrypt the backup or authenticate its author. A
complete export must fit the 32 MiB JSON limit. Oversized exports fail rather
than silently dropping notes, attachments, or history.

If browser recovery storage cannot be read, the app can export a clearly named
`-rescue.json` file containing the complete current workspace and attachments.
Its notice and `recoveryIncluded: false` field disclose the missing history.
Detected corruption in a readable checkpoint remains an export error; it is
not silently relabeled as an unavailable history store.

**Restore backup** checks the format, checksum, limits, source paths, metadata,
attachment hashes, and actual image decoding before changing the workspace.
After confirmation, it atomically restores the current state and imported
recovery history, subject to the retention budget, while attempting to retain
the preceding saved workspace as a checkpoint. Legacy version 1 backups are
still accepted after their available structural checks; they do not gain a
version 2 checksum retroactively. Export the current workspace first when you
want an independent copy of both versions. A valid backup can manually transfer
the workspace to another browser; this is not automatic synchronization.

## Recovery, Trash, and storage failures

**Settings → Recovery** lists earlier whole-workspace checkpoints. Checkpoints
are spaced at least 30 seconds apart during ordinary editing so rapid keystrokes
do not immediately replace useful history. The app retains at most five
checkpoints within a 32 MiB history budget. An explicit backup or recovery
restoration attempts to preserve the preceding saved workspace as a checkpoint.

Restoring a recovery point replaces the whole workspace after confirmation.
Export a JSON backup first if the current version contains material you still
need. Recovery history shares the same browser storage as the current workspace
and is not an independent backup.

**Move to Trash** preserves a document's text, metadata, and attachment
references. Restore it from **Settings → Trash**. Trash is included in JSON
backups and counts toward storage limits. Trashed notes are excluded from
active backlinks. Removing a Recent shortcut never moves a document to Trash.

A failed save leaves the previous committed workspace intact and retains the
current edits in memory. Keep the tab open, export a backup, and use **Retry
save** after resolving the problem. If a saved workspace fails its integrity
check during opening, the app shows recovery and backup options instead of
silently overwriting it with new example notes.

### When another tab changes the workspace

The app compares the stored revision inside each write transaction. A tab with
an older revision cannot overwrite a newer save from another tab. Its local
edits remain visible, and automatic saves stop with a conflict message.

1. Export a workspace backup from the tab containing the edits you want to keep.
2. Choose one tab for further editing and close the other editor tabs.
3. Use **Load latest saved workspace** to open the committed version, or
   explicitly restore the exported backup if that should become the workspace.
4. For individual conflicting changes, export or copy their source and reapply
   them to the chosen workspace.

There is no automatic merge. Reloading or restoring asks before replacing
pending local work. If new input arrives while a reload is reading storage, the
reload is cancelled and that newer input is retained.

## Offline use and app updates

The production build prepares offline access with a service worker. Open the
app online and wait until **Settings → Workspace → Web app** says it is ready to
open offline. This requires downloading the application, compiler, fonts, and
other build assets. A loading server or a partially downloaded cache is not
offline readiness.

Once ready, the cached application and the local workspace can reopen without
an internet connection. Note storage stays in IndexedDB; note text is not added
to the service worker's application-asset cache. Offline availability still
depends on the browser retaining that site's data.

When an update is available, **Save and update app** first commits the latest
edits, including input entered while a storage-permission request was pending.
It then activates the new cached application and reloads. A failed save or
conflict prevents this update action. Development mode does not register the
production service worker.

## Enforced limits and architecture boundaries

| Area                             | Current limit or behavior                                 |
| -------------------------------- | --------------------------------------------------------- |
| Catalog                          | 1,000 source files, including Trash                       |
| One source                       | 500,000 UTF-8 bytes                                       |
| All source text                  | 24 MiB per workspace                                      |
| One related import/compile group | 32 files and 8 MiB                                        |
| One image / PDF                  | 4 MiB / 8 MiB                                             |
| Image dimensions                 | At most 24 million decoded pixels                         |
| Attachment catalog               | 256 assets and 16 MiB of original bytes                   |
| One attachment import            | 16 files                                                  |
| JSON backup                      | 32 MiB, including escaping, base64, metadata, and history |
| Recent                           | 30 stable shortcuts                                       |
| Recovery                         | At most five whole-workspace checkpoints and 32 MiB       |
| Compilation                      | 300 ms debounce and a 15-second build deadline            |
| Runtime component state          | Temporary; reset by source rebuilds                       |

The editor rejects an oversized source transaction before it enters CodeMirror,
with a visible explanation that the previous source was retained. Whole-state
validation bounds the current snapshot; the portable exporter separately bounds
the combined archive with history and attachment encoding. The individual
catalog, source, asset, and history maxima cannot necessarily all fit into one
backup at once. Live syntax and link analysis also have conservative input
budgets and fall back to raw source when exceeded. These are resource bounds,
not performance guarantees for a fully populated catalog.

`src/web/workspace.ts` owns the browser catalog and reuses the existing
`Workspace.files` representation as its only source-text authority. The raw
CodeMirror source field maps display positions to that source; mathematical
edits validate an exact captured revision. `src/links` derives relationships
from the real Markdown/MDX parser and catalog metadata. Its index is not a
second persistent source of truth.

`src/assets` validates content-addressed original bytes. `src/backup` defines
the portable backup codec. `src/web/persistence.ts` owns transactional storage,
revision comparisons, and integrity checks. `src/web/useWebWorkspace.ts`
connects these operations to the interface. Native document grants and native
saved-source snapshots are not importable into a browser backup.

The existing compiler worker and resolver remain responsible for compiling
explicitly selected source groups. Web-only Markdown, mathematics, and styling
are enabled separately from the native pipeline. The preview frame has an
opaque origin and `sandbox="allow-scripts"`. Scripts use exact CSP hashes;
`connect-src 'none'` and `img-src 'none'` remain in place. Canvas attachment
decoding does not grant image URL or network access. Trusted host controls own
note navigation, attachment downloads, and writes. Messages from the frame can
report bounded presentation information and errors, not save or replace
documents.

The browser preview does not have the native Linux process, CPU, or memory
limits. The compiler deadline does not limit an already-running React component.
Use your own trusted code while broader browser and runtime testing continues.
The web app is not a claim of completed native security review or support for
arbitrary hostile JavaScript.

## Development and verification

Use the Node version in `.nvmrc` and the npm version in `package.json`, install
with `npm ci`, and run `npm run dev` for development. `npm run build` generates
the production bundle and its offline asset manifest. `npm run preview` serves
that build for local inspection.

Run `npm run check` before committing. It covers formatting, lint, TypeScript,
unit tests, tooling controls, and the production-build browser suite. Browser
tests own port 4173. Use Playwright's matching installed Chromium, or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when a supported system browser is
available. Set `PN_ALL_BROWSERS=1` to include the configured Firefox and WebKit
projects after installing their browsers. `/engine` preserves the original
editor regression route; `/` is the unified web product.

The unit suites cover source fidelity, math revision guards, actual parser
links, rename collisions, preview lifecycle races, attachment corruption,
portable backup integrity, recovery, quota rollback, and revision conflicts.
The integration flows are represented in `tests/e2e/web-live.spec.ts`,
`tests/e2e/web-runtime-links.spec.ts`, and
`tests/e2e/web-assets-backup.spec.ts`, alongside existing web, offline, and
engine regressions. Unit storage simulations do not replace actual browser
reload, offline, multitab, and deployment checks. Report results with their
exact source revision and runner. Native GUI and process-security acceptance
require the separate native environment and evidence.

### Writing in Preview

Type Markdown prefixes directly: `1. ` or `- ` starts a list; Enter continues it,
Enter on an empty item exits, and Tab/Shift+Tab nests or lifts items. `## ` makes
a heading; `**bold**`, `*italic*` and backticks format inline text. Ctrl/Cmd+B/I
toggles bold/italic. Ctrl/Cmd+Shift+K inserts a link. Additional table, list and
equation commands are in Ctrl/Cmd+K; there is no formatting toolbar.

Errors and important workspace feedback appear as small notifications without
moving the document or taking focus. Details opens an optional dialog. If an edit
is refused, **Review draft** exposes its retained source; **Download retained
source** preserves exact bytes. Copy or download before explicitly discarding;
your accepted source remains unchanged. Keep regular workspace backups.

For responsiveness, documents containing a single run of more than 8,192 spaces
or tabs use the existing Source-only fallback. Their exact bytes remain editable
and exportable in Source. An in-progress Preview edit crossing the work budget
is retained behind Review draft; download it before discarding or changing modes.
