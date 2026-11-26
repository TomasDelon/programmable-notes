import { describe, expect, it, vi } from 'vitest';
import {
  DocumentSessions,
  type SessionBudgets,
} from '../../src/application/documentSessions';
import type {
  DocumentWrite,
  WriteReceipt,
} from '../../src/application/autosave';
import type { SourceSession } from '../../src/editor/sourceWitness';
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
} from '../../src/documents/workspace';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const baseline = (sessionId = 'a', source = 'original') => ({
  witness: { sessionId, editorRevision: 0, source },
  logicalPath: 'notes/a.mdx',
  diskRevision: 'disk-0',
});
const publish = (session: SourceSession, source: string) =>
  session.publish({ expected: session.witness, source });
const saved = async (): Promise<WriteReceipt> => ({
  diskRevision: 'disk-1',
  durable: true,
});

describe('accepted document sessions', () => {
  it('retains limits supplied through inherited budget properties', () => {
    const budgets = Object.create({
      maxDocumentBytes: 4,
      maxLoadedBytes: 8,
      maxSessions: 2,
    }) as SessionBudgets;
    const controller = new DocumentSessions(saved, async () => {}, budgets);
    expect(() => controller.attach(baseline('a', '12345'))).toThrow();
    controller.attach(baseline('a', '1234'));
    controller.attach(baseline('b', '1234'));
    expect(() => controller.attach(baseline('c', ''))).toThrow();
  });

  it('captures each budget getter once and stores exactly the validated values', () => {
    let documentReads = 0;
    let loadedReads = 0;
    let sessionReads = 0;
    const controller = new DocumentSessions(saved, async () => {}, {
      get maxDocumentBytes() {
        return ++documentReads === 1 ? 4 : 100;
      },
      get maxLoadedBytes() {
        return ++loadedReads === 1 ? 6 : 100;
      },
      get maxSessions() {
        return ++sessionReads === 1 ? 2 : 10;
      },
    });
    expect([documentReads, loadedReads, sessionReads]).toEqual([1, 1, 1]);
    expect(() => controller.attach(baseline('a', '12345'))).toThrow();
    controller.attach(baseline('a', '1234'));
    expect(() => controller.attach(baseline('b', '123'))).toThrow();
    controller.attach(baseline('b', '12'));
    expect(() => controller.attach(baseline('c', ''))).toThrow();
    expect([documentReads, loadedReads, sessionReads]).toEqual([1, 1, 1]);
  });

  it('targets initial delivery to a reentrantly added subscriber without rebroadcast loops', async () => {
    const controller = new DocumentSessions(saved, async () => {});
    controller.attach(baseline());
    await tick();
    let calls = 0;
    const child = vi.fn();
    controller.subscribe('a', () => {
      calls++;
      // Bound the regression so a broken controller cannot starve the runner.
      if (calls < 5) controller.subscribe('a', child);
    });
    await tick();
    expect(calls).toBe(1);
    expect(child).toHaveBeenCalledTimes(1);
  });

  it('does not notify an unchanged unapplied-text state', async () => {
    const controller = new DocumentSessions(saved, async () => {});
    controller.attach(baseline());
    await tick();
    const listener = vi.fn();
    controller.subscribe('a', listener);
    await tick();
    listener.mockClear();
    controller.setUnapplied('a', false);
    await tick();
    expect(listener).not.toHaveBeenCalled();
    controller.setUnapplied('a', true);
    await tick();
    expect(listener).toHaveBeenCalledTimes(1);
    controller.setUnapplied('a', true);
    await tick();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      maxDocumentBytes: MAX_FILE_BYTES + 1,
      maxLoadedBytes: MAX_TOTAL_BYTES,
      maxSessions: MAX_FILES,
    },
    {
      maxDocumentBytes: MAX_FILE_BYTES,
      maxLoadedBytes: MAX_TOTAL_BYTES + 1,
      maxSessions: MAX_FILES,
    },
    {
      maxDocumentBytes: MAX_FILE_BYTES,
      maxLoadedBytes: MAX_TOTAL_BYTES,
      maxSessions: MAX_FILES + 1,
    },
  ])(
    'refuses a budget override that widens native source limits: %j',
    (budgets) => {
      expect(
        () => new DocumentSessions(saved, async () => {}, budgets),
      ).toThrow();
    },
  );

  it.each(['maxDocumentBytes', 'maxLoadedBytes', 'maxSessions'] as const)(
    'refuses an omitted %s budget at the runtime boundary',
    (field) => {
      const budgets: Partial<SessionBudgets> = {
        maxDocumentBytes: 4,
        maxLoadedBytes: 8,
        maxSessions: 2,
      };
      delete budgets[field];
      expect(
        () =>
          new DocumentSessions(
            saved,
            async () => {},
            budgets as SessionBudgets,
          ),
      ).toThrow();
    },
  );

  it('publishes synchronously, validates without side effects and rejects same-byte stale witnesses', async () => {
    const writer = vi.fn(saved);
    const controller = new DocumentSessions(writer, async () => {});
    const session = controller.attach(baseline());
    const old = session.witness;
    expect(session.validate({ expected: old, source: 'next' })).toBe(true);
    expect(session.witness).toEqual(old);
    expect(writer).not.toHaveBeenCalled();
    const next = publish(session, 'next');
    expect(next).toEqual({ sessionId: 'a', editorRevision: 1, source: 'next' });
    expect(controller.state('a').autosave.latest.editorRevision).toBe(1);
    publish(session, 'original');
    expect(session.isCurrent(old)).toBe(false);
    expect(() => session.publish({ expected: old, source: 'stale' })).toThrow();
    expect(session.witness.editorRevision).toBe(2);
    await controller.flush('a');
  });

  it('coalesces rapid edits, preserves exact bytes and never acknowledges a newer revision early', async () => {
    const first = deferred<WriteReceipt>();
    const second = deferred<WriteReceipt>();
    const writes: DocumentWrite[] = [];
    const controller = new DocumentSessions(
      (input) => {
        writes.push(input);
        return writes.length === 1 ? first.promise : second.promise;
      },
      async () => {},
    );
    const session = controller.attach(baseline());
    publish(session, 'one');
    await tick();
    publish(session, 'two');
    publish(session, '\uFEFF# latest\r\n<Broken');
    first.resolve({ diskRevision: 'disk-1', durable: true });
    await tick();
    expect(writes).toEqual([
      { documentId: 'a', expectedDiskRevision: 'disk-0', source: 'one' },
      {
        documentId: 'a',
        expectedDiskRevision: 'disk-1',
        source: '\uFEFF# latest\r\n<Broken',
      },
    ]);
    expect(controller.state('a').autosave.persisted.source).toBe('one');
    expect(controller.state('a').autosave.status).toBe('writing');
    second.resolve({ diskRevision: 'disk-2', durable: true });
    await controller.flush('a');
    expect(controller.state('a').autosave.status).toBe('saved');
  });

  it('keeps callbacks bound to their open session and retires identities permanently', async () => {
    const writes: DocumentWrite[] = [];
    const controller = new DocumentSessions(
      async (input) => {
        writes.push(input);
        return saved();
      },
      async () => {},
    );
    const a = controller.attach(baseline('a'));
    const b = controller.attach(baseline('b', 'other'));
    const old = a.witness;
    publish(b, 'B edit');
    a.publish({ expected: old, source: 'late A' });
    await controller.flush();
    expect(writes.map((write) => [write.documentId, write.source])).toEqual([
      ['b', 'B edit'],
      ['a', 'late A'],
    ]);
    await controller.close('a');
    expect(a.isCurrent(a.witness)).toBe(false);
    expect(() => publish(a, 'retired')).toThrow();
    expect(() => controller.attach(baseline('a'))).toThrow();
    const reopened = controller.attach(baseline('new-a'));
    expect(reopened.validate({ expected: old, source: 'wrong session' })).toBe(
      false,
    );
    expect(reopened.witness.editorRevision).toBe(0);
  });

  it('defers observers and writer until the receipt exists, and tolerates observer reentrancy', async () => {
    const writer = vi.fn(async (input: DocumentWrite) => {
      expect(session.witness.source).toBe(input.source);
      return saved();
    });
    const controller = new DocumentSessions(writer, async () => {});
    const session = controller.attach(baseline());
    let seen = 0;
    controller.subscribe('a', (state) => {
      seen++;
      if (state.witness.source === 'one') publish(session, 'two');
    });
    expect(seen).toBe(0);
    publish(session, 'one');
    expect(seen).toBe(0);
    expect(writer).not.toHaveBeenCalled();
    await controller.flush('a');
    expect(session.witness.source).toBe('two');
    expect(seen).toBeGreaterThan(0);
  });

  it('isolates attached inputs, returned witnesses, observations and retained batches', async () => {
    const controller = new DocumentSessions(saved, async () => {});
    const input = baseline();
    const session = controller.attach(input);
    input.witness.source = 'tampered';
    const observed = controller.state('a');
    (observed.witness as { source: string }).source = 'tampered';
    const witness = session.witness;
    (witness as { source: string }).source = 'tampered';
    expect(session.witness.source).toBe('original');
    const batch = { expected: session.witness, source: 'unapplied' };
    session.retainFailure(batch);
    batch.source = 'tampered';
    const failure = controller.state('a').retainedFailures[0]!;
    (failure.expected as { source: string }).source = 'tampered';
    expect(controller.state('a').retainedFailures[0]).toEqual({
      expected: baseline().witness,
      source: 'unapplied',
    });
    expect(controller.state('a').autosave.latest.source).toBe('original');
    await expect(controller.close('a')).rejects.toThrow();
  });

  it('enforces loaded-source budgets before publication and does not consume a revision', () => {
    const controller = new DocumentSessions(saved, async () => {}, {
      maxDocumentBytes: 4,
      maxLoadedBytes: 6,
      maxSessions: 2,
    });
    const a = controller.attach(baseline('a', 'é'));
    controller.attach(baseline('b', 'bbb'));
    expect(a.validate({ expected: a.witness, source: 'ééé' })).toBe(false);
    expect(a.validate({ expected: a.witness, source: 'éé' })).toBe(false);
    expect(() => publish(a, 'éé')).toThrow();
    expect(a.witness.editorRevision).toBe(0);
    expect(() => controller.attach(baseline('c', ''))).toThrow();
    expect(() => controller.attach(baseline('a', ''))).toThrow();
  });

  it('gates publication and waits for disk before native close, then releases', async () => {
    const write = deferred<WriteReceipt>();
    const nativeClose = deferred<void>();
    const close = vi.fn(() => nativeClose.promise);
    const controller = new DocumentSessions(() => write.promise, close);
    const session = controller.attach(baseline());
    publish(session, 'pending');
    const closing = controller.close('a');
    expect(controller.state('a').phase).toBe('closing');
    expect(
      session.validate({ expected: session.witness, source: 'later' }),
    ).toBe(false);
    expect(() => publish(session, 'later')).toThrow();
    expect(close).not.toHaveBeenCalled();
    write.resolve({ diskRevision: 'disk-1', durable: true });
    await tick();
    expect(close).toHaveBeenCalledExactlyOnceWith('a');
    expect(controller.state('a').phase).toBe('closing');
    nativeClose.resolve();
    await closing;
    expect(() => controller.state('a')).toThrow();
    expect(() => controller.attach(baseline('a'))).toThrow();
  });

  it('blocks close on unapplied text even when the file baseline is saved', async () => {
    const close = vi.fn(async () => {});
    const controller = new DocumentSessions(saved, close);
    controller.attach(baseline());
    controller.setUnapplied('a', true);
    await expect(controller.close('a')).rejects.toThrow();
    expect(close).not.toHaveBeenCalled();
    expect(controller.state('a').phase).toBe('open');
    controller.setUnapplied('a', false);
    await controller.close('a');
  });

  it('rechecks unapplied text that arrives while close is flushing', async () => {
    const write = deferred<WriteReceipt>();
    const close = vi.fn(async () => {});
    const controller = new DocumentSessions(() => write.promise, close);
    const session = controller.attach(baseline());
    publish(session, 'next');
    const closing = controller.close('a');
    controller.setUnapplied('a', true);
    write.resolve({ diskRevision: 'disk-1', durable: true });
    await expect(closing).rejects.toThrow();
    expect(close).not.toHaveBeenCalled();
    expect(controller.state('a').phase).toBe('open');
  });

  it('retains latest accepted source after external conflict without automatic retry', async () => {
    const writer = vi.fn(async () => {
      throw Error('external conflict');
    });
    const close = vi.fn(async () => {});
    const controller = new DocumentSessions(writer, close);
    const session = controller.attach(baseline());
    publish(session, 'local one');
    await expect(controller.flush()).rejects.toThrow();
    publish(session, 'local two');
    await expect(controller.close('a')).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(session.witness.source).toBe('local two');
    expect(controller.state('a').autosave.persisted.source).toBe('original');
    expect(controller.state('a').autosave.status).toBe('blocked');
    expect(controller.state('a').phase).toBe('open');
  });

  it('does not release or retry a session after uncertain native close', async () => {
    const close = vi.fn(async () => {
      throw Error('lost close reply');
    });
    const controller = new DocumentSessions(saved, close);
    const session = controller.attach(baseline());
    await expect(controller.close('a')).rejects.toThrow('lost close reply');
    expect(controller.state('a').phase).toBe('close-uncertain');
    expect(controller.state('a').autosave.latest.source).toBe('original');
    expect(() => publish(session, 'unsafe')).toThrow();
    await expect(controller.close('a')).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('retains an attempt received during native close without claiming safe retirement', async () => {
    const nativeClose = deferred<void>();
    const close = vi.fn(() => nativeClose.promise);
    const controller = new DocumentSessions(saved, close);
    const session = controller.attach(baseline());
    const closing = controller.close('a');
    await tick();
    expect(close).toHaveBeenCalledTimes(1);
    session.retainFailure({
      expected: session.witness,
      source: 'late unapplied text',
    });
    nativeClose.resolve();
    await expect(closing).rejects.toThrow();
    expect(controller.state('a').phase).toBe('close-uncertain');
    expect(controller.state('a').retainedFailures[0]!.source).toBe(
      'late unapplied text',
    );
    expect(controller.state('a').autosave.latest.source).toBe('original');
  });

  it('rejects concurrent closes without invoking the port twice', async () => {
    const nativeClose = deferred<void>();
    const close = vi.fn(() => nativeClose.promise);
    const controller = new DocumentSessions(saved, close);
    controller.attach(baseline());
    const closing = controller.close('a');
    await expect(controller.close('a')).rejects.toThrow();
    await tick();
    expect(close).toHaveBeenCalledTimes(1);
    nativeClose.resolve();
    await closing;
  });

  it('advances a same-source receipt without rewriting durable identical bytes', async () => {
    const writer = vi.fn(saved);
    const controller = new DocumentSessions(writer, async () => {});
    const session = controller.attach(baseline());
    const old = session.witness;
    const next = publish(session, old.source);
    expect(next.editorRevision).toBe(1);
    expect(session.isCurrent(old)).toBe(false);
    await controller.flush();
    expect(controller.state('a').autosave.persisted.editorRevision).toBe(1);
    expect(writer).not.toHaveBeenCalled();
  });

  it('does not close a baseline whose durability has not been confirmed', async () => {
    const writer = vi.fn(saved);
    const close = vi.fn(async () => {});
    const controller = new DocumentSessions(writer, close);
    controller.attach({ ...baseline(), durable: false });
    await expect(controller.close('a')).rejects.toThrow();
    expect(controller.state('a').autosave.durable).toBe(false);
    expect(writer).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('refuses revision exhaustion and copies caller budget configuration', () => {
    const budgets = { maxDocumentBytes: 4, maxLoadedBytes: 8, maxSessions: 2 };
    const controller = new DocumentSessions(saved, async () => {}, budgets);
    budgets.maxDocumentBytes = 100;
    const session = controller.attach({
      ...baseline('a', 'a'),
      witness: {
        sessionId: 'a',
        editorRevision: Number.MAX_SAFE_INTEGER,
        source: 'a',
      },
    });
    expect(session.validate({ expected: session.witness, source: 'b' })).toBe(
      false,
    );
    expect(() => publish(session, 'b')).toThrow();
    expect(() => controller.attach(baseline('b', '12345'))).toThrow();
    expect(
      () =>
        new DocumentSessions(saved, async () => {}, {
          ...budgets,
          maxSessions: 0,
        }),
    ).toThrow();
  });

  it('suppresses unsubscribed callbacks and contains throwing/asynchronous observers', async () => {
    const controller = new DocumentSessions(saved, async () => {});
    const session = controller.attach(baseline());
    const removed = vi.fn();
    const unsubscribe = controller.subscribe('a', removed);
    unsubscribe();
    controller.subscribe('a', () => {
      throw Error('observer');
    });
    controller.subscribe('a', async () => {
      throw Error('async observer');
    });
    publish(session, 'next');
    await controller.flush();
    await tick();
    expect(removed).not.toHaveBeenCalled();
    expect(controller.state('a').autosave.status).toBe('saved');
  });
});
