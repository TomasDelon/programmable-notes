import { createHash, webcrypto } from 'node:crypto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parsePortableBackup,
  serializePortableBackup,
} from '../../src/backup/portable';
import {
  createDocument,
  createWebState,
  serializeBackup,
  trashDocument,
  updateDocumentSource,
  validateWebState,
} from '../../src/web/workspace';
import {
  readRecoverySnapshots,
  readWorkspace,
  writeWorkspace,
  WorkspaceConflictError,
} from '../../src/web/persistence';
import { pngAsset } from './web-assets-fixtures';

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => vi.unstubAllGlobals());

async function populated() {
  const asset = await pngAsset('a'.repeat(99) + '😀.png');
  let state = createWebState(1);
  state = updateDocumentSource(
    state,
    state.workspace.selected,
    '\uFEFF# exact\r\n😀\n![chart](attachment:' + asset.id + ')\r\n',
  );
  const created = createDocument(state, 'Deleted');
  state = updateDocumentSource(
    created.state,
    created.key,
    'Trash keeps its attachment ![plot](attachment:' + asset.id + ')',
  );
  state = trashDocument(state, created.key);
  return validateWebState({
    ...state,
    mode: 'live',
    assets: { [asset.id]: asset },
  });
}

describe('complete checked backup and atomic restore', () => {
  it('deduplicates original blobs while preserving different safe filenames in current and historical snapshots', async () => {
    const asset = await pngAsset('current-chart.png');
    const state = { ...createWebState(1), assets: { [asset.id]: asset } };
    const historical = {
      ...state,
      assets: { [asset.id]: { ...asset, name: 'older-chart.png' } },
    };
    const text = await serializePortableBackup(state, [
      { updated: 1, state: historical },
    ]);
    expect(text.split(asset.base64)).toHaveLength(2);
    const restored = await parsePortableBackup(text);
    expect(restored.state.assets![asset.id]!.name).toBe('current-chart.png');
    expect(restored.recovery[0]!.state.assets![asset.id]!.name).toBe(
      'older-chart.png',
    );
    expect(restored.recovery[0]!.state).toEqual(historical);

    // Earlier v2 archives had a single name per blob, without snapshot metadata.
    const old = JSON.parse(text);
    delete old.assetNames;
    delete old.recovery[0].assetNames;
    delete old.recoveryIncluded;
    delete old.checksum;
    function ordered(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(ordered);
      if (value !== null && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, item]) => [key, ordered(item)]),
        );
      return value;
    }
    old.checksum = createHash('sha256')
      .update(JSON.stringify(ordered(old)))
      .digest('hex');
    const compatible = await parsePortableBackup(JSON.stringify(old));
    expect(compatible.state).toEqual(state);
    expect(compatible.recovery[0]!.state.assets![asset.id]!.name).toBe(
      'current-chart.png',
    );
  });
  it('round-trips exact source, Trash, live mode, metadata, original assets and recovery', async () => {
    const state = await populated();
    const recoveryState = updateDocumentSource(
      state,
      state.workspace.selected,
      'Previous source\r\n',
    );
    const recovery = [{ updated: 100, state: recoveryState }];
    const text = await serializePortableBackup(state, recovery);
    const packed = JSON.parse(text);
    expect(packed.version).toBe(2);
    expect(packed.format).toBe('programmable-notes-workspace');
    expect(Object.keys(packed.assets)).toHaveLength(1);
    expect(packed.recovery[0].state.assets).toBeUndefined();
    const restored = await parsePortableBackup(text);
    expect(restored.state).toEqual(state);
    expect(restored.recovery).toEqual(recovery);
    expect(restored.legacy).toBe(false);
  });

  it('imports original v1 backups unchanged without requiring attachment fields', async () => {
    const state = createWebState(1);
    const restored = await parsePortableBackup(serializeBackup(state));
    expect(restored).toEqual({ state, recovery: [], legacy: true });
  });

  it('rejects source tampering and corrupt/truncated documents before restore', async () => {
    const text = await serializePortableBackup(await populated());
    await expect(
      parsePortableBackup(text.replace('exact', 'edited')),
    ).rejects.toThrow('integrity');
    await expect(parsePortableBackup(text.slice(0, -1))).rejects.toThrow(
      'valid JSON',
    );
    await expect(
      parsePortableBackup('['.repeat(50) + ']'.repeat(50)),
    ).rejects.toThrow('structural');
  });

  it('publishes restored state and all imported checkpoints in one IDB transaction', async () => {
    const original = createWebState(1);
    await writeWorkspace(original, 0);
    const target = await populated();
    const checkpoint = updateDocumentSource(
      target,
      target.workspace.selected,
      'Earlier raw\r\nsource',
    );
    const payload = await parsePortableBackup(
      await serializePortableBackup(target, [
        { updated: 100, state: checkpoint },
      ]),
    );
    const saved = await writeWorkspace(
      payload.state,
      1,
      true,
      payload.recovery,
    );
    expect(saved.revision).toBe(3);
    expect((await readWorkspace())!.state).toEqual(target);
    const history = await readRecoverySnapshots();
    expect(
      history.some(
        (item) => JSON.stringify(item.state) === JSON.stringify(checkpoint),
      ),
    ).toBe(true);
    await expect(writeWorkspace(original, 1)).rejects.toBeInstanceOf(
      WorkspaceConflictError,
    );
  });

  it('rolls back restored assets and checkpoints together if workspace persistence fails', async () => {
    const original = createWebState(1);
    await writeWorkspace(original, 0);
    const target = await populated();
    const put = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name === 'workspace')
          throw new DOMException('Full', 'QuotaExceededError');
        return put.call(this, value, key);
      });
    await expect(
      writeWorkspace(target, 1, true, [{ updated: 1, state: target }]),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
    spy.mockRestore();
    expect((await readWorkspace())!.state).toEqual(original);
    expect(await readRecoverySnapshots()).toEqual([]);
  });

  it('detects attachment corruption even when an outer envelope checksum is newly generated', async () => {
    const target = await populated();
    const [id, asset] = Object.entries(target.assets!)[0]!;
    const damaged = {
      ...target,
      assets: {
        [id]: { ...asset, base64: asset.base64.slice(0, -4) + 'AAAA' },
      },
    };
    await expect(serializePortableBackup(damaged)).rejects.toThrow();
    await expect(writeWorkspace(damaged, 0)).rejects.toThrow();
    expect(await readWorkspace()).toBeNull();
  });
});
