import { describe, expect, it, vi } from 'vitest';
import {
  createNativeWorkspace,
  type NativeWorkspacePorts,
} from '../../src/application/nativeWorkspace';
import { createNativeProduct } from '../../src/application/nativeProduct';
import type { NativeProductServices } from '../../src/product/productApplication';

function setup() {
  let sequence = 0;
  const disk = new Map([
    ['plain.md', '\uFEFF# Plain\r\n'],
    ['component.mdx', '# Component'],
  ]);
  const ports: NativeWorkspacePorts = {
    chooseVault: vi.fn(async () => ({
      vaultId: 'vault',
      displayPath: '/display/vault',
    })),
    vaultInventory: vi.fn(async (vaultId) => ({
      vaultId,
      entries: [...disk].map(([logicalPath, source]) => ({
        logicalPath,
        bytes: new TextEncoder().encode(source).length,
      })),
    })),
    openVaultSources: vi.fn(async (vaultId, paths) => ({
      status: 'acquired' as const,
      vaultId,
      documents: paths.map((logicalPath: string) => ({
        id: `grant-${logicalPath}`,
        revision: 'disk-0',
        logicalPath,
        name: logicalPath,
        displayPath: `/display/${logicalPath}`,
        source: disk.get(logicalPath)!,
        durabilityWarning: false,
      })),
    })),
    createVaultSource: vi.fn(async (vaultId, logicalPath, source) => {
      disk.set(logicalPath, source);
      return {
        status: 'acquired' as const,
        vaultId,
        document: {
          id: `grant-${logicalPath}`,
          revision: 'disk-0',
          logicalPath,
          name: logicalPath,
          displayPath: `/display/${logicalPath}`,
          source,
          durabilityWarning: false,
        },
      };
    }),
    save: vi.fn(async (id: string, _revision: string, source: string) => {
      disk.set(id.slice(6), source);
      return { revision: 'disk-1', durable: true };
    }),
    close: vi.fn(async () => {}),
  };
  const services: NativeProductServices = {
    setCloseState: vi.fn(async () => {}),
    preserveAttempt: vi.fn(async () => ({ durable: true })),
  };
  const workspace = createNativeWorkspace(ports, () => `session-${++sequence}`);
  return {
    ports,
    services,
    workspace,
    disk,
    app: createNativeProduct(workspace, services),
  };
}
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('native product application (PRODUCT-01, DATA-01/02, EDIT-01)', () => {
  it('composes the existing source session, exact autosave and stable structural projection', async () => {
    const h = setup();
    await h.app.chooseVault();
    await h.app.open('plain.md');
    const before = h.app.snapshot();
    const id = before.selectedSessionId!;
    expect(h.app.session(id)).toBe(h.workspace.session(id));
    expect(h.app.snapshot()).toBe(before);
    h.app.session(id).publish({
      expected: h.app.session(id).witness,
      source: '\uFEFF# Changed\r\n$unfinished',
    });
    await h.workspace.controller.flush();
    await tick();
    expect(h.disk.get('plain.md')).toBe('\uFEFF# Changed\r\n$unfinished');
    expect(h.app.snapshot()).toBe(before);
    expect(h.app.documents.state(id).autosave.status).toBe('saved');
    expect(JSON.stringify(h.app.snapshot())).not.toContain('grant-');
  });
  it('keeps immutable loaded metadata when inventory disappears and rejects retired identities', async () => {
    const h = setup();
    await h.app.chooseVault();
    await h.app.open('plain.md');
    const id = h.app.snapshot().selectedSessionId!;
    const metadata = h.app.loadedDocument(id);
    expect(Object.isFrozen(metadata)).toBe(true);
    h.disk.clear();
    await h.app.refreshInventory();
    expect(h.app.snapshot().entries).toEqual([]);
    expect(h.app.loadedDocument(id)).toBe(metadata);
    expect(h.app.snapshot().loadedDocuments).toEqual([metadata]);
    await h.app.closeDocument(id);
    expect(() => h.app.loadedDocument(id)).toThrow();
  });
  it('keeps external-conflict disk CAS on explicit retry and retains the edited buffer', async () => {
    const h = setup();
    await h.app.chooseVault();
    await h.app.open('plain.md');
    const id = h.app.snapshot().selectedSessionId!;
    vi.mocked(h.ports.save).mockRejectedValue(Error('external conflict'));
    h.app
      .session(id)
      .publish({ expected: h.app.session(id).witness, source: 'local edited' });
    await expect(h.workspace.controller.flush()).rejects.toThrow();
    await expect(h.app.retrySave(id)).rejects.toThrow();
    expect(
      vi.mocked(h.ports.save).mock.calls.every((call) => call[1] === 'disk-0'),
    ).toBe(true);
    expect(h.app.session(id).witness.source).toBe('local edited');
    expect(h.disk.get('plain.md')).toBe('\uFEFF# Plain\r\n');
  });
  it('clears only the matching retained batch after a durable recovery acknowledgement', async () => {
    const h = setup();
    await h.app.chooseVault();
    await h.app.open('plain.md');
    const id = h.app.snapshot().selectedSessionId!;
    const a = { expected: h.app.session(id).witness, source: 'attempt A' };
    const b = { expected: h.app.session(id).witness, source: 'attempt B' };
    h.app.session(id).retainFailure(a);
    h.app.session(id).retainFailure(b);
    vi.mocked(h.services.preserveAttempt).mockResolvedValueOnce({
      durable: false,
    });
    await expect(h.app.resolveAttempt(id, a, 'keep')).rejects.toThrow();
    expect(h.app.documents.state(id).retainedFailures).toHaveLength(2);
    await h.app.resolveAttempt(id, a, 'keep');
    expect(h.app.documents.state(id).retainedFailures).toEqual([b]);
    expect(h.app.session(id).witness.source).toBe('\uFEFF# Plain\r\n');
  });
  it('explicitly blocks aggregate native close without sending a clean closable hint', async () => {
    const h = setup();
    await h.app.chooseVault();
    await h.app.open('plain.md');
    await expect(h.app.prepareClose()).rejects.toThrow(
      /close.*unavailable|activation.*blocked/i,
    );
    expect(h.app.snapshot().closing).toBe(false);
    expect(
      h.app.documents.state(h.app.snapshot().selectedSessionId!).phase,
    ).toBe('open');
    expect(
      vi
        .mocked(h.services.setCloseState)
        .mock.calls.every(([s]) => s.busy || s.dirty),
    ).toBe(true);
  });
});

it('coalesces secondary recovery while its acknowledgement is held', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  const id = h.app.snapshot().selectedSessionId!;
  let acknowledge!: (value: { durable: boolean }) => void;
  const held = new Promise<{ durable: boolean }>((resolve) => {
    acknowledge = resolve;
  });
  vi.mocked(h.services.preserveAttempt).mockReturnValueOnce(held);
  vi.mocked(h.ports.save).mockReturnValue(new Promise(() => {}));
  for (let i = 0; i < 6; i++) {
    h.app
      .session(id)
      .publish({ expected: h.app.session(id).witness, source: `changed ${i}` });
    await tick();
  }
  acknowledge({ durable: true });
  await tick();
  expect(
    vi.mocked(h.services.preserveAttempt).mock.calls.length,
  ).toBeLessThanOrEqual(2);
  expect(
    vi.mocked(h.services.preserveAttempt).mock.calls.at(-1)![0].batch.source,
  ).toBe('changed 5');
});

it('persists an editor retained report without clearing it or claiming a memory copy is durable', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  const id = h.app.snapshot().selectedSessionId!;
  const batch = {
    expected: h.app.session(id).witness,
    source: 'retained exact source',
  };
  vi.mocked(h.services.preserveAttempt).mockResolvedValueOnce({
    durable: false,
  });
  await expect(h.app.retainAttempt(id, batch)).rejects.toThrow(/durable/);
  expect(h.app.documents.state(id).retainedFailures).toEqual([batch]);
  await h.app.retainAttempt(id, batch);
  expect(h.app.documents.state(id).retainedFailures).toEqual([batch]);
});

it('does not suppress another subscriber when a reader observes a deferred workspace change', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  const first = h.app.snapshot().selectedSessionId!;
  await h.app.open('component.mdx');
  await tick();
  const changed = vi.fn();
  const unsubscribe = h.app.subscribe(changed);
  h.workspace.select(first);
  expect(h.app.snapshot().selectedSessionId).toBe(first);
  await tick();
  expect(changed).toHaveBeenCalledTimes(1);
  unsubscribe();
});
it('flushes a held accepted write before reporting that native close release is unavailable', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  const id = h.app.snapshot().selectedSessionId!;
  let acknowledge!: (value: { revision: string; durable: boolean }) => void;
  vi.mocked(h.ports.save).mockReturnValueOnce(
    new Promise((resolve) => {
      acknowledge = resolve;
    }),
  );
  h.app
    .session(id)
    .publish({ expected: h.app.session(id).witness, source: 'held source' });
  await tick();
  let settled = false;
  const closing = h.app.prepareClose().catch((error) => {
    settled = true;
    return error;
  });
  await tick();
  expect(settled).toBe(false);
  acknowledge({ revision: 'disk-held', durable: true });
  expect((await closing).message).toMatch(/activation.*blocked/i);
  expect(h.app.documents.state(id).autosave.status).toBe('saved');
});

it('retains direct editor reports while a native protection acknowledgement is held', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  await tick();
  const id = h.app.snapshot().selectedSessionId!;
  let acknowledge!: () => void;
  vi.mocked(h.services.setCloseState).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      acknowledge = resolve;
    }),
  );
  const closing = h.app.prepareClose();
  const refused = expect(closing).rejects.toThrow();
  const before = h.app.session(id).witness;
  expect(() =>
    h.app.session(id).publish({ expected: before, source: 'must not publish' }),
  ).toThrow();
  h.app.documents.setUnapplied(id, true);
  const retained = { expected: before, source: 'exact late draft' };
  h.app.session(id).retainFailure(retained);
  await tick();
  acknowledge();
  await refused;
  expect(h.app.documents.state(id)).toMatchObject({
    phase: 'open',
    unapplied: true,
    retainedFailures: [retained],
    witness: before,
  });
  expect(h.ports.save).not.toHaveBeenCalled();
  expect(h.ports.close).not.toHaveBeenCalled();
  expect(
    vi
      .mocked(h.services.setCloseState)
      .mock.calls.every(([state]) => state.busy || state.dirty),
  ).toBe(true);
});
it('navigates a large inventory without reinterpreting it as the loaded graph and creates through native ports', async () => {
  const h = setup();
  for (let i = 0; i < 100; i++) h.disk.set(`notes/${i}.md`, `# ${i}`);
  await h.app.chooseVault();
  expect(h.app.snapshot().entries).toHaveLength(102);
  expect(h.app.snapshot().loadedDocuments).toHaveLength(0);
  await h.app.open('notes/99.md');
  expect(h.app.snapshot().loadedDocuments).toHaveLength(1);
  await h.app.create('new.md', '\uFEFFNew\r\n');
  const id = h.app.snapshot().selectedSessionId!;
  expect(h.app.loadedDocument(id).logicalPath).toBe('new.md');
  expect(h.ports.createVaultSource).toHaveBeenCalledExactlyOnceWith(
    'vault',
    'new.md',
    '\uFEFFNew\r\n',
  );
  h.app.session(id).publish({
    expected: h.app.session(id).witness,
    source: '\uFEFFNew edited\r\n',
  });
  await h.workspace.controller.flush();
  expect(h.disk.get('new.md')).toBe('\uFEFFNew edited\r\n');
});

it.each([true, false])(
  'confirms only a completed durable current-source recovery receipt (durable=%s)',
  async (durable) => {
    const h = setup();
    await h.app.chooseVault();
    await h.app.open('plain.md');
    const id = h.app.snapshot().selectedSessionId!;
    expect(h.app.recoveryAcknowledged?.(id)).toBe(false);
    let release!: (receipt: { durable: boolean }) => void;
    const held = new Promise<{ durable: boolean }>((resolve) => {
      release = resolve;
    });
    vi.mocked(h.services.preserveAttempt).mockReturnValue(held);
    vi.mocked(h.ports.save).mockRejectedValue(Error('save refused'));
    h.app.session(id).publish({
      expected: h.app.session(id).witness,
      source: 'pending exact source',
    });
    await expect(h.workspace.controller.flush()).rejects.toThrow();
    await tick();
    expect(h.app.recoveryAcknowledged?.(id)).toBe(false);
    release({ durable });
    await tick();
    expect(h.app.recoveryAcknowledged?.(id)).toBe(durable);
    expect(h.app.documents.state(id).autosave.status).toBe('blocked');
    expect(h.disk.get('plain.md')).toBe('\uFEFF# Plain\r\n');
  },
);

it('cannot reuse a late recovery acknowledgement after same-byte history changes', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  const id = h.app.snapshot().selectedSessionId!;
  const replies: ((receipt: { durable: boolean }) => void)[] = [];
  vi.mocked(h.services.preserveAttempt).mockImplementation(
    () => new Promise((resolve) => replies.push(resolve)),
  );
  vi.mocked(h.ports.save).mockRejectedValue(Error('save refused'));
  const publish = (source: string) =>
    h.app.session(id).publish({ expected: h.app.session(id).witness, source });
  publish('same');
  await expect(h.workspace.controller.flush()).rejects.toThrow();
  await tick();
  publish('different');
  publish('same');
  await tick();
  expect(replies).toHaveLength(1);
  replies[0]!({ durable: true });
  await tick();
  expect(h.app.recoveryAcknowledged?.(id)).toBe(false);
  expect(replies).toHaveLength(2);
  replies[1]!({ durable: true });
  await tick();
  expect(h.app.recoveryAcknowledged?.(id)).toBe(true);
  expect(h.app.session(id).witness.source).toBe('same');
});

it('does not claim current source recovery after retaining a different unapplied attempt', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  const id = h.app.snapshot().selectedSessionId!;
  vi.mocked(h.ports.save).mockRejectedValue(Error('save refused'));
  h.app.session(id).publish({
    expected: h.app.session(id).witness,
    source: 'canonical source',
  });
  await expect(h.workspace.controller.flush()).rejects.toThrow();
  await tick();
  expect(h.app.recoveryAcknowledged?.(id)).toBe(true);
  const batch = {
    expected: h.app.session(id).witness,
    source: 'different retained text',
  };
  await h.app.retainAttempt(id, batch);
  await h.app.resolveAttempt(id, batch, 'discard');
  expect(h.app.documents.state(id).retainedFailures).toHaveLength(0);
  expect(h.app.recoveryAcknowledged?.(id)).toBe(false);
  expect(h.app.session(id).witness.source).toBe('canonical source');
});

it('keeps a held recovery acknowledgement scoped through document selection A-to-B-to-A', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  const a = h.app.snapshot().selectedSessionId!;
  let release!: (receipt: { durable: boolean }) => void;
  const held = new Promise<{ durable: boolean }>((resolve) => {
    release = resolve;
  });
  vi.mocked(h.services.preserveAttempt).mockReturnValue(held);
  vi.mocked(h.ports.save).mockRejectedValue(Error('save refused'));
  h.app
    .session(a)
    .publish({ expected: h.app.session(a).witness, source: 'pending A' });
  await expect(h.workspace.controller.flush()).rejects.toThrow();
  await tick();
  await h.app.open('component.mdx');
  const b = h.app.snapshot().selectedSessionId!;
  release({ durable: true });
  await tick();
  expect(h.app.snapshot().selectedSessionId).toBe(b);
  expect(h.app.recoveryAcknowledged?.(b)).toBe(false);
  expect(h.app.recoveryAcknowledged?.(a)).toBe(true);
  h.app.select(a);
  expect(h.app.session(a).witness.source).toBe('pending A');
  expect(h.app.recoveryAcknowledged?.(a)).toBe(true);
});

it('never revives recovery confirmation after the source session is retired', async () => {
  const h = setup();
  await h.app.chooseVault();
  await h.app.open('plain.md');
  const id = h.app.snapshot().selectedSessionId!;
  let releaseRecovery!: (receipt: { durable: boolean }) => void;
  let releaseSave!: (receipt: { revision: string; durable: boolean }) => void;
  vi.mocked(h.services.preserveAttempt).mockReturnValue(
    new Promise((resolve) => {
      releaseRecovery = resolve;
    }),
  );
  vi.mocked(h.ports.save).mockReturnValue(
    new Promise((resolve) => {
      releaseSave = resolve;
    }),
  );
  h.app.session(id).publish({
    expected: h.app.session(id).witness,
    source: 'saved before retirement',
  });
  const flushing = h.workspace.controller.flush();
  await tick();
  expect(h.services.preserveAttempt).toHaveBeenCalled();
  releaseSave({ revision: 'disk-1', durable: true });
  await flushing;
  await h.app.closeDocument(id);
  releaseRecovery({ durable: true });
  await tick();
  expect(h.app.recoveryAcknowledged?.(id)).toBe(false);
  expect(() => h.app.session(id)).toThrow();
});
