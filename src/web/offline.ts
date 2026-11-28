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

let reloadWorker: ServiceWorker | undefined;
let activation: Promise<boolean> | undefined;

/** Only the editor may request an update; recheck its save after activation. */
export function activateUpdate(
  beforeReload: () => Promise<boolean>,
): Promise<boolean> {
  if (activation) return activation;
  const worker = registration?.waiting ?? reloadWorker;
  if (!worker) return Promise.resolve(false);
  reloadWorker = worker;
  const container = navigator.serviceWorker;
  const task = new Promise<boolean>((resolve) => {
    let settled = false;
    let saving = false;
    let timer = -1;
    const cleanup = () => {
      window.clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      container.removeEventListener('controllerchange', changed);
    };
    const finish = (success: boolean, error = '') => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error)
        publish({
          error,
          updateAvailable: Boolean(registration?.waiting || reloadWorker),
        });
      resolve(success);
    };
    const reloadIfReady = async () => {
      if (settled) return;
      if (worker.state === 'redundant') {
        reloadWorker = undefined;
        finish(
          false,
          'The app update was replaced. Your workspace stays open; try the update again.',
        );
        return;
      }
      // controllerchange can precede completion of activate/waitUntil in WebKit.
      // Reloading there can abandon activation; require both acknowledgements.
      if (
        saving ||
        worker.state !== 'activated' ||
        container.controller !== worker
      )
        return;
      saving = true;
      try {
        const saved = await beforeReload();
        if (settled) return;
        if (!saved) {
          finish(
            false,
            'The app could not confirm a completed save. Your workspace stays open.',
          );
          return;
        }
        if (worker.state !== 'activated' || container.controller !== worker) {
          finish(
            false,
            'The app update changed before reload. Your workspace stays open.',
          );
          return;
        }
        location.reload();
        reloadWorker = undefined;
        publish({ error: '', updateAvailable: false });
        finish(true);
      } catch {
        finish(
          false,
          'The app update could not finish. Your workspace stays open.',
        );
      }
    };
    const changed = () => {
      void reloadIfReady();
    };
    timer = window.setTimeout(
      () =>
        finish(
          false,
          'The app update did not finish. Your workspace stays open; try the update again.',
        ),
      15_000,
    );
    worker.addEventListener('statechange', changed);
    container.addEventListener('controllerchange', changed);
    try {
      if (registration?.waiting === worker)
        worker.postMessage({ type: 'ACTIVATE_UPDATE' });
      changed();
    } catch {
      finish(
        false,
        'The app update could not start. Your workspace stays open.',
      );
    }
  });
  activation = task;
  void task.then(() => {
    if (activation === task) activation = undefined;
  });
  return task;
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
