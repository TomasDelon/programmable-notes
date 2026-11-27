import { describe, expect, it, vi } from 'vitest';
import {
  createNativeWorkspace,
  type NativeWorkspacePorts,
} from '../../src/application/nativeWorkspace';
import type { NativeDocument } from '../../src/documents/workspace';

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
function document(
  path = 'a.mdx',
  id = `grant-${path}`,
  source = `source ${path}`,
): NativeDocument {
  return {
    id,
    revision: `disk-${id}`,
    logicalPath: path,
    name: path.split('/').at(-1)!,
    displayPath: `/label/${path}`,
    source,
    durabilityWarning: false,
  };
}
function setup() {
  let sequence = 0;
  const ports = {
    chooseVault: vi.fn<NativeWorkspacePorts['chooseVault']>(async () => ({
      vaultId: 'vault-a',
      displayPath: '/label/a',
    })),
    vaultInventory: vi.fn<NativeWorkspacePorts['vaultInventory']>(
      async (vaultId) => ({
        vaultId,
        entries: [{ logicalPath: 'a.mdx', bytes: 12 }],
      }),
    ),
    openVaultSources: vi.fn<NativeWorkspacePorts['openVaultSources']>(
      async (vaultId, paths) => ({
        vaultId,
        status: 'acquired' as const,
        documents: paths.map((path) => document(path)),
      }),
    ),
    createVaultSource: vi.fn<NativeWorkspacePorts['createVaultSource']>(
      async (vaultId, path, source) => ({
        vaultId,
        status: 'acquired' as const,
        document: document(path, `created-${path}`, source),
      }),
    ),
    save: vi.fn<NativeWorkspacePorts['save']>(async () => ({
      revision: 'saved-disk',
      durable: true,
    })),
    close: vi.fn<NativeWorkspacePorts['close']>(async () => {}),
  };
  return {
    ports,
    workspace: createNativeWorkspace(ports, () => `session-${++sequence}`),
  };
}

describe('native workspace use cases (DATA-01/02, EDIT-01)', () => {
  it('holds direct source publication and all structural workspace operations during aggregate close', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const a = await w.open('a.mdx');
    const b = await w.open('b.mdx');
    const session = w.session(a);
    const admission = w.beginAggregateClose();
    expect(w.controller.state(a).phase).toBe('closing');
    expect(w.controller.state(b).phase).toBe('closing');
    expect(() =>
      session.publish({ expected: session.witness, source: 'blocked' }),
    ).toThrow();
    expect(() => w.select(a)).toThrow();
    for (const request of [
      () => w.choose(),
      () => w.refreshInventory(),
      () => w.open('c.mdx'),
      () => w.create('c.mdx', 'new'),
      () => w.close(a),
    ])
      await expect(request()).rejects.toThrow();
    expect(ports.chooseVault).toHaveBeenCalledTimes(1);
    expect(ports.vaultInventory).toHaveBeenCalledTimes(1);
    expect(ports.openVaultSources).toHaveBeenCalledTimes(2);
    expect(ports.createVaultSource).not.toHaveBeenCalled();
    expect(ports.close).not.toHaveBeenCalled();
    await admission.flush();
    admission.abort();
    w.select(a);
    expect(w.state().selectedSessionId).toBe(a);
  });

  it('refuses aggregate admission during acquisition rather than losing a late native grant', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const reply =
      deferred<Awaited<ReturnType<NativeWorkspacePorts['openVaultSources']>>>();
    ports.openVaultSources.mockReturnValueOnce(reply.promise);
    const opening = w.open('a.mdx');
    expect(() => w.beginAggregateClose()).toThrow();
    reply.resolve({
      status: 'acquired',
      vaultId: 'vault-a',
      documents: [document()],
    });
    const id = await opening;
    expect(w.session(id).witness.source).toBe('source a.mdx');
    expect(w.controller.state(id).phase).toBe('open');
    expect(ports.close).not.toHaveBeenCalled();
  });

  it('refuses aggregate admission when acquisition ownership is unresolved', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    ports.openVaultSources.mockRejectedValueOnce(Error('reply lost'));
    await expect(w.open('a.mdx')).rejects.toThrow();
    expect(w.state().unresolvedCleanup).toBe(1);
    expect(() => w.beginAggregateClose()).toThrow();
    expect(ports.close).not.toHaveBeenCalled();
  });

  it('does not reopen or replace uncertain aggregate sessions and retains late exact attempted source', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const id = await w.open('a.mdx');
    const session = w.session(id);
    const admission = w.beginAggregateClose();
    await admission.flush();
    admission.markUncertain(Error('close acknowledgement lost'));
    const batch = {
      expected: session.witness,
      source: '\uFEFFlate\r\n<Broken',
    };
    session.retainFailure(batch);
    w.controller.setUnapplied(id, true);
    expect(() => admission.abort()).toThrow();
    expect(() => w.beginAggregateClose()).toThrow();
    await expect(w.close(id)).rejects.toThrow();
    await expect(w.create('other.mdx', 'other')).rejects.toThrow();
    expect(w.controller.state(id)).toMatchObject({
      phase: 'close-uncertain',
      unapplied: true,
      retainedFailures: [batch],
    });
    expect(w.state().sessions).toEqual([
      { sessionId: id, vaultId: 'vault-a', logicalPath: 'a.mdx' },
    ]);
    expect(ports.close).not.toHaveBeenCalled();
  });
  it('chooses/indexes selectively, reuses a loaded path and publishes exact autosaved source without another model', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const id = await w.open('a.mdx');
    expect(await w.open('a.mdx')).toBe(id);
    expect(ports.openVaultSources).toHaveBeenCalledExactlyOnceWith('vault-a', [
      'a.mdx',
    ]);
    const session = w.session(id);
    const source = '\uFEFF# É\r\n\r\n$unfinished\n<Broken';
    session.publish({ expected: session.witness, source });
    await w.controller.flush();
    expect(ports.save).toHaveBeenCalledExactlyOnceWith(
      'grant-a.mdx',
      'disk-grant-a.mdx',
      source,
    );
    expect(w.controller.state(id).autosave.status).toBe('saved');
    expect(w.state()).toMatchObject({
      selectedSessionId: id,
      sessions: [{ sessionId: id, vaultId: 'vault-a', logicalPath: 'a.mdx' }],
      unresolvedCleanup: 0,
    });
    expect(JSON.stringify(w.state())).not.toContain('grant-a.mdx');
  });

  it('preserves a prior vault on cancellation and refuses replacement before closing any session', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const original = w.state();
    ports.chooseVault.mockResolvedValue(null);
    await w.choose();
    expect(w.state().vault).toEqual(original.vault);
    expect(w.state().inventory).toEqual(original.inventory);
    const id = await w.open('a.mdx');
    w.controller.setUnapplied(id, true);
    await expect(w.choose()).rejects.toThrow();
    expect(ports.chooseVault).toHaveBeenCalledTimes(2);
    expect(ports.close).not.toHaveBeenCalled();
    expect(w.state().selectedSessionId).toBe(id);
    expect(w.controller.state(id).unapplied).toBe(true);
  });

  it('records the NEW active vault when its inventory fails rather than restoring the invalid old token', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    ports.chooseVault.mockResolvedValue({
      vaultId: 'vault-b',
      displayPath: '/label/b',
    });
    ports.vaultInventory.mockRejectedValueOnce(Error('index failed'));
    await expect(w.choose()).rejects.toThrow();
    expect(w.state()).toMatchObject({
      vault: { vaultId: 'vault-b' },
      inventory: null,
    });
    await w.refreshInventory();
    expect(ports.vaultInventory).toHaveBeenLastCalledWith('vault-b');
  });

  it('rejects competing structural operations while an admitted open allows old-source autosave', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const a = await w.open('a.mdx');
    const pending =
      deferred<Awaited<ReturnType<NativeWorkspacePorts['openVaultSources']>>>();
    ports.openVaultSources.mockReturnValueOnce(pending.promise);
    const opening = w.open('b.mdx');
    await expect(w.create('c.mdx', '')).rejects.toThrow(/operation/i);
    const session = w.session(a);
    session.publish({
      expected: session.witness,
      source: 'accepted while opening',
    });
    await w.controller.flush(a);
    pending.reject(Error('open failed'));
    await expect(opening).rejects.toThrow();
    expect(w.state().selectedSessionId).toBe(a);
    expect(w.session(a).witness.source).toBe('accepted while opening');
    expect(ports.close).not.toHaveBeenCalled();
  });

  it('attaches a completed open but retains selection if an unapplied draft appears during the await', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const a = await w.open('a.mdx');
    const pending =
      deferred<Awaited<ReturnType<NativeWorkspacePorts['openVaultSources']>>>();
    ports.openVaultSources.mockReturnValueOnce(pending.promise);
    const opening = w.open('b.mdx');
    w.controller.setUnapplied(a, true);
    pending.resolve({
      vaultId: 'vault-a',
      status: 'acquired' as const,
      documents: [document('b.mdx')],
    });
    const b = await opening;
    expect(w.state().sessions).toHaveLength(2);
    expect(w.state().selectedSessionId).toBe(a);
    expect(() => w.select(b)).toThrow();
    w.controller.setUnapplied(a, false);
    w.session(a).retainFailure({
      expected: w.session(a).witness,
      source: 'retained attempt',
    });
    expect(() => w.select(b)).toThrow();
    expect(w.controller.state(a).retainedFailures[0]!.source).toBe(
      'retained attempt',
    );
  });

  it('does not override a newer deliberate selection when an older open completes', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const a = await w.open('a.mdx');
    await w.open('b.mdx');
    const pending =
      deferred<Awaited<ReturnType<NativeWorkspacePorts['openVaultSources']>>>();
    ports.openVaultSources.mockReturnValueOnce(pending.promise);
    const opening = w.open('c.mdx');
    w.select(a);
    pending.resolve({
      vaultId: 'vault-a',
      status: 'acquired' as const,
      documents: [document('c.mdx')],
    });
    await opening;
    expect(w.state().selectedSessionId).toBe(a);
  });

  it('creates an acknowledged real-file baseline then autosaves to its private grant', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const id = await w.create('notes/new.MdX', '\uFEFFCreated\r\n');
    expect(ports.createVaultSource).toHaveBeenCalledExactlyOnceWith(
      'vault-a',
      'notes/new.MdX',
      '\uFEFFCreated\r\n',
    );
    expect(w.session(id).witness.source).toBe('\uFEFFCreated\r\n');
    const session = w.session(id);
    session.publish({ expected: session.witness, source: 'later' });
    await w.controller.flush();
    expect(ports.save).toHaveBeenCalledWith(
      'created-notes/new.MdX',
      'disk-created-notes/new.MdX',
      'later',
    );
  });

  it('rejects a loaded-path create collision before I/O without closing anything', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const id = await w.open('a.mdx');
    await expect(w.create('a.mdx', 'new')).rejects.toThrow();
    expect(w.state().selectedSessionId).toBe(id);
    expect(w.session(id).witness.source).toBe('source a.mdx');
    expect(ports.close).not.toHaveBeenCalled();
    expect(ports.createVaultSource).not.toHaveBeenCalled();
    expect(w.state().unresolvedCleanup).toBe(0);
  });

  it('cleans only a newly acquired grant on attachment budget failure, retaining a created file', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    for (let i = 0; i < 32; i++) await w.open(`${i}.mdx`);
    const before = w.state().selectedSessionId;
    await expect(w.create('overflow.mdx', 'created bytes')).rejects.toThrow(
      /created.*not opened/i,
    );
    expect(ports.close).toHaveBeenCalledExactlyOnceWith('created-overflow.mdx');
    expect(w.state().selectedSessionId).toBe(before);
    expect(w.state().sessions).toHaveLength(32);
    expect(w.state().unresolvedCleanup).toBe(0);
  });

  it('retains failed cleanup ownership and blocks vault replacement even with no loaded sessions', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    ports.openVaultSources.mockResolvedValueOnce({
      vaultId: 'vault-a',
      status: 'acquired' as const,
      documents: [document('big.mdx', 'new-grant', 'x'.repeat(500_001))],
    });
    ports.close.mockRejectedValueOnce(Error('close lost'));
    await expect(w.open('big.mdx')).rejects.toThrow();
    expect(w.state().unresolvedCleanup).toBe(1);
    expect(ports.close).toHaveBeenCalledExactlyOnceWith('new-grant');
    await expect(w.choose()).rejects.toThrow();
    expect(ports.chooseVault).toHaveBeenCalledTimes(1);
  });

  it.each(['wrong-vault', 'wrong-path', 'old-grant'] as const)(
    'never closes a foreign or existing binding from a %s response',
    async (kind) => {
      const { ports, workspace: w } = setup();
      await w.choose();
      const a = await w.open('a.mdx');
      ports.openVaultSources.mockResolvedValueOnce({
        vaultId: kind === 'wrong-vault' ? 'foreign' : 'vault-a',
        status: 'acquired' as const,
        documents: [
          document(
            kind === 'wrong-path' ? 'foreign.mdx' : 'b.mdx',
            kind === 'old-grant' ? 'grant-a.mdx' : 'foreign-grant',
          ),
        ],
      });
      await expect(w.open('b.mdx')).rejects.toThrow();
      expect(ports.close).not.toHaveBeenCalled();
      expect(w.state().selectedSessionId).toBe(a);
      expect(w.session(a).witness.source).toBe('source a.mdx');
    },
  );

  it('keeps a closing session until acknowledgement and retains close uncertainty without retries', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const id = await w.open('a.mdx');
    const saving = deferred<{ revision: string; durable: boolean }>();
    ports.save.mockReturnValueOnce(saving.promise);
    w.session(id).publish({
      expected: w.session(id).witness,
      source: 'latest',
    });
    const closing = w.close(id);
    await tick();
    expect(ports.close).not.toHaveBeenCalled();
    expect(w.state().selectedSessionId).toBe(id);
    saving.resolve({ revision: 'written', durable: true });
    ports.close.mockRejectedValueOnce(Error('uncertain'));
    await expect(closing).rejects.toThrow();
    expect(w.controller.state(id).phase).toBe('close-uncertain');
    expect(w.state().sessions).toHaveLength(1);
    await expect(w.close(id)).rejects.toThrow();
    expect(ports.close).toHaveBeenCalledTimes(1);
  });

  it('retires successful close and gives reopening a fresh identity, excluding late old callbacks', async () => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const id = await w.open('a.mdx');
    const old = w.session(id);
    await w.close(id);
    expect(w.state().selectedSessionId).toBeNull();
    ports.openVaultSources.mockResolvedValueOnce({
      vaultId: 'vault-a',
      status: 'acquired' as const,
      documents: [document('a.mdx', 'fresh-grant')],
    });
    const next = await w.open('a.mdx');
    expect(next).not.toBe(id);
    expect(old.validate({ expected: old.witness, source: 'late' })).toBe(false);
    expect(w.session(next).witness.editorRevision).toBe(0);
  });

  it('captures response/state copies and isolates rejecting, throwing and reentrant observers', async () => {
    const { ports, workspace: w } = setup();
    const info = { vaultId: 'vault-a', displayPath: '/label/a' };
    ports.chooseVault.mockResolvedValue(info);
    const observed = vi.fn();
    w.subscribe(() => {
      throw Error('observer');
    });
    w.subscribe(async () => {
      throw Error('async observer');
    });
    let subscribed = false;
    w.subscribe(() => {
      if (!subscribed) {
        subscribed = true;
        w.subscribe(observed);
      }
    });
    await w.choose();
    info.vaultId = 'mutated';
    const snapshot = w.state();
    snapshot.vault!.vaultId = 'also mutated';
    snapshot.inventory!.entries[0]!.logicalPath = 'changed.mdx';
    await tick();
    expect(w.state().vault!.vaultId).toBe('vault-a');
    expect(w.state().inventory!.entries[0]!.logicalPath).toBe('a.mdx');
    expect(observed).toHaveBeenCalled();
    const removed = vi.fn();
    const unsubscribe = w.subscribe(removed);
    unsubscribe();
    unsubscribe();
    await tick();
    expect(removed).not.toHaveBeenCalled();
  });

  it.each(['../a.mdx', '/a.mdx', 'a\\b.mdx', 'a//b.mdx', 'a.txt', 'a\0.mdx'])(
    'rejects unsupported relative source path %s before I/O',
    async (path) => {
      const { ports, workspace: w } = setup();
      await w.choose();
      await expect(w.open(path)).rejects.toThrow();
      expect(ports.openVaultSources).not.toHaveBeenCalled();
    },
  );
});

it('retains close uncertainty and membership if failed editor text arrives after native close admission', async () => {
  const { ports, workspace: w } = setup();
  await w.choose();
  const id = await w.open('a.mdx');
  const session = w.session(id);
  const pending = deferred<void>();
  ports.close.mockReturnValueOnce(pending.promise);
  const closing = w.close(id);
  await tick();
  session.retainFailure({
    expected: session.witness,
    source: 'late attempted text',
  });
  pending.resolve();
  await expect(closing).rejects.toThrow();
  expect(w.state().selectedSessionId).toBe(id);
  expect(w.state().sessions).toHaveLength(1);
  expect(w.controller.state(id)).toMatchObject({
    phase: 'close-uncertain',
    retainedFailures: [{ source: 'late attempted text' }],
  });
  await expect(w.choose()).rejects.toThrow();
  expect(ports.chooseVault).toHaveBeenCalledTimes(1);
});

it('keeps inventory independent of loaded source budgets and refuses stale or duplicate indexes', async () => {
  const { ports, workspace: w } = setup();
  ports.vaultInventory.mockImplementation(async (vaultId) => ({
    vaultId,
    entries: Array.from({ length: 100 }, (_, i) => ({
      logicalPath: `${i}.mdx`,
      bytes: 800_000,
    })),
  }));
  await w.choose();
  expect(w.state().inventory!.entries).toHaveLength(100);
  expect(w.state().sessions).toHaveLength(0);
  expect(ports.openVaultSources).not.toHaveBeenCalled();
  ports.vaultInventory.mockResolvedValueOnce({ vaultId: 'stale', entries: [] });
  await expect(w.refreshInventory()).rejects.toThrow();
  expect(w.state().inventory).toBeNull();
  expect(w.state().vault!.vaultId).toBe('vault-a');
  ports.vaultInventory.mockResolvedValueOnce({
    vaultId: 'vault-a',
    entries: [
      { logicalPath: 'a.mdx', bytes: 1 },
      { logicalPath: 'a.mdx', bytes: 2 },
    ],
  });
  await expect(w.refreshInventory()).rejects.toThrow();
  expect(w.state().inventory).toBeNull();
});

it('captures a baseline before later response mutation and never retargets private saving', async () => {
  const { ports, workspace: w } = setup();
  const baseline = document();
  ports.openVaultSources.mockResolvedValueOnce({
    vaultId: 'vault-a',
    status: 'acquired' as const,
    documents: [baseline],
  });
  await w.choose();
  const id = await w.open('a.mdx');
  baseline.id = 'foreign';
  baseline.source = 'mutated';
  baseline.logicalPath = 'foreign.mdx';
  const session = w.session(id);
  session.publish({ expected: session.witness, source: 'accepted' });
  await w.controller.flush();
  expect(ports.save).toHaveBeenCalledWith(
    'grant-a.mdx',
    'disk-grant-a.mdx',
    'accepted',
  );
  expect(w.state().sessions[0]!.logicalPath).toBe('a.mdx');
});

it('cleans a fresh grant with mismatched created bytes but never deletes or selects its file', async () => {
  const { ports, workspace: w } = setup();
  await w.choose();
  const a = await w.open('a.mdx');
  ports.createVaultSource.mockResolvedValueOnce({
    vaultId: 'vault-a',
    status: 'acquired' as const,
    document: document('new.mdx', 'new-grant', 'different'),
  });
  await expect(w.create('new.mdx', 'requested bytes')).rejects.toThrow(
    /created.*not opened/i,
  );
  expect(ports.close).toHaveBeenCalledExactlyOnceWith('new-grant');
  expect(w.state().sessions).toHaveLength(1);
  expect(w.state().selectedSessionId).toBe(a);
});

it('does not revive an old vault token after a rejected or malformed chooser acknowledgement', async () => {
  const { ports, workspace: w } = setup();
  await w.choose();
  ports.chooseVault.mockRejectedValueOnce(Error('uncertain selection'));
  await expect(w.choose()).rejects.toThrow();
  expect(w.state().vault).toBeNull();
  await expect(w.open('a.mdx')).rejects.toThrow();
  expect(ports.openVaultSources).not.toHaveBeenCalled();
  ports.chooseVault.mockResolvedValueOnce(
    undefined as unknown as Awaited<
      ReturnType<NativeWorkspacePorts['chooseVault']>
    >,
  );
  await expect(w.choose()).rejects.toThrow();
  expect(w.state().vault).toBeNull();
});

it('sends only a new initial observer notification during reentrant subscription, with no unchanged-state loop', async () => {
  const { workspace: w } = setup();
  const added = vi.fn();
  const first = vi.fn(() => w.subscribe(added));
  w.subscribe(first);
  await tick();
  expect(first).toHaveBeenCalledTimes(1);
  expect(added).toHaveBeenCalledTimes(1);
  expect(first.mock.calls).toHaveLength(1);
});

it.each(['open', 'create'] as const)(
  'latches ownership after %s succeeds natively but its reply is lost, without closing unknown IDs or losing old source',
  async (kind) => {
    const { ports, workspace: w } = setup();
    const nativeGrants = new Set<string>();
    const nativeFiles = new Map<string, string>();
    await w.choose();
    const a = await w.open('a.mdx');
    if (kind === 'open')
      ports.openVaultSources.mockImplementationOnce(async () => {
        nativeGrants.add('unknown-open-grant');
        throw Error('reply lost after acquisition');
      });
    else
      ports.createVaultSource.mockImplementationOnce(
        async (_vaultId, path, source) => {
          nativeFiles.set(path, source);
          nativeGrants.add('unknown-create-grant');
          throw Error('reply lost after publication');
        },
      );
    const request = () =>
      kind === 'open'
        ? w.open('new.mdx')
        : w.create('new.mdx', 'created before reply loss');
    await expect(request()).rejects.toThrow(/uncertain/i);
    expect(w.state()).toMatchObject({
      selectedSessionId: a,
      unresolvedCleanup: 1,
    });
    expect(ports.close).not.toHaveBeenCalled();
    const session = w.session(a);
    session.publish({
      expected: session.witness,
      source: 'old accepted source continues',
    });
    await w.controller.flush(a);
    expect(ports.save).toHaveBeenCalledWith(
      'grant-a.mdx',
      'disk-grant-a.mdx',
      'old accepted source continues',
    );
    const openCalls = ports.openVaultSources.mock.calls.length;
    const createCalls = ports.createVaultSource.mock.calls.length;
    await expect(request()).rejects.toThrow();
    expect(ports.openVaultSources).toHaveBeenCalledTimes(openCalls);
    expect(ports.createVaultSource).toHaveBeenCalledTimes(createCalls);
    await w.close(a);
    await expect(w.choose()).rejects.toThrow();
    expect(ports.chooseVault).toHaveBeenCalledTimes(1);
    expect(ports.close).toHaveBeenCalledExactlyOnceWith('grant-a.mdx');
    expect(nativeGrants.size).toBe(1);
    if (kind === 'create')
      expect(nativeFiles.get('new.mdx')).toBe('created before reply loss');
  },
);

it.each([
  ['Git directory', '.git/a.mdx'],
  ['Dependency directory', 'nested/node_modules/a.mdx'],
  ['Private metadata directory', '.programmable-notes/a.mdx'],
  ['Depth above sixteen directories', `${Array(17).fill('d').join('/')}/a.mdx`],
  ['UTF-8 bytes above 4096', `${'é'.repeat(2047)}.mdx`],
])(
  'mirrors native reserved/depth/UTF-8 path refusal before opening or creating %s',
  async (_label, path) => {
    const { ports, workspace: w } = setup();
    await w.choose();
    await expect(w.open(path)).rejects.toThrow();
    await expect(w.create(path, 'source')).rejects.toThrow();
    expect(ports.openVaultSources).not.toHaveBeenCalled();
    expect(ports.createVaultSource).not.toHaveBeenCalled();
    expect(w.state().unresolvedCleanup).toBe(0);
  },
);

it('preserves the native depth and 4096 UTF-8 byte boundary without normalization', async () => {
  const { ports, workspace: w } = setup();
  await w.choose();
  const path = `${Array(16).fill('x'.repeat(250)).join('/')}/${'a'.repeat(76)}.MdX`;
  expect(new TextEncoder().encode(path).byteLength).toBe(4096);
  const id = await w.open(path);
  expect(ports.openVaultSources).toHaveBeenLastCalledWith('vault-a', [path]);
  expect(
    w.state().sessions.find((entry) => entry.sessionId === id)!.logicalPath,
  ).toBe(path);
});

it('does not infer a confirmed no-side-effect refusal from a native error message', async () => {
  const { ports, workspace: w } = setup();
  await w.choose();
  ports.createVaultSource.mockRejectedValueOnce(Error('File already exists'));
  await expect(w.create('unloaded.mdx', 'requested')).rejects.toThrow(
    /uncertain/i,
  );
  expect(w.state().unresolvedCleanup).toBe(1);
  expect(w.state().error).toMatch(/reconciliation/i);
  expect(ports.close).not.toHaveBeenCalled();
  await expect(w.choose()).rejects.toThrow();
  expect(ports.chooseVault).toHaveBeenCalledTimes(1);
});

it('allows retry after an exact resolved missing-file refusal without altering selected text or grants', async () => {
  const { ports, workspace: w } = setup();
  await w.choose();
  const a = await w.open('a.mdx');
  ports.openVaultSources.mockResolvedValueOnce({
    status: 'refused',
    vaultId: 'vault-a',
    paths: ['missing.mdx'],
    code: 'io',
  });
  await expect(w.open('missing.mdx')).rejects.toThrow(/refused/i);
  expect(w.state()).toMatchObject({
    selectedSessionId: a,
    unresolvedCleanup: 0,
  });
  expect(w.session(a).witness.source).toBe('source a.mdx');
  expect(ports.close).not.toHaveBeenCalled();
  const retry = await w.open('missing.mdx');
  expect(w.state().selectedSessionId).toBe(retry);
  expect(w.state().sessions).toHaveLength(2);
});

it.each(['io', 'conflict', 'rejected'] as const)(
  'allows create retry after a resolved %s refusal, without claiming a file was created',
  async (code) => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const a = await w.open('a.mdx');
    ports.createVaultSource.mockResolvedValueOnce({
      status: 'refused',
      vaultId: 'vault-a',
      path: 'new.mdx',
      code,
    });
    await expect(w.create('new.mdx', 'requested')).rejects.toThrow(/refused/i);
    expect(w.state()).toMatchObject({
      selectedSessionId: a,
      unresolvedCleanup: 0,
    });
    expect(ports.close).not.toHaveBeenCalled();
    const retry = await w.create('new.mdx', 'requested');
    expect(w.session(retry).witness.source).toBe('requested');
  },
);

it.each(['open', 'create'] as const)(
  'never treats a rejected refusal-shaped object as a confirmed %s refusal',
  async (kind) => {
    const { ports, workspace: w } = setup();
    await w.choose();
    const refusal =
      kind === 'open'
        ? {
            status: 'refused',
            vaultId: 'vault-a',
            paths: ['new.mdx'],
            code: 'io',
          }
        : {
            status: 'refused',
            vaultId: 'vault-a',
            path: 'new.mdx',
            code: 'io',
          };
    if (kind === 'open') ports.openVaultSources.mockRejectedValueOnce(refusal);
    else ports.createVaultSource.mockRejectedValueOnce(refusal);
    await expect(
      kind === 'open' ? w.open('new.mdx') : w.create('new.mdx', 'requested'),
    ).rejects.toThrow(/uncertain/i);
    expect(w.state().unresolvedCleanup).toBe(1);
    expect(ports.close).not.toHaveBeenCalled();
  },
);

it.each(['open', 'create'] as const)(
  'latches malformed/foreign resolved %s refusals without trusting their IDs',
  async (kind) => {
    const baseline =
      kind === 'open'
        ? {
            status: 'refused',
            vaultId: 'vault-a',
            paths: ['new.mdx'],
            code: 'io',
          }
        : {
            status: 'refused',
            vaultId: 'vault-a',
            path: 'new.mdx',
            code: 'io',
          };
    const variants: unknown[] = [
      { ...baseline, vaultId: 'foreign' },
      { ...baseline, code: 'PublicationUncertain' },
      { ...baseline, code: 'IO' },
      { ...baseline, code: undefined },
      { ...baseline, status: undefined },
      { ...baseline, grant: 'foreign-grant' },
      {
        ...baseline,
        [kind === 'open' ? 'paths' : 'path']:
          kind === 'open' ? ['other.mdx'] : 'other.mdx',
      },
      {
        ...baseline,
        [kind === 'open' ? 'paths' : 'path']:
          kind === 'open' ? ['new.mdx', 'other.mdx'] : ['new.mdx'],
      },
      Object.assign(Object.create({ inherited: true }), baseline),
      Object.defineProperty({ ...baseline }, 'hidden', {
        value: 'foreign-grant',
      }),
      Object.defineProperty({ ...baseline }, 'code', { get: () => 'io' }),
      null,
    ];
    for (const variant of variants) {
      const { ports, workspace: w } = setup();
      await w.choose();
      const a = await w.open('a.mdx');
      if (kind === 'open')
        ports.openVaultSources.mockResolvedValueOnce(
          variant as Awaited<
            ReturnType<NativeWorkspacePorts['openVaultSources']>
          >,
        );
      else
        ports.createVaultSource.mockResolvedValueOnce(
          variant as Awaited<
            ReturnType<NativeWorkspacePorts['createVaultSource']>
          >,
        );
      await expect(
        kind === 'open' ? w.open('new.mdx') : w.create('new.mdx', 'requested'),
      ).rejects.toThrow();
      expect(w.state().unresolvedCleanup).toBe(1);
      expect(w.state().selectedSessionId).toBe(a);
      expect(ports.close).not.toHaveBeenCalled();
    }
  },
);

it.each(['open', 'create'] as const)(
  'requires an exact acquired envelope/tag for %s before accepting a grant',
  async (kind) => {
    const doc = document('new.mdx', 'new-grant');
    const variants: unknown[] =
      kind === 'open'
        ? [
            { vaultId: 'vault-a', documents: [doc] },
            {
              status: 'acquired',
              vaultId: 'vault-a',
              documents: [doc],
              code: 'io',
            },
          ]
        : [
            { vaultId: 'vault-a', document: doc },
            {
              status: 'acquired',
              vaultId: 'vault-a',
              document: doc,
              code: 'io',
            },
          ];
    for (const variant of variants) {
      const { ports, workspace: w } = setup();
      await w.choose();
      if (kind === 'open')
        ports.openVaultSources.mockResolvedValueOnce(
          variant as Awaited<
            ReturnType<NativeWorkspacePorts['openVaultSources']>
          >,
        );
      else
        ports.createVaultSource.mockResolvedValueOnce(
          variant as Awaited<
            ReturnType<NativeWorkspacePorts['createVaultSource']>
          >,
        );
      await expect(
        kind === 'open' ? w.open('new.mdx') : w.create('new.mdx', 'requested'),
      ).rejects.toThrow();
      expect(w.state().sessions).toHaveLength(0);
      expect(w.state().unresolvedCleanup).toBe(1);
      expect(ports.close).not.toHaveBeenCalled();
    }
  },
);
