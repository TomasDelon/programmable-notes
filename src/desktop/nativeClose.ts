import { invoke } from '@tauri-apps/api/core';
import type {
  ProductCloseGuard,
  ProductCloseResolution,
  ProductCloseState,
} from '../product/productApplication';

/** Only these three fixed editor commands; never an arbitrary IPC gateway. */
export interface NativeClosePorts {
  enable(version: 1): Promise<unknown>;
  read(epoch: string): Promise<unknown>;
  resolve(
    epoch: string,
    request: string,
    action: 'cancel' | 'commit',
  ): Promise<unknown>;
}
const nativePorts: NativeClosePorts = {
  enable: (version) => invoke('enable_editor_close_guard', { version }),
  read: (epoch) => invoke('editor_close_state', { epoch }),
  resolve: (epoch, request, action) =>
    invoke('resolve_editor_close', { epoch, request, action }),
};
const POLL_MS = 250;
const DEADLINE_MS = 2000;
const NEGOTIATION_ERROR = 'Native close negotiation failed.';
const READ_ERROR = 'Native close state could not be verified.';
const RESOLUTION_ERROR = 'Native close outcome is uncertain.';
const token = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).length !== keys.length ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    !keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && 'value' in descriptor;
    })
  )
    throw Error('Invalid native close record.');
  return value as Record<string, unknown>;
}
function decodeState(
  value: unknown,
  expectedEpoch?: string,
): { epoch: string; state: ProductCloseState } {
  const data = record(value, ['version', 'epoch', 'phase', 'request']);
  if (
    data.version !== 1 ||
    !token(data.epoch) ||
    (expectedEpoch !== undefined && data.epoch !== expectedEpoch) ||
    !['idle', 'requested', 'committing', 'uncertain'].includes(
      data.phase as string,
    ) ||
    (data.request !== null && !token(data.request)) ||
    (data.phase === 'idle' && data.request !== null) ||
    ((data.phase === 'requested' || data.phase === 'committing') &&
      data.request === null)
  )
    throw Error('Invalid native close state.');
  return {
    epoch: data.epoch,
    state: Object.freeze({
      phase: data.phase as ProductCloseState['phase'],
      request: data.request as string | null,
    }),
  };
}
function decodeResolution(
  value: unknown,
  epoch: string,
  request: string,
  action: 'cancel' | 'commit',
): ProductCloseResolution {
  const data = record(value, ['status', 'epoch', 'request', 'reason', 'state']);
  if (data.epoch !== epoch || data.request !== request)
    throw Error('Invalid native close identity.');
  const { state } = decodeState(data.state, epoch);
  if (state.request !== null && state.request !== request)
    throw Error('Invalid native close request.');
  if (data.status === 'cancelled') {
    if (
      action !== 'cancel' ||
      data.reason !== null ||
      state.phase !== 'idle' ||
      state.request !== null
    )
      throw Error('Invalid cancellation.');
  } else if (data.status === 'committing') {
    if (
      action !== 'commit' ||
      data.reason !== null ||
      state.phase !== 'committing' ||
      state.request !== request
    )
      throw Error('Invalid commit.');
  } else if (data.status === 'refused') {
    if (
      data.reason ===
      'Native operation, dialog, update or renderer prevents close'
    ) {
      if (
        action !== 'commit' ||
        state.phase !== 'requested' ||
        state.request !== request
      )
        throw Error('Invalid native refusal.');
    } else if (data.reason === 'Stale editor close request') {
      if (state.phase === 'requested' && state.request === request)
        throw Error('Contradictory native refusal.');
    } else throw Error('Invalid native refusal.');
  } else throw Error('Invalid native close status.');
  return Object.freeze({
    status: data.status,
    request,
    reason: data.reason as string | null,
    state,
  });
}
async function bounded<T>(work: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error(message)), DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Negotiates before any product construction; the epoch never leaves this adapter. */
export async function negotiateNativeCloseGuard(
  ports: NativeClosePorts = nativePorts,
): Promise<ProductCloseGuard> {
  const bound = {
    enable: ports.enable,
    read: ports.read,
    resolve: ports.resolve,
  };
  let epoch: string;
  let latest: ProductCloseState;
  try {
    const decoded = decodeState(
      await bounded(bound.enable(1), NEGOTIATION_ERROR),
    );
    if (decoded.state.phase !== 'idle' || decoded.state.request !== null)
      throw Error(NEGOTIATION_ERROR);
    ({ epoch, state: latest } = decoded);
  } catch {
    throw Error(NEGOTIATION_ERROR);
  }
  const observers = new Set<{
    changed: (state: ProductCloseState) => void;
    onError: (reason: unknown) => void;
  }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reading = false;
  let resolving = false;
  let readFault = false;
  let generation = 0;
  let last: {
    request: string;
    action: 'cancel' | 'commit';
    status: 'pending' | 'refused' | 'settled' | 'uncertain';
  } | null = null;
  function cancelTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function reportReadError() {
    readFault = true;
    for (const observer of [...observers]) {
      if (!observers.has(observer)) continue;
      try {
        observer.onError(Error(READ_ERROR));
      } catch {
        /* Observers do not own transport. */
      }
    }
  }
  function schedule() {
    if (observers.size && !reading && !resolving && timer === undefined)
      timer = setTimeout(() => {
        timer = undefined;
        void poll();
      }, POLL_MS);
  }
  async function poll() {
    if (!observers.size || reading || resolving) return;
    reading = true;
    const cycle = generation;
    let expired = false;
    const deadline = setTimeout(() => {
      expired = true;
      // The physical read still occupies the shared slot after its observers
      // retire. Its fault belongs to that slot, not the retired subscription.
      reportReadError();
    }, DEADLINE_MS);
    try {
      const raw = await bound.read(epoch);
      if (expired || cycle !== generation || !observers.size) return;
      const decoded = decodeState(raw, epoch);
      latest = decoded.state;
      readFault = false;
      for (const observer of [...observers]) {
        if (!observers.has(observer)) continue;
        try {
          observer.changed(latest);
        } catch {
          /* Other observers still receive the state. */
        }
      }
    } catch {
      if (!expired && cycle === generation && observers.size) reportReadError();
    } finally {
      clearTimeout(deadline);
      reading = false;
      schedule();
    }
  }
  return Object.freeze({
    observe(changed, onError) {
      const observer = { changed, onError };
      observers.add(observer);
      if (readFault) {
        try {
          onError(Error(READ_ERROR));
        } catch {
          /* An observer cannot clear or replace the shared transport fault. */
        }
      }
      if (observers.size === 1) {
        generation++;
        void poll();
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        observers.delete(observer);
        if (!observers.size) {
          generation++;
          cancelTimer();
        }
      };
    },
    async resolve(request, action) {
      const mayCancelRefusal =
        last?.request === request &&
        last.action === 'commit' &&
        last.status === 'refused' &&
        action === 'cancel';
      if (
        !token(request) ||
        (action !== 'cancel' && action !== 'commit') ||
        resolving ||
        readFault ||
        latest.phase !== 'requested' ||
        latest.request !== request ||
        last?.status === 'uncertain' ||
        (last?.request === request && !mayCancelRefusal)
      )
        throw Error(RESOLUTION_ERROR);
      resolving = true;
      generation++;
      cancelTimer();
      const attempt = {
        request,
        action,
        status: 'pending' as 'pending' | 'refused' | 'settled' | 'uncertain',
      };
      last = attempt;
      try {
        const raw = await bounded(
          bound.resolve(epoch, request, action),
          RESOLUTION_ERROR,
        );
        const result = decodeResolution(raw, epoch, request, action);
        latest = result.state;
        attempt.status = result.status === 'refused' ? 'refused' : 'settled';
        return result;
      } catch {
        attempt.status = 'uncertain';
        throw Error(RESOLUTION_ERROR);
      } finally {
        resolving = false;
        schedule();
      }
    },
  } satisfies ProductCloseGuard);
}
