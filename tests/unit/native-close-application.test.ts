import { expect, it, vi } from 'vitest';
import { createNativeWorkspace } from '../../src/application/nativeWorkspace';
import { createNativeProduct } from '../../src/application/nativeProduct';
import type {
  NativeProductServices,
  ProductCloseGuard,
  ProductCloseResolution,
  ProductCloseState,
} from '../../src/product/productApplication';

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
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const idle: ProductCloseState = { phase: 'idle', request: null };
function fixture() {
  let sequence = 0;
  let observed!: (value: ProductCloseState) => void;
  let failed!: (reason: unknown) => void;
  const stop = vi.fn();
  const resolve = vi.fn<ProductCloseGuard['resolve']>(
    async (request, action) => ({
      status: action === 'commit' ? 'committing' : 'cancelled',
      request,
      reason: null,
      state: action === 'commit' ? { phase: 'committing', request } : idle,
    }),
  );
  const guard: ProductCloseGuard = {
    observe: vi.fn((changed, onError) => {
      observed = changed;
      failed = onError;
      return stop;
    }),
    resolve,
  };
  const services: NativeProductServices = {
    closeGuard: guard,
    setCloseState: vi.fn(async () => {}),
    preserveAttempt: vi.fn(async () => ({ durable: true })),
  };
  const save = vi.fn(async () => ({ revision: 'disk-1', durable: true }));
  const workspace = createNativeWorkspace(
    {
      chooseVault: async () => ({
        vaultId: 'vault',
        displayPath: '/synthetic',
      }),
      vaultInventory: async () => ({
        vaultId: 'vault',
        entries: [{ logicalPath: 'note.md', bytes: 12 }],
      }),
      openVaultSources: async () => ({
        status: 'acquired',
        vaultId: 'vault',
        documents: [
          {
            id: 'grant',
            revision: 'disk-0',
            logicalPath: 'note.md',
            name: 'note.md',
            displayPath: '/synthetic/note.md',
            source: '\uFEFF# Note\r\n',
            durabilityWarning: false,
          },
        ],
      }),
      createVaultSource: async () => {
        throw Error('not needed');
      },
      save,
      close: async () => {},
    },
    () => `session-${++sequence}`,
  );
  const app = createNativeProduct(workspace, services);
  const subscribe = () => app.subscribe(() => {});
  const request = (id = 'request-1') =>
    observed({ phase: 'requested', request: id });
  async function open() {
    await app.chooseVault();
    await app.open('note.md');
    return app.snapshot().selectedSessionId!;
  }
  return {
    app,
    workspace,
    services,
    guard,
    resolve,
    stop,
    save,
    subscribe,
    request,
    open,
    error: (e: unknown) => failed(e),
    oldObserver: () => observed,
  };
}

it('starts one observer on first subscriber, retires it on last, and ignores retired callbacks', () => {
  const h = fixture();
  expect(h.guard.observe).not.toHaveBeenCalled();
  const a = h.subscribe(),
    b = h.subscribe();
  expect(h.guard.observe).toHaveBeenCalledOnce();
  const old = h.oldObserver();
  h.request();
  expect(h.app.snapshot().closeRequestId).toBe('request-1');
  a();
  expect(h.stop).not.toHaveBeenCalled();
  b();
  expect(h.stop).toHaveBeenCalledOnce();
  old({ phase: 'requested', request: 'retired' });
  expect(h.app.snapshot().closeRequestId).toBe('request-1');
  const c = h.subscribe();
  expect(h.guard.observe).toHaveBeenCalledTimes(2);
  c();
});
it('detaches and gates publication synchronously, flushes exact originals then commits once', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  const write = deferred<{ revision: string; durable: boolean }>();
  h.save.mockImplementation(() => write.promise);
  const session = h.app.session(id);
  session.publish({ expected: session.witness, source: '\uFEFF# Changed\r\n' });
  h.request();
  const detach = vi.fn(() => true);
  const closing = h.app.prepareClose(detach);
  expect(detach).toHaveBeenCalledOnce();
  expect(h.app.snapshot().closing).toBe(true);
  expect(() =>
    session.publish({ expected: session.witness, source: 'must refuse' }),
  ).toThrow('Source publication refused');
  expect(h.resolve).not.toHaveBeenCalled();
  write.resolve({ revision: 'disk-1', durable: true });
  await expect(closing).resolves.toBe('committing');
  expect(h.resolve).toHaveBeenCalledExactlyOnceWith('request-1', 'commit');
  expect(session.witness.source).toBe('\uFEFF# Changed\r\n');
  expect(h.app.documents.state(id).phase).toBe('closing');
});
it('refuses detachment during an already-admitted operation waiting for its initial hint', async () => {
  const h = fixture();
  h.subscribe();
  await tick();
  const hint = deferred<void>();
  vi.mocked(h.services.setCloseState).mockImplementationOnce(
    () => hint.promise,
  );
  const choose = h.app.chooseVault();
  h.request();
  const detach = vi.fn(() => true);
  await expect(h.app.prepareClose(detach)).resolves.toBe('editing');
  expect(detach).not.toHaveBeenCalled();
  expect(h.resolve).toHaveBeenCalledWith('request-1', 'cancel');
  hint.resolve();
  await choose;
});
it('keeps a refused IME barrier mounted and cancels without acquiring aggregate admission', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  h.app.documents.setUnapplied(id, true);
  h.request();
  const cancel = deferred<ProductCloseResolution>();
  h.resolve.mockImplementation(() => cancel.promise);
  const closing = h.app.prepareClose(() => false);
  expect(h.app.snapshot().closing).toBe(false);
  expect(h.app.documents.state(id).unapplied).toBe(true);
  expect(h.app.documents.state(id).phase).toBe('open');
  cancel.resolve({
    status: 'cancelled',
    request: 'request-1',
    reason: null,
    state: idle,
  });
  await expect(closing).resolves.toBe('editing');
  expect(h.app.documents.state(id).unapplied).toBe(true);
});
it('waits for canonical recovery and hint tails before native commit', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  const recovery = deferred<{ durable: boolean }>();
  vi.mocked(h.services.preserveAttempt).mockImplementationOnce(
    () => recovery.promise,
  );
  const session = h.app.session(id);
  session.publish({ expected: session.witness, source: 'saved text' });
  await tick();
  h.request();
  const closing = h.app.prepareClose(() => true);
  await tick();
  expect(h.resolve).not.toHaveBeenCalled();
  recovery.resolve({ durable: true });
  await expect(closing).resolves.toBe('committing');
});
it('late retained reports invalidate close and survive a definite cancellation', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  const write = deferred<{ revision: string; durable: boolean }>();
  h.save.mockImplementation(() => write.promise);
  const session = h.app.session(id);
  session.publish({ expected: session.witness, source: 'accepted' });
  h.request();
  const closing = h.app.prepareClose(() => true);
  const batch = { expected: session.witness, source: 'late retained' };
  session.retainFailure(batch);
  h.app.documents.setUnapplied(id, true);
  write.resolve({ revision: 'disk-1', durable: true });
  await expect(closing).resolves.toBe('editing');
  expect(h.resolve).toHaveBeenCalledExactlyOnceWith('request-1', 'cancel');
  expect(h.app.documents.state(id).retainedFailures).toEqual([batch]);
  expect(h.app.documents.state(id).unapplied).toBe(true);
  expect(h.app.documents.state(id).phase).toBe('open');
});
it('blocked original writes cancel and retain the edited source and CAS baseline', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  h.save.mockRejectedValue(Error('external conflict'));
  const session = h.app.session(id);
  session.publish({ expected: session.witness, source: 'my edit' });
  h.request();
  await expect(h.app.prepareClose(() => true)).resolves.toBe('editing');
  expect(session.witness.source).toBe('my edit');
  expect(h.app.documents.state(id).autosave.diskRevision).toBe('disk-0');
  expect(h.resolve).toHaveBeenCalledExactlyOnceWith('request-1', 'cancel');
});
it('a refused native commit requires an exact acknowledged cancel before reopening', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  const cancel = deferred<ProductCloseResolution>();
  h.resolve.mockImplementation(async (request, action) =>
    action === 'commit'
      ? {
          status: 'refused',
          request,
          reason: 'native busy',
          state: { phase: 'requested', request },
        }
      : cancel.promise,
  );
  h.request();
  const closing = h.app.prepareClose(() => true);
  await tick();
  expect(h.app.documents.state(id).phase).toBe('closing');
  cancel.resolve({
    status: 'cancelled',
    request: 'request-1',
    reason: null,
    state: idle,
  });
  await expect(closing).resolves.toBe('editing');
  expect(h.app.documents.state(id).phase).toBe('open');
});
it.each(['lost', 'mismatched', 'wrongphase'] as const)(
  'keeps identities and source held after %s native commit reply',
  async (mode) => {
    const h = fixture();
    h.subscribe();
    const id = await h.open();
    h.resolve.mockImplementation(async (request) => {
      if (mode === 'lost') throw Error('lost reply');
      return {
        status: 'committing',
        request: mode === 'mismatched' ? 'different' : request,
        reason: null,
        state: {
          phase: mode === 'wrongphase' ? 'idle' : 'committing',
          request,
        },
      };
    });
    h.request();
    await expect(h.app.prepareClose(() => true)).resolves.toBe('uncertain');
    expect(h.app.snapshot().closeUncertain).toBe(true);
    expect(h.app.snapshot().closing).toBe(true);
    expect(h.app.documents.state(id).phase).toBe('close-uncertain');
    expect(h.resolve).toHaveBeenCalledTimes(1);
    expect(() => h.app.select(id)).toThrow();
  },
);
it('lost cancel acknowledgement never reports safe editing or drops an IME draft', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  h.app.documents.setUnapplied(id, true);
  h.resolve.mockRejectedValue(Error('lost cancel'));
  h.request();
  await expect(h.app.prepareClose(() => false)).resolves.toBe('uncertain');
  expect(h.app.snapshot().closeUncertain).toBe(true);
  expect(h.app.documents.state(id).unapplied).toBe(true);
});
it('duplicates share the existing close operation without a second detach or commit', async () => {
  const h = fixture();
  h.subscribe();
  await h.open();
  const reply = deferred<ProductCloseResolution>();
  h.resolve.mockImplementation(() => reply.promise);
  h.request();
  const detach = vi.fn(() => true);
  const a = h.app.prepareClose(detach),
    b = h.app.prepareClose(detach);
  await tick();
  expect(detach).toHaveBeenCalledOnce();
  expect(h.resolve).toHaveBeenCalledOnce();
  reply.resolve({
    status: 'committing',
    request: 'request-1',
    reason: null,
    state: { phase: 'committing', request: 'request-1' },
  });
  expect(await a).toBe('committing');
  expect(await b).toBe('committing');
});
it('buffers a fresh native request until old cancellation completes', async () => {
  const h = fixture();
  h.subscribe();
  const reply = deferred<ProductCloseResolution>();
  h.resolve.mockImplementation(() => reply.promise);
  h.request();
  const closing = h.app.prepareClose(() => false);
  h.request('request-2');
  expect(h.app.snapshot().closeRequestId).toBe('request-1');
  reply.resolve({
    status: 'cancelled',
    request: 'request-1',
    reason: null,
    state: idle,
  });
  expect(await closing).toBe('editing');
  expect(h.app.snapshot().closeRequestId).toBe('request-2');
});
it('can close an empty workspace without inventing a source session', async () => {
  const h = fixture();
  h.subscribe();
  h.request();
  await expect(h.app.prepareClose(() => true)).resolves.toBe('committing');
  expect(h.app.snapshot().loadedDocuments).toEqual([]);
});

it('late reports during the final commit acknowledgement become uncertainty rather than safe close or reopen', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  const reply = deferred<ProductCloseResolution>();
  h.resolve.mockImplementation(() => reply.promise);
  h.request();
  const closing = h.app.prepareClose(() => true);
  await tick();
  expect(h.resolve).toHaveBeenCalledExactlyOnceWith('request-1', 'commit');
  const batch = {
    expected: h.app.session(id).witness,
    source: 'late producer retained text',
  };
  h.app.session(id).retainFailure(batch);
  h.app.documents.setUnapplied(id, true);
  reply.resolve({
    status: 'committing',
    request: 'request-1',
    reason: null,
    state: { phase: 'committing', request: 'request-1' },
  });
  await expect(closing).resolves.toBe('uncertain');
  expect(h.app.documents.state(id).phase).toBe('close-uncertain');
  expect(h.app.documents.state(id).retainedFailures).toEqual([batch]);
  expect(h.app.documents.state(id).unapplied).toBe(true);
  expect(h.resolve).toHaveBeenCalledTimes(1);
});

it.each(['identity', 'phase', 'reason'] as const)(
  'a cancellation with wrong %s cannot reopen detached sessions',
  async (invalid) => {
    const h = fixture();
    h.subscribe();
    const id = await h.open();
    h.resolve.mockImplementation(async (request, action) =>
      action === 'commit'
        ? {
            status: 'refused',
            request,
            reason: 'native busy',
            state: { phase: 'requested', request },
          }
        : {
            status: 'cancelled',
            request: invalid === 'identity' ? 'foreign' : request,
            reason: invalid === 'reason' ? 'unexpected' : null,
            state: invalid === 'phase' ? { phase: 'requested', request } : idle,
          },
    );
    h.request();
    await expect(h.app.prepareClose(() => true)).resolves.toBe('uncertain');
    expect(h.app.documents.state(id).phase).toBe('close-uncertain');
    expect(h.app.snapshot().closing).toBe(true);
  },
);
it('an obsolete failed canonical recovery copy does not replace the original durable-save witness', async () => {
  const h = fixture();
  h.subscribe();
  const id = await h.open();
  vi.mocked(h.services.preserveAttempt).mockRejectedValue(
    Error('recovery write failed'),
  );
  const session = h.app.session(id);
  session.publish({ expected: session.witness, source: 'durable original' });
  await h.workspace.controller.flush();
  await tick();
  expect(h.app.documents.state(id).autosave.durable).toBe(true);
  h.request();
  await expect(h.app.prepareClose(() => true)).resolves.toBe('committing');
  expect(session.witness.source).toBe('durable original');
});

it('retires an acknowledged cancelled request so a delayed duplicate poll cannot start another close', async () => {
  const h = fixture();
  h.subscribe();
  h.request();
  await expect(h.app.prepareClose(() => false)).resolves.toBe('editing');
  h.request();
  expect(h.app.snapshot().closeRequestId).toBeNull();
  await expect(h.app.prepareClose(() => true)).resolves.toBe('editing');
  expect(h.resolve).toHaveBeenCalledExactlyOnceWith('request-1', 'cancel');
  h.request('request-2');
  expect(h.app.snapshot().closeRequestId).toBe('request-2');
});

it('reserves the close singleflight before invoking a synchronous trusted detach callback', async () => {
  const h = fixture();
  h.subscribe();
  await h.open();
  h.request();
  let nested: Promise<unknown> | undefined;
  const nestedDetach = vi.fn(() => true);
  const outer = h.app.prepareClose(() => {
    nested = h.app.prepareClose(nestedDetach);
    return true;
  });
  expect(nestedDetach).not.toHaveBeenCalled();
  await expect(outer).resolves.toBe('committing');
  expect(await nested).toBe('committing');
  expect(h.resolve).toHaveBeenCalledOnce();
});
