import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWebWorkspace } from '../../src/web/useWebWorkspace';
import { createWebState, updateDocumentSource } from '../../src/web/workspace';
import {
  readWorkspace,
  WEB_DATABASE_NAME,
  writeWorkspace,
} from '../../src/web/persistence';
import { parsePortableBackup } from '../../src/backup/portable';
import { pngAsset } from './web-assets-fixtures';

let downloads: Blob[];
let names: string[];
beforeEach(() => {
  downloads = [];
  names = [];
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('Blob', NodeBlob);
  const BaseURL = URL;
  vi.stubGlobal(
    'URL',
    class extends BaseURL {
      static createObjectURL(blob: Blob) {
        downloads.push(blob);
        return 'blob:unit-test';
      }
      static revokeObjectURL() {}
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('exports a labeled checksummed rescue when IndexedDB disappears, preserving the storage error and unsaved current data', async () => {
  const asset = await pngAsset();
  const initial = { ...createWebState(1), assets: { [asset.id]: asset } };
  await writeWorkspace(initial, 0);
  const { result } = renderHook(useWebWorkspace);
  await waitFor(() => expect(result.current.saveStatus).toBe('saved'));
  const key = result.current.state!.workspace.selected;
  vi.stubGlobal('indexedDB', undefined);
  act(() =>
    result.current.updateSource(key, '\uFEFFUnsaved rescued source\r\n'),
  );
  await waitFor(() => expect(result.current.saveStatus).toBe('error'));
  const storageError = result.current.error;
  vi.useFakeTimers();
  await act(async () => {
    await result.current.exportBackup();
  });
  expect(downloads).toHaveLength(1);
  expect(names[0]).toMatch(/-rescue\.json$/);
  const text = await downloads[0]!.text();
  const envelope = JSON.parse(text);
  expect(envelope.recoveryIncluded).toBe(false);
  expect(envelope.recovery).toEqual([]);
  const restored = await parsePortableBackup(text);
  expect(restored.state.workspace.files[key]).toBe(
    '\uFEFFUnsaved rescued source\r\n',
  );
  expect(restored.state.assets).toEqual(initial.assets);
  expect(restored.state.documents).toEqual(result.current.state!.documents);
  expect(result.current.backupNotice).toContain(
    'recovery history could not be read',
  );
  expect(result.current.error).toBe(storageError);
  expect(result.current.saveStatus).toBe('error');
  act(() => vi.runOnlyPendingTimers());
});

it('does not disguise a corrupt recovery checksum as a storage-unavailable rescue', async () => {
  const initial = createWebState(1);
  const first = await writeWorkspace(initial, 0);
  await writeWorkspace(
    updateDocumentSource(initial, initial.workspace.selected, 'Current source'),
    1,
    true,
  );
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(WEB_DATABASE_NAME);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('recovery', 'readwrite');
      transaction
        .objectStore('recovery')
        .put({ ...first, checksum: '0'.repeat(64) });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    };
    open.onerror = () => reject(open.error);
  });
  const current = await readWorkspace();
  const { result } = renderHook(useWebWorkspace);
  await waitFor(() => expect(result.current.saveStatus).toBe('saved'));
  await act(async () => {
    await result.current.exportBackup();
  });
  expect(downloads).toHaveLength(0);
  expect(result.current.backupNotice).toBe('');
  expect(result.current.error).toContain('integrity check');
  expect((await readWorkspace())!.state).toEqual(current!.state);
});
