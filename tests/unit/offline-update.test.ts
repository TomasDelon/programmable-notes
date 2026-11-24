import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture() {
  const worker = Object.assign(new EventTarget(), {
    state: 'installed' as ServiceWorkerState,
    postMessage: vi.fn(),
  });
  const registration = Object.assign(new EventTarget(), {
    waiting: worker as typeof worker | null,
    installing: null,
  });
  const container = Object.assign(new EventTarget(), {
    controller: null as typeof worker | null,
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  });
  const reload = vi.fn();
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: container });
  vi.stubGlobal('location', { reload });
  const api = await import('../../src/web/offline');
  api.startOffline();
  await Promise.resolve();
  await Promise.resolve();
  return {
    api,
    worker,
    registration,
    container,
    reload,
    control: () => {
      registration.waiting = null;
      container.controller = worker;
      container.dispatchEvent(new Event('controllerchange'));
    },
    activate: () => {
      worker.state = 'activated';
      worker.dispatchEvent(new Event('statechange'));
    },
  };
}

it('does not reload on controllerchange before activation finishes', async () => {
  const f = await fixture();
  const save = vi.fn(async () => true);
  const update = f.api.activateUpdate(save);
  expect(f.api.activateUpdate(save)).toBe(update);
  expect(f.worker.postMessage).toHaveBeenCalledOnce();
  f.worker.state = 'activating';
  f.control();
  expect(f.reload).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  f.activate();
  expect(await update).toBe(true);
  expect(save).toHaveBeenCalledOnce();
  expect(f.reload).toHaveBeenCalledOnce();
  f.container.dispatchEvent(new Event('controllerchange'));
  expect(f.reload).toHaveBeenCalledOnce();
});
it('also waits for ownership when activation completes before controllerchange', async () => {
  const f = await fixture();
  const save = vi.fn(async () => true);
  const update = f.api.activateUpdate(save);
  f.activate();
  await Promise.resolve();
  expect(f.reload).not.toHaveBeenCalled();
  f.control();
  expect(await update).toBe(true);
  expect(f.reload).toHaveBeenCalledOnce();
});
it('keeps the page open after an unconfirmed save and allows an explicit retry', async () => {
  const f = await fixture();
  const save = vi.fn(async () => false);
  const update = f.api.activateUpdate(save);
  f.control();
  f.activate();
  expect(await update).toBe(false);
  expect(f.reload).not.toHaveBeenCalled();
  const retry = vi.fn(async () => true);
  expect(await f.api.activateUpdate(retry)).toBe(true);
  expect(retry).toHaveBeenCalledOnce();
  expect(f.reload).toHaveBeenCalledOnce();
});
it('times out closed and ignores activation arriving after the failed attempt', async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const save = vi.fn(async () => true);
  const update = f.api.activateUpdate(save);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await update).toBe(false);
  f.control();
  f.activate();
  await Promise.resolve();
  expect(save).not.toHaveBeenCalled();
  expect(f.reload).not.toHaveBeenCalled();
});

it('never reloads when a save completes after the activation attempt timed out', async () => {
  vi.useFakeTimers();
  const f = await fixture();
  let finishSave!: (value: boolean) => void;
  const update = f.api.activateUpdate(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  f.control();
  f.activate();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await update).toBe(false);
  finishSave(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(f.reload).not.toHaveBeenCalled();
});
