# Daily-use web integration

Date: 2026-11-22. Scope: the unified browser application at `/`, with the
original `/engine` regression route preserved. This document records the
integration basis and decisions. It does not declare a final test pass, a
deployment, or native GUI acceptance. The user-facing behavior and limits are
in [WEB_APP.md](WEB_APP.md).

## Agent audit

The earlier handoffs describe useful recovery work and executable prototypes.
They do not describe a completed, integrated application release. Prototype
test counts and baseline CI results must not be added together and presented as
application acceptance.

| Agent | What the handoff accomplished                                                                                                              | What remained before integration                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| C0    | Reconstructed the deployed source, documented manifest discrepancies, published the complete D0 archive, and froze provisional interfaces. | A unified application commit, integrated validation, and deployment.                                                               |
| Q7    | Independently reconstructed the baseline and ran its required-toolchain build and non-browser checks.                                      | Browser assertions did not run successfully in its process-limited runner; final application acceptance remained open.             |
| E1    | Tested original-source to CodeMirror position mapping, including Unicode and mixed line endings.                                           | Actual editor state, undo/redo, selection, and Live UI integration.                                                                |
| M2    | Tested exact LaTeX replacement and revision-conflict handling.                                                                             | A parser-backed equation editor connected to the actual source transaction and pending-draft lifecycle.                            |
| R3    | Tested a standalone preview lifecycle model.                                                                                               | The real worker, asynchronous preview-document generation, iframe lifecycle, and React interactions.                               |
| L4    | Tested link extraction from supplied syntax, resolution, backlink derivation, and rename proposals.                                        | The actual Markdown/MDX parser, host navigation UI, catalog updates, and rename collision checks.                                  |
| S5    | Tested a backup codec and simulated revision-safe synchronization.                                                                         | Browser IndexedDB, complete assets/history backup and restore, real conflict handling, and any authenticated cross-device service. |
| A6    | Tested media inspection and a prototype backup round-trip.                                                                                 | Browser decoding, actual attachment persistence, source insertion, preview display, and downloads.                                 |

The original development protocol made implementation depend on a retrievable
D0 and approved D1 interfaces. Several handoffs still said those prerequisites
were pending after newer C0 evidence existed. This coordination bottleneck,
together with runner limitations, explains the gap between tested prototypes
and unchanged application source. The owner's later instruction authorizes
actual integration and deployment; the integration uses the recovered source
and explicit file ownership rather than treating old waiting states as a new
implementation prohibition.

## Corrected D0 provenance

The baseline is a reconstruction of the engine commit plus the deployed source
patch. C0 and Q7 independently obtained the same reconstructed Git tree. The
integration checkout was prepared from the archive and checked against its
file inventory and tree before modifications.

| Item                      | Verified reconstruction value                                         |
| ------------------------- | --------------------------------------------------------------------- |
| Repository                | `TomasDelon/programmable-notes`                                       |
| Engine commit             | `fff0e7ea81ac1c1a53d847ab741b1dfcf672cac6`                            |
| Engine Git tree           | `0faeaf4022c594166d6a00c4c95f9e2cfaee8479`                            |
| Checkpoint ZIP            | 110,559 bytes                                                         |
| Checkpoint SHA-256        | `0cb4b22d7271d42daf1305464e3acc0137b45f24d4e94399cbdf70874e96aedc`    |
| Applied patch             | 447,547 bytes; 48 paths, comprising 36 additions and 12 modifications |
| Actual patch SHA-256      | `42b81c9c0f4a1cf45291a85c945a2d46b36b2b27923575970b968461407ebd31`    |
| Reconstructed D0 Git tree | `d5ab658fd7b49239bc0bf35dcf732194f589ff06`                            |
| Tracked source inventory  | 1,443 files; 36,268,072 source-blob bytes                             |
| Complete D0 archive       | 17,904,296 bytes                                                      |
| D0 archive SHA-256        | `4842bb6be4c3f1d43d022280d49981d4ae0cc697e370f13ba878423296d8c00b`    |

The original release manifest declared patch SHA-256
`1ffab0543ac50348e461a63753c437064f2cafea5217fc267cd0dc0473fb95d2`
and source tree `df3bfdf86d678ac4335ada4e4b9214dfe79dafe1`. Those values do not
match the independently reconstructed source. Preserve that discrepancy as
historical evidence; do not reuse the old manifest as release-integrity proof
or change its historical result to PASS. The archive digest proves the archived
baseline's bytes, not the identity of the later integrated build. Its original
waiting-state fields also describe the archive's publication time, not a live
coordination service.

## Integration decisions

1. **One source authority and stable identities.**
   [Workspace.files](../src/web/workspace.ts) remains authoritative. Display
   titles and folders do not rename module paths. The editor's
   [raw source field](../src/editor/live/rawSource.ts) maps CodeMirror display
   changes to the original source. Undo history retains the effects needed to
   restore the exact raw text.

2. **Live math uses actual source transactions.**
   [Math parsing and replacement](../src/editor/math/mathSource.ts) use the real
   Markdown/MDX parser, an exact captured source revision, and original spans.
   The [equation dialog](../src/editor/math/MathEditor.tsx) edits LaTeX rather
   than rendered HTML. Pending drafts are guarded from navigation and workspace
   replacement; only an accepted Apply becomes saved source.

3. **Links are derived, and navigation belongs to the host.**
   [The workspace link index](../src/links/workspaceLinks.ts) parses actual note
   syntax and returns stable-ID resolutions and backlinks. Opaque syntax and
   escaped examples do not become relationships. Rename and move validate the
   proposed catalog before atomically patching target spans. This closes the
   prototype's collision gap: a renamed target cannot silently become an
   ambiguous or redirected link. [Connections](../src/web/NoteConnections.tsx)
   and Live widgets provide trusted note navigation without granting the
   preview a navigation command.

4. **React lifecycle checks wrap the real asynchronous work.**
   [useWebPreview](../src/web/useWebPreview.ts) invalidates stale completions,
   ignores duplicate worker replies, terminates completed workers, and applies
   its deadline through worker startup and preview-document preparation. Source
   changes and explicit restart reset runtime state; mode and appearance
   changes preserve the mounted frame. Runtime errors are accepted only for
   the active preview generation.

5. **Attachments share one original-byte identity.**
   [The asset catalog](../src/assets/catalog.ts) validates SHA-256 identities,
   containers, bounds, and real browser image decoding. Markdown stores
   `attachment:sha256:...` references. Host controls provide downloads and
   missing-asset feedback. [Preview asset selection](../src/web/previewAssets.ts)
   uses the parser, and [the preview document](../src/web/previewDocument.ts)
   decodes only referenced raster bytes into canvases. Its opaque-origin
   sandbox, exact script hashes, `img-src 'none'`, and `connect-src 'none'`
   remain intact. PDFs are download-only.

6. **Portable backups include the actual workspace.**
   [The version 2 codec](../src/backup/portable.ts) covers current source,
   metadata, Trash, original attachment bytes, and retained recovery snapshots
   with a canonical checksum. Shared bytes are deduplicated while per-snapshot
   attachment names and membership survive. [IndexedDB persistence](../src/web/persistence.ts)
   compares revisions and publishes current state and imported recovery in one
   transaction. Import validation precedes replacement. An unavailable recovery
   store produces an explicitly labeled current-workspace rescue export;
   detected corruption and oversized complete archives remain errors.

## Product boundary

This is a single-device web beta with local browser storage and manual portable
backup transfer. There is no account service, authenticated cross-device sync,
automatic conflict merge, or collaborative editing. The S5 prototype's
simulated synchronization is not a deployed synchronization backend.

Wikilinks and backlinks are included. A knowledge graph is deferred. Live
formatting is a conservative source projection, not a general rendered-DOM
editor. Unsupported or expensive syntax stays editable as source. Unapplied
math drafts and running React component state are not persisted in backups.

Attachments are limited to validated PNG, JPEG, WebP, and PDF. Removing a source
reference does not garbage-collect its bytes automatically. The preview still
does not support arbitrary npm packages, remote media, or network access. Its
compile deadline is not a hard CPU or memory limit on already-running browser
JavaScript. Existing native isolation documentation and dated evidence remain
separate; this web integration makes no new native GUI or native security-pass
claim.

## Final release evidence

Final acceptance must identify the integrated source revision, toolchain,
executed unit/tooling/browser checks, security-scan scope, and any remaining
failures or skips. Deployment evidence must identify the actual published
build and observed production behavior. These results are pending the release
owner's final record and must not be inferred from the baseline archive,
prototype counts, historical CI, or the existence of this document.

Historical handoff and security evidence, the README design, and
[PUBLIC_READINESS.md](PUBLIC_READINESS.md) retain their separate scope.
