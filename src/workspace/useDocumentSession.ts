import { useMemo, useSyncExternalStore } from 'react';
import type {
  DocumentSessions,
  DocumentSessionState,
} from '../application/documentSessions';

type Controller = Pick<DocumentSessions, 'state' | 'subscribe'>;
type Snapshot = { value: DocumentSessionState | null } | { error: unknown };

function observeSession(controller: Controller, sessionId: string | null) {
  // Controller reads allocate copies. React must instead read this cached projection.
  let snapshot: Snapshot = {
    value: sessionId === null ? null : controller.state(sessionId),
  };
  return {
    getSnapshot: () => {
      if ('error' in snapshot) throw snapshot.error;
      return snapshot.value;
    },
    subscribe: (changed: () => void) => {
      if (sessionId === null) return () => {};
      let active = true;
      const refresh = () => {
        if (!active) return;
        try {
          snapshot = { value: controller.state(sessionId) };
        } catch (error) {
          // Observer exceptions are guarded by the controller. Publish this error
          // through React instead of silently leaving a stale/empty projection.
          snapshot = { error };
        }
        changed();
      };
      const unsubscribe = controller.subscribe(sessionId, refresh);
      // Close the render-to-subscribe gap, including hosts that do not replay.
      refresh();
      return () => {
        active = false;
        unsubscribe();
      };
    },
  };
}

/** Observes accepted sessions; publication, history and persistence remain controller-owned. */
export function useDocumentSession(
  controller: Controller,
  sessionId: string | null,
): DocumentSessionState | null {
  const observation = useMemo(
    () => observeSession(controller, sessionId),
    [controller, sessionId],
  );
  return useSyncExternalStore(
    observation.subscribe,
    observation.getSnapshot,
    observation.getSnapshot,
  );
}
