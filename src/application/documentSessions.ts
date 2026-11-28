import {
  AutosaveCoordinator,
  type AutosaveState,
  type DocumentWriter,
  type PersistenceReservation,
} from './autosave';
import {
  sameSourceWitness,
  validSourceWitness,
  type SourceBatch,
  type SourceSession,
  type SourceWitness,
} from '../editor/sourceWitness';
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
} from '../documents/workspace';

export interface DocumentSessionInput {
  readonly witness: SourceWitness;
  /** Import/syntax/display identity only. This is never filesystem authority. */
  readonly logicalPath: string;
  readonly diskRevision: string;
  readonly durable?: boolean;
}

export interface SessionBudgets {
  readonly maxDocumentBytes: number;
  readonly maxLoadedBytes: number;
  readonly maxSessions: number;
}

export type DocumentObservationIssue =
  'missing' | 'permission' | 'invalid' | 'unstable' | 'retired' | 'unreadable';

export interface ObservedSource {
  readonly source: string;
  readonly diskRevision: string;
}

/** Retained reconciliation inputs, never an additional editable source owner. */
export interface RetainedObservation {
  readonly base: SourceWitness;
  readonly diskRevision: string;
  readonly observed?: ObservedSource;
  readonly issue?: DocumentObservationIssue;
}

export interface DocumentSessionState {
  readonly witness: SourceWitness;
  readonly logicalPath: string;
  readonly phase: 'open' | 'closing' | 'close-uncertain';
  readonly autosave: AutosaveState;
  readonly unapplied: boolean;
  readonly retainedFailures: readonly SourceBatch[];
  readonly closeError: unknown;
  /** Prior canonical source retained separately from local keystroke publication. */
  readonly externalCheckpoint?: SourceWitness;
  readonly externalObservation?: RetainedObservation;
}

export interface DocumentObservationReservation {
  settled(): Promise<void>;
  adopt(
    expected: SourceWitness,
    expectedDiskRevision: string,
    observed: { readonly source: string; readonly diskRevision: string },
  ): SourceWitness;
  retainExternal(
    expected: SourceWitness,
    expectedDiskRevision: string,
    observed: ObservedSource,
  ): void;
  retainReadFailure(
    expected: SourceWitness,
    expectedDiskRevision: string,
    issue: DocumentObservationIssue,
  ): void;
  confirmUnchanged(expectedDiskRevision: string): void;
  release(): void;
}

export interface AggregateCloseAdmission {
  flush(): Promise<void>;
  assertCurrent(): void;
  abort(): void;
  /** Native release may have happened: retain identities and never reopen this scope. */
  markUncertain(reason?: unknown): void;
}

type Listener = (state: DocumentSessionState) => void;
interface Entry {
  witness: SourceWitness;
  logicalPath: string;
  phase: DocumentSessionState['phase'];
  unapplied: boolean;
  retainedFailures: SourceBatch[];
  closeError: unknown;
  observation?: object;
  externalCheckpoint?: SourceWitness;
  externalObservation?: RetainedObservation;
  externalPause?: PersistenceReservation;
  listeners: Set<{ listener: Listener }>;
  pendingListeners: Set<{ listener: Listener }>;
  notificationPending: boolean;
  unsubscribeAutosave: () => void;
}

interface AggregateClose {
  readonly captured: readonly { entry: Entry; witness: SourceWitness }[];
  invalidated: boolean;
  uncertain: boolean;
}

const copyBatch = (batch: SourceBatch): SourceBatch => ({
  expected: { ...batch.expected },
  source: batch.source,
});

/**
 * Trusted application orchestration, not a sandbox or another editing history.
 * Ports resolve private grants outside this controller; session IDs never repeat.
 */
export class DocumentSessions {
  private readonly autosave: AutosaveCoordinator;
  private readonly entries = new Map<string, Entry>();
  private readonly retired = new Set<string>();
  private aggregateClose: AggregateClose | null = null;

  get aggregateCloseHeld(): boolean {
    return this.aggregateClose !== null;
  }

  constructor(
    write: DocumentWriter,
    private readonly closeDocument: (documentId: string) => Promise<void>,
    private readonly budgets: SessionBudgets = {
      maxDocumentBytes: MAX_FILE_BYTES,
      maxLoadedBytes: MAX_TOTAL_BYTES,
      maxSessions: MAX_FILES,
    },
  ) {
    const selected: SessionBudgets = {
      maxDocumentBytes: budgets.maxDocumentBytes,
      maxLoadedBytes: budgets.maxLoadedBytes,
      maxSessions: budgets.maxSessions,
    };
    const fields = [
      [selected.maxDocumentBytes, MAX_FILE_BYTES],
      [selected.maxLoadedBytes, MAX_TOTAL_BYTES],
      [selected.maxSessions, MAX_FILES],
    ] as const;
    if (
      fields.some(([n, cap]) => !Number.isSafeInteger(n) || n <= 0 || n > cap)
    )
      throw Error('Invalid source budgets.');
    this.budgets = selected;
    this.autosave = new AutosaveCoordinator(write);
  }

  attach(input: DocumentSessionInput): SourceSession {
    if (
      this.aggregateClose ||
      !validSourceWitness(input.witness) ||
      typeof input.logicalPath !== 'string' ||
      !input.logicalPath ||
      this.entries.has(input.witness.sessionId) ||
      this.retired.has(input.witness.sessionId) ||
      this.entries.size >= this.budgets.maxSessions ||
      !this.withinBudget(input.witness.source)
    )
      throw Error('Invalid or unavailable document session.');
    const witness = { ...input.witness };
    const id = witness.sessionId;
    this.autosave.attach({
      documentId: id,
      editorRevision: witness.editorRevision,
      source: witness.source,
      diskRevision: input.diskRevision,
      durable: input.durable,
    });
    const entry: Entry = {
      witness,
      logicalPath: input.logicalPath,
      phase: 'open',
      unapplied: false,
      retainedFailures: [],
      closeError: null,
      listeners: new Set(),
      pendingListeners: new Set(),
      notificationPending: false,
      unsubscribeAutosave: () => {},
    };
    this.entries.set(id, entry);
    entry.unsubscribeAutosave = this.autosave.subscribe(id, () =>
      this.notify(entry),
    );
    return {
      get witness() {
        return { ...entry.witness };
      },
      isCurrent: (expected) => this.current(entry, expected),
      validate: (batch) => this.validate(entry, batch),
      publish: (batch) => {
        if (!this.validate(entry, batch))
          throw Error('Source publication refused.');
        const next: SourceWitness = {
          sessionId: id,
          editorRevision: entry.witness.editorRevision + 1,
          source: batch.source,
        };
        // No callbacks/awaits between coordinator acceptance and canonical receipt.
        // Its writer and observers run in later microtasks, never within accept.
        this.autosave.accept({
          documentId: id,
          editorRevision: next.editorRevision,
          source: next.source,
        });
        entry.witness = next;
        this.notify(entry);
        return { ...next };
      },
      retainFailure: (batch) => {
        if (
          this.entries.get(id) !== entry ||
          !validSourceWitness(batch.expected) ||
          batch.expected.sessionId !== id ||
          typeof batch.source !== 'string'
        )
          throw Error('Retained attempt does not belong to an active session.');
        entry.retainedFailures.push(copyBatch(batch));
        this.invalidateAggregate(entry);
        this.notify(entry);
      },
    };
  }

  state(documentId: string): DocumentSessionState {
    const entry = this.get(documentId);
    return {
      witness: { ...entry.witness },
      logicalPath: entry.logicalPath,
      phase: entry.phase,
      autosave: this.autosave.state(documentId),
      unapplied: entry.unapplied,
      retainedFailures: entry.retainedFailures.map(copyBatch),
      closeError: entry.closeError,
      ...(entry.externalObservation
        ? {
            externalObservation: {
              ...entry.externalObservation,
              base: { ...entry.externalObservation.base },
              ...(entry.externalObservation.observed
                ? { observed: { ...entry.externalObservation.observed } }
                : {}),
            },
          }
        : {}),
      ...(entry.externalCheckpoint
        ? { externalCheckpoint: { ...entry.externalCheckpoint } }
        : {}),
    };
  }

  reserveObservation(documentId: string): DocumentObservationReservation {
    const entry = this.get(documentId);
    if (this.aggregateClose || entry.phase !== 'open' || entry.observation)
      throw Error('Document observation is already reserved or closing.');
    const persistence =
      entry.externalPause ?? this.autosave.reserve(documentId);
    let settled = false;
    const token = {};
    entry.observation = token;
    const requireHeld = () => {
      if (
        this.entries.get(documentId) !== entry ||
        entry.observation !== token ||
        entry.phase !== 'open' ||
        this.aggregateClose
      )
        throw Error('Document observation is no longer current.');
    };
    const requireBaseline = (expectedDiskRevision: string) => {
      requireHeld();
      const saved = this.autosave.state(documentId);
      if (
        !settled ||
        saved.status === 'writing' ||
        saved.diskRevision !== expectedDiskRevision
      )
        throw Error('Observation baseline is unsettled or stale.');
      return saved;
    };
    const retain = (
      expected: SourceWitness,
      expectedDiskRevision: string,
      update: { observed?: ObservedSource; issue?: DocumentObservationIssue },
    ) => {
      const saved = requireBaseline(expectedDiskRevision);
      if (!this.current(entry, expected))
        throw Error('Observation source capture is stale.');
      entry.externalObservation = {
        base: entry.externalObservation?.base ?? {
          sessionId: documentId,
          ...saved.persisted,
        },
        diskRevision: expectedDiskRevision,
        ...(entry.externalObservation?.observed
          ? { observed: entry.externalObservation.observed }
          : {}),
        ...update,
      };
      entry.externalPause = persistence;
      this.notify(entry);
    };
    return {
      settled: async () => {
        requireHeld();
        await persistence.settled();
        requireHeld();
        settled = true;
      },
      retainExternal: (expected, expectedDiskRevision, observed) => {
        if (
          typeof observed.source !== 'string' ||
          !this.withinBudget(observed.source, documentId) ||
          typeof observed.diskRevision !== 'string' ||
          !observed.diskRevision ||
          observed.diskRevision === expectedDiskRevision
        )
          throw Error('Invalid external source retention.');
        retain(expected, expectedDiskRevision, { observed: { ...observed } });
      },
      retainReadFailure: (expected, expectedDiskRevision, issue) => {
        if (
          ![
            'missing',
            'permission',
            'invalid',
            'unstable',
            'retired',
            'unreadable',
          ].includes(issue)
        )
          throw Error('Invalid observation issue.');
        retain(expected, expectedDiskRevision, { issue });
      },
      confirmUnchanged: (expectedDiskRevision) => {
        requireBaseline(expectedDiskRevision);
        // Returning to the base cannot silently discard a retained competing version.
        if (entry.externalObservation?.observed)
          throw Error('A retained external version requires reconciliation.');
        entry.externalObservation = undefined;
        entry.externalPause = undefined;
        this.notify(entry);
      },
      adopt: (expected, expectedDiskRevision, observed) => {
        requireBaseline(expectedDiskRevision);
        const retained = entry.externalObservation?.observed;
        if (
          (retained &&
            (retained.source !== observed.source ||
              retained.diskRevision !== observed.diskRevision)) ||
          !this.current(entry, expected) ||
          entry.unapplied ||
          entry.retainedFailures.length ||
          expected.editorRevision >= Number.MAX_SAFE_INTEGER ||
          typeof observed.source !== 'string' ||
          !this.withinBudget(observed.source, documentId)
        )
          throw Error(
            'External source competes with current or unapplied text.',
          );
        const previous = { ...entry.witness };
        const next = {
          sessionId: documentId,
          editorRevision: previous.editorRevision + 1,
          source: observed.source,
        };
        persistence.adopt(
          { documentId, ...expected, diskRevision: expectedDiskRevision },
          { documentId, ...next, diskRevision: observed.diskRevision },
        );
        // No callbacks/awaits between persistence and canonical acceptance.
        // Queued subscribers can only observe the complete new transaction.
        entry.witness = next;
        entry.externalCheckpoint = previous;
        entry.externalObservation = undefined;
        entry.externalPause = undefined;
        this.notify(entry);
        return { ...next };
      },
      release: () => {
        if (entry.observation !== token) return;
        entry.observation = undefined;
        // Known external data/failures outlive a worker. Cleanup never chooses a winner.
        if (!entry.externalObservation) {
          entry.externalPause = undefined;
          persistence.release();
        }
        this.notify(entry);
      },
    };
  }

  subscribe(documentId: string, listener: Listener): () => void {
    const entry = this.get(documentId);
    const subscription = { listener };
    entry.listeners.add(subscription);
    this.notify(entry, subscription);
    return () => {
      entry.listeners.delete(subscription);
      entry.pendingListeners.delete(subscription);
    };
  }

  /** Editor draft signal only; it is not accepted source or retained durability. */
  setUnapplied(documentId: string, pending: boolean) {
    const entry = this.get(documentId);
    if (entry.unapplied === pending) return;
    entry.unapplied = pending;
    this.invalidateAggregate(entry);
    this.notify(entry);
  }

  flush(documentId?: string): Promise<void> {
    return this.autosave.flush(documentId);
  }

  async retrySave(documentId: string): Promise<void> {
    const entry = this.get(documentId);
    if (this.aggregateClose || entry.phase !== 'open')
      throw Error('Document close is pending or uncertain.');
    this.autosave.retry(documentId);
    await this.autosave.flush(documentId);
  }

  /** Called only after acknowledged recovery or the user's explicit warned discard. */
  resolveRetained(documentId: string, batch: SourceBatch): void {
    const entry = this.get(documentId);
    if (
      this.aggregateClose ||
      entry.phase !== 'open' ||
      !validSourceWitness(batch.expected) ||
      batch.expected.sessionId !== documentId ||
      typeof batch.source !== 'string'
    )
      throw Error('Retained attempt resolution refused.');
    const index = entry.retainedFailures.findIndex(
      (retained) =>
        sameSourceWitness(retained.expected, batch.expected) &&
        retained.source === batch.source,
    );
    if (index < 0) throw Error('Retained attempt is no longer present.');
    entry.retainedFailures.splice(index, 1);
    this.notify(entry);
  }

  beginAggregateClose(): AggregateCloseAdmission {
    if (this.aggregateClose) throw Error('Aggregate close is already held.');
    const captured = [...this.entries.values()].map((entry) => ({
      entry,
      witness: { ...entry.witness },
    }));
    // Admission is atomic: reject the whole set before changing any phase.
    for (const { entry } of captured) {
      if (entry.phase !== 'open')
        throw Error('Document close is pending or uncertain.');
      this.requireApplied(entry);
    }
    const scope: AggregateClose = {
      captured,
      invalidated: false,
      uncertain: false,
    };
    this.aggregateClose = scope;
    for (const { entry } of captured) entry.phase = 'closing';
    for (const { entry } of captured) this.notify(entry);
    const requireHeld = () => {
      if (this.aggregateClose !== scope)
        throw Error('Aggregate close admission is no longer current.');
    };
    const requireIdentity = () => {
      requireHeld();
      if (this.entries.size !== captured.length)
        throw Error('Aggregate close identities changed.');
      for (const { entry, witness } of captured)
        if (
          this.entries.get(witness.sessionId) !== entry ||
          !sameSourceWitness(entry.witness, witness)
        )
          throw Error('Aggregate close identities changed.');
    };
    const requireApplied = () => {
      requireIdentity();
      if (scope.uncertain || scope.invalidated)
        throw Error('Aggregate close is invalidated or uncertain.');
      for (const { entry } of captured) {
        if (entry.phase !== 'closing')
          throw Error('Aggregate close phase changed.');
        this.requireApplied(entry);
      }
    };
    const assertCurrent = () => {
      requireApplied();
      for (const { witness } of captured) {
        const saved = this.autosave.state(witness.sessionId);
        if (saved.status !== 'saved' || !saved.durable || saved.error)
          throw Error('Aggregate close requires durable original-file writes.');
      }
    };
    return {
      flush: async () => {
        requireApplied();
        await this.autosave.flush();
        assertCurrent();
      },
      assertCurrent,
      abort: () => {
        requireIdentity();
        if (scope.uncertain)
          throw Error('Uncertain aggregate close cannot reopen documents.');
        for (const { entry } of captured)
          if (entry.phase !== 'closing')
            throw Error('Aggregate close phase changed.');
        this.aggregateClose = null;
        for (const { entry } of captured) entry.phase = 'open';
        for (const { entry } of captured) this.notify(entry);
      },
      markUncertain: (
        reason = Error('Aggregate native close acknowledgement is uncertain.'),
      ) => {
        requireIdentity();
        scope.uncertain = true;
        for (const { entry } of captured) {
          entry.phase = 'close-uncertain';
          entry.closeError = reason;
          this.notify(entry);
        }
      },
    };
  }

  async close(documentId: string): Promise<void> {
    if (this.aggregateClose) throw Error('Aggregate close admission is held.');
    const entry = this.get(documentId);
    if (entry.phase !== 'open')
      throw Error('Session close is pending or uncertain.');
    entry.phase = 'closing';
    entry.closeError = null;
    this.notify(entry);
    let admitted = false;
    try {
      this.requireApplied(entry);
      await this.autosave.flush(documentId);
      this.requireApplied(entry);
      admitted = true;
      await this.closeDocument(documentId);
      // A failed editor publication can arrive while the native close awaits.
      // Retain it and report uncertainty rather than releasing its only owner.
      this.requireApplied(entry);
      this.autosave.release(documentId);
      entry.unsubscribeAutosave();
      entry.listeners.clear();
      entry.pendingListeners.clear();
      this.entries.delete(documentId);
      this.retired.add(documentId);
    } catch (error) {
      entry.phase = admitted ? 'close-uncertain' : 'open';
      entry.closeError = error;
      this.notify(entry);
      throw error;
    }
  }

  private requireApplied(entry: Entry) {
    if (
      entry.unapplied ||
      entry.retainedFailures.length ||
      entry.observation ||
      entry.externalObservation
    )
      throw Error(
        'Unapplied text or pending observation prevents normal close.',
      );
  }

  private invalidateAggregate(entry: Entry) {
    if (
      this.aggregateClose?.captured.some((captured) => captured.entry === entry)
    )
      this.aggregateClose.invalidated = true;
  }

  private current(entry: Entry, expected: SourceWitness): boolean {
    return (
      this.entries.get(entry.witness.sessionId) === entry &&
      validSourceWitness(expected) &&
      sameSourceWitness(entry.witness, expected)
    );
  }

  private validate(entry: Entry, batch: SourceBatch): boolean {
    return (
      entry.phase === 'open' &&
      this.current(entry, batch.expected) &&
      entry.witness.editorRevision < Number.MAX_SAFE_INTEGER &&
      typeof batch.source === 'string' &&
      this.withinBudget(batch.source, entry.witness.sessionId)
    );
  }

  private withinBudget(source: string, replacing?: string): boolean {
    const bytes = new TextEncoder().encode(source).byteLength;
    if (bytes > this.budgets.maxDocumentBytes) return false;
    let total = bytes;
    for (const [id, entry] of this.entries)
      if (id !== replacing)
        total += new TextEncoder().encode(entry.witness.source).byteLength;
    return total <= this.budgets.maxLoadedBytes;
  }

  private get(documentId: string): Entry {
    const entry = this.entries.get(documentId);
    if (!entry) throw Error('Document session is not attached.');
    return entry;
  }

  private notify(entry: Entry, initial?: { listener: Listener }) {
    for (const subscription of initial ? [initial] : entry.listeners)
      entry.pendingListeners.add(subscription);
    if (entry.notificationPending || !entry.listeners.size) return;
    entry.notificationPending = true;
    queueMicrotask(() => {
      entry.notificationPending = false;
      const subscriptions = [...entry.pendingListeners];
      entry.pendingListeners.clear();
      for (const subscription of subscriptions) {
        if (this.entries.get(entry.witness.sessionId) !== entry) return;
        if (!entry.listeners.has(subscription)) continue;
        try {
          void Promise.resolve(
            subscription.listener(this.state(entry.witness.sessionId)),
          ).catch(() => {});
        } catch {
          /* Observers cannot affect persistence or publication. */
        }
      }
    });
  }
}
