import { useSyncExternalStore } from 'react';

interface OfflineState {
  online: boolean;
  ready: boolean;
  error: string;
  updateAvailable: boolean;
}

let current: OfflineState = {
  online: navigator.onLine,
  ready: false,
  error: '',
  updateAvailable: false,
};
let registration: ServiceWorkerRegistration | undefined;
let started = false;
const listeners = new Set<() => void>();
function publish(change: Partial<OfflineState>) {
  current = { ...current, ...change };
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => current;

export function useOffline() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Update only after the user chooses to reload and the caller commits edits. */
export function activateUpdate() {
  if (!registration?.waiting) return;
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => location.reload(),
    { once: true },
  );
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
}

export function startOffline() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => publish({ online: true }));
  window.addEventListener('offline', () => publish({ online: false }));
  if (!('serviceWorker' in navigator)) {
    publish({ error: 'Offline opening is unavailable in this browser.' });
    return;
  }
  void navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then(async (value) => {
      registration = value;
      publish({ updateAvailable: Boolean(value.waiting) });
      value.addEventListener('updatefound', () => {
        const worker = value.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            publish({ updateAvailable: Boolean(value.waiting) });
          } else if (worker.state === 'redundant') {
            publish({ error: 'Offline files could not finish downloading.' });
          }
        });
      });
      await navigator.serviceWorker.ready;
      publish({ ready: true, error: '' });
    })
    .catch(() => {
      publish({
        error: 'Offline files could not be saved. Online editing is available.',
      });
    });
}
