import { expect, it, vi } from 'vitest';
import { decodeRecoveryCatalog } from '../../src/desktop/nativeRecoveryCatalog';
import { createNativeProductServices } from '../../src/desktop/nativeProductServices';
import { createNativeProduct } from '../../src/application/nativeProduct';
import {
  createNativeWorkspace,
  type NativeWorkspacePorts,
} from '../../src/application/nativeWorkspace';
import type { RecoverySnapshot } from '../../src/documents/recovery';
const source =
  '\uFEFFimport C from "./C"\r\n\r\n# Café 😀\r\n{/* untouched */}\n<C value={{x: 1}} />\r\n';
const version: RecoverySnapshot = {
  id: 'b'.repeat(64),
  file: `${'a'.repeat(32)}-00000000000000000001-${'b'.repeat(64)}.pnrec`,
  metadata: {
    schema: 1,
    documentId: 'a'.repeat(32),
    name: 'note.mdx',
    baseline: null,
    parent: null,
    generation: 1,
    createdAtMs: 1,
    sourceBytes: new TextEncoder().encode(source).length,
  },
};
const catalog = () => ({ versions: [version], warning: false });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const tick = async () => {
  for (let n = 0; n < 25; n++) await Promise.resolve();
};
function fixture(guarded = false) {
  const files = new Map([
    ['original.mdx', 'original'],
    ['other.md', 'other'],
  ]);
  let sequence = 0;
  const ports: NativeWorkspacePorts = {
    chooseVault: vi.fn(async () => ({
      vaultId: 'vault',
      displayPath: 'Selected vault',
    })),
    vaultInventory: vi.fn(async () => ({
      vaultId: 'vault',
      entries: [...files].map(([logicalPath, text]) => ({
        logicalPath,
        bytes: text.length,
      })),
    })),
    openVaultSources: vi.fn<NativeWorkspacePorts['openVaultSources']>(
      async (_vault, paths) => ({
        status: 'acquired',
        vaultId: 'vault',
        documents: paths.map((path) => document(path, files.get(path)!)),
      }),
    ),
    createVaultSource: vi.fn<NativeWorkspacePorts['createVaultSource']>(
      async (_vault, path, text) => {
        if (files.has(path) || path.startsWith('symlink/'))
          return {
            status: 'refused',
            vaultId: 'vault',
            path,
            code: 'conflict',
          };
        files.set(path, text);
        return {
          status: 'acquired',
          vaultId: 'vault',
          document: document(path, text),
        };
      },
    ),
    save: vi.fn(async () => ({ revision: 'next', durable: true })),
    close: vi.fn(async () => {}),
  };
  function document(path: string, text: string) {
    return {
      id: `grant-${++sequence}`,
      revision: 'disk',
      logicalPath: path,
      name: path,
      displayPath: path,
      source: text,
      durabilityWarning: false,
    };
  }
  const read = vi.fn(async () => source);
  const protect = vi.fn(async () => {});
  const workspace = createNativeWorkspace(ports, () => `session-${++sequence}`);
  const app = createNativeProduct(workspace, {
    closeGuard: guarded
      ? {
          observe(changed) {
            changed({ phase: 'requested', request: 'close-request' });
            return () => {};
          },
          async resolve(request, action) {
            if (action !== 'cancel')
              throw Error('Must not commit while recovery is in flight');
            return {
              status: 'cancelled',
              request,
              reason: null,
              state: { phase: 'idle', request: null },
            };
          },
        }
      : undefined,
    setCloseState: protect,
    preserveAttempt: async () => ({ durable: true }),
    recovery: { list: async () => catalog(), read },
  });
  const signal = new AbortController();
  return { app, workspace, ports, files, read, protect, signal };
}
it('isolates corrupt and duplicate inventory entries while retaining bounded good versions and warnings', () => {
  const decoded = decodeRecoveryCatalog({
    snapshots: [
      null,
      version,
      { ...version, metadata: { ...version.metadata, sourceBytes: 500_001 } },
      version,
    ],
    errors: [{}],
    capacityExceeded: true,
  });
  expect(decoded.versions).toEqual([version]);
  expect(decoded.warning).toBe(true);
  expect(Object.isFrozen(decoded.versions[0]!.metadata)).toBe(true);
  expect(
    decodeRecoveryCatalog({
      snapshots: [version],
      errors: [],
      capacityExceeded: false,
    }).warning,
  ).toBe(false);
});
it('captures narrow recovery ports and requires exact immutable metadata and byte receipt', async () => {
  const ports = {
    dirty: vi.fn(async () => {}),
    snapshot: vi.fn(),
    snapshots: vi.fn(async () => ({
      snapshots: [version],
      errors: [],
      capacityExceeded: false,
    })),
    restoreSnapshot: vi.fn(async () => ({
      name: version.metadata.name,
      source,
      snapshot: version,
    })),
  };
  const service = createNativeProductServices(ports).recovery!;
  ports.snapshots = vi.fn(async () => {
    throw Error('retarget');
  });
  const selected = (await service.list()).versions[0]!;
  expect(await service.read(selected)).toBe(source);
  ports.restoreSnapshot.mockResolvedValueOnce({
    name: version.metadata.name,
    source,
    snapshot: { ...version, metadata: { ...version.metadata, generation: 2 } },
  });
  await expect(service.read(selected)).rejects.toThrow(/readback/);
});
it('creates an exact independent saved copy without changing original or recovery source', async () => {
  const h = fixture();
  await h.app.chooseVault();
  await h.app.open('original.mdx');
  const original = h.app.snapshot().selectedSessionId!;
  await h.app.refreshRecovery!(h.signal.signal);
  await h.app.restoreRecoveryCopy!(
    version.file,
    'recovered.mdx',
    h.signal.signal,
  );
  const id = h.app.snapshot().selectedSessionId!;
  expect(id).not.toBe(original);
  expect(h.files.get('recovered.mdx')).toBe(source);
  expect(h.files.get('original.mdx')).toBe('original');
  expect(h.app.session(id).witness.source).toBe(source);
  expect(h.app.documents.state(id).autosave).toMatchObject({
    status: 'saved',
    durable: true,
  });
  expect(h.app.session(original).witness.source).toBe('original');
});
it.each(['original.mdx', '../escape.mdx', '.git/copy.md', 'symlink/copy.mdx'])(
  'refuses collision or unsafe destination %s',
  async (path) => {
    const h = fixture();
    await h.app.chooseVault();
    await h.app.refreshRecovery!(h.signal.signal);
    await expect(
      h.app.restoreRecoveryCopy!(version.file, path, h.signal.signal),
    ).rejects.toThrow();
    expect([...h.files]).toEqual([
      ['original.mdx', 'original'],
      ['other.md', 'other'],
    ]);
  },
);
it.each(['abort', 'aba', 'open', 'close'] as const)(
  'cancelled or structurally stale read performs zero creates: %s',
  async (kind) => {
    const h = fixture();
    await h.app.chooseVault();
    await h.app.open('original.mdx');
    const a = h.app.snapshot().selectedSessionId!;
    await h.app.open('other.md');
    const b = h.app.snapshot().selectedSessionId!;
    h.app.select(a);
    await h.app.refreshRecovery!(h.signal.signal);
    const read = deferred<string>();
    h.read.mockReturnValueOnce(read.promise);
    const pending = h.app.restoreRecoveryCopy!(
      version.file,
      'copy.mdx',
      h.signal.signal,
    );
    await tick();
    if (kind === 'abort') h.signal.abort();
    if (kind === 'aba') {
      h.app.select(b);
      h.app.select(a);
    }
    if (kind === 'open') await h.app.open('other.md');
    if (kind === 'close') await h.app.closeDocument(b);
    read.resolve(source);
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(h.ports.createVaultSource).not.toHaveBeenCalled();
  },
);
it('cancels while close protection is pending and refuses a duplicate before read or create', async () => {
  const h = fixture();
  await h.app.chooseVault();
  await h.app.refreshRecovery!(h.signal.signal);
  await tick();
  const protection = deferred<void>();
  h.protect.mockReturnValueOnce(protection.promise);
  const pending = h.app.restoreRecoveryCopy!(
    version.file,
    'copy.mdx',
    h.signal.signal,
  );
  await expect(
    h.app.restoreRecoveryCopy!(version.file, 'second.mdx', h.signal.signal),
  ).rejects.toThrow(/already running/);
  h.signal.abort();
  protection.resolve();
  await expect(pending).rejects.toThrow(/cancelled/);
  expect(h.read).not.toHaveBeenCalled();
  expect(h.ports.createVaultSource).not.toHaveBeenCalled();
});
it.each(['lost', 'malformed'] as const)(
  'retains exact recovery data after %s create acknowledgement and holds acquisition',
  async (ack) => {
    const h = fixture();
    await h.app.chooseVault();
    await h.app.refreshRecovery!(h.signal.signal);
    if (ack === 'lost')
      vi.mocked(h.ports.createVaultSource).mockRejectedValueOnce(
        Error('lost acknowledgement'),
      );
    else
      vi.mocked(h.ports.createVaultSource).mockResolvedValueOnce({
        status: 'acquired',
        vaultId: 'foreign',
      } as never);
    await expect(
      h.app.restoreRecoveryCopy!(version.file, 'copy.mdx', h.signal.signal),
    ).rejects.toThrow(/uncertain/);
    expect(h.app.snapshot().recovery!.attempt).toEqual({
      version,
      path: 'copy.mdx',
      source,
      uncertain: true,
    });
    expect(h.app.snapshot().unresolvedCleanup).toBe(1);
    await expect(
      h.app.restoreRecoveryCopy!(version.file, 'retry.mdx', h.signal.signal),
    ).rejects.toThrow(/unresolved/);
    expect(h.ports.createVaultSource).toHaveBeenCalledTimes(1);
  },
);
it('does not commit close while a recovery read is in flight', async () => {
  const h = fixture(true);
  await h.app.chooseVault();
  await h.app.refreshRecovery!(h.signal.signal);
  const read = deferred<string>();
  h.read.mockReturnValueOnce(read.promise);
  const pending = h.app.restoreRecoveryCopy!(
    version.file,
    'copy.mdx',
    h.signal.signal,
  );
  await tick();
  h.app.subscribe(() => {});
  expect(await h.app.prepareClose(() => true)).toBe('editing');
  read.resolve(source);
  await expect(pending).rejects.toThrow(/cancelled/);
  expect(h.ports.createVaultSource).not.toHaveBeenCalled();
});

it('isolates unsupported dates, C1 controls and empty basenames from valid recovery versions', () => {
  const malformed = [
    {
      ...version,
      metadata: { ...version.metadata, createdAtMs: Number.MAX_SAFE_INTEGER },
    },
    { ...version, metadata: { ...version.metadata, name: 'bad\u0085.md' } },
    { ...version, metadata: { ...version.metadata, name: '.md' } },
  ];
  const result = decodeRecoveryCatalog({
    snapshots: [...malformed, version],
    errors: [],
    capacityExceeded: false,
  });
  expect(result.versions).toEqual([version]);
  expect(result.warning).toBe(true);
});
