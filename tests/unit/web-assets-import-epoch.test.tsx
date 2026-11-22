import { webcrypto } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWebWorkspace } from '../../src/web/useWebWorkspace';
import {
  createWebState,
  renameDocument,
  serializeBackup,
} from '../../src/web/workspace';
import { readWorkspace, writeWorkspace } from '../../src/web/persistence';
import { PNG } from './web-assets-fixtures';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

it.each(['source', 'attachment'] as const)(
  'rejects a delayed %s import when an explicit restore replaced the workspace',
  async (kind) => {
    const initial = createWebState(1);
    await writeWorkspace(initial, 0);
    const { result } = renderHook(useWebWorkspace);
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'));
    const read = deferred<ArrayBuffer>();
    const decode = deferred<ImageBitmap>();
    const decoder = vi.fn(() => decode.promise);
    vi.stubGlobal('createImageBitmap', decoder);
    let importing!: Promise<void>;
    if (kind === 'source') {
      const file = {
        name: 'late.mdx',
        size: 4,
        webkitRelativePath: '',
        arrayBuffer: () => read.promise,
      } as File;
      act(() => {
        importing = result.current.importFiles([file]);
      });
    } else {
      const file = new NodeFile([PNG], 'late.png', {
        type: 'image/png',
      }) as unknown as File;
      act(() => {
        importing = result.current.importAttachments([file]);
      });
      await waitFor(() => expect(decoder).toHaveBeenCalledOnce());
    }
    const replacement = renameDocument(
      createWebState(2),
      initial.workspace.selected,
      'Restored workspace',
    );
    const backup = new NodeFile(
      [serializeBackup(replacement)],
      'replacement.json',
      { type: 'application/json' },
    ) as unknown as File;
    await act(async () => {
      await result.current.restoreBackup(backup);
    });
    expect(result.current.state).toEqual(replacement);
    await act(async () => {
      if (kind === 'source')
        read.resolve(new Uint8Array([108, 97, 116, 101]).buffer);
      else
        decode.resolve({
          width: 4,
          height: 3,
          close: vi.fn(),
        } as unknown as ImageBitmap);
      await importing;
    });
    expect(result.current.state).toEqual(replacement);
    expect((await readWorkspace())!.state).toEqual(replacement);
    expect(result.current.error).toContain('workspace changed');
    expect(result.current.error).toContain('No files were imported');
  },
);
