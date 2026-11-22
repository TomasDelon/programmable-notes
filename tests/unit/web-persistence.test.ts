import { webcrypto } from 'node:crypto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listRecoveryVersions,
  readRecoveryVersion,
  readWorkspace,
  WEB_DATABASE_NAME,
  WorkspaceConflictError,
  writeWorkspace,
} from '../../src/web/persistence';
import { createWebState, updateDocumentSource } from '../../src/web/workspace';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe('transactional browser persistence', () => {
  it('publishes a verified full workspace only after a committed transaction', async () => {
    const state = createWebState(1);
    expect(await readWorkspace()).toBeNull();
    const saved = await writeWorkspace(state, 0);
    expect(saved.revision).toBe(1);
    expect(saved.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect((await readWorkspace())!.state).toEqual(state);
  });

  it('permits exactly one concurrent writer and retains the losing tab data outside storage', async () => {
    const initial = createWebState(1);
    await writeWorkspace(initial, 0);
    const key = initial.workspace.selected;
    const first = updateDocumentSource(initial, key, 'Tab A');
    const second = updateDocumentSource(initial, key, 'Tab B');
    const outcomes = await Promise.allSettled([
      writeWorkspace(first, 1),
      writeWorkspace(second, 1),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejected = outcomes.find(
      (item) => item.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(WorkspaceConflictError);
    const stored = await readWorkspace();
    expect(stored!.revision).toBe(2);
    expect(['Tab A', 'Tab B']).toContain(stored!.state.workspace.files[key]);
    expect(first.workspace.files[key]).toBe('Tab A');
    expect(second.workspace.files[key]).toBe('Tab B');
  });

  it('rolls back current state and recovery changes together on a quota failure', async () => {
    const initial = createWebState(1);
    await writeWorkspace(initial, 0);
    const update = updateDocumentSource(
      initial,
      initial.workspace.selected,
      'Keep this pending edit',
    );
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name === 'workspace')
          throw new DOMException('Full', 'QuotaExceededError');
        return originalPut.call(this, value, key);
      });
    await expect(writeWorkspace(update, 1)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    put.mockRestore();
    expect((await readWorkspace())!.state).toEqual(initial);
    expect(await listRecoveryVersions()).toEqual([]);
    expect(update.workspace.files[initial.workspace.selected]).toBe(
      'Keep this pending edit',
    );
  });

  it('preserves useful checkpoints across keystrokes and ignores navigation-only saves', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000);
    let state = createWebState(1);
    await writeWorkspace(state, 0);
    const key = state.workspace.selected;
    state = updateDocumentSource(state, key, 'First edit', 100_100);
    now.mockReturnValue(100_100);
    await writeWorkspace(state, 1);
    expect(await listRecoveryVersions()).toEqual([
      { revision: 1, updated: 100_000 },
    ]);
    now.mockReturnValue(100_500);
    state = updateDocumentSource(state, key, 'Second edit', 100_500);
    await writeWorkspace(state, 2);
    expect(await listRecoveryVersions()).toHaveLength(1);
    now.mockReturnValue(160_000);
    await writeWorkspace({ ...state, theme: 'dark' }, 3);
    expect(await listRecoveryVersions()).toHaveLength(1);
    now.mockReturnValue(160_100);
    state = updateDocumentSource(state, key, 'Later edit', 160_100);
    await writeWorkspace(state, 4);
    expect((await listRecoveryVersions()).map((item) => item.revision)).toEqual(
      [4, 1],
    );
    expect((await readRecoveryVersion(1)).state.workspace.files[key]).toContain(
      'Your notes',
    );
  });

  it('detects damaged persisted content without replacing it or silently creating a new workspace', async () => {
    const state = createWebState(1);
    const saved = await writeWorkspace(state, 0);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(WEB_DATABASE_NAME);
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction('workspace', 'readwrite');
        transaction.objectStore('workspace').put(
          {
            ...saved,
            state: updateDocumentSource(
              state,
              state.workspace.selected,
              'Tampered',
            ),
          },
          'current',
        );
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      open.onerror = () => reject(open.error);
    });
    await expect(readWorkspace()).rejects.toThrow('integrity check');
    await expect(readWorkspace()).rejects.toThrow('integrity check');
  });
});
