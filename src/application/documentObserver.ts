import type { PrepareExternalHistory } from '../editor/sourceWitness';
import type {
  DocumentSessions,
  DocumentObservationReservation,
} from './documentSessions';
import type { NativeSessionObservation } from '../documents/nativeObservation';

export interface DocumentObserverHost {
  readonly controller: Pick<DocumentSessions, 'state' | 'reserveObservation'>;
  readonly observation: NativeSessionObservation & {
    scope(sessionId: string): { isCurrent(): boolean };
  };
}

/** One loaded grant owns one watch and at most one checked read. No source authority. */
export function createDocumentObserver(
  host: DocumentObserverHost,
  sessionId: string,
  canAdopt: () => boolean,
  prepareHistory?: PrepareExternalHistory,
) {
  const { controller, observation } = host;
  let watchId: string | undefined;
  let stopped = false;
  let flight: Promise<void> | undefined;
  let stopFlight: Promise<void> | undefined;
  let checking = false;
  let readDispatched = false;
  let forceRequested = false;

  async function reconcile() {
    let lease: DocumentObservationReservation | undefined;
    let reading = false;
    let baseline: string | undefined;
    try {
      if (stopped) return;
      lease = controller.reserveObservation(sessionId);
      await lease.settled();
      if (stopped) return;
      const state = controller.state(sessionId);
      baseline = state.autosave.diskRevision;
      if (!watchId) {
        try {
          watchId = await observation.watch(sessionId, baseline);
        } catch {
          // Notifications are hints. Checked periodic reads remain authoritative.
        }
      }
      if (stopped) return;
      const scope = observation.scope(sessionId);
      reading = true;
      readDispatched = true;
      const result = await observation.read(sessionId, baseline);
      const latest = controller.state(sessionId);
      if (stopped || !scope.isCurrent()) {
        // Discard the stale payload, but do not resume writes over unknown disk state.
        lease.retainReadFailure(latest.witness, baseline, 'unstable');
        return;
      }
      if (result.status === 'unavailable') {
        lease.retainReadFailure(latest.witness, baseline, result.reason);
      } else if (result.status === 'unchanged') {
        if (!latest.externalObservation?.observed)
          lease.confirmUnchanged(baseline);
      } else {
        const observed = {
          source: result.source,
          diskRevision: result.revision,
        };
        lease.retainExternal(latest.witness, baseline, observed);
        // Passive native DOM/IME readiness and scope are checked in this same stack.
        // No callback or await may separate these checks from canonical adoption.
        if (canAdopt() === true) {
          try {
            const commitHistory = prepareHistory?.(
              state.witness,
              observed.source,
            );
            if (commitHistory === null || !scope.isCurrent()) return;
            lease.adopt(state.witness, baseline, observed);
            commitHistory?.();
          } catch {
            // Preparation/canonical guards refuse competition without consuming history.
          }
        }
      }
    } catch {
      if (reading && lease && baseline) {
        // A transport failure is not evidence of an empty or unchanged file.
        try {
          lease.retainReadFailure(
            controller.state(sessionId).witness,
            baseline,
            'unreadable',
          );
        } catch {
          // A retired/closing owner cannot publish late state.
        }
      }
    } finally {
      readDispatched = false;
      lease?.release();
    }
  }

  function run(force: boolean): Promise<void> {
    if (stopped) return Promise.resolve();
    if (flight) {
      if (force && (!checking || readDispatched)) forceRequested = true;
      return flight;
    }
    flight = (async () => {
      let changed = force || !watchId;
      if (!changed && watchId) {
        try {
          changed = await observation.poll(sessionId, watchId);
        } catch {
          changed = true;
        }
      }
      changed ||= forceRequested;
      forceRequested = false;
      if (!stopped && changed) {
        checking = true;
        do {
          forceRequested = false;
          await reconcile();
        } while (!stopped && forceRequested);
      }
    })().finally(() => {
      flight = undefined;
      checking = false;
      forceRequested = false;
    });
    return flight;
  }

  return Object.freeze({
    reconcile: () => run(true),
    poll: () => run(false),
    stop(): Promise<void> {
      if (!stopFlight) {
        stopped = true;
        stopFlight = (async () => {
          await flight;
          if (watchId) {
            const token = watchId;
            watchId = undefined;
            await observation.unwatch(sessionId, token);
          }
        })();
      }
      return stopFlight;
    },
  });
}
