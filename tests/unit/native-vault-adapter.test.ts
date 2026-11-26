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
  const opened = { vaultId: 'origin-vault', documents: [] };
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
  const receipt = { vaultId: 'captured-vault', document: { id: 'new-grant' } };
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
