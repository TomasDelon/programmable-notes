import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RetainedAttempt,
  StoredWorkspace,
} from '../../src/web/persistence';
import { createWebState, type WebState } from '../../src/web/workspace';
import { serializePortableBackup } from '../../src/backup/portable';

const cloud = vi.hoisted(() => ({
  readWorkspace: vi.fn<() => Promise<StoredWorkspace | null>>(),
  readWorkspaceRevision: vi.fn<() => Promise<number>>(),
  readRetainedAttempts:
    vi.fn<() => Promise<{ attempts: RetainedAttempt[]; error: string }>>(),
  writeWorkspace:
    vi.fn<
      (state: WebState, expectedRevision: number) => Promise<StoredWorkspace>
    >(),
}));
vi.mock('../../src/web/cloudStorage', () => ({
  createCloudStorage: () => cloud,
}));

const openDatabase = vi.fn();
const persisted = vi.fn();
const persist = vi.fn();

function stored(state: WebState, revision = 1): StoredWorkspace {
  return {
    state,
    revision,
    updated: 1,
    checksum: 'a'.repeat(64),
    byteSize: 123,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('VITE_STORAGE_BACKEND', 'cloud');
  vi.stubGlobal('indexedDB', { open: openDatabase });
  vi.stubGlobal('navigator', { storage: { persisted, persist } });
  cloud.readWorkspace.mockResolvedValue(stored(createWebState(1)));
  cloud.readRetainedAttempts.mockResolvedValue({ attempts: [], error: '' });
  cloud.readWorkspaceRevision.mockResolvedValue(2);
  cloud.writeWorkspace.mockImplementation(async (state, revision) =>
    stored(state, revision + 1),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('cloud workspace save lifecycle', () => {
  it('cannot restore over an unseen cloud catalog after a failed initial open', async () => {
    const { WorkspaceConflictError } =
      await import('../../src/web/persistence');
    cloud.readWorkspace.mockRejectedValueOnce(
      new Error('Connection interrupted.'),
    );
    cloud.writeWorkspace.mockImplementation(async (state, revision) => {
      if (revision === 0) throw new WorkspaceConflictError();
      return stored(state, 3);
    });
    const { useWebWorkspace } = await import('../../src/web/useWebWorkspace');
    const { result } = renderHook(() => useWebWorkspace());
    await act(async () => {});
    expect(result.current.state).toBeNull();
    const bytes = new TextEncoder().encode(
      await serializePortableBackup(createWebState(2)),
    );
    await act(async () =>
      result.current.restoreBackup({
        size: bytes.length,
        arrayBuffer: async () => bytes.buffer,
      } as File),
    );
    expect(cloud.writeWorkspace).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      0,
      true,
      [],
    );
    expect(cloud.readWorkspaceRevision).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();
    expect(result.current.conflict).toBe(true);
  });

  it.each([false, true])(
    'does not restore a backup over an unseen remote revision (dirty=%s)',
    async (dirty) => {
      const { WorkspaceConflictError } =
        await import('../../src/web/persistence');
      const initial = createWebState(1);
      const remote = createWebState(1);
      const key = initial.workspace.selected;
      remote.workspace.files[key] = 'Other device saved this.';
      cloud.readWorkspace
        .mockResolvedValue(stored(remote, 2))
        .mockResolvedValueOnce(stored(initial, 1));
      cloud.writeWorkspace.mockImplementation(async (state, revision) => {
        if (revision !== 2) throw new WorkspaceConflictError();
        return stored(state, 3);
      });
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { useWebWorkspace } = await import('../../src/web/useWebWorkspace');
      const { result } = renderHook(() => useWebWorkspace());
      await act(async () => {});
      if (dirty)
        act(() => result.current.updateSource(key, 'Keep my local draft.'));
      const bytes = new TextEncoder().encode(
        await serializePortableBackup(createWebState(2)),
      );
      const file = {
        size: bytes.length,
        arrayBuffer: async () => bytes.buffer,
      } as File;
      await act(async () => result.current.restoreBackup(file));
      expect(cloud.writeWorkspace).toHaveBeenCalledTimes(1);
      expect(cloud.writeWorkspace.mock.calls[0]![1]).toBe(1);
      expect(result.current.conflict).toBe(true);
      expect(result.current.state!.workspace.files[key]).toBe(
        dirty ? 'Keep my local draft.' : initial.workspace.files[key],
      );
      expect(cloud.readWorkspaceRevision).not.toHaveBeenCalled();
    },
  );

  it('requires explicit creation after a verified empty cloud read', async () => {
    vi.useFakeTimers();
    cloud.readWorkspace.mockResolvedValue(null);
    const { useWebWorkspace } = await import('../../src/web/useWebWorkspace');
    const { result } = renderHook(() => useWebWorkspace());
    await act(async () => {});
    expect(result.current.state).toBeNull();
    expect(result.current.cloudWorkspaceEmpty).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(cloud.writeWorkspace).not.toHaveBeenCalled();
    await act(async () => result.current.createCloudWorkspace());
    expect(cloud.writeWorkspace).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      0,
    );
    expect(result.current.state).not.toBeNull();
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.cloudWorkspaceEmpty).toBe(false);
  });

  it('waits two seconds to autosave and reports saved only after cloud acknowledgment', async () => {
    vi.useFakeTimers();
    const { useWebWorkspace } = await import('../../src/web/useWebWorkspace');
    const { result } = renderHook(() => useWebWorkspace());
    await act(async () => {});
    expect(result.current.saveStatus).toBe('saved');
    const key = result.current.state!.workspace.selected;
    let acknowledge!: (record: StoredWorkspace) => void;
    cloud.writeWorkspace.mockReturnValueOnce(
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    );
    act(() => result.current.updateSource(key, '\uFEFF# Edited\r\n'));
    await act(async () => vi.advanceTimersByTimeAsync(1_999));
    expect(cloud.writeWorkspace).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(cloud.writeWorkspace).toHaveBeenCalledExactlyOnceWith(
      result.current.state,
      1,
    );
    expect(result.current.saveStatus).toBe('saving');
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(beforeUnload)).toBe(false);
    await act(async () => acknowledge(stored(result.current.state!, 2)));
    expect(result.current.saveStatus).toBe('saved');
    await act(async () => expect(await result.current.saveNow()).toBe(true));
    expect(openDatabase).not.toHaveBeenCalled();
    expect(persisted).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('shows a failed open without creating or saving an empty workspace', async () => {
    vi.useFakeTimers();
    cloud.readWorkspace.mockRejectedValueOnce(new Error('Sign in again.'));
    const { useWebWorkspace } = await import('../../src/web/useWebWorkspace');
    const { result } = renderHook(() => useWebWorkspace());
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.state).toBeNull();
    expect(result.current.error).toBe('Sign in again.');
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(cloud.writeWorkspace).not.toHaveBeenCalled();
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it('retains a failed remote save in the open tab until an explicit retry succeeds', async () => {
    const { useWebWorkspace } = await import('../../src/web/useWebWorkspace');
    const { result } = renderHook(() => useWebWorkspace());
    await act(async () => {});
    const key = result.current.state!.workspace.selected;
    cloud.writeWorkspace.mockRejectedValueOnce(
      new Error('Cloud connection failed.'),
    );
    const source = '\uFEFFExact draft\r\n';
    act(() => result.current.updateSource(key, source));
    await act(async () => expect(await result.current.saveNow()).toBe(false));
    expect(result.current.error).toBe('Cloud connection failed.');
    expect(result.current.saveStatus).toBe('error');
    expect(result.current.state!.workspace.files[key]).toBe(source);
    expect(openDatabase).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    await act(async () => expect(await result.current.saveNow()).toBe(true));
    expect(result.current.saveStatus).toBe('saved');
    expect(cloud.writeWorkspace).toHaveBeenCalledTimes(2);
  });
});
