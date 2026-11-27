import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import {
  negotiateNativeCloseGuard,
  type NativeClosePorts,
} from '../../src/desktop/nativeClose';
const epoch = 'a'.repeat(32),
  request = 'b'.repeat(32);
const state = (phase = 'idle', requested: string | null = null) => ({
  version: 1,
  epoch,
  phase,
  request: requested,
});
function fixture() {
  return {
    enable: vi.fn<NativeClosePorts['enable']>(async () => state()),
    read: vi.fn<NativeClosePorts['read']>(async () =>
      state('requested', request),
    ),
    resolve: vi.fn<NativeClosePorts['resolve']>(
      async (
        _epoch: string,
        requested: string,
        action: 'cancel' | 'commit',
      ) => ({
        status: action === 'commit' ? 'committing' : 'cancelled',
        epoch,
        request: requested,
        reason: null,
        state: action === 'commit' ? state('committing', requested) : state(),
      }),
    ),
  } satisfies NativeClosePorts;
}
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(invoke).mockReset();
});
it('negotiates once, starts no idle polling, and strips the private epoch from observations', async () => {
  vi.useFakeTimers();
  const ports = fixture(),
    changed = vi.fn(),
    failed = vi.fn();
  const guard = await negotiateNativeCloseGuard(ports);
  expect(ports.enable).toHaveBeenCalledExactlyOnceWith(1);
  expect(ports.read).not.toHaveBeenCalled();
  const stop = guard.observe(changed, failed);
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).toHaveBeenCalledExactlyOnceWith({
    phase: 'requested',
    request,
  });
  expect(failed).not.toHaveBeenCalled();
  stop();
});
it('accepts exact commit or cancellation acknowledgements and never repeats a resolved request', async () => {
  vi.useFakeTimers();
  for (const action of ['cancel', 'commit'] as const) {
    const ports = fixture();
    const guard = await negotiateNativeCloseGuard(ports);
    const stop = guard.observe(vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    await expect(guard.resolve(request, action)).resolves.toEqual({
      status: action === 'commit' ? 'committing' : 'cancelled',
      request,
      reason: null,
      state:
        action === 'commit'
          ? { phase: 'committing', request }
          : { phase: 'idle', request: null },
    });
    await expect(guard.resolve(request, action)).rejects.toThrow(
      'Native close outcome is uncertain.',
    );
    expect(ports.resolve).toHaveBeenCalledExactlyOnceWith(
      epoch,
      request,
      action,
    );
    stop();
  }
});

it.each([
  null,
  [],
  { ...state(), version: 2 },
  { ...state(), extra: true },
  { ...state(), epoch: 'bad' },
  { ...state(), request },
  state('requested', request),
  state('committing', request),
  state('uncertain'),
  { ...state(), phase: 'closed' },
  Object.assign(Object.create({ inherited: true }), state()),
  Object.defineProperty({ ...state() }, 'phase', { get: () => 'idle' }),
])(
  'blocks invalid/non-idle negotiation without starting read or resolution',
  async (invalid) => {
    const ports = fixture();
    ports.enable.mockResolvedValueOnce(invalid as ReturnType<typeof state>);
    await expect(negotiateNativeCloseGuard(ports)).rejects.toThrow(
      'Native close negotiation failed.',
    );
    expect(ports.read).not.toHaveBeenCalled();
    expect(ports.resolve).not.toHaveBeenCalled();
  },
);
it('captures method bindings before the delayed negotiation completes', async () => {
  vi.useFakeTimers();
  const ports = fixture(),
    originalRead = ports.read,
    changed = vi.fn();
  let release!: (value: unknown) => void;
  ports.enable.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }) as ReturnType<typeof ports.enable>,
  );
  const waiting = negotiateNativeCloseGuard(ports);
  const replacement = vi.fn(async () => {
    throw Error('private replaced transport');
  });
  ports.read = replacement;
  release(state());
  const guard = await waiting;
  const stop = guard.observe(changed, vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  expect(originalRead).toHaveBeenCalledExactlyOnceWith(epoch);
  expect(replacement).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledOnce();
  stop();
});
it('shares one in-flight read across consumers and retired subscription lifetimes', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  let release!: (value: ReturnType<typeof state>) => void;
  ports.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const guard = await negotiateNativeCloseGuard(ports),
    old = vi.fn(),
    current = vi.fn();
  const stopOld = guard.observe(old, vi.fn());
  const stopSecond = guard.observe(vi.fn(), vi.fn());
  expect(ports.read).toHaveBeenCalledOnce();
  stopOld();
  stopSecond();
  const stopCurrent = guard.observe(current, vi.fn());
  await vi.advanceTimersByTimeAsync(1000);
  expect(ports.read).toHaveBeenCalledOnce();
  release(state('requested', request));
  await vi.advanceTimersByTimeAsync(0);
  expect(old).not.toHaveBeenCalled();
  expect(current).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(250);
  expect(ports.read).toHaveBeenCalledTimes(2);
  expect(current).toHaveBeenCalledExactlyOnceWith({
    phase: 'requested',
    request,
  });
  stopCurrent();
  await vi.advanceTimersByTimeAsync(5000);
  expect(ports.read).toHaveBeenCalledTimes(2);
});
it('reports a fixed deadline error without spawning reads behind an unresolved transport', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  ports.read.mockImplementationOnce(() => new Promise(() => {}));
  const guard = await negotiateNativeCloseGuard(ports),
    failed = vi.fn();
  const stop = guard.observe(vi.fn(), failed);
  await vi.advanceTimersByTimeAsync(10000);
  expect(ports.read).toHaveBeenCalledOnce();
  expect(failed).toHaveBeenCalledOnce();
  expect(String(failed.mock.calls[0]![0])).toBe(
    'Error: Native close state could not be verified.',
  );
  await expect(guard.resolve(request, 'commit')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  expect(ports.resolve).not.toHaveBeenCalled();
  stop();
});
it.each([
  { ...state(), epoch: 'c'.repeat(32) },
  { ...state('requested'), extra: true },
  state('requested'),
  state('committing'),
  state('idle', request),
  { ...state(), version: '1' },
  { ...state(), request: 9 },
])(
  'refuses contradictory or foreign read states with sanitized feedback',
  async (invalid) => {
    vi.useFakeTimers();
    const ports = fixture();
    ports.read.mockResolvedValueOnce(invalid as ReturnType<typeof state>);
    const guard = await negotiateNativeCloseGuard(ports),
      changed = vi.fn(),
      failed = vi.fn();
    const stop = guard.observe(changed, failed);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
    expect(String(failed.mock.calls[0]![0])).toBe(
      'Error: Native close state could not be verified.',
    );
    await expect(guard.resolve(request, 'commit')).rejects.toThrow(
      'Native close outcome is uncertain.',
    );
    expect(ports.resolve).not.toHaveBeenCalled();
    stop();
  },
);
it.each(['lost', 'malformed', 'timeout'] as const)(
  'does not retry a %s resolution or permit late acknowledgements to rearm it',
  async (failure) => {
    vi.useFakeTimers();
    const ports = fixture();
    const guard = await negotiateNativeCloseGuard(ports),
      stop = guard.observe(vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    let release!: (value: unknown) => void;
    if (failure === 'lost')
      ports.resolve.mockRejectedValueOnce(Error('private transport detail'));
    if (failure === 'malformed')
      ports.resolve.mockResolvedValueOnce({ bad: 'private response' } as never);
    if (failure === 'timeout')
      ports.resolve.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }) as ReturnType<typeof ports.resolve>,
      );
    const outcome = expect(guard.resolve(request, 'commit')).rejects.toThrow(
      'Native close outcome is uncertain.',
    );
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(2000);
    await outcome;
    if (release)
      release({
        status: 'committing',
        epoch,
        request,
        reason: null,
        state: state('committing', request),
      });
    await vi.advanceTimersByTimeAsync(0);
    await expect(guard.resolve(request, 'commit')).rejects.toThrow(
      'Native close outcome is uncertain.',
    );
    await expect(guard.resolve(request, 'cancel')).rejects.toThrow(
      'Native close outcome is uncertain.',
    );
    expect(ports.resolve).toHaveBeenCalledOnce();
    stop();
  },
);
it('allows exact cancellation after a verified commit refusal, never repeats the commit', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  ports.resolve.mockResolvedValueOnce({
    status: 'refused',
    epoch,
    request,
    reason: 'Native operation, dialog, update or renderer prevents close',
    state: state('requested', request),
  });
  const guard = await negotiateNativeCloseGuard(ports),
    stop = guard.observe(vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  expect((await guard.resolve(request, 'commit')).status).toBe('refused');
  await expect(guard.resolve(request, 'commit')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  expect((await guard.resolve(request, 'cancel')).status).toBe('cancelled');
  expect(ports.resolve).toHaveBeenCalledTimes(2);
  stop();
});
it.each([
  {
    status: 'cancelled',
    epoch,
    request,
    reason: null,
    state: state('committing', request),
  },
  { status: 'committing', epoch, request, reason: null, state: state() },
  {
    status: 'committing',
    epoch: 'c'.repeat(32),
    request,
    reason: null,
    state: state('committing', request),
  },
  {
    status: 'committing',
    epoch,
    request: 'c'.repeat(32),
    reason: null,
    state: state('committing', request),
  },
  {
    status: 'committing',
    epoch,
    request,
    reason: null,
    state: state('committing', 'c'.repeat(32)),
  },
  {
    status: 'committing',
    epoch,
    request,
    reason: 'unexpected',
    state: state('committing', request),
  },
  {
    status: 'committing',
    epoch,
    request,
    reason: null,
    state: { ...state('committing', request), version: 2 },
  },
  {
    status: 'refused',
    epoch,
    request,
    reason: null,
    state: state('requested', request),
  },
  {
    status: 'refused',
    epoch,
    request,
    reason: 'Stale editor close request',
    state: state('requested', request),
  },
  {
    status: 'committing',
    epoch,
    request,
    reason: null,
    state: state('committing', request),
    extra: true,
  },
])(
  'rejects contradictory resolution records rather than resuming',
  async (invalid) => {
    vi.useFakeTimers();
    const ports = fixture();
    ports.resolve.mockResolvedValueOnce(invalid as never);
    const guard = await negotiateNativeCloseGuard(ports),
      stop = guard.observe(vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    await expect(guard.resolve(request, 'commit')).rejects.toThrow(
      'Native close outcome is uncertain.',
    );
    expect(ports.resolve).toHaveBeenCalledOnce();
    stop();
  },
);

it('uses only the three fixed default native commands and named wire arguments', async () => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'enable_editor_close_guard') return state() as never;
    if (command === 'editor_close_state')
      return state('requested', request) as never;
    if (command === 'resolve_editor_close') {
      expect(args).toEqual({ epoch, request, action: 'cancel' });
      return {
        status: 'cancelled',
        epoch,
        request,
        reason: null,
        state: state(),
      } as never;
    }
    throw Error('Unexpected native command');
  });
  const guard = await negotiateNativeCloseGuard();
  const stop = guard.observe(vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  await guard.resolve(request, 'cancel');
  expect(vi.mocked(invoke).mock.calls).toEqual([
    ['enable_editor_close_guard', { version: 1 }],
    ['editor_close_state', { epoch }],
    ['resolve_editor_close', { epoch, request, action: 'cancel' }],
  ]);
  stop();
});
it('fences a read started before resolution so it cannot rewind the verified outcome', async () => {
  vi.useFakeTimers();
  const ports = fixture(),
    changed = vi.fn();
  let release!: (value: unknown) => void;
  const guard = await negotiateNativeCloseGuard(ports),
    stop = guard.observe(changed, vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  ports.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(250);
  expect(ports.read).toHaveBeenCalledTimes(2);
  await guard.resolve(request, 'commit');
  release(state('requested', request));
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).toHaveBeenCalledOnce();
  await expect(guard.resolve(request, 'cancel')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  expect(ports.resolve).toHaveBeenCalledOnce();
  stop();
});
it('rejects a stale request before native mutation and disallows concurrent duplicate resolution', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  const guard = await negotiateNativeCloseGuard(ports),
    stop = guard.observe(vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  await expect(guard.resolve('c'.repeat(32), 'commit')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  expect(ports.resolve).not.toHaveBeenCalled();
  let release!: (value: unknown) => void;
  ports.resolve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = guard.resolve(request, 'cancel');
  await expect(guard.resolve(request, 'commit')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  expect(ports.resolve).toHaveBeenCalledOnce();
  release({
    status: 'cancelled',
    epoch,
    request,
    reason: null,
    state: state(),
  });
  await pending;
  stop();
});
it('rejects a commit acknowledgement to a cancellation request', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  ports.resolve.mockResolvedValueOnce({
    status: 'committing',
    epoch,
    request,
    reason: null,
    state: state('committing', request),
  });
  const guard = await negotiateNativeCloseGuard(ports),
    stop = guard.observe(vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  await expect(guard.resolve(request, 'cancel')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  await expect(guard.resolve(request, 'commit')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  expect(ports.resolve).toHaveBeenCalledOnce();
  stop();
});
it('bounds a lost negotiation without revealing its late response or starting observation', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  let release!: (value: unknown) => void;
  ports.enable.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = expect(negotiateNativeCloseGuard(ports)).rejects.toThrow(
    'Native close negotiation failed.',
  );
  await vi.advanceTimersByTimeAsync(2000);
  await pending;
  release(state());
  await vi.advanceTimersByTimeAsync(0);
  expect(ports.enable).toHaveBeenCalledOnce();
  expect(ports.read).not.toHaveBeenCalled();
  expect(ports.resolve).not.toHaveBeenCalled();
});

it('reports a held retired read deadline to the current observer without spawning another read', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  ports.read.mockImplementationOnce(() => new Promise(() => {}));
  const guard = await negotiateNativeCloseGuard(ports);
  const oldError = vi.fn(),
    currentError = vi.fn();
  const stopOld = guard.observe(vi.fn(), oldError);
  stopOld();
  const stopCurrent = guard.observe(vi.fn(), currentError);
  await vi.advanceTimersByTimeAsync(2000);
  expect(oldError).not.toHaveBeenCalled();
  expect(currentError).toHaveBeenCalledOnce();
  expect(String(currentError.mock.calls[0]![0])).toBe(
    'Error: Native close state could not be verified.',
  );
  expect(ports.read).toHaveBeenCalledOnce();
  stopCurrent();
});
it('immediately reports a known held-read fault when observation resumes after its deadline', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  ports.read.mockImplementationOnce(() => new Promise(() => {}));
  const guard = await negotiateNativeCloseGuard(ports),
    oldError = vi.fn();
  const stopOld = guard.observe(vi.fn(), oldError);
  stopOld();
  await vi.advanceTimersByTimeAsync(2000);
  expect(oldError).not.toHaveBeenCalled();
  const currentError = vi.fn(),
    stopCurrent = guard.observe(vi.fn(), currentError);
  expect(currentError).toHaveBeenCalledOnce();
  expect(String(currentError.mock.calls[0]![0])).toBe(
    'Error: Native close state could not be verified.',
  );
  expect(ports.read).toHaveBeenCalledOnce();
  stopCurrent();
});
it('keeps an expired retired value quarantined and recovers only after a fresh verified read', async () => {
  vi.useFakeTimers();
  const ports = fixture();
  let release!: (value: unknown) => void;
  ports.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const guard = await negotiateNativeCloseGuard(ports),
    changed = vi.fn(),
    failed = vi.fn();
  const stopOld = guard.observe(vi.fn(), vi.fn());
  stopOld();
  const stopCurrent = guard.observe(changed, failed);
  await vi.advanceTimersByTimeAsync(2000);
  expect(failed).toHaveBeenCalledOnce();
  release(state('requested', 'c'.repeat(32)));
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).not.toHaveBeenCalled();
  await expect(guard.resolve('c'.repeat(32), 'commit')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  expect(ports.resolve).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(250);
  expect(ports.read).toHaveBeenCalledTimes(2);
  expect(changed).toHaveBeenCalledExactlyOnceWith({
    phase: 'requested',
    request,
  });
  expect((await guard.resolve(request, 'cancel')).status).toBe('cancelled');
  stopCurrent();
});

it('reports the occupied read deadline even when a held commit retired its read generation', async () => {
  vi.useFakeTimers();
  const ports = fixture(),
    failed = vi.fn();
  const guard = await negotiateNativeCloseGuard(ports),
    stop = guard.observe(vi.fn(), failed);
  await vi.advanceTimersByTimeAsync(0);
  ports.read.mockImplementationOnce(() => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(250);
  ports.resolve.mockImplementationOnce(() => new Promise(() => {}));
  const outcome = expect(guard.resolve(request, 'commit')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  await vi.advanceTimersByTimeAsync(2000);
  await outcome;
  expect(failed).toHaveBeenCalledOnce();
  expect(String(failed.mock.calls[0]![0])).toBe(
    'Error: Native close state could not be verified.',
  );
  expect(ports.read).toHaveBeenCalledTimes(2);
  expect(ports.resolve).toHaveBeenCalledOnce();
  await expect(guard.resolve(request, 'cancel')).rejects.toThrow(
    'Native close outcome is uncertain.',
  );
  expect(ports.resolve).toHaveBeenCalledOnce();
  stop();
});
