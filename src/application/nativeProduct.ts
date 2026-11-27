import type { createNativeWorkspace } from './nativeWorkspace';
import { sameSourceWitness, type SourceBatch } from '../editor/sourceWitness';
import type {
  LoadedProductDocument,
  NativeProductServices,
  ProductApplication,
  ProductSnapshot,
} from '../product/productApplication';

/** Application projection only. Source/history/grants stay in the existing workspace. */
export function createNativeProduct(
  workspace: ReturnType<typeof createNativeWorkspace>,
  services: NativeProductServices,
): ProductApplication {
  const { setCloseState, preserveAttempt } = services;
  const listeners = new Set<() => void>();
  const loaded = new Map<string, LoadedProductDocument>();
  const subscriptions = new Map<string, () => void>();
  const recoveryKeys = new Map<string, string>();
  const resolving = new Set<string>();
  const pendingRecovery = new Set<string>();
  let closing = false;
  let localError: string | null = null;
  let cache: ProductSnapshot;
  let fingerprint = '';
  let notificationPending = false;
  let hintQueue = Promise.resolve();
  let recoveryQueue = Promise.resolve();
  const copyBatch = (batch: SourceBatch): SourceBatch =>
    Object.freeze({
      expected: Object.freeze({ ...batch.expected }),
      source: batch.source,
    });
  function emit() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* Observers do not own application state. */
      }
    }
  }
  function error(message: string) {
    if (localError === message) return;
    localError = message;
    refresh();
  }
  function dirty(): boolean {
    const current = workspace.state();
    return (
      current.unresolvedCleanup > 0 ||
      current.sessions.some(({ sessionId }) => {
        const state = workspace.controller.state(sessionId);
        return (
          state.phase !== 'open' ||
          state.unapplied ||
          state.retainedFailures.length > 0 ||
          state.autosave.status !== 'saved' ||
          !state.autosave.durable
        );
      })
    );
  }
  function protect(): Promise<void> {
    // The old boolean IPC cannot atomically release OS-close admission against a
    // late draft. Keep protection asserted; native entry activation stays blocked.
    const state = { dirty: dirty(), busy: true };
    const pending = hintQueue.then(() => setCloseState(state));
    hintQueue = pending.catch(() => {
      error(
        'Native close protection could not be acknowledged. Activation remains blocked.',
      );
    });
    return pending;
  }
  function recoveryKey(id: string): string | null {
    const state = workspace.controller.state(id);
    if (state.autosave.status === 'saved' && state.autosave.durable)
      return null;
    return `${state.witness.editorRevision}:${state.autosave.persisted.editorRevision}:${state.autosave.diskRevision}:${state.autosave.durable}`;
  }
  function observeDocument(id: string) {
    void protect().catch(() => {});
    const key = recoveryKey(id);
    if (key === null || recoveryKeys.get(id) === key || pendingRecovery.has(id))
      return;
    pendingRecovery.add(id);
    recoveryQueue = recoveryQueue
      .then(async () => {
        const metadata = loaded.get(id);
        if (!metadata) return;
        const currentKey = recoveryKey(id);
        if (currentKey === null || recoveryKeys.get(id) === currentKey) return;
        recoveryKeys.set(id, currentKey);
        const state = workspace.controller.state(id);
        const batch = copyBatch({
          expected: {
            sessionId: id,
            editorRevision: state.autosave.persisted.editorRevision,
            source: state.autosave.persisted.source,
          },
          source: state.autosave.latest.source,
        });
        const acknowledgement = await preserveAttempt(
          Object.freeze({
            sessionId: id,
            logicalPath: metadata.logicalPath,
            batch,
          }),
        );
        if (acknowledgement.durable !== true)
          throw Error('Recovery not durable.');
      })
      .catch(() => {
        error(
          'Automatic recovery could not be confirmed. Accepted and retained text remains owned by its session.',
        );
      })
      .finally(() => {
        pendingRecovery.delete(id);
        if (loaded.has(id)) observeDocument(id);
      });
  }
  function refresh(notify = true): ProductSnapshot {
    const state = workspace.state();
    const ids = new Set(state.sessions.map((s) => s.sessionId));
    for (const [id, unsubscribe] of subscriptions)
      if (!ids.has(id)) {
        unsubscribe();
        subscriptions.delete(id);
        loaded.delete(id);
        recoveryKeys.delete(id);
      }
    for (const association of state.sessions) {
      if (!loaded.has(association.sessionId))
        loaded.set(
          association.sessionId,
          Object.freeze({
            sessionId: association.sessionId,
            logicalPath: association.logicalPath,
          }),
        );
      if (!subscriptions.has(association.sessionId))
        subscriptions.set(
          association.sessionId,
          workspace.controller.subscribe(association.sessionId, () =>
            observeDocument(association.sessionId),
          ),
        );
    }
    const value = {
      vaultLabel: state.vault?.displayPath ?? null,
      entries: (state.inventory?.entries ?? []).map((entry) => ({
        ...entry,
        loadedSessionId:
          state.sessions.find((s) => s.logicalPath === entry.logicalPath)
            ?.sessionId ?? null,
      })),
      loadedDocuments: [...loaded.values()],
      selectedSessionId: state.selectedSessionId,
      operation: state.operation,
      error: state.error ?? localError,
      unresolvedCleanup: state.unresolvedCleanup,
      closing,
    };
    const nextFingerprint = JSON.stringify(value);
    if (nextFingerprint !== fingerprint) {
      fingerprint = nextFingerprint;
      cache = Object.freeze({
        ...value,
        entries: Object.freeze(value.entries.map((e) => Object.freeze(e))),
        loadedDocuments: Object.freeze(value.loadedDocuments),
      });
      notificationPending = true;
    }
    if (notify && notificationPending) {
      notificationPending = false;
      emit();
    }
    return cache;
  }
  function admitted() {
    if (closing) throw Error('Aggregate document close is pending.');
  }
  async function perform(action: () => Promise<unknown>): Promise<void> {
    admitted();
    try {
      await protect();
      await action();
    } finally {
      refresh();
      void protect().catch(() => {});
    }
  }
  refresh();
  workspace.subscribe(() => {
    refresh();
    void protect().catch(() => {});
  });
  void protect().catch(() => {});
  return {
    snapshot: () => refresh(false),
    subscribe(changed) {
      listeners.add(changed);
      return () => {
        listeners.delete(changed);
      };
    },
    documents: {
      state: (id) => workspace.controller.state(id),
      subscribe: (id, changed) => workspace.controller.subscribe(id, changed),
      setUnapplied: (id, pending) =>
        workspace.controller.setUnapplied(id, pending),
    },
    session: (id) => workspace.session(id),
    loadedDocument(id) {
      refresh(false);
      const metadata = loaded.get(id);
      if (!metadata) throw Error('Document session is not loaded.');
      return metadata;
    },
    chooseVault: () => perform(() => workspace.choose()),
    refreshInventory: () => perform(() => workspace.refreshInventory()),
    open: (path) => perform(() => workspace.open(path)),
    create: (path, source) => perform(() => workspace.create(path, source)),
    select(id) {
      admitted();
      workspace.select(id);
      refresh();
    },
    retrySave: (id) =>
      perform(async () => {
        recoveryKeys.delete(id);
        await workspace.controller.retrySave(id);
      }),
    async retainAttempt(id, input) {
      // Reports remain admissible while aggregate publication is gated. They
      // invalidate close admission rather than being dropped to keep it clean.
      const batch = copyBatch(input);
      const state = workspace.controller.state(id);
      if (batch.expected.sessionId !== id)
        throw Error('Retained attempt belongs to another session.');
      const metadata = loaded.get(id);
      if (!metadata) throw Error('Document session is not loaded.');
      if (
        !state.retainedFailures.some(
          (f) =>
            sameSourceWitness(f.expected, batch.expected) &&
            f.source === batch.source,
        )
      )
        workspace.session(id).retainFailure(batch);
      const acknowledgement = await preserveAttempt(
        Object.freeze({
          sessionId: id,
          logicalPath: metadata.logicalPath,
          batch,
        }),
      );
      if (acknowledgement.durable !== true)
        throw Error(
          'The retained attempt has no durable recovery acknowledgement.',
        );
      void protect().catch(() => {});
    },
    async resolveAttempt(id, input, action) {
      admitted();
      if (action !== 'keep' && action !== 'discard')
        throw Error('Unknown retained-attempt resolution.');
      if (resolving.has(id))
        throw Error('A retained-attempt resolution is already running.');
      const batch = copyBatch(input);
      if (
        !workspace.controller
          .state(id)
          .retainedFailures.some(
            (f) =>
              sameSourceWitness(f.expected, batch.expected) &&
              f.source === batch.source,
          )
      )
        throw Error('The exact retained attempt is no longer available.');
      const metadata = loaded.get(id);
      if (!metadata) throw Error('Document session is not loaded.');
      resolving.add(id);
      try {
        if (action === 'keep') {
          const receipt = await preserveAttempt(
            Object.freeze({
              sessionId: id,
              logicalPath: metadata.logicalPath,
              batch,
            }),
          );
          if (receipt.durable !== true)
            throw Error(
              'The retained attempt has no durable recovery acknowledgement.',
            );
        }
        workspace.controller.resolveRetained(id, batch);
      } finally {
        resolving.delete(id);
        void protect().catch(() => {});
      }
    },
    closeDocument: (id) => perform(() => workspace.close(id)),
    async prepareClose() {
      admitted();
      const admission = workspace.beginAggregateClose();
      closing = true;
      refresh();
      try {
        await protect();
        await admission.flush();
        admission.assertCurrent();
        // No native release was requested: the existing async boolean command
        // lacks the generation-bound final acknowledgement required by this gate.
        throw Error(
          'Safe aggregate native close acknowledgement is unavailable. Native entry activation remains blocked.',
        );
      } catch (reason) {
        admission.abort();
        closing = false;
        error(
          reason instanceof Error
            ? reason.message
            : 'Aggregate close refused. Source retained.',
        );
        throw reason;
      } finally {
        void protect().catch(() => {});
      }
    },
  };
}
