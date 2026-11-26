import { webcrypto } from 'node:crypto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  RenderedEditor,
  type RenderedCommands,
} from '../../src/editor/rendered/RenderedEditor';
import { NotificationProvider } from '../../src/ui/Notifications';
import { useWebWorkspace } from '../../src/web/useWebWorkspace';
import {
  deleteRetainedAttempt,
  readRetainedAttempts,
  readWorkspace,
  WEB_DATABASE_NAME,
  writeRetainedAttempt,
  writeWorkspace,
} from '../../src/web/persistence';
import * as persistence from '../../src/web/persistence';
import * as catalog from '../../src/assets/catalog';
import { pngAsset } from './web-assets-fixtures';
import { parseRenderedSource } from '../../src/editor/rendered/sourceBridge';
import { previewSourcePolicy } from '../../src/plugins/core/react';
import {
  createWebState,
  importSources,
  updateDocumentSource,
} from '../../src/web/workspace';

vi.mock('../../src/editor/rendered/RenderedRuntime', () => ({
  RenderedRuntime: () => null,
}));
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

it('reopens the refused editor attempt separately from the exact acknowledged source', async () => {
  const initial = createWebState(1);
  const key = initial.workspace.selected;
  const source = '\ufeffOriginal $x$ source.\r\n';
  await writeWorkspace(updateDocumentSource(initial, key, source), 0);
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.loading).toBe(false));
  const commands = createRef<RenderedCommands>();
  let acknowledged: Promise<void> | undefined;
  const live = render(
    <RenderedEditor
      source={source}
      path={key}
      active
      disabled={false}
      commandsRef={commands}
      runtime={{
        files: { [key]: source },
        entry: key,
        theme: 'light',
        images: [],
        stopped: true,
      }}
      wikilinks={[]}
      apply={() => false}
      undo={() => {}}
      redo={() => {}}
      openSource={() => {}}
      onPendingChange={tab.result.current.setPendingEditorDraft}
      onRetainAttempt={(base, text) =>
        (acknowledged = tab.result.current.retainAttempt(key, base, text))
      }
    />,
    { wrapper: NotificationProvider },
  );
  act(() => {
    expect(commands.current!.insertText('未適用🌱')).toBe(false);
  });
  await act(async () =>
    screen.getByRole('button', { name: 'Review draft' }).click(),
  );
  const attempted = (
    screen.getByRole('textbox', {
      name: 'Unapplied text',
    }) as HTMLTextAreaElement
  ).value;
  const exact = '\ufeff未適用🌱\r\n\r\nOriginal $x$ source.\r\n';
  expect(attempted).toBe(exact.replaceAll('\r\n', '\n'));
  // Let an issued write finish, then drop all page-local state.
  await act(async () => {
    await acknowledged;
  });
  live.unmount();
  tab.unmount();
  const reopen = renderHook(useWebWorkspace);
  await waitFor(() => expect(reopen.result.current.loading).toBe(false));
  expect((await readWorkspace())?.state.workspace.files[key]).toBe(source);
  await waitFor(() =>
    expect(reopen.result.current.attempts).toMatchObject([
      { documentKey: key, baseRevision: 1, text: exact },
    ]),
  );
});

it('restores a copy once by workspace revision and keeps the winner and pending text through a conflicting tab', async () => {
  const initial = createWebState(1);
  const key = initial.workspace.selected;
  const original = '\ufeffBefore $x$.\r\n';
  const attempted = original.replace('$x$', '漢🌱');
  const published = original.replace('Before', 'Newer');
  const state = updateDocumentSource(initial, key, original);
  await writeWorkspace(state, 0);
  const attempt = await writeRetainedAttempt(key, 1, original, attempted);
  const stale = renderHook(useWebWorkspace);
  await waitFor(() => expect(stale.result.current.attempts).toHaveLength(1));
  const newer = await writeWorkspace(
    updateDocumentSource(state, key, published),
    1,
  );
  await act(async () =>
    expect(await stale.result.current.restoreAttempt(attempt.id)).toBe(false),
  );
  expect(stale.result.current.conflict).toBe(true);
  expect(await readWorkspace()).toEqual(newer);
  expect((await readRetainedAttempts()).attempts).toEqual([attempt]);
  act(() => {
    expect(stale.result.current.canUpdateSource(key, 'Undo attempt')).toBe(
      false,
    );
    stale.result.current.updateSource(key, 'Late native input');
  });
  expect(stale.result.current.state?.workspace.files[key]).toBe(original);
  stale.unmount();

  const fresh = renderHook(useWebWorkspace);
  await waitFor(() => expect(fresh.result.current.attempts).toHaveLength(1));
  expect((await readWorkspace())?.revision).toBe(newer.revision);
  await act(async () =>
    expect(await fresh.result.current.restoreAttempt(attempt.id)).toBe(true),
  );
  const restored = (await readWorkspace())!;
  const copy = restored.state.workspace.selected;
  expect(copy).not.toBe(key);
  expect(restored.state.workspace.files[key]).toBe(published);
  expect(restored.state.workspace.files[copy]).toBe(attempted);
  expect(restored.state.workspace.bindings).toEqual({});
  expect(restored.state.workspace.saved).toEqual({});
  expect((await readRetainedAttempts()).attempts).toEqual([]);
  await act(async () =>
    expect(await fresh.result.current.restoreAttempt(attempt.id)).toBe(false),
  );
  expect((await readWorkspace())?.revision).toBe(restored.revision);
});

it('keeps other snapshots across capacity refusal, cancellation and an explicit discard', async () => {
  const initial = createWebState(1);
  await writeWorkspace(initial, 0);
  const key = initial.workspace.selected;
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.loading).toBe(false));
  for (let i = 0; i < 4; i++)
    await writeRetainedAttempt(key, 1, '', 'Attempt ' + i);
  await act(async () => tab.result.current.retainAttempt(key, '', 'This tab'));
  const previous = (await readRetainedAttempts()).attempts;
  expect(previous).toHaveLength(5);
  // Closing review with no user action leaves all five snapshots untouched.
  await act(async () => tab.result.current.reloadAttempts());
  await expect(writeRetainedAttempt(key, 1, '', 'Overflow')).rejects.toThrow(
    'full',
  );
  expect((await readRetainedAttempts()).attempts).toEqual(previous);
  await act(async () => tab.result.current.discardLiveAttempt());
  expect((await readRetainedAttempts()).attempts).toEqual(
    previous.filter((row) => row.text !== 'This tab'),
  );
  expect((await readWorkspace())?.revision).toBe(1);
});

it('keeps an unreadable snapshot separate from valid rescues and refuses stale consumption', async () => {
  const initial = createWebState(1);
  const saved = await writeWorkspace(initial, 0);
  const key = initial.workspace.selected;
  const first = await writeRetainedAttempt(key, 1, '', 'Valid');
  const second = await writeRetainedAttempt(
    key,
    1,
    '',
    'Altered outside the application',
  );
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(WEB_DATABASE_NAME);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(
        [first, { ...second, text: 'Corrupted' }],
        'retained-edits-v1',
      );
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
    open.onerror = () => reject(open.error);
  });
  const inventory = await readRetainedAttempts();
  expect(inventory.error).toContain('integrity');
  expect(inventory.attempts).toEqual([first]);
  await expect(deleteRetainedAttempt(second)).rejects.toThrow('changed');
  await expect(
    writeWorkspace(
      updateDocumentSource(initial, key, 'Wrong'),
      1,
      true,
      [],
      second,
    ),
  ).rejects.toThrow('changed');
  expect(await readWorkspace()).toEqual(saved);
  expect(await readRetainedAttempts()).toEqual(inventory);
});

it('leaves both the canonical note and the retained inventory intact when a copy cannot commit', async () => {
  const initial = createWebState(1);
  const saved = await writeWorkspace(initial, 0);
  const key = initial.workspace.selected;
  const attempt = await writeRetainedAttempt(key, 1, '', 'Rescue');
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.attempts).toEqual([attempt]));
  const originalPut = IDBObjectStore.prototype.put;
  const failing = vi
    .spyOn(IDBObjectStore.prototype, 'put')
    .mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      id?: IDBValidKey,
    ) {
      if (this.name === 'workspace' && id === 'retained-edits-v1')
        throw new DOMException('Full', 'QuotaExceededError');
      return originalPut.call(this, value, id);
    });
  try {
    await act(async () => {
      expect(await tab.result.current.restoreAttempt(attempt.id)).toBe(false);
      await expect(
        tab.result.current.retainAttempt(key, '', 'Keep live'),
      ).rejects.toThrow('Download the live draft');
    });
  } finally {
    failing.mockRestore();
  }
  expect(await readWorkspace()).toEqual(saved);
  expect((await readRetainedAttempts()).attempts).toEqual([attempt]);
});

it('reestablishes an acknowledged live edit deleted in another tab before releasing the last in-memory copy', async () => {
  const state = createWebState(1);
  const key = state.workspace.selected;
  const saved = await writeWorkspace(state, 0);
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.loading).toBe(false));
  await act(async () =>
    tab.result.current.retainAttempt(key, '\ufeffFirst base\r\n', '確定🌱'),
  );
  const old = tab.result.current.attempts[0]!;
  await deleteRetainedAttempt(old);
  await act(async () => tab.result.current.keepLiveAttempt());
  const fresh = (await readRetainedAttempts()).attempts;
  expect(fresh).toHaveLength(1);
  expect(fresh[0]!.id).not.toBe(old.id);
  expect(fresh[0]).toMatchObject({
    documentKey: key,
    baseRevision: saved.revision,
    baseChecksum: old.baseChecksum,
    text: old.text,
  });
  tab.unmount();
  expect((await readRetainedAttempts()).attempts).toEqual(fresh);
  expect(await readWorkspace()).toEqual(saved);
});

it('keeps a live attempt in memory on verification failure and hands off an existing durable record exactly once', async () => {
  const state = createWebState(1);
  await writeWorkspace(state, 0);
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.loading).toBe(false));
  await act(async () =>
    tab.result.current.retainAttempt(
      state.workspace.selected,
      '',
      'Live attempt',
    ),
  );
  const original = (await readRetainedAttempts()).attempts;
  const database = indexedDB;
  vi.stubGlobal('indexedDB', undefined);
  await act(async () =>
    expect(tab.result.current.keepLiveAttempt()).rejects.toThrow(
      'Browser storage is unavailable',
    ),
  );
  vi.stubGlobal('indexedDB', database);
  await act(async () => tab.result.current.keepLiveAttempt());
  expect((await readRetainedAttempts()).attempts).toEqual(original);
});

it('refreshes a stale recovery inventory after failed consumption and preserves the action error', async () => {
  const state = createWebState(1);
  await writeWorkspace(state, 0);
  const first = await writeRetainedAttempt(
    state.workspace.selected,
    1,
    '',
    'Removed in another tab',
  );
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.attempts).toHaveLength(1));
  await deleteRetainedAttempt(first);
  await act(async () =>
    expect(await tab.result.current.restoreAttempt(first.id)).toBe(false),
  );
  expect(tab.result.current.attempts).toEqual([]);
  expect(tab.result.current.attemptError).toContain('changed');
});

it('blocks late attachment preparation and other content mutations in a conflicted tab while preserving view preferences', async () => {
  const state = createWebState(1);
  const key = state.workspace.selected;
  await writeWorkspace(state, 0);
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.loading).toBe(false));
  let finish!: (asset: catalog.StoredAsset) => void;
  const held = new Promise<catalog.StoredAsset>((resolve) => {
    finish = resolve;
  });
  vi.spyOn(catalog, 'prepareAttachment').mockImplementationOnce(() => held);
  const attachment = tab.result.current.importAttachments(
    [new File([''], 'chart.png')],
    key,
  );
  await writeWorkspace(
    updateDocumentSource(state, key, 'First tab published'),
    1,
  );
  act(() => tab.result.current.updateSource(key, 'Losing local source'));
  await act(async () => expect(await tab.result.current.saveNow()).toBe(false));
  expect(tab.result.current.conflict).toBe(true);
  const before = tab.result.current.state!;
  await act(async () => {
    finish(await pngAsset());
    await attachment;
    expect((await readWorkspace())?.state.workspace.files[key]).toBe(
      'First tab published',
    );
    expect(tab.result.current.createNote('New content')).toBeNull();
    tab.result.current.trash(key);
    tab.result.current.setTheme('dark');
  });
  expect(tab.result.current.state?.workspace).toEqual(before.workspace);
  expect(tab.result.current.state?.assets).toEqual(before.assets);
  expect(tab.result.current.state?.documents).toEqual(before.documents);
  expect(tab.result.current.state?.theme).toBe('dark');
  expect((await readWorkspace())?.state.workspace.files[key]).toBe(
    'First tab published',
  );
});

it('rechecks the recovery record transactionally if another tab discards it during handoff verification', async () => {
  const state = createWebState(1);
  await writeWorkspace(state, 0);
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.loading).toBe(false));
  await act(async () =>
    tab.result.current.retainAttempt(
      state.workspace.selected,
      'First',
      'Attempt',
    ),
  );
  const previous = tab.result.current.attempts[0]!;
  const write = persistence.writeRetainedAttempt;
  const competing = vi
    .spyOn(persistence, 'writeRetainedAttempt')
    .mockImplementationOnce(async (...args) => {
      await deleteRetainedAttempt(previous);
      return write(...args);
    });
  await act(async () => tab.result.current.keepLiveAttempt());
  expect(competing).toHaveBeenCalledOnce();
  expect((await readRetainedAttempts()).attempts).toMatchObject([
    { text: 'Attempt', baseChecksum: previous.baseChecksum },
  ]);
});

it('retries an initial rescue write failure with the original in-memory text and base after storage recovers', async () => {
  const state = createWebState(1);
  const key = state.workspace.selected;
  const saved = await writeWorkspace(state, 0);
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.loading).toBe(false));
  vi.spyOn(persistence, 'writeRetainedAttempt').mockRejectedValueOnce(
    new DOMException('Full', 'QuotaExceededError'),
  );
  await act(async () =>
    expect(
      tab.result.current.retainAttempt(
        key,
        'Original local base',
        'Live 🌱\r\n',
      ),
    ).rejects.toThrow('Download the live draft'),
  );
  expect((await readRetainedAttempts()).attempts).toEqual([]);
  act(() => tab.result.current.setTheme('dark'));
  await act(async () => expect(await tab.result.current.saveNow()).toBe(true));
  await act(async () => tab.result.current.keepLiveAttempt());
  expect((await readRetainedAttempts()).attempts).toMatchObject([
    { documentKey: key, baseRevision: saved.revision, text: 'Live 🌱\r\n' },
  ]);
  expect((await readWorkspace())?.state.workspace.files[key]).toBe(
    state.workspace.files[key],
  );
});

it('hands off a verified live record even when an unrelated stored row has a bad checksum', async () => {
  const state = createWebState(1);
  const key = state.workspace.selected;
  await writeWorkspace(state, 0);
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.loading).toBe(false));
  await act(async () =>
    tab.result.current.retainAttempt(key, '', 'Keep exact live content'),
  );
  const live = tab.result.current.attempts[0]!;
  const damaged = {
    ...live,
    id: crypto.randomUUID(),
    text: 'Separate damaged text',
  };
  const open = indexedDB.open(WEB_DATABASE_NAME);
  await new Promise<void>((resolve, reject) => {
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put([live, damaged], 'retained-edits-v1');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
    open.onerror = () => reject(open.error);
  });
  await act(async () => tab.result.current.keepLiveAttempt());
  const reread = await readRetainedAttempts();
  expect(reread.attempts).toEqual([live]);
  expect(reread.error).toContain('integrity');
  expect((await readWorkspace())?.revision).toBe(1);
});

it.each(['md', 'MD', 'mdx', 'MDX'])(
  'preserves the source interpretation of a recovered .%s note including literal Markdown braces',
  async (extension) => {
    const original = '\ufeffOriginal note.\r\n';
    const raw = '\ufeffKeep {1+1} here.\r\n';
    const state = importSources(createWebState(1), [
      { logicalPath: 'Imported.' + extension, source: original },
    ]);
    const key = state.workspace.selected;
    await writeWorkspace(state, 0);
    const attempted = await writeRetainedAttempt(key, 1, original, raw);
    const tab = renderHook(useWebWorkspace);
    await waitFor(() =>
      expect(tab.result.current.attempts).toEqual([attempted]),
    );
    await act(async () =>
      expect(await tab.result.current.restoreAttempt(attempted.id)).toBe(true),
    );
    const recovered = (await readWorkspace())!.state.workspace;
    const copy = recovered.selected;
    expect(copy).not.toBe(key);
    expect(recovered.files[key]).toBe(original);
    expect(recovered.files[copy]).toBe(raw);
    const doc = parseRenderedSource(recovered.files[copy]!, copy).doc;
    const islands: string[] = [];
    doc.descendants((node) => {
      if (
        (node.type.name === 'source_inline' ||
          node.type.name === 'source_block') &&
        previewSourcePolicy(node.attrs.kind, node.attrs.raw, true, false).render
      )
        islands.push(node.attrs.raw);
    });
    const markdown = extension.toLowerCase() === 'md';
    expect(islands).toEqual(markdown ? [] : ['{1+1}']);
    if (markdown) expect(doc.textContent).toContain('Keep {1+1} here.');
    expect(copy.toLowerCase().split('.').pop()).toBe(extension.toLowerCase());
    expect(recovered.bindings).toEqual({});
    expect((await readRetainedAttempts()).attempts).toEqual([]);
  },
);

it('keeps a retained non-note source downloadable without creating a differently typed copy', async () => {
  const state = createWebState(1);
  const saved = await writeWorkspace(state, 0);
  const attempted = await writeRetainedAttempt(
    'imports/read.ts',
    1,
    '',
    'const kept = 1;',
  );
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.attempts).toEqual([attempted]));
  await act(async () =>
    expect(await tab.result.current.restoreAttempt(attempted.id)).toBe(false),
  );
  expect(tab.result.current.attemptError).toContain('Download');
  expect(await readWorkspace()).toEqual(saved);
  expect((await readRetainedAttempts()).attempts).toEqual([attempted]);
});
