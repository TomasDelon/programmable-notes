import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as product from '../../src/application/nativeProduct';
import * as services from '../../src/desktop/nativeProductServices';
import type { NativeClosePorts } from '../../src/desktop/nativeClose';
import type { SnapshotInput } from '../../src/documents/recovery';
import { createNativeProductBootstrap } from '../../src/desktop/nativeProductBootstrap';
import { NativeProductEntry } from '../../src/desktop/NativeProductEntry';

const epoch = 'a'.repeat(32);
const request = 'b'.repeat(32);
const state = (phase = 'idle', nonce: string | null = null) => ({
  version: 1,
  epoch,
  phase,
  request: nonce,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  let nativeState = state();
  const copies = new Map<string, SnapshotInput>();
  let generation = 0;
  const ports = {
    dirty: vi.fn(async () => {}),
    snapshot: vi.fn(async (input: SnapshotInput) => {
      const id = `snapshot-${++generation}`;
      const file = `${id}.json`;
      copies.set(file, { ...input });
      return {
        durable: true,
        warning: null,
        snapshot: {
          id,
          file,
          metadata: {
            schema: 1 as const,
            documentId: input.documentId,
            name: input.name,
            baseline: input.baseline,
            parent: input.parent,
            generation,
            createdAtMs: 1,
            sourceBytes: new TextEncoder().encode(input.source).length,
          },
        },
      };
    }),
    restoreSnapshot: vi.fn(async (file: string) => {
      const input = copies.get(file)!;
      return { name: input.name, source: input.source };
    }),
    chooseVault: vi.fn(async () => ({
      vaultId: 'vault',
      displayPath: '/synthetic/Notes',
    })),
    vaultInventory: vi.fn(async () => ({
      vaultId: 'vault',
      entries: [{ logicalPath: 'note.md', bytes: 8 }],
    })),
    openVaultSources: vi.fn(async () => ({
      status: 'acquired' as const,
      vaultId: 'vault',
      documents: [
        {
          id: 'grant',
          revision: 'disk-0',
          logicalPath: 'note.md',
          name: 'note.md',
          displayPath: '/synthetic/Notes/note.md',
          source: '# Note\r\n',
          durabilityWarning: false,
        },
      ],
    })),
    createVaultSource: vi.fn(async () => {
      throw Error('unused create');
    }),
    save: vi.fn(async () => ({ revision: 'disk-1', durable: true })),
    close: vi.fn(async () => {}),
  };
  const closePorts = {
    enable: vi.fn<NativeClosePorts['enable']>(async () => state()),
    read: vi.fn<NativeClosePorts['read']>(async () => nativeState),
    resolve: vi.fn<NativeClosePorts['resolve']>(
      async (_epoch, nonce, action) => {
        nativeState =
          action === 'commit' ? state('committing', nonce) : state();
        return {
          status: action === 'commit' ? 'committing' : 'cancelled',
          epoch,
          request: nonce,
          reason: null,
          state: nativeState,
        };
      },
    ),
  };
  const owner = createNativeProductBootstrap(ports, closePorts);
  return {
    ports,
    closePorts,
    owner,
    request() {
      nativeState = state('requested', request);
    },
  };
}
const stops: (() => void)[] = [];
const rangeDescriptors = ['getClientRects', 'getBoundingClientRect'].map(
  (key) =>
    [key, Object.getOwnPropertyDescriptor(Range.prototype, key)] as const,
);
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
});
afterEach(() => {
  cleanup();
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const [key, descriptor] of rangeDescriptors) {
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});

it('starts one real guarded host and model outside StrictMode and repeated entry renders', async () => {
  const host = vi.spyOn(services, 'createGuardedNativeProductHost');
  const model = vi.spyOn(product, 'createNativeProduct');
  const f = fixture();
  const pending = f.owner.start();
  expect(f.owner.start()).toBe(pending);
  const session = await pending;
  const ui = render(
    <StrictMode>
      <NativeProductEntry session={session} />
    </StrictMode>,
  );
  ui.rerender(
    <StrictMode>
      <NativeProductEntry session={session} />
    </StrictMode>,
  );
  expect(await f.owner.start()).toBe(session);
  expect(host).toHaveBeenCalledOnce();
  expect(model).toHaveBeenCalledOnce();
  expect(f.closePorts.enable).toHaveBeenCalledExactlyOnceWith(1);
  expect(
    screen.getByRole('main', { name: 'Document workspace' }),
  ).toBeInTheDocument();
  expect(f.ports.chooseVault).not.toHaveBeenCalled();
});

it('holds all authority and product construction until exact negotiation acknowledgement', async () => {
  const gate = deferred<unknown>();
  const f = fixture();
  f.closePorts.enable.mockImplementation(() => gate.promise);
  const model = vi.spyOn(product, 'createNativeProduct');
  const pending = f.owner.start();
  await waitFor(() => expect(f.closePorts.enable).toHaveBeenCalledOnce());
  for (const port of Object.values(f.ports))
    expect(port).not.toHaveBeenCalled();
  expect(model).not.toHaveBeenCalled();
  expect(screen.queryByRole('main', { name: 'Document workspace' })).toBeNull();
  gate.resolve(state());
  await pending;
  expect(model).toHaveBeenCalledOnce();
});

it('captures storage and native-close bindings when the owner is created, before start', async () => {
  const f = fixture();
  const original = {
    dirty: f.ports.dirty,
    choose: f.ports.chooseVault,
    enable: f.closePorts.enable,
  };
  f.ports.dirty = vi.fn(async () => {
    throw Error('replaced dirty');
  });
  f.ports.chooseVault = vi.fn(async () => {
    throw Error('replaced chooser');
  });
  f.closePorts.enable = vi.fn(async () => {
    throw Error('replaced negotiation');
  });
  for (const port of Object.values(original))
    expect(port).not.toHaveBeenCalled();
  const session = await f.owner.start();
  await session.application.chooseVault();
  expect(original.enable).toHaveBeenCalledExactlyOnceWith(1);
  expect(original.choose).toHaveBeenCalledOnce();
  expect(original.dirty).toHaveBeenCalled();
  expect(f.ports.dirty).not.toHaveBeenCalled();
  expect(f.ports.chooseVault).not.toHaveBeenCalled();
  expect(f.closePorts.enable).not.toHaveBeenCalled();
});

it('does not construct a model or acquire authority after fatal failure during negotiation', async () => {
  const f = fixture();
  const gate = deferred<unknown>();
  f.closePorts.enable.mockImplementation(() => gate.promise);
  const model = vi.spyOn(product, 'createNativeProduct');
  const pending = f.owner.start();
  await waitFor(() => expect(f.closePorts.enable).toHaveBeenCalledOnce());
  f.owner.fail();
  gate.resolve(state());
  await expect(pending).rejects.toThrow(
    'Native workspace could not start safely.',
  );
  expect(f.owner.start()).toBe(pending);
  expect(model).not.toHaveBeenCalled();
  for (const port of Object.values(f.ports))
    expect(port).not.toHaveBeenCalled();
});

it('keeps a timed-out startup rejected when its negotiation acknowledgement arrives late', async () => {
  const f = fixture();
  const gate = deferred<unknown>();
  f.closePorts.enable.mockImplementation(() => gate.promise);
  const model = vi.spyOn(product, 'createNativeProduct');
  const pending = f.owner.start();
  await waitFor(() => expect(f.closePorts.enable).toHaveBeenCalledOnce());
  const rejection = expect(pending).rejects.toThrow(
    'Native workspace could not start safely.',
  );
  await rejection;
  gate.resolve(state());
  await Promise.resolve();
  expect(f.owner.start()).toBe(pending);
  expect(model).not.toHaveBeenCalled();
  for (const port of Object.values(f.ports))
    expect(port).not.toHaveBeenCalled();
});

it.each(['reject', 'malformed'] as const)(
  'keeps %s negotiation permanently failed without retry or fallback authority',
  async (failure) => {
    const f = fixture();
    if (failure === 'reject')
      f.closePorts.enable.mockRejectedValue(Error('private failure'));
    else
      f.closePorts.enable.mockResolvedValue({ ...state(), extra: 'invalid' });
    const pending = f.owner.start();
    await expect(pending).rejects.toThrow(
      'Native workspace could not start safely.',
    );
    expect(f.owner.start()).toBe(pending);
    await expect(f.owner.start()).rejects.toThrow(
      'Native workspace could not start safely.',
    );
    expect(f.closePorts.enable).toHaveBeenCalledOnce();
    for (const port of Object.values(f.ports))
      expect(port).not.toHaveBeenCalled();
  },
);

function Crash({ fail }: { fail: boolean }) {
  if (fail) throw Error('private render failure');
  return null;
}
const fatalRenderOptions = {
  // The permanent latch also applies when React retries an interrupted render.
  // Account for that expected recovery report without swallowing other errors.
  onRecoverableError(error: unknown) {
    expect(error).toMatchObject({
      cause: { message: 'private render failure' },
    });
  },
};
function failBoundary(
  Boundary: Awaited<
    ReturnType<ReturnType<typeof fixture>['owner']['start']>
  >['Boundary'],
) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const ui = render(
    <Boundary>
      <Crash fail={false} />
    </Boundary>,
    fatalRenderOptions,
  );
  ui.rerender(
    <Boundary>
      <Crash fail />
    </Boundary>,
  );
  return ui;
}
async function requested(
  f: ReturnType<typeof fixture>,
  app: Awaited<ReturnType<typeof f.owner.start>>['application'],
) {
  stops.push(app.subscribe(() => {}));
  f.request();
  await waitFor(() => expect(app.snapshot().closeRequestId).toBe(request));
}

it('never commits, reloads, remounts or claims saved after fatal failure with actual pending Preview composition', async () => {
  const f = fixture();
  const session = await f.owner.start();
  await session.application.chooseVault();
  await session.application.open('note.md');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const ui = render(
    <NativeProductEntry session={session} />,
    fatalRenderOptions,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show document modes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  const editor = screen.getByRole('textbox', { name: 'Editable document' });
  fireEvent.compositionStart(editor);
  editor.querySelector('p, h1')!.textContent = 'Unpublished IME';
  vi.spyOn(session.application, 'loadedDocument').mockImplementationOnce(() => {
    throw Error('private render failure');
  });
  ui.rerender(<NativeProductEntry session={session} />);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(
    screen.getByText(/Save and close completion cannot be confirmed/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /reload|restart|close/i }),
  ).toBeNull();
  expect(screen.queryByText(/Saved to file|last saved|site data/)).toBeNull();
  expect(f.closePorts.resolve).not.toHaveBeenCalled();
  ui.rerender(<NativeProductEntry session={session} />);
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(await f.owner.start()).toBe(session);
  expect(session.application.snapshot().loadedDocuments).toHaveLength(1);
});

it('blocks a queued close commit when fatal failure arrives during real aggregate flush', async () => {
  const f = fixture();
  const save = deferred<{ revision: string; durable: boolean }>();
  f.ports.save.mockImplementation(() => save.promise);
  const session = await f.owner.start();
  const app = session.application;
  await app.chooseVault();
  await app.open('note.md');
  const id = app.snapshot().selectedSessionId!;
  app
    .session(id)
    .publish({ expected: app.session(id).witness, source: '# Changed\r\n' });
  await requested(f, app);
  const outcome = app.prepareClose(() => true);
  await waitFor(() => expect(f.ports.save).toHaveBeenCalled());
  failBoundary(session.Boundary);
  save.resolve({ revision: 'disk-1', durable: true });
  expect(await outcome).toBe('uncertain');
  expect(f.closePorts.resolve).not.toHaveBeenCalled();
  expect(app.snapshot().closeUncertain).toBe(true);
  expect(app.session(id).witness.source).toBe('# Changed\r\n');
});

it('reports uncertainty when fatal failure follows an already dispatched commit without retry or cancellation', async () => {
  const f = fixture();
  const receipt = deferred<unknown>();
  f.closePorts.resolve.mockImplementation(() => receipt.promise);
  const session = await f.owner.start();
  await requested(f, session.application);
  const outcome = session.application.prepareClose(() => true);
  await waitFor(() =>
    expect(f.closePorts.resolve).toHaveBeenCalledExactlyOnceWith(
      epoch,
      request,
      'commit',
    ),
  );
  failBoundary(session.Boundary);
  await act(async () =>
    receipt.resolve({
      status: 'committing',
      epoch,
      request,
      reason: null,
      state: state('committing', request),
    }),
  );
  expect(await outcome).toBe('uncertain');
  expect(f.closePorts.resolve).toHaveBeenCalledOnce();
  expect(session.application.snapshot().closeUncertain).toBe(true);
});
