import type { PrepareExternalHistory } from '../editor/sourceWitness';
import {
  createDocumentObserver,
  type DocumentObserverHost,
} from './documentObserver';

interface ObservationWorkspace extends DocumentObserverHost {
  state(): { readonly sessions: readonly { readonly sessionId: string }[] };
  subscribe(changed: () => void): () => void;
}

/** One application owner; no watch replacement on document selection. */
export function createWorkspaceObserver(
  workspace: ObservationWorkspace,
  canAdopt: (sessionId: string) => boolean,
  onError: (reason: unknown) => void,
  prepareHistory?: PrepareExternalHistory,
) {
  const documents = new Map<
    string,
    ReturnType<typeof createDocumentObserver>
  >();
  const pending = new Set<Promise<void>>();
  let stopped = false;
  let cleanupError: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopFlight: Promise<void> | undefined;
  let polls = 0;
  function track(job: Promise<void>): Promise<void> {
    pending.add(job);
    void job.then(
      () => pending.delete(job),
      (reason: unknown) => {
        pending.delete(job);
        cleanupError = reason;
        onError(reason);
      },
    );
    return job;
  }
  function synchronize() {
    if (stopped) return;
    const ids = new Set(workspace.state().sessions.map((s) => s.sessionId));
    for (const [id, document] of documents) {
      if (!ids.has(id)) {
        documents.delete(id);
        void track(document.stop());
      }
    }
    for (const id of ids) {
      if (!documents.has(id) && workspace.controller.state(id).phase === 'open')
        documents.set(
          id,
          createDocumentObserver(
            workspace,
            id,
            () => canAdopt(id),
            prepareHistory,
          ),
        );
    }
  }
  function run(force: boolean): Promise<void> {
    if (stopped) return Promise.resolve();
    synchronize();
    return track(
      Promise.all(
        [...documents.values()].map((document) =>
          force ? document.reconcile() : document.poll(),
        ),
      ).then(() => {}),
    );
  }
  function schedule() {
    if (stopped) return;
    // One timer is scheduled only after its batch settles: slow IPC cannot pile up.
    timer = setTimeout(() => {
      timer = undefined;
      polls++;
      void run(polls % 8 === 0)
        .finally(schedule)
        .catch(() => {});
    }, 250);
  }
  const unsubscribe = workspace.subscribe(() => {
    if (!stopped) void run(true).catch(() => {});
  });
  // Avoid IPC during construction and permit the caller to establish its owner.
  void Promise.resolve()
    .then(() => run(true))
    .finally(schedule)
    .catch(() => {});
  function finish(cancel: boolean): Promise<void> {
    if (!stopFlight) {
      stopped = true;
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const owners = [...documents.values()];
      const jobs = [...pending];
      // Normal close drains a current authoritative read before retiring its owner.
      // Surface teardown cancels immediately and retains unknown disk state instead.
      const drains = cancel ? owners.map((document) => document.stop()) : [];
      stopFlight = (async () => {
        const outcomes = await Promise.allSettled([...jobs, ...drains]);
        if (!cancel)
          outcomes.push(
            ...(await Promise.allSettled(
              owners.map((document) => document.stop()),
            )),
          );
        documents.clear();
        // Cleanup is ownership work: a refusal cannot skip or outpace other drains.
        const failure = outcomes.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        if (cleanupError) throw cleanupError;
      })();
    }
    return stopFlight;
  }
  return Object.freeze({
    reconcile: () => run(true),
    quiesce: () => finish(false),
    stop: () => finish(true),
  });
}
