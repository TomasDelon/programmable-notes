import type { createNativeWorkspace } from './nativeWorkspace';
import type { AggregateCloseAdmission } from './documentSessions';
import { sameSourceWitness, type SourceBatch } from '../editor/sourceWitness';
import type {
  LoadedProductDocument,
  NativeProductServices,
  ProductApplication,
  ProductSnapshot,
  ProductCloseState,
  ProductCloseResolution,
  ProductCloseOutcome,
  ProductRecoveryState,
} from '../product/productApplication';

/** Application projection only. Source/history/grants stay in the existing workspace. */
export function createNativeProduct(
  workspace: ReturnType<typeof createNativeWorkspace>,
  services: NativeProductServices,
): ProductApplication {
  const { setCloseState, preserveAttempt, closeGuard } = services;
  const listeners = new Set<() => void>();
  const loaded = new Map<string, LoadedProductDocument>();
  const subscriptions = new Map<string, () => void>();
  const recoveryKeys = new Map<string, string>();
  const resolving = new Set<string>();
  const pendingRecovery = new Set<string>();
  const recoveryPort = services.recovery;
  let structuralGeneration = 0;
  let recoveryFlight = false;
  let recoveryState: ProductRecoveryState = {
    versions: [],
    warning: false,
    operation: null,
    attempt: null,
  };
  let closing = false;
  let closeUncertain = false;
  let closeActive = false;
  let closeFlight: Promise<ProductCloseOutcome> | null = null;
  let capturedCloseRequest: string | null = null;
  let retiredCloseRequest: string | null = null;
  let nativeCloseState: ProductCloseState = { phase: 'idle', request: null };
  let stopCloseObserver: (() => void) | null = null;
  let observerGeneration = 0;
  let productOperations = 0;
  let commitDispatched = false;
  let heldAdmission: AggregateCloseAdmission | null = null;
  let hintError: unknown = null;
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
    // Boolean hints never authorize close. A negotiated guard protects the OS
    // window independently; legacy/no-guard callers remain permanently protected.
    const state = {
      dirty: dirty(),
      busy:
        !closeGuard ||
        closing ||
        productOperations > 0 ||
        !!workspace.state().operation ||
        resolving.size > 0 ||
        pendingRecovery.size > 0,
    };
    const pending = hintQueue.then(async () => {
      try {
        await setCloseState(state);
        hintError = null;
      } catch (reason) {
        hintError = reason;
        throw reason;
      }
    });
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
      ...(recoveryPort ? { recovery: recoveryState } : {}),
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
      closeRequestId: closeActive
        ? capturedCloseRequest
        : nativeCloseState.phase === 'requested'
          ? nativeCloseState.request
          : null,
      closeUncertain,
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
    if (closing || closeActive)
      throw Error('Aggregate document close is pending.');
  }
  async function perform(action: () => Promise<unknown>): Promise<void> {
    admitted();
    productOperations++;
    try {
      await protect();
      await action();
    } finally {
      productOperations--;
      refresh();
      void protect().catch(() => {});
    }
  }
  function uncertain(reason: unknown): ProductCloseOutcome {
    closing = true;
    closeUncertain = true;
    if (heldAdmission) heldAdmission.markUncertain(reason);
    error(
      'Native close acknowledgement is uncertain. Existing source and identities remain protected.',
    );
    refresh();
    return 'uncertain';
  }
  function validState(state: ProductCloseState): boolean {
    if (!state || typeof state !== 'object') return false;
    if (state.phase === 'idle') return state.request === null;
    if (state.phase === 'requested' || state.phase === 'committing')
      return typeof state.request === 'string' && state.request.length > 0;
    return (
      state.phase === 'uncertain' &&
      (state.request === null ||
        (typeof state.request === 'string' && state.request.length > 0))
    );
  }
  function startObserver() {
    if (!closeGuard || stopCloseObserver) return;
    const generation = ++observerGeneration;
    const current = () =>
      generation === observerGeneration && listeners.size > 0;
    try {
      const stop = closeGuard.observe(
        (state) => {
          if (!current()) return;
          if (!validState(state)) {
            if (commitDispatched)
              uncertain(Error('Malformed close observation.'));
            else
              error(
                'Native close state could not be verified. Window close remains guarded.',
              );
            return;
          }
          if (
            state.phase === 'requested' &&
            state.request === retiredCloseRequest
          )
            return;
          nativeCloseState = Object.freeze({
            phase: state.phase,
            request: state.request,
          });
          if (
            state.phase === 'uncertain' ||
            (state.phase === 'committing' && !commitDispatched)
          )
            uncertain(
              Error(
                'Native close state changed outside the current close request.',
              ),
            );
          else refresh();
        },
        () => {
          if (!current()) return;
          if (commitDispatched)
            uncertain(Error('Native close observation was interrupted.'));
          else
            error(
              'Native close state could not be read. Window close remains guarded.',
            );
        },
      );
      if (current()) stopCloseObserver = stop;
      else stop();
    } catch {
      error(
        'Native close observation could not start. Window close remains guarded.',
      );
    }
  }
  async function drainCloseWork() {
    for (;;) {
      const hints = hintQueue,
        recovery = recoveryQueue;
      await recovery;
      await hints;
      if (
        hints === hintQueue &&
        recovery === recoveryQueue &&
        pendingRecovery.size === 0
      )
        break;
    }
    if (hintError) throw Error('Native close protection was not acknowledged.');
    if (
      productOperations ||
      resolving.size ||
      workspace.state().operation ||
      workspace.state().unresolvedCleanup
    )
      throw Error('A document operation is still running.');
  }
  function exactReply(reply: ProductCloseResolution, request: string): boolean {
    return (
      !!reply &&
      reply.request === request &&
      validState(reply.state) &&
      ['cancelled', 'committing', 'refused'].includes(reply.status)
    );
  }
  async function guardedClose(
    detachEditor?: () => boolean,
  ): Promise<ProductCloseOutcome> {
    const request = capturedCloseRequest!;
    const requireRequest = () => {
      if (
        closeUncertain ||
        nativeCloseState.phase !== 'requested' ||
        nativeCloseState.request !== request
      )
        throw Error('Native close request is no longer current.');
    };
    const cancel = async (): Promise<ProductCloseOutcome> => {
      try {
        const reply = await closeGuard!.resolve(request, 'cancel');
        if (
          !exactReply(reply, request) ||
          reply.status !== 'cancelled' ||
          reply.reason !== null ||
          reply.state.phase !== 'idle' ||
          reply.state.request !== null ||
          closeUncertain ||
          nativeCloseState.phase === 'committing' ||
          nativeCloseState.phase === 'uncertain'
        )
          return uncertain(
            Error('Native close cancellation was not confirmed.'),
          );
        // A new OS request may arrive after native cancellation but before its
        // reply. Keep it buffered until this flight has actually completed.
        if (
          nativeCloseState.phase !== 'requested' ||
          nativeCloseState.request === request
        )
          nativeCloseState = reply.state;
        heldAdmission?.abort();
        heldAdmission = null;
        retiredCloseRequest = request;
        closing = false;
        return 'editing';
      } catch (reason) {
        return uncertain(reason);
      }
    };
    try {
      requireRequest();
      if (
        productOperations ||
        resolving.size ||
        workspace.state().operation ||
        workspace.state().unresolvedCleanup
      )
        throw Error('Finish the current operation before closing.');
      if (!detachEditor || !detachEditor())
        throw Error('Finish the current edit before closing.');
      heldAdmission = workspace.beginAggregateClose();
      closing = true;
      refresh();
      await protect();
      await heldAdmission.flush();
      await drainCloseWork();
      heldAdmission.assertCurrent();
      requireRequest();
    } catch (reason) {
      error(
        reason instanceof Error
          ? reason.message
          : 'Close refused. Source retained.',
      );
      return cancel();
    }
    try {
      commitDispatched = true;
      const reply = await closeGuard!.resolve(request, 'commit');
      if (!exactReply(reply, request))
        return uncertain(Error('Native close response identity changed.'));
      if (
        reply.status === 'committing' &&
        reply.reason === null &&
        reply.state.phase === 'committing' &&
        reply.state.request === request &&
        !closeUncertain
      ) {
        // A late report is not permission to reopen after a possibly consumed
        // permit. Preserve it and make the final acknowledgement uncertain.
        heldAdmission!.assertCurrent();
        nativeCloseState = reply.state;
        return 'committing';
      }
      if (
        reply.status === 'refused' &&
        typeof reply.reason === 'string' &&
        reply.state.phase !== 'committing' &&
        reply.state.phase !== 'uncertain' &&
        !closeUncertain
      ) {
        commitDispatched = false; // Exact refusal proves this command armed no permit.
        return cancel();
      }
      return uncertain(Error('Native close response could not be verified.'));
    } catch (reason) {
      return uncertain(reason);
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
      if (listeners.size === 1) startObserver();
      return () => {
        listeners.delete(changed);
        if (listeners.size === 0) {
          observerGeneration++;
          const stop = stopCloseObserver;
          stopCloseObserver = null;
          try {
            stop?.();
          } catch {
            /* Retired observers never own source. */
          }
        }
      };
    },
    ...(recoveryPort
      ? {
          async refreshRecovery(signal: AbortSignal) {
            admitted();
            if (recoveryFlight)
              throw Error('A recovery operation is already running.');
            recoveryFlight = true;
            recoveryState = { ...recoveryState, operation: 'list' };
            refresh();
            try {
              await perform(async () => {
                if (signal.aborted)
                  throw Error('Recovery discovery was cancelled.');
                const catalog = await recoveryPort.list();
                if (signal.aborted)
                  throw Error('Recovery discovery was cancelled.');
                recoveryState = { ...recoveryState, ...catalog };
              });
            } finally {
              recoveryFlight = false;
              recoveryState = { ...recoveryState, operation: null };
              refresh();
            }
          },
          async restoreRecoveryCopy(
            file: string,
            path: string,
            signal: AbortSignal,
          ) {
            admitted();
            if (recoveryFlight)
              throw Error('A recovery operation is already running.');
            if (
              recoveryState.attempt?.uncertain ||
              workspace.state().unresolvedCleanup
            )
              throw Error(
                'Recovery creation outcome is unresolved. Do not retry automatically.',
              );
            const version = recoveryState.versions.find(
              (entry) => entry.file === file,
            );
            const initial = workspace.state();
            const generation = structuralGeneration;
            const vaultId = initial.vault?.vaultId;
            const selected = initial.selectedSessionId;
            if (!version || !vaultId)
              throw Error(
                'Choose a vault and a retained recovery version first.',
              );
            const current = () => {
              const state = workspace.state();
              if (
                signal.aborted ||
                generation !== structuralGeneration ||
                state.vault?.vaultId !== vaultId ||
                state.selectedSessionId !== selected ||
                state.unresolvedCleanup ||
                closing ||
                closeActive
              )
                throw Error(
                  'Recovery creation was cancelled or its destination changed.',
                );
            };
            current();
            recoveryFlight = true;
            recoveryState = {
              ...recoveryState,
              operation: 'read',
              attempt: null,
            };
            refresh();
            try {
              await perform(async () => {
                current();
                const source = await recoveryPort.read(version);
                current();
                if (
                  typeof source !== 'string' ||
                  new TextEncoder().encode(source).length !==
                    version.metadata.sourceBytes ||
                  version.metadata.sourceBytes > 500_000
                )
                  throw Error(
                    'Recovery source does not match the selected version.',
                  );
                recoveryState = {
                  ...recoveryState,
                  operation: 'create',
                  attempt: Object.freeze({
                    version,
                    path,
                    source,
                    uncertain: false,
                  }),
                };
                refresh();
                // Last synchronous check before the existing exclusive file authority.
                current();
                try {
                  await workspace.create(path, source);
                } catch (reason) {
                  recoveryState = {
                    ...recoveryState,
                    attempt: Object.freeze({
                      version,
                      path,
                      source,
                      uncertain: workspace.state().unresolvedCleanup > 0,
                    }),
                  };
                  throw reason;
                }
                recoveryState = { ...recoveryState, attempt: null };
              });
            } finally {
              recoveryFlight = false;
              recoveryState = { ...recoveryState, operation: null };
              refresh();
            }
          },
        }
      : {}),
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
    chooseVault: () => {
      structuralGeneration++;
      return perform(() => workspace.choose());
    },
    refreshInventory: () => perform(() => workspace.refreshInventory()),
    open: (path) => {
      structuralGeneration++;
      return perform(() => workspace.open(path));
    },
    create: (path, source) => {
      structuralGeneration++;
      return perform(() => workspace.create(path, source));
    },
    select(id) {
      structuralGeneration++;
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
    closeDocument: (id) => {
      structuralGeneration++;
      return perform(() => workspace.close(id));
    },
    prepareClose(detachEditor) {
      structuralGeneration++;
      if (closeUncertain) return Promise.resolve('uncertain');
      if (closeFlight) return closeFlight;
      if (closeGuard) {
        if (closing || closeUncertain) return Promise.resolve('uncertain');
        if (nativeCloseState.phase !== 'requested' || !nativeCloseState.request)
          return Promise.resolve('editing');
        closeActive = true;
        capturedCloseRequest = nativeCloseState.request;
        // Reserve the promise before calling trusted synchronous editor code:
        // disposal notifications may reenter application observers in this task.
        let settle!: (outcome: ProductCloseOutcome) => void;
        const flight = new Promise<ProductCloseOutcome>((resolve) => {
          settle = resolve;
        });
        closeFlight = flight;
        void guardedClose(detachEditor).then(
          (outcome) => {
            if (!closing && !closeUncertain) {
              closeActive = false;
              capturedCloseRequest = null;
              closeFlight = null;
            }
            settle(outcome);
            refresh();
          },
          (reason: unknown) => {
            settle(uncertain(reason));
          },
        );
        return flight;
      }
      return (async (): Promise<ProductCloseOutcome> => {
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
      })();
    },
  };
}
