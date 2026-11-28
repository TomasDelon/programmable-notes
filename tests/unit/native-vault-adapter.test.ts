import { beforeEach, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { nativeDocuments } from '../../src/documents/native';

beforeEach(() => invoke.mockReset());

it('requests OS vault authorization without supplying a renderer path and retains cancellation', async () => {
  invoke.mockResolvedValue(null);
  expect(await nativeDocuments.chooseVault()).toBeNull();
  expect(invoke).toHaveBeenCalledExactlyOnceWith('choose_vault');
});
it('carries opaque vault identity through inventory and selected relative-source requests', async () => {
  const receipt = {
    vaultId: 'origin-vault',
    entries: [{ logicalPath: 'a.mdx', bytes: 12 }],
  };
  invoke.mockResolvedValue(receipt);
  expect(await nativeDocuments.vaultInventory('origin-vault')).toBe(receipt);
  expect(invoke).toHaveBeenLastCalledWith('vault_inventory', {
    vaultId: 'origin-vault',
  });
  const opened = { status: 'acquired', vaultId: 'origin-vault', documents: [] };
  invoke.mockResolvedValue(opened);
  expect(
    await nativeDocuments.openVaultSources('origin-vault', ['notes/a.mdx']),
  ).toBe(opened);
  expect(invoke).toHaveBeenLastCalledWith('open_vault_sources', {
    vaultId: 'origin-vault',
    paths: ['notes/a.mdx'],
  });
});
it('creates exact accepted source under a vault token without substituting a disk path or selected note', async () => {
  const source = '\uFEFF# É\r\n<Broken';
  const receipt = {
    status: 'acquired',
    vaultId: 'captured-vault',
    document: { id: 'new-grant' },
  };
  invoke.mockResolvedValue(receipt);
  expect(
    await nativeDocuments.createVaultSource(
      'captured-vault',
      'notes/a.md',
      source,
    ),
  ).toBe(receipt);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('create_vault_source', {
    vaultId: 'captured-vault',
    path: 'notes/a.md',
    source,
  });
});

it('preserves resolved domain refusals and their originating request fields without throwing or rebranding them', async () => {
  const opened = {
    status: 'refused',
    vaultId: 'origin',
    paths: ['missing.mdx'],
    code: 'io',
  };
  invoke.mockResolvedValueOnce(opened);
  expect(
    await nativeDocuments.openVaultSources('origin', ['missing.mdx']),
  ).toBe(opened);
  const created = {
    status: 'refused',
    vaultId: 'origin',
    path: 'existing.mdx',
    code: 'conflict',
  };
  invoke.mockResolvedValueOnce(created);
  expect(
    await nativeDocuments.createVaultSource('origin', 'existing.mdx', 'kept'),
  ).toBe(created);
});

it('leaves transport/publication rejections rejected even when their values look like domain refusals', async () => {
  const forged = {
    status: 'refused',
    vaultId: 'origin',
    paths: ['a.mdx'],
    code: 'io',
  };
  invoke.mockRejectedValueOnce(forged);
  await expect(
    nativeDocuments.openVaultSources('origin', ['a.mdx']),
  ).rejects.toBe(forged);
  const uncertain = Error(
    'File publication outcome is uncertain; reconcile before retrying',
  );
  invoke.mockRejectedValueOnce(uncertain);
  await expect(
    nativeDocuments.createVaultSource('origin', 'new.mdx', 'source'),
  ).rejects.toBe(uncertain);
});
