import { describe, expect, it, vi } from 'vitest';
import { createNativeWorkspace } from '../../src/application/nativeWorkspace';
import type { NativeDocument } from '../../src/documents/workspace';

function setup() {
  let sequence = 0;
  let grant = 0;
  const document = (path: string): NativeDocument => ({
    id: `private-grant-${++grant}`,
    revision: 'disk-0',
    source: path,
    name: path,
    logicalPath: path,
    displayPath: `/label/${path}`,
    durabilityWarning: false,
  });
  const ports = {
    chooseVault: vi.fn(async () => ({
      vaultId: 'vault-a',
      displayPath: '/label/vault',
    })),
    vaultInventory: vi.fn(async (vaultId: string) => ({
      vaultId,
      entries: [],
    })),
    openVaultSources: vi.fn(async (vaultId: string, paths: string[]) => ({
      status: 'acquired' as const,
      vaultId,
      documents: paths.map(document),
    })),
    createVaultSource: vi.fn(async (vaultId: string, path: string) => ({
      status: 'acquired' as const,
      vaultId,
      document: document(path),
    })),
    save: vi.fn(async () => ({ revision: 'saved', durable: true })),
    close: vi.fn<(id: string) => Promise<void>>(async () => {}),
    observe: vi.fn(async () => ({ status: 'unchanged', revision: 'disk-0' })),
    watch: vi.fn(async () => 'a'.repeat(32)),
    pollWatch: vi.fn(async () => false),
    unwatch: vi.fn(async () => {}),
  };
  return {
    ports,
    workspace: createNativeWorkspace(ports, () => `session-${++sequence}`),
  };
}
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe('vault/session/selection observation scope', () => {
  it('exposes checked private transport and display metadata, with canonical adoption still owned by DocumentSessions', async () => {
    const { workspace, ports } = setup();
    await workspace.choose();
    const id = await workspace.open('a.mdx');
    const scope = workspace.observation!.scope(id);
    expect(scope.sessionId).toBe(id);
    expect(scope.vaultId).toBe('vault-a');
    expect(scope.logicalPath).toBe('a.mdx');
    expect(scope.isCurrent()).toBe(true);
    expect(JSON.stringify(scope)).not.toContain('private-grant');
    expect(await workspace.observation!.read(id, 'disk-0')).toEqual({
      status: 'unchanged',
      revision: 'disk-0',
    });
    expect(ports.observe).toHaveBeenCalledExactlyOnceWith(
      'private-grant-1',
      'disk-0',
    );
    const reservation = workspace.controller.reserveObservation(id);
    await reservation.settled();
    reservation.release();
  });

  it('invalidates selection A-to-B-to-A reads even when the original canonical witness is unchanged', async () => {
    const { workspace } = setup();
    await workspace.choose();
    const a = await workspace.open('a.mdx');
    const b = await workspace.open('b.mdx');
    workspace.select(a);
    const witness = workspace.session(a).witness;
    const old = workspace.observation!.scope(a);
    workspace.select(b);
    workspace.select(a);
    expect(workspace.session(a).witness).toEqual(witness);
    expect(old.isCurrent()).toBe(false);
    expect(workspace.observation!.scope(a).isCurrent()).toBe(true);
  });

  it('never revives a retired scope after vault reauthorization and reopening the same path', async () => {
    const { workspace } = setup();
    await workspace.choose();
    const a = await workspace.open('a.mdx');
    const old = workspace.observation!.scope(a);
    await workspace.close(a);
    expect(old.isCurrent()).toBe(false);
    expect(() => workspace.observation!.scope(a)).toThrow();
    await workspace.choose();
    const current = await workspace.open('a.mdx');
    expect(current).not.toBe(a);
    expect(old.isCurrent()).toBe(false);
    expect(workspace.observation!.scope(current).isCurrent()).toBe(true);
  });

  it('invalidates pending reads as soon as close owns the session, before the native acknowledgement', async () => {
    const { workspace, ports } = setup();
    await workspace.choose();
    const a = await workspace.open('a.mdx');
    const scope = workspace.observation!.scope(a);
    let closed!: () => void;
    ports.close.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        closed = resolve;
      }),
    );
    const closing = workspace.close(a);
    await tick();
    expect(scope.isCurrent()).toBe(false);
    closed();
    await closing;
    expect(scope.isCurrent()).toBe(false);
  });
});
