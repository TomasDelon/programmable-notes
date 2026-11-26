import { describe, expect, it, vi } from 'vitest';
import {
  AutosaveCoordinator,
  type DocumentWriter,
  type WriteReceipt,
} from '../../src/application/autosave';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup() {
  // Native IPC is external. Hold only that boundary to exercise real scheduling.
  const attempts: ReturnType<typeof deferred<WriteReceipt>>[] = [];
  const write = vi.fn<DocumentWriter>(() => {
    const attempt = deferred<WriteReceipt>();
    attempts.push(attempt);
    return attempt.promise;
  });
  const queue = new AutosaveCoordinator(write);
  queue.attach({
    documentId: 'grant-a',
    editorRevision: 0,
    source: 'original',
    diskRevision: 'disk-0',
  });
  return { queue, write, attempts };
}

describe('shared accepted-source autosave (DATA-01 / A04)', () => {
  it('writes accepted exact source automatically, without compilation or manual Save', async () => {
    const { queue, write, attempts } = setup();
    const source = '\uFEFF# Héllo\r\n\r\n$broken\r\n<Component unclosed\r\n';
    queue.accept({ documentId: 'grant-a', editorRevision: 1, source });
    await Promise.resolve();
    expect(write).toHaveBeenCalledWith({
      documentId: 'grant-a',
      expectedDiskRevision: 'disk-0',
      source,
    });
    attempts[0]!.resolve({ diskRevision: 'disk-1', durable: true });
    await queue.flush();
    expect(queue.state('grant-a')).toMatchObject({
      status: 'saved',
      latest: { editorRevision: 1, source },
      persisted: { editorRevision: 1, source },
      diskRevision: 'disk-1',
    });
  });

  it('serializes writes and coalesces superseded edits while an older write is in flight', async () => {
    const { queue, write, attempts } = setup();
    queue.accept({ documentId: 'grant-a', editorRevision: 1, source: 'one' });
    await Promise.resolve();
    queue.accept({ documentId: 'grant-a', editorRevision: 2, source: 'two' });
    queue.accept({ documentId: 'grant-a', editorRevision: 3, source: 'three' });
    expect(write).toHaveBeenCalledTimes(1);
    attempts[0]!.resolve({ diskRevision: 'disk-1', durable: true });
    await Promise.resolve();
    expect(queue.state('grant-a')).toMatchObject({
      status: 'writing',
      persisted: { editorRevision: 1, source: 'one' },
      latest: { editorRevision: 3, source: 'three' },
    });
    expect(write.mock.calls[1]![0]).toEqual({
      documentId: 'grant-a',
      expectedDiskRevision: 'disk-1',
      source: 'three',
    });
    attempts[1]!.resolve({ diskRevision: 'disk-2', durable: true });
    await queue.flush();
    expect(queue.state('grant-a').persisted.editorRevision).toBe(3);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('persists undo back to the original bytes after an intervening write', async () => {
    const { queue, write, attempts } = setup();
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 1,
      source: 'changed',
    });
    await Promise.resolve();
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 2,
      source: 'original',
    });
    attempts[0]!.resolve({ diskRevision: 'disk-1', durable: true });
    await Promise.resolve();
    expect(write.mock.calls[1]![0].source).toBe('original');
    attempts[1]!.resolve({ diskRevision: 'disk-2', durable: true });
    await queue.flush();
    expect(queue.state('grant-a').persisted).toEqual({
      editorRevision: 2,
      source: 'original',
    });
  });

  it('does not rewrite already durable identical bytes, but records the newer editor revision', async () => {
    const { queue, write } = setup();
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 4,
      source: 'original',
    });
    await queue.flush();
    expect(write).not.toHaveBeenCalled();
    expect(queue.state('grant-a').persisted.editorRevision).toBe(4);
  });

  it('keeps late callbacks bound to their document and flushes every open document', async () => {
    const { queue, write, attempts } = setup();
    queue.attach({
      documentId: 'grant-b',
      editorRevision: 0,
      source: 'B',
      diskRevision: 'b0',
    });
    queue.accept({ documentId: 'grant-a', editorRevision: 1, source: 'A1' });
    queue.accept({ documentId: 'grant-b', editorRevision: 1, source: 'B1' });
    await Promise.resolve();
    attempts[1]!.resolve({ diskRevision: 'b1', durable: true });
    await queue.flush('grant-b');
    expect(queue.state('grant-b').persisted.source).toBe('B1');
    expect(queue.state('grant-a').status).toBe('writing');
    expect(() => queue.release('grant-a')).toThrow();
    expect(() =>
      queue.attach({
        documentId: 'grant-a',
        editorRevision: 0,
        source: 'replacement',
        diskRevision: 'another',
      }),
    ).toThrow();
    attempts[0]!.resolve({ diskRevision: 'a1', durable: true });
    await queue.flush();
    expect(queue.state('grant-a').persisted.source).toBe('A1');
    expect(write).toHaveBeenCalledTimes(2);
    queue.release('grant-a');
    expect(() => queue.state('grant-a')).toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects stale/invalid editor revision %s without writing',
    async (editorRevision) => {
      const { queue, write } = setup();
      expect(() =>
        queue.accept({
          documentId: 'grant-a',
          editorRevision,
          source: 'unsafe',
        }),
      ).toThrow();
      await queue.flush();
      expect(write).not.toHaveBeenCalled();
      expect(queue.state('grant-a').latest.source).toBe('original');
    },
  );

  it('does not let duplicate editor revisions smuggle different bytes into persistence', async () => {
    const { queue, attempts } = setup();
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 1,
      source: 'accepted',
    });
    expect(() =>
      queue.accept({
        documentId: 'grant-a',
        editorRevision: 1,
        source: 'forged',
      }),
    ).toThrow();
    await Promise.resolve();
    attempts[0]!.resolve({ diskRevision: '1', durable: true });
    await queue.flush();
    expect(queue.state('grant-a').persisted.source).toBe('accepted');
  });

  it('retains the newest source on conflict and never retries merely because typing continues', async () => {
    const { queue, write, attempts } = setup();
    queue.accept({ documentId: 'grant-a', editorRevision: 1, source: 'first' });
    await Promise.resolve();
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 2,
      source: 'newest',
    });
    attempts[0]!.reject(new Error('External file changed'));
    await expect(queue.flush()).rejects.toMatchObject({
      documentIds: ['grant-a'],
    });
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 3,
      source: 'still typing',
    });
    await expect(queue.flush()).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.state('grant-a')).toMatchObject({
      status: 'blocked',
      latest: { editorRevision: 3, source: 'still typing' },
      persisted: { editorRevision: 0, source: 'original' },
      diskRevision: 'disk-0',
    });
    expect(() => queue.release('grant-a')).toThrow();
  });

  it('keeps a non-durable write blocked and retries with its new disk revision only explicitly', async () => {
    const { queue, write, attempts } = setup();
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 1,
      source: 'retained',
    });
    await Promise.resolve();
    attempts[0]!.resolve({ diskRevision: 'disk-1', durable: false });
    await expect(queue.flush()).rejects.toThrow();
    expect(queue.state('grant-a')).toMatchObject({
      status: 'blocked',
      durable: false,
      diskRevision: 'disk-1',
    });
    queue.retry('grant-a');
    await Promise.resolve();
    expect(write.mock.calls[1]![0].expectedDiskRevision).toBe('disk-1');
    attempts[1]!.resolve({ diskRevision: 'disk-2', durable: true });
    await queue.flush();
    expect(queue.state('grant-a').status).toBe('saved');
  });

  it('flush waits for edits arriving during the current write, rather than closing on an old acknowledgement', async () => {
    const { queue, attempts } = setup();
    queue.accept({ documentId: 'grant-a', editorRevision: 1, source: 'one' });
    const flushed = vi.fn();
    const closing = queue.flush().then(flushed);
    await Promise.resolve();
    queue.accept({ documentId: 'grant-a', editorRevision: 2, source: 'two' });
    attempts[0]!.resolve({ diskRevision: '1', durable: true });
    await Promise.resolve();
    expect(flushed).not.toHaveBeenCalled();
    attempts[1]!.resolve({ diskRevision: '2', durable: true });
    await closing;
    expect(queue.state('grant-a').persisted.source).toBe('two');
  });

  it('never skips disk CAS after a lost acknowledgement even when undo matches old saved bytes', async () => {
    const { queue, write, attempts } = setup();
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 1,
      source: 'possibly published',
    });
    await Promise.resolve();
    attempts[0]!.reject(new Error('IPC lost after possible publication'));
    await expect(queue.flush()).rejects.toThrow();
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 2,
      source: 'original',
    });
    queue.retry('grant-a');
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]![0]).toEqual({
      documentId: 'grant-a',
      expectedDiskRevision: 'disk-0',
      source: 'original',
    });
    attempts[1]!.reject(
      new Error('Stale revision: reconcile the actual disk version first'),
    );
    await expect(queue.flush()).rejects.toThrow();
    expect(queue.state('grant-a').status).toBe('blocked');
  });

  it('a blocked document does not prevent a different document from becoming durable', async () => {
    const { queue, attempts } = setup();
    queue.attach({
      documentId: 'grant-b',
      editorRevision: 0,
      source: 'B',
      diskRevision: 'b0',
    });
    queue.accept({ documentId: 'grant-a', editorRevision: 1, source: 'A1' });
    queue.accept({ documentId: 'grant-b', editorRevision: 1, source: 'B1' });
    await Promise.resolve();
    attempts[0]!.reject(new Error('permission denied'));
    attempts[1]!.resolve({ diskRevision: 'b1', durable: true });
    await expect(queue.flush()).rejects.toMatchObject({
      documentIds: ['grant-a'],
    });
    expect(queue.state('grant-b').status).toBe('saved');
    expect(queue.state('grant-a').latest.source).toBe('A1');
  });

  it('a synchronous writer exception blocks instead of leaking an unhandled promise or losing text', async () => {
    const queue = new AutosaveCoordinator(() => {
      throw Error('transport unavailable');
    });
    queue.attach({
      documentId: 'grant',
      editorRevision: 0,
      source: 'old',
      diskRevision: '0',
    });
    queue.accept({ documentId: 'grant', editorRevision: 1, source: 'new' });
    await expect(queue.flush()).rejects.toThrow();
    expect(queue.state('grant')).toMatchObject({
      status: 'blocked',
      latest: { source: 'new' },
    });
  });

  it('same-turn source changes coalesce before dispatch, including undo/redo revisions', async () => {
    const { queue, write, attempts } = setup();
    queue.accept({ documentId: 'grant-a', editorRevision: 1, source: 'first' });
    queue.accept({
      documentId: 'grant-a',
      editorRevision: 2,
      source: 'original',
    });
    queue.accept({ documentId: 'grant-a', editorRevision: 3, source: 'redo' });
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0].source).toBe('redo');
    attempts[0]!.resolve({ diskRevision: '1', durable: true });
    await queue.flush();
    expect(queue.state('grant-a').persisted.editorRevision).toBe(3);
  });

  it('inherited non-durable baselines cannot be silently closed or skipped on identical text', async () => {
    const { queue, write, attempts } = setup();
    queue.attach({
      documentId: 'uncertain',
      editorRevision: 0,
      source: 'text',
      diskRevision: 'u0',
      durable: false,
    });
    await expect(queue.flush()).rejects.toMatchObject({
      documentIds: ['uncertain'],
    });
    expect(() => queue.release('uncertain')).toThrow();
    queue.retry('uncertain');
    await Promise.resolve();
    expect(write.mock.calls[0]![0]).toEqual({
      documentId: 'uncertain',
      expectedDiskRevision: 'u0',
      source: 'text',
    });
    attempts[0]!.resolve({ diskRevision: 'u1', durable: true });
    await queue.flush();
    queue.release('uncertain');
  });

  it.each([
    { diskRevision: '', durable: true },
    { diskRevision: 7, durable: true },
    { diskRevision: 'next', durable: undefined },
    null,
  ])(
    'fails closed on a malformed write acknowledgement %s',
    async (receipt) => {
      const { queue, attempts } = setup();
      queue.accept({ documentId: 'grant-a', editorRevision: 1, source: 'new' });
      await Promise.resolve();
      attempts[0]!.resolve(receipt as unknown as WriteReceipt);
      await expect(queue.flush()).rejects.toThrow();
      expect(queue.state('grant-a')).toMatchObject({
        status: 'blocked',
        diskRevision: 'disk-0',
        latest: { source: 'new' },
      });
    },
  );

  it('unknown document identities cannot write and state snapshots cannot mutate accepted source', async () => {
    const { queue, write } = setup();
    expect(() =>
      queue.accept({
        documentId: '/arbitrary/file',
        editorRevision: 1,
        source: 'no',
      }),
    ).toThrow();
    const state = queue.state('grant-a');
    // Cast deliberately imitates an accidental mutable view consumer.
    (state.latest as { source: string }).source = 'changed outside authority';
    await queue.flush();
    expect(queue.state('grant-a').latest.source).toBe('original');
    expect(write).not.toHaveBeenCalled();
  });

  it('never reuses a released session identity for a later opening that an old view could overwrite', async () => {
    const { queue, write } = setup();
    const lateOldView = () =>
      queue.accept({
        documentId: 'grant-a',
        editorRevision: 7,
        source: 'stale view',
      });
    queue.release('grant-a');
    expect(() =>
      queue.attach({
        documentId: 'grant-a',
        editorRevision: 0,
        source: 'new opening',
        diskRevision: 'new-grant-revision',
      }),
    ).toThrow();
    expect(lateOldView).toThrow();
    queue.attach({
      documentId: 'new-session',
      editorRevision: 0,
      source: 'new opening',
      diskRevision: 'new-grant-revision',
    });
    await queue.flush();
    expect(queue.state('new-session').latest.source).toBe('new opening');
    expect(write).not.toHaveBeenCalled();
  });
});
