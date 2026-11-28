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

export type AutosaveListener = (state: AutosaveState) => void;

/** Trusted observation owner only; this never cancels an already dispatched write. */
export interface PersistenceReservation {
  settled(): Promise<void>;
  adopt(
    expected: AcceptedSource & { readonly diskRevision: string },
    next: AcceptedSource & { readonly diskRevision: string },
  ): void;
  release(): void;
}

interface Entry {
  documentId: string;
  latest: Snapshot;
  persisted: Snapshot;
  diskRevision: string;
  durable: boolean;
  error: unknown;
  running?: Promise<void>;
  reservation?: object;
  listeners: Set<{ listener: AutosaveListener }>;
  pendingListeners: Set<{ listener: AutosaveListener }>;
  notificationPending: boolean;
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

  constructor(
    private readonly write: DocumentWriter,
    private readonly observerError?: (error: unknown) => void,
  ) {}

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
      listeners: new Set(),
      pendingListeners: new Set(),
      notificationPending: false,
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
    this.notify(entry);
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

  reserve(documentId: string): PersistenceReservation {
    const entry = this.get(documentId);
    if (entry.reservation) throw Error('Persistence is already reserved.');
    const token = {};
    entry.reservation = token;
    const requireHeld = () => {
      if (this.entries.get(documentId) !== entry || entry.reservation !== token)
        throw Error('Persistence reservation is no longer current.');
    };
    return {
      settled: async () => {
        requireHeld();
        await entry.running;
        requireHeld();
      },
      adopt: (expected, next) => {
        requireHeld();
        if (
          entry.running ||
          entry.error ||
          !entry.durable ||
          entry.latest.source !== entry.persisted.source ||
          expected.documentId !== documentId ||
          next.documentId !== documentId ||
          expected.editorRevision !== entry.latest.editorRevision ||
          expected.source !== entry.latest.source ||
          expected.diskRevision !== entry.diskRevision ||
          !validRevision(next.editorRevision) ||
          next.editorRevision !== expected.editorRevision + 1 ||
          typeof next.source !== 'string' ||
          typeof next.diskRevision !== 'string' ||
          !next.diskRevision
        )
          throw Error(
            'External source adoption is stale or competes with writing.',
          );
        const snapshot = {
          editorRevision: next.editorRevision,
          source: next.source,
        };
        // No writer, callbacks or awaits: the canonical owner completes its
        // witness update before this queued observation can be delivered.
        entry.latest = snapshot;
        entry.persisted = snapshot;
        entry.diskRevision = next.diskRevision;
        this.notify(entry);
      },
      release: () => {
        // Cleanup may run twice, or after a newer reservation was acquired.
        if (entry.reservation !== token) return;
        entry.reservation = undefined;
        this.start(entry);
        this.notify(entry);
      },
    };
  }

  /** Trusted status observations only; copied current state, not an event journal. */
  subscribe(documentId: string, listener: AutosaveListener): () => void {
    const entry = this.get(documentId);
    const subscription = { listener };
    entry.listeners.add(subscription);
    this.notify(entry, subscription);
    return () => {
      entry.listeners.delete(subscription);
      entry.pendingListeners.delete(subscription);
    };
  }

  /** Explicit recovery attempt, still using CAS; never replaces an external version. */
  retry(documentId: string) {
    const entry = this.get(documentId);
    if (entry.reservation) throw Error('Persistence observation is pending.');
    entry.error = null;
    this.start(entry);
    this.notify(entry);
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
        (entry) => entry.reservation || entry.error || this.pending(entry),
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
    if (
      entry.reservation ||
      entry.running ||
      entry.error ||
      this.pending(entry)
    )
      throw new UnsavedDocumentsError([documentId]);
    this.entries.delete(documentId);
    entry.listeners.clear();
    entry.pendingListeners.clear();
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

  private notify(entry: Entry, initial?: { listener: AutosaveListener }) {
    for (const subscription of initial ? [initial] : entry.listeners)
      entry.pendingListeners.add(subscription);
    if (entry.notificationPending || !entry.listeners.size) return;
    entry.notificationPending = true;
    queueMicrotask(() => {
      entry.notificationPending = false;
      const subscriptions = [...entry.pendingListeners];
      entry.pendingListeners.clear();
      for (const subscription of subscriptions) {
        if (!entry.listeners.has(subscription)) continue;
        try {
          // An earlier listener may accept new text or release this session.
          // Read afresh for each delivery, never replay a captured old snapshot.
          void Promise.resolve(
            subscription.listener(this.state(entry.documentId)),
          ).catch((error: unknown) => this.reportObserverError(error));
        } catch (error) {
          this.reportObserverError(error);
        }
      }
    });
  }

  private reportObserverError(error: unknown) {
    try {
      // A void callback can still return a promise. Consume failures without
      // awaiting observers or letting diagnostic failures expose their contents.
      void Promise.resolve(this.observerError?.(error)).catch(() => {});
    } catch {
      // Diagnostics must not affect persistence or expose contents by default.
    }
  }

  private start(entry: Entry) {
    if (
      entry.reservation ||
      entry.running ||
      entry.error ||
      !this.pending(entry)
    )
      return;
    // Same-turn accepted revisions can coalesce before IPC begins. Writes already
    // in flight are never cancelled or acknowledged as a newer source version.
    entry.running = Promise.resolve()
      .then(() => this.persist(entry))
      .finally(() => {
        entry.running = undefined;
        this.start(entry);
        this.notify(entry);
      });
    this.notify(entry);
  }

  private async persist(entry: Entry) {
    try {
      while (!entry.reservation && this.pending(entry)) {
        const snapshot = entry.latest;
        if (entry.durable && snapshot.source === entry.persisted.source) {
          entry.persisted = snapshot;
          this.notify(entry);
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
        this.notify(entry);
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
      this.notify(entry);
    }
  }
}
