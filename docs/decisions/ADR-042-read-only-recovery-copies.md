# ADR-042: Read-only native recovery discovery and explicit copies

Status: development candidate; installed acceptance pending.

## Context

DATA-01 makes real vault files and automatic original-file writes the normal
saving model. Recovery is secondary. Retained snapshot document IDs contain
run/session/path-derived identities and filenames are basenames; neither can
identify an original location safely after restart. Restoring a version into an
active buffer or inferred original would risk replacing unrelated or newer data.

The existing Recovery::open also runs cleanup and retention repair. Reusing it for
new recovery discovery would make opening a dialog delete older versions. Reads
must not perform writer maintenance merely because the user inspects recovery.

## Decision

The existing editor-authorized recovery command gains no new action or filesystem
capability. List and restore-version use a narrow read-only opening of an existing
private, owned directory and validated existing lock. They retain descriptor,
symlink, ownership, mode, integrity and lock checks without creating, chmodding,
cleaning or pruning files. Only a truly absent store means an empty inventory;
an unsafe existing store is an error. Writer retention policy remains unchanged.

A version read returns its verified snapshot metadata/file/ID together with its
exact source from one checked record. The captured native service compares that
receipt with the selected immutable version. Invalid catalog entries produce a
health warning while valid siblings remain usable. Display metadata is bounded
so malformed timestamps cannot crash the whole editor.

The existing ProductApplication owns one explicit recovery-copy operation, not
another document/history registry or autosave writer. Before awaiting protection
or a version read it captures the authorized vault, selected session, structural
generation and cancellation signal. Structural actions invalidate the generation
synchronously, including selection A-to-B-to-A. Checks after awaits and immediately
before creation reject stale or cancelled work.

The user chooses a version and a new vault-relative filename in ProductDialog.
The model calls the existing NativeWorkspace exclusive creation path, preserving
its traversal, collision, revision, readback and uncertain-acquisition handling.
Recovered source keeps its exact BOM, line endings, comments and JSX. A new copy
gets its own canonical session/history. Recovery never replaces an original with
snapshot text, deletes versions, or interprets preview messages as authorization.

Cancellation before native creation causes no file write. Once creation starts,
cancellation cannot promise rollback. A lost or malformed acknowledgement retains
the exact version, destination and source, and the existing unresolved-acquisition
state blocks automatic retry. Reopening the dialog exposes the attempted path and
version so the user can identify a possibly created file. No deletion or guessed
retry is offered. An operation dialog is not an editing surface inside the note.

## Alternatives and limits

- Reusing legacy RecoveryHistory was rejected: it owns direct IPC and another
  writer/manual-save lifecycle outside the current application authority.
- Restoring into an inferred original or current buffer was rejected because
  basename and historical session identities cannot authorize replacement.
- A new generic filesystem API was unnecessary; scoped exclusive creation already
  supplies the required authority and failure semantics.

The feature does not add periodic snapshots, change retention, implement Trash,
reconcile uncertain grants automatically or enable native React. Browser tests
with controlled native ports and backend filesystem tests remain distinct from
actual packaged recovery/restart acceptance. This engineering decision is not
owner acceptance of the Linux product or production security readiness.

## Executed verification

The frozen candidate passed the full application check:1004 unit,173 tooling
with zero skips,157 Chromium,9 Pages and4 disposable local cloud cases, plus
format/lint/types/build. The full native document crate passed93 with seven
explicitly ignored worker/ptrace/tmpfs cases; Rust formatting passed. Targeted
browser journeys use controlled native IPC, not GTK or actual native authority.
Independent review found no remaining Important issue. Packaged native recovery
and actual restart remain unexecuted; retain that distinction when delivering it.

The operational dialogs reuse the existing shared form styles. Actual browser
screenshots at desktop/tablet/mobile exposed and then verified correction of
inline/clipped controls. A real immediate-typing probe also reproduced lost focus
after successful restoration. The parent now reuses the existing guarded creation
focus handoff, capturing the initiator before awaiting and validating the current
application, newly selected session and destination before focusing. Cancellation
and newer focused controls retain ownership. No new focus engine or document
writer was introduced. These remain controlled-native-IPC browser observations.

## Discovery and modal follow-up

The dialog distinguishes in-flight discovery, successful empty results and failed
refreshes. A refresh failure preserves the existing catalog and allows explicit
restoration from cached valid versions; Retry discovery is manual. Request and
application identity suppress late completions after replacement. Effect replay
must retire its lifetime before reserving the existing model operation.

Enabled initial focus and the rendered recovery dialog's keyboard ownership keep
background palette/mode/history commands out while preserving normal input undo.
These are shared UI fixes, not a new source/history owner or filesystem authority.
Unit and controlled-port browser regressions cover failure, cached restoration,
stale discovery, strict replay and keyboard interaction. Actual installed restart
acceptance remains separate; see the dated evidence and proposed installed
recovery acceptance procedure.
