import type { PrepareExternalHistory } from '../../src/editor/sourceWitness';
import { describe, expect, it, vi } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import { createDocumentObserver } from '../../src/application/documentObserver';
import type { NativeSourceObservation } from '../../src/documents/nativeObservation';

const foreign: NativeSourceObservation = {
  status: 'changed',
  baselineRevision: 'base',
  revision: 'foreign',
  source: '\uFEFFexternal\r\n🌱\n',
};
function setup(prepareHistory?: PrepareExternalHistory) {
  const write = vi.fn(async () => ({ diskRevision: 'own', durable: true }));
  const controller = new DocumentSessions(write, async () => {});
  const session = controller.attach({
    witness: { sessionId: 'a', editorRevision: 0, source: 'original' },
    logicalPath: 'a.md',
    diskRevision: 'base',
  });
  const read = vi.fn(async (): Promise<NativeSourceObservation> => foreign);
  const watch = vi.fn(async () => 'watch');
  const poll = vi.fn(async () => false);
  const unwatch = vi.fn(async () => {});
  let current = true;
  let ready = true;
  const observer = createDocumentObserver(
    {
      controller,
      observation: {
        read,
        watch,
        poll,
        unwatch,
        scope: () => ({ isCurrent: () => current }),
      },
    },
    'a',
    () => ready,
    prepareHistory,
  );
  return {
    observer,
    controller,
    session,
    read,
    watch,
    poll,
    unwatch,
    write,
    stale: () => {
      current = false;
    },
    busy: () => {
      ready = false;
    },
  };
}
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe('loaded document observation lifecycle (DATA-01 / A05)', () => {
  it('commits prepared genuine history only after confirmed adoption and rechecks scope after preparation', async () => {
    const commit = vi.fn();
    const prepare = vi.fn(() => {
      s.stale();
      return commit;
    });
    const s = setup(prepare);
    await s.observer.reconcile();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(s.session.witness.source).toBe('original');
    expect(s.controller.state('a').externalObservation?.observed).toBeDefined();
    await s.observer.stop();
  });

  it('retains competition without changing prepared history when typing invalidates the read capture', async () => {
    const commit = vi.fn();
    const prepare = vi.fn(() => commit);
    const s = setup(prepare);
    let finish!: (value: NativeSourceObservation) => void;
    s.read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const job = s.observer.reconcile();
    await tick();
    s.session.publish({ expected: s.session.witness, source: 'local' });
    finish(foreign);
    await job;
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(s.session.witness.source).toBe('local');
    await s.observer.stop();
  });

  it('drains one coalesced focus request arriving during an authoritative read', async () => {
    const s = setup();
    let finish!: (value: NativeSourceObservation) => void;
    s.read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const initial = s.observer.reconcile();
    await tick();
    const focus = s.observer.reconcile();
    const secondFocus = s.observer.reconcile();
    finish({ status: 'unchanged', revision: 'base' });
    await Promise.all([initial, focus, secondFocus]);
    expect(s.read).toHaveBeenCalledTimes(2);
    expect(s.session.witness.source).toBe(
      foreign.status === 'changed' ? foreign.source : '',
    );
    await s.observer.stop();
  });

  it('does not lose focus reconciliation behind an in-flight unchanged hint poll', async () => {
    const s = setup();
    s.read.mockResolvedValueOnce({ status: 'unchanged', revision: 'base' });
    await s.observer.reconcile();
    let finish!: (value: boolean) => void;
    s.poll.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const polling = s.observer.poll();
    await tick();
    const focus = s.observer.reconcile();
    finish(false);
    await Promise.all([polling, focus]);
    expect(s.read).toHaveBeenCalledTimes(2);
    expect(s.session.witness.source).toBe(
      foreign.status === 'changed' ? foreign.source : '',
    );
    await s.observer.stop();
  });

  it('preserves a valid competing disk version through a later transport failure', async () => {
    const s = setup();
    s.busy();
    await s.observer.reconcile();
    s.read.mockRejectedValueOnce(Error('transport lost'));
    await s.observer.reconcile();
    expect(s.controller.state('a').externalObservation).toMatchObject({
      observed: { source: foreign.status === 'changed' ? foreign.source : '' },
      issue: 'unreadable',
    });
    await s.observer.stop();
    expect(s.session.witness.source).toBe('original');
    await expect(s.controller.flush()).rejects.toThrow();
  });

  it('drains late watch registration and releases it without dispatching a new read', async () => {
    const s = setup();
    let finish!: (value: string) => void;
    s.watch.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const job = s.observer.reconcile();
    await tick();
    const stop = s.observer.stop();
    finish('late-watch');
    await Promise.all([job, stop]);
    expect(s.read).not.toHaveBeenCalled();
    expect(s.unwatch).toHaveBeenCalledExactlyOnceWith('a', 'late-watch');
    await s.controller.flush();
  });

  it('adopts exact checked source without a writer echo and cleans its one watch', async () => {
    const s = setup();
    await s.observer.reconcile();
    expect(s.session.witness.source).toBe(
      foreign.status === 'changed' ? foreign.source : '',
    );
    await s.controller.flush();
    expect(s.write).not.toHaveBeenCalled();
    await s.observer.poll();
    expect(s.read).toHaveBeenCalledTimes(1);
    await s.observer.stop();
    await s.observer.reconcile();
    expect(s.watch).toHaveBeenCalledTimes(1);
    expect(s.unwatch).toHaveBeenCalledExactlyOnceWith('a', 'watch');
  });

  it('retains competing local and disk text and pauses writes after stop', async () => {
    const s = setup();
    let resolve!: (value: NativeSourceObservation) => void;
    s.read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const job = s.observer.reconcile();
    await tick();
    s.session.publish({ expected: s.session.witness, source: 'local' });
    resolve(foreign);
    await job;
    await s.observer.stop();
    expect(s.session.witness.source).toBe('local');
    expect(s.controller.state('a').externalObservation?.observed?.source).toBe(
      foreign.status === 'changed' ? foreign.source : '',
    );
    expect(s.write).not.toHaveBeenCalled();
    await expect(s.controller.flush()).rejects.toThrow();
  });

  it('defers replacement for a native DOM draft even before its model signal', async () => {
    const s = setup();
    s.busy();
    await s.observer.reconcile();
    expect(s.session.witness.source).toBe('original');
    expect(s.controller.state('a').externalObservation?.observed).toBeDefined();
    await s.observer.stop();
    expect(s.write).not.toHaveBeenCalled();
  });

  it('ignores A-to-B-to-A stale results and keeps unknown writes paused', async () => {
    const s = setup();
    let resolve!: (value: NativeSourceObservation) => void;
    s.read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const job = s.observer.reconcile();
    await tick();
    s.stale();
    resolve(foreign);
    await job;
    expect(s.session.witness.source).toBe('original');
    expect(s.controller.state('a').externalObservation).toMatchObject({
      issue: 'unstable',
    });
    await s.observer.stop();
    await expect(s.controller.flush()).rejects.toThrow();
  });

  it('drains a late read at shutdown without publishing it or abandoning its pause', async () => {
    const s = setup();
    let resolve!: (value: NativeSourceObservation) => void;
    s.read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const job = s.observer.reconcile();
    await tick();
    const stop = s.observer.stop();
    resolve(foreign);
    await Promise.all([job, stop]);
    expect(s.session.witness.source).toBe('original');
    expect(s.controller.state('a').externalObservation?.issue).toBe('unstable');
    expect(s.unwatch).toHaveBeenCalledTimes(1);
    expect(s.write).not.toHaveBeenCalled();
  });

  it('coalesces concurrent requests and reconciles authoritatively when notifications fail', async () => {
    const s = setup();
    s.watch.mockRejectedValueOnce(Error('watch unavailable'));
    s.read.mockResolvedValueOnce({ status: 'unchanged', revision: 'base' });
    await Promise.all([
      s.observer.reconcile(),
      s.observer.reconcile(),
      s.observer.poll(),
    ]);
    expect(s.read).toHaveBeenCalledTimes(1);
    expect(s.controller.state('a').externalObservation).toBeUndefined();
    await s.observer.reconcile();
    expect(s.read).toHaveBeenCalledTimes(2);
    expect(s.watch).toHaveBeenCalledTimes(2);
    await s.observer.stop();
  });

  it('waits for a dispatched save and classifies a pre-ack hint against the completed revision', async () => {
    const s = setup();
    let ack!: (value: { diskRevision: string; durable: boolean }) => void;
    s.write.mockImplementationOnce(
      () =>
        new Promise((r) => {
          ack = r;
        }),
    );
    s.session.publish({ expected: s.session.witness, source: 'own source' });
    await tick();
    const job = s.observer.reconcile();
    await tick();
    expect(s.read).not.toHaveBeenCalled();
    s.read.mockResolvedValueOnce({ status: 'unchanged', revision: 'own' });
    ack({ diskRevision: 'own', durable: true });
    await job;
    expect(s.read).toHaveBeenCalledExactlyOnceWith('a', 'own');
    expect(s.session.witness.source).toBe('own source');
    await s.observer.stop();
    await s.controller.flush();
    expect(s.write).toHaveBeenCalledTimes(1);
  });
});
