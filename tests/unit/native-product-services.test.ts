import { expect, it, vi } from 'vitest';
import {
  createGuardedNativeProductHost,
  createNativeProductServices,
} from '../../src/desktop/nativeProductServices';
import type {
  SnapshotInput,
  SnapshotWritten,
} from '../../src/documents/recovery';

function fixture() {
  const copies = new Map<string, SnapshotInput>();
  let sequence = 0;
  const ports = {
    dirty: vi.fn(async () => {}),
    snapshot: vi.fn(async (input: SnapshotInput): Promise<SnapshotWritten> => {
      const id = `snapshot-${++sequence}`;
      const file = `${id}.json`;
      copies.set(file, { ...input });
      return {
        durable: true,
        warning: null,
        snapshot: {
          id,
          file,
          metadata: {
            schema: 1,
            documentId: input.documentId,
            name: input.name,
            baseline: input.baseline,
            parent: input.parent,
            generation: sequence,
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
  };
  return {
    ports,
    services: createNativeProductServices(ports, () => 'private-test-identity'),
  };
}
const input = () => ({
  sessionId: 'session-a',
  logicalPath: 'notes/plain.md',
  batch: {
    expected: {
      sessionId: 'session-a',
      editorRevision: 2,
      source: '\uFEFFbase\r\n',
    },
    source: '\uFEFFattempt\r\n😀',
  },
});
it('acknowledges captured recovery bytes only after matching metadata and exact readback', async () => {
  const h = fixture();
  const attempt = input();
  const pending = h.services.preserveAttempt(attempt);
  attempt.batch.source = 'caller mutation';
  attempt.logicalPath = 'other.mdx';
  expect(await pending).toEqual({ durable: true });
  expect(h.ports.snapshot.mock.calls[0]![0]).toMatchObject({
    name: 'plain.md',
    source: '\uFEFFattempt\r\n😀',
    parent: null,
  });
  await h.services.preserveAttempt(input());
  expect(h.ports.snapshot.mock.calls[1]![0].parent).toBe('snapshot-1');
  expect(h.ports.restoreSnapshot).toHaveBeenCalledTimes(2);
});
it('refuses cross-session attempts before IPC and cannot turn a mismatching readback into durable recovery', async () => {
  const h = fixture();
  await expect(
    h.services.preserveAttempt({ ...input(), sessionId: 'session-b' }),
  ).rejects.toThrow();
  expect(h.ports.snapshot).not.toHaveBeenCalled();
  h.ports.restoreSnapshot.mockResolvedValueOnce({
    name: 'plain.md',
    source: 'other bytes',
  });
  await expect(h.services.preserveAttempt(input())).rejects.toThrow(/readback/);
});
it('does not acknowledge non-durable or foreign snapshot metadata', async () => {
  for (const changed of ['durability', 'identity'] as const) {
    const h = fixture();
    const append = h.ports.snapshot.getMockImplementation()!;
    h.ports.snapshot.mockImplementationOnce(async (value) => {
      const receipt = await append(value);
      if (changed === 'durability') receipt.durable = false;
      else receipt.snapshot.metadata.documentId = 'foreign';
      return receipt;
    });
    await expect(h.services.preserveAttempt(input())).rejects.toThrow(
      /acknowledgement/,
    );
    expect(h.ports.restoreSnapshot).not.toHaveBeenCalled();
  }
});

function bootstrapPorts() {
  const h = fixture();
  return {
    ...h.ports,
    chooseVault: vi.fn(async () => null),
    vaultInventory: vi.fn(async () => ({ vaultId: 'vault', entries: [] })),
    openVaultSources: vi.fn(async () => ({
      status: 'acquired' as const,
      vaultId: 'vault',
      documents: [],
    })),
    createVaultSource: vi.fn(async () => {
      throw Error('unused synthetic create');
    }),
    save: vi.fn(async () => ({ revision: 'next', durable: true })),
    close: vi.fn(async () => {}),
  };
}
function closeBootstrapPorts() {
  return {
    enable: vi.fn(async () => ({
      version: 1,
      epoch: 'a'.repeat(32),
      phase: 'idle',
      request: null,
    })),
    read: vi.fn(async () => ({
      version: 1,
      epoch: 'a'.repeat(32),
      phase: 'idle',
      request: null,
    })),
    resolve: vi.fn(async () => {
      throw Error('unused synthetic close');
    }),
  };
}
it('negotiates before constructing a guarded host and never invokes storage during bootstrap', async () => {
  const ports = bootstrapPorts(),
    closePorts = closeBootstrapPorts();
  let release!: (value: Awaited<ReturnType<typeof closePorts.enable>>) => void;
  closePorts.enable.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = createGuardedNativeProductHost(ports, closePorts);
  expect(closePorts.enable).toHaveBeenCalledExactlyOnceWith(1);
  for (const port of Object.values(ports)) expect(port).not.toHaveBeenCalled();
  let constructed = false;
  void pending.then(() => {
    constructed = true;
  });
  await Promise.resolve();
  expect(constructed).toBe(false);
  release({ version: 1, epoch: 'a'.repeat(32), phase: 'idle', request: null });
  const host = await pending;
  expect(host.services.closeGuard).toBeDefined();
  expect(host.workspace.state().sessions).toEqual([]);
  for (const port of Object.values(ports)) expect(port).not.toHaveBeenCalled();
  expect(closePorts.read).not.toHaveBeenCalled();
});
it('captures storage and close bindings before delayed negotiation and uses the captured host ports', async () => {
  const ports = bootstrapPorts(),
    closePorts = closeBootstrapPorts(),
    originalDirty = ports.dirty,
    originalChoose = ports.chooseVault;
  let release!: (value: Awaited<ReturnType<typeof closePorts.enable>>) => void;
  closePorts.enable.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = createGuardedNativeProductHost(ports, closePorts);
  ports.dirty = vi.fn(async () => {
    throw Error('replaced dirty');
  });
  ports.chooseVault = vi.fn(async () => {
    throw Error('replaced chooser');
  });
  closePorts.enable = vi.fn(async () => {
    throw Error('replaced enable');
  });
  release({ version: 1, epoch: 'a'.repeat(32), phase: 'idle', request: null });
  const host = await pending;
  await host.services.setCloseState({ dirty: true, busy: true });
  await host.workspace.choose();
  expect(originalDirty).toHaveBeenCalledExactlyOnceWith(true, true);
  expect(originalChoose).toHaveBeenCalledOnce();
  expect(ports.dirty).not.toHaveBeenCalled();
  expect(ports.chooseVault).not.toHaveBeenCalled();
  expect(closePorts.enable).not.toHaveBeenCalled();
});
it('does not fall back to an unguarded host or issue storage IPC after failed negotiation', async () => {
  const ports = bootstrapPorts(),
    closePorts = closeBootstrapPorts();
  closePorts.enable.mockRejectedValueOnce(Error('private detail'));
  await expect(
    createGuardedNativeProductHost(ports, closePorts),
  ).rejects.toThrow('Native close negotiation failed.');
  for (const port of Object.values(ports)) expect(port).not.toHaveBeenCalled();
  expect(closePorts.read).not.toHaveBeenCalled();
});
