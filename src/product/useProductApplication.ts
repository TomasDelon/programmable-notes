import { useMemo, useSyncExternalStore } from 'react';
import type { ProductApplication, ProductSnapshot } from './productApplication';

/** Structural observation only; selected source stays in DocumentSessions. */
function observeProduct(application: ProductApplication) {
  let snapshot = application.snapshot();
  return {
    read: () => snapshot,
    subscribe(changed: () => void) {
      let active = true;
      const refresh = () => {
        if (!active) return;
        snapshot = application.snapshot();
        changed();
      };
      const unsubscribe = application.subscribe(refresh);
      refresh();
      return () => {
        active = false;
        unsubscribe();
      };
    },
  };
}
export function useProductApplication(
  application: ProductApplication,
): ProductSnapshot {
  const observation = useMemo(() => observeProduct(application), [application]);
  return useSyncExternalStore(
    observation.subscribe,
    observation.read,
    observation.read,
  );
}
