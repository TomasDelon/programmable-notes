import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDocuments } from '../../src/documents/useDocuments';
const api = vi.hoisted(() => ({
  open: vi.fn(),
  draft: vi.fn(),
  restoreSnapshot: vi.fn(),
  save: vi.fn(),
  saveAs: vi.fn(),
  reopen: vi.fn(),
  close: vi.fn(),
  confirmDiscard: vi.fn(),
  dirty: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('../../src/documents/native', () => ({ nativeDocuments: api }));
const doc = {
  id: 'grant',
  revision: '1',
  name: 'local.mdx',
  logicalPath: 'local.mdx',
  displayPath: '/explicitly/selected/local.mdx',
  source: 'disk original',
  durabilityWarning: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  api.open.mockResolvedValue([doc]);
  api.close.mockResolvedValue(undefined);
  api.dirty.mockResolvedValue(undefined);
  api.confirmDiscard.mockResolvedValue(true);
});
afterEach(cleanup);
async function opened() {
  const hook = renderHook(() =>
    useDocuments({ 'note.mdx': 'example' }, 'note.mdx'),
  );
  await act(async () => {
    await hook.result.current.openNative();
  });
  return hook;
}
describe('native document UI state (mocked OS transport, not native security proof)', () => {
  it('restores an explicit draft without inheriting the original file grant', async () => {
    const h = await opened();
    api.draft.mockResolvedValue('# Recovered\r\n');
    await act(async () => h.result.current.nativeDraft('restore'));
    const { workspace, dirty } = h.result.current;
    expect(workspace.files[workspace.selected]).toBe('# Recovered\r\n');
    expect(workspace.bindings[workspace.selected]).toBeUndefined();
    expect(workspace.bindings['opened-1/local.mdx']?.id).toBe('grant');
    expect(workspace.files['opened-1/local.mdx']).toBe('disk original');
    expect(dirty).toBe(true);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('a queued editor callback cannot overwrite a newly selected document', async () => {
    const h = renderHook(() =>
      useDocuments({ 'note.mdx': 'example' }, 'note.mdx'),
    );
    const previousEditorChange = h.result.current.change;
    await act(async () => {
      await h.result.current.openNative();
    });
    act(() => previousEditorChange('late input from original editor'));
    expect(h.result.current.workspace.files['note.mdx']).toBe(
      'late input from original editor',
    );
    expect(h.result.current.workspace.files['opened-1/local.mdx']).toBe(
      'disk original',
    );
  });
  it('retains edits received while native close is releasing the grant', async () => {
    const h = await opened();
    const pending = deferred<void>();
    api.close.mockReturnValue(pending.promise);
    let closing!: Promise<void>;
    act(() => {
      closing = h.result.current.close();
    });
    act(() => h.result.current.change('new text while closing'));
    await act(async () => {
      pending.resolve();
      await closing;
    });
    const s = h.result.current.workspace;
    expect(s.files['opened-1/local.mdx']).toBe('new text while closing');
    expect(s.bindings['opened-1/local.mdx']).toBeUndefined();
    expect(h.result.current.dirty).toBe(true);
  });
  it('cancelled picker retains existing buffers and selection', async () => {
    api.open.mockResolvedValue([]);
    const h = renderHook(() =>
      useDocuments({ 'note.mdx': 'example' }, 'note.mdx'),
    );
    await act(async () => {
      await h.result.current.openNative();
    });
    expect(h.result.current.workspace.files).toEqual({ 'note.mdx': 'example' });
    expect(h.result.current.workspace.selected).toBe('note.mdx');
  });
  it('preserves edits made during a save while adopting its new revision', async () => {
    const h = await opened();
    act(() => h.result.current.change('first edit'));
    const pending = deferred<{ revision: string; durable: boolean }>();
    api.save.mockReturnValue(pending.promise);
    let saving!: Promise<void>;
    act(() => {
      saving = h.result.current.save();
    });
    act(() => h.result.current.change('later edit'));
    await act(async () => {
      pending.resolve({ revision: '2', durable: true });
      await saving;
    });
    const s = h.result.current.workspace;
    expect(s.files[s.selected]).toBe('later edit');
    expect(s.saved[s.selected]).toBe('first edit');
    expect(s.bindings[s.selected]?.revision).toBe('2');
    expect(h.result.current.dirty).toBe(true);
  });
  it('conflicts and cancelled Save As retain unsaved source and grant', async () => {
    const h = await opened();
    act(() => h.result.current.change('unsaved'));
    api.save.mockRejectedValue(Error('File changed on disk'));
    await act(async () => {
      await h.result.current.save();
    });
    expect(h.result.current.fileError).toMatch(
      /changed on disk.*Source retained/,
    );
    api.saveAs.mockResolvedValue(null);
    await act(async () => {
      await h.result.current.save(true);
    });
    expect(
      h.result.current.workspace.files[h.result.current.workspace.selected],
    ).toBe('unsaved');
    expect(
      h.result.current.workspace.bindings[h.result.current.workspace.selected]
        ?.id,
    ).toBe('grant');
  });
  it('late reopen preserves newer editor input but adopts the refreshed disk revision', async () => {
    const h = await opened();
    const pending = deferred<typeof doc>();
    api.reopen.mockReturnValue(pending.promise);
    let reopening!: Promise<void>;
    act(() => {
      reopening = h.result.current.reopen();
    });
    act(() => h.result.current.change('new local edit'));
    await act(async () => {
      pending.resolve({ ...doc, revision: '2', source: 'external disk edit' });
      await reopening;
    });
    const s = h.result.current.workspace;
    expect(s.files[s.selected]).toBe('new local edit');
    expect(s.bindings[s.selected]?.revision).toBe('2');
    expect(s.saved[s.selected]).toBe('external disk edit');
    expect(h.result.current.dirty).toBe(true);
  });
  it('releases returned grants when a native selection cannot enter the workspace', async () => {
    api.open.mockResolvedValue([doc, { ...doc, id: 'second' }]);
    const h = renderHook(() =>
      useDocuments({ 'note.mdx': 'example' }, 'note.mdx'),
    );
    await act(async () => {
      await h.result.current.openNative();
    });
    expect(h.result.current.fileError).toMatch(/Duplicate/);
    expect(api.close).toHaveBeenCalledWith('grant');
    expect(api.close).toHaveBeenCalledWith('second');
    expect(h.result.current.workspace.files).toEqual({ 'note.mdx': 'example' });
  });
  it('reports a committed durability warning without leaving an obsolete revision', async () => {
    const h = await opened();
    act(() => h.result.current.change('saved'));
    api.save.mockResolvedValue({ revision: '2', durable: false });
    await act(async () => {
      await h.result.current.save();
    });
    expect(h.result.current.fileNotice).toMatch(/durability/);
    expect(
      h.result.current.workspace.bindings[h.result.current.workspace.selected]
        ?.revision,
    ).toBe('2');
    expect(h.result.current.dirty).toBe(false);
  });
});

it('restores a version as a new dirty source without reusing the original grant', async () => {
  const h = await opened();
  api.restoreSnapshot.mockResolvedValue({
    name: 'local.mdx',
    source: '\uFEFF# Recovered\r\n',
  });
  await act(async () =>
    h.result.current.restoreNativeVersion('opaque-version'),
  );
  const state = h.result.current.workspace;
  expect(state.files[state.selected]).toBe('\uFEFF# Recovered\r\n');
  expect(state.bindings[state.selected]).toBeUndefined();
  expect(state.files['opened-1/local.mdx']).toBe('disk original');
  expect(state.bindings['opened-1/local.mdx']?.id).toBe('grant');
  expect(h.result.current.dirty).toBe(true);
  expect(api.save).not.toHaveBeenCalled();
});

it('a delayed version restore preserves edits made to the open original meanwhile', async () => {
  const h = await opened();
  const pending = deferred<{ name: string; source: string }>();
  api.restoreSnapshot.mockReturnValue(pending.promise);
  let restoring!: Promise<void>;
  act(() => {
    restoring = h.result.current.restoreNativeVersion('opaque-version');
  });
  act(() => h.result.current.change('new unsaved original edits'));
  await act(async () => {
    pending.resolve({ name: 'local.mdx', source: 'earlier version' });
    await restoring;
  });
  expect(h.result.current.workspace.files['opened-1/local.mdx']).toBe(
    'new unsaved original edits',
  );
  expect(
    h.result.current.workspace.files[h.result.current.workspace.selected],
  ).toBe('earlier version');
});

it('new notes retain queued source input and start without filesystem authorization', async () => {
  const h = await opened();
  act(() => {
    h.result.current.change('queued original\r\n😀');
    h.result.current.newNote();
  });
  const state = h.result.current.workspace;
  expect(state.files['opened-1/local.mdx']).toBe('queued original\r\n😀');
  expect(state.files[state.selected]).toBe('');
  expect(state.bindings[state.selected]).toBeUndefined();
  expect(state.saved[state.selected]).toBeUndefined();
  expect(api.save).not.toHaveBeenCalled();
  expect(api.saveAs).not.toHaveBeenCalled();
  expect(h.result.current.dirty).toBe(true);
});

it('protects unapplied trusted visual text without authorizing saves or replacing documents', async () => {
  const h = renderHook(
    ({ pending }) =>
      useDocuments({ 'note.mdx': 'saved example' }, 'note.mdx', pending),
    { initialProps: { pending: false } },
  );
  await act(async () => h.result.current.openNative());
  const before = h.result.current.workspace;
  h.rerender({ pending: true });
  expect(h.result.current.dirty).toBe(true);
  expect(api.dirty).toHaveBeenLastCalledWith(true, false);
  const closing = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);
  await act(async () => {
    await h.result.current.save();
    await h.result.current.reopen();
    await h.result.current.openNative();
    await h.result.current.close();
    h.result.current.newNote();
    h.result.current.select('note.mdx');
  });
  expect(h.result.current.workspace).toBe(before);
  expect(h.result.current.fileError).toMatch(/Apply or cancel/);
  expect(api.open).toHaveBeenCalledTimes(1);
  expect(api.save).not.toHaveBeenCalled();
  expect(api.reopen).not.toHaveBeenCalled();
  expect(api.close).not.toHaveBeenCalled();
  expect(api.confirmDiscard).not.toHaveBeenCalled();
  h.rerender({ pending: false });
  expect(h.result.current.dirty).toBe(false);
  expect(api.dirty).toHaveBeenLastCalledWith(false, false);
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  api.save.mockResolvedValue({ revision: '2', durable: true });
  await act(async () => h.result.current.save());
  expect(api.save).toHaveBeenCalledWith('grant', '1', 'disk original');
});
