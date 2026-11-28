import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import { createWorkspaceObserver } from '../../src/application/workspaceObserver';
import type {
  NativeSourceObservation,
  NativeSessionObservation,
} from '../../src/documents/nativeObservation';

const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
afterEach(() => {
  vi.useRealTimers();
});
function setup() {
  vi.useFakeTimers();
  const controller = new DocumentSessions(vi.fn(), async () => {});
  const session = controller.attach({
    witness: { sessionId: 'a', source: 'original', editorRevision: 0 },
    logicalPath: 'a.md',
    diskRevision: 'base',
  });
  const sessions = [{ sessionId: 'a' }];
  let changed = () => {};
  const read = vi.fn(async (): Promise<NativeSourceObservation> => ({
    status: 'unchanged',
    revision: 'base',
  }));
  const watch = vi.fn(async () => 'token');
  const poll = vi.fn(async () => false);
  const unwatch = vi.fn<NativeSessionObservation['unwatch']>(async () => {});
  const unsubscribe = vi.fn();
  const onError = vi.fn();
  const owner = createWorkspaceObserver(
    {
      controller,
      observation: {
        read,
        watch,
        poll,
        unwatch,
        scope: () => ({ isCurrent: () => true }),
      },
      state: () => ({ sessions }),
      subscribe: (listener: () => void) => {
        changed = listener;
        return unsubscribe;
      },
    },
    () => true,
    onError,
  );
  return {
    owner,
    session,
    controller,
    sessions,
    read,
    watch,
    poll,
    unwatch,
    onError,
    unsubscribe,
    changed: () => changed(),
  };
}

describe('bounded workspace observation ownership', () => {
  it('retires every watch and drains all cleanup even if an earlier retirement rejects', async () => {
    const s = setup();
    s.controller.attach({
      witness: { sessionId: 'b', editorRevision: 0, source: 'B' },
      logicalPath: 'b.md',
      diskRevision: 'base',
    });
    s.sessions.push({ sessionId: 'b' });
    await tick();
    let rejectA!: (reason: Error) => void;
    let finishB!: () => void;
    s.unwatch.mockImplementation(async (id: string) => {
      if (id === 'a')
        await new Promise<void>((_resolve, reject) => {
          rejectA = reject;
        });
      else
        await new Promise<void>((resolve) => {
          finishB = resolve;
        });
    });
    s.sessions.splice(0, 1);
    s.changed();
    await tick();
    let finished = false;
    const drain = s.owner.quiesce().catch((reason) => {
      finished = true;
      return reason;
    });
    rejectA(Error('unwatch A uncertain'));
    await tick();
    expect(s.unwatch).toHaveBeenCalledWith('b', 'token');
    expect(finished).toBe(false);
    finishB();
    expect(await drain).toEqual(Error('unwatch A uncertain'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('quiesces a current checked read before close without converting unchanged disk into a false failure', async () => {
    const s = setup();
    let release!: (value: NativeSourceObservation) => void;
    s.read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    await tick();
    const drain = s.owner.quiesce();
    expect(s.unwatch).not.toHaveBeenCalled();
    release({ status: 'unchanged', revision: 'base' });
    await drain;
    expect(s.controller.state('a').externalObservation).toBeUndefined();
    await s.controller.flush();
    expect(s.unwatch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads initially, polls hints, and reconciles missed notifications periodically', async () => {
    const s = setup();
    await tick();
    expect(s.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(s.poll).toHaveBeenCalledTimes(1);
    expect(s.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1750);
    expect(s.read).toHaveBeenCalledTimes(2);
    await s.owner.stop();
    expect(s.unwatch).toHaveBeenCalledExactlyOnceWith('a', 'token');
    expect(s.unsubscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(s.read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps one watch through repeated workspace selection notifications and forces on focus', async () => {
    const s = setup();
    await tick();
    s.changed();
    s.changed();
    await tick();
    await s.owner.reconcile();
    expect(s.watch).toHaveBeenCalledTimes(1);
    expect(s.read.mock.calls.length).toBeGreaterThanOrEqual(2);
    await s.owner.stop();
  });

  it('drains pending work, propagates uncertain cleanup and never restarts itself', async () => {
    const s = setup();
    let release!: (value: NativeSourceObservation) => void;
    s.read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    await tick();
    const stop = s.owner.stop();
    release({
      status: 'changed',
      baselineRevision: 'base',
      revision: 'external',
      source: 'external',
    });
    await stop;
    expect(s.session.witness.source).toBe('original');
    expect(s.controller.state('a').externalObservation?.issue).toBe('unstable');
    expect(s.unwatch).toHaveBeenCalledTimes(1);
    s.changed();
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.watch).toHaveBeenCalledTimes(1);
  });
});
