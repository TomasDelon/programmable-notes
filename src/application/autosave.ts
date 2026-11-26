/** Accepted canonical snapshots only. Rendering/compilation never owns this port. */
export interface AcceptedSource {
  readonly documentId: string;
  readonly editorRevision: number;
  readonly source: string;
}

export interface DocumentWrite {
  /** Session identity; the adapter resolves its private grant. Never a path. */
  readonly documentId: string;
  readonly expectedDiskRevision: string;
  readonly source: string;
}

export interface WriteReceipt {
  readonly diskRevision: string;
  /** Publication can succeed while the filesystem cannot confirm durability. */
  readonly durable: boolean;
}

/** Implementations must atomically compare disk revisions and preserve exact bytes. */
export type DocumentWriter = (input: DocumentWrite) => Promise<WriteReceipt>;

interface Snapshot {
  readonly editorRevision: number;
  readonly source: string;
}

export interface AutosaveState {
  readonly documentId: string;
  readonly latest: Snapshot;
  readonly persisted: Snapshot;
  readonly diskRevision: string;
  readonly durable: boolean;
  readonly status: 'saved' | 'pending' | 'writing' | 'blocked';
  readonly error: unknown;
}

interface Entry {
  documentId: string;
  latest: Snapshot;
  persisted: Snapshot;
  diskRevision: string;
  durable: boolean;
  error: unknown;
  running?: Promise<void>;
}

export class UnsavedDocumentsError extends Error {
  constructor(readonly documentIds: readonly string[]) {
    super(
      'Some documents are not durably saved. Their source remains retained.',
    );
    this.name = 'UnsavedDocumentsError';
  }
}

function validRevision(revision: number) {
  return Number.isSafeInteger(revision) && revision >= 0;
}

/**
 * Shared persistence scheduling, independent of UI, storage and compiler state.
 * The caller supplies already accepted monotonically increasing editor revisions;
 * this class retains their snapshots, rather than inventing another edit history.
 * It is not a security boundary: only trusted application use cases may call it.
 */
export class AutosaveCoordinator {
  private readonly entries = new Map<string, Entry>();
  // Keep lifecycle tombstones: a stale view must never target a later opening.
  private readonly retired = new Set<string>();

  constructor(private readonly write: DocumentWriter) {}

  attach(input: AcceptedSource & { diskRevision: string; durable?: boolean }) {
    if (
      !input.documentId ||
      this.entries.has(input.documentId) ||
      this.retired.has(input.documentId) ||
      !input.diskRevision ||
      !validRevision(input.editorRevision)
    )
      throw Error('Invalid or already attached document.');
    const snapshot = {
      editorRevision: input.editorRevision,
      source: input.source,
    };
    this.entries.set(input.documentId, {
      documentId: input.documentId,
      latest: snapshot,
      persisted: snapshot,
      diskRevision: input.diskRevision,
      durable: input.durable ?? true,
      error:
        input.durable === false
          ? Error('File durability has not been confirmed.')
          : null,
    });
  }

  accept(input: AcceptedSource) {
    const entry = this.get(input.documentId);
    if (
      !validRevision(input.editorRevision) ||
      input.editorRevision <= entry.latest.editorRevision
    )
      throw Error('Stale or invalid accepted-source revision.');
    entry.latest = {
      editorRevision: input.editorRevision,
      source: input.source,
    };
    this.start(entry);
  }

  state(documentId: string): AutosaveState {
    const entry = this.get(documentId);
    return {
      documentId,
      latest: { ...entry.latest },
      persisted: { ...entry.persisted },
      diskRevision: entry.diskRevision,
      durable: entry.durable,
      status: entry.error
        ? 'blocked'
        : entry.running
          ? 'writing'
          : this.pending(entry)
            ? 'pending'
            : 'saved',
      error: entry.error,
    };
  }

  /** Explicit recovery attempt, still using CAS; never replaces an external version. */
  retry(documentId: string) {
    const entry = this.get(documentId);
    entry.error = null;
    this.start(entry);
  }

  /** A caller must handle rejection before closing/upgrading or claiming durability. */
  async flush(documentId?: string): Promise<void> {
    for (;;) {
      const entries = documentId
        ? [this.get(documentId)]
        : [...this.entries.values()];
      for (const entry of entries) this.start(entry);
      const jobs = entries.flatMap((entry) =>
        entry.running ? [entry.running] : [],
      );
      if (jobs.length) {
        await Promise.all(jobs);
        continue;
      }
      const unsaved = entries.filter(
        (entry) => entry.error || this.pending(entry),
      );
      if (unsaved.length)
        throw new UnsavedDocumentsError(
          unsaved.map((entry) => entry.documentId),
        );
      return;
    }
  }

  /** Safe normal close only. Discard/conflict resolution needs a separate use case. */
  release(documentId: string) {
    const entry = this.get(documentId);
    if (entry.running || entry.error || this.pending(entry))
      throw new UnsavedDocumentsError([documentId]);
    this.entries.delete(documentId);
    this.retired.add(documentId);
  }

  private get(documentId: string) {
    const entry = this.entries.get(documentId);
    if (!entry) throw Error('Document is not attached to persistence.');
    return entry;
  }

  private pending(entry: Entry) {
    return (
      !entry.durable ||
      entry.latest.editorRevision !== entry.persisted.editorRevision
    );
  }

  private start(entry: Entry) {
    if (entry.running || entry.error || !this.pending(entry)) return;
    // Same-turn accepted revisions can coalesce before IPC begins. Writes already
    // in flight are never cancelled or acknowledged as a newer source version.
    entry.running = Promise.resolve()
      .then(() => this.persist(entry))
      .finally(() => {
        entry.running = undefined;
        this.start(entry);
      });
  }

  private async persist(entry: Entry) {
    try {
      while (this.pending(entry)) {
        const snapshot = entry.latest;
        if (entry.durable && snapshot.source === entry.persisted.source) {
          entry.persisted = snapshot;
          continue;
        }
        const result = await this.write({
          documentId: entry.documentId,
          expectedDiskRevision: entry.diskRevision,
          source: snapshot.source,
        });
        if (
          typeof result.diskRevision !== 'string' ||
          !result.diskRevision ||
          typeof result.durable !== 'boolean'
        )
          throw Error('Invalid persistence acknowledgement.');
        entry.diskRevision = result.diskRevision;
        entry.persisted = snapshot;
        entry.durable = result.durable;
        if (!result.durable)
          throw Error('File was published, but durability was not confirmed.');
      }
    } catch (error) {
      // A rejection can be an external conflict or an uncertain commit. Typing
      // keeps updating latest, but does not silently retry or change disk CAS.
      // Even undo to the old baseline must check disk again: a lost IPC reply
      // may hide a successful publication, so old matching bytes prove nothing.
      entry.durable = false;
      entry.error = error || Error('Persistence failed.');
    }
  }
}
