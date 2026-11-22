import { webcrypto } from 'node:crypto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as persistence from '../../src/web/persistence';
import { useWebWorkspace } from '../../src/web/useWebWorkspace';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe('web workspace save lifecycle', () => {
  it('keeps saving across separate edits after idle no-op saves', async () => {
    const { result } = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    const key = result.current.state!.workspace.selected;
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    // A no-op save must not leave a resolved promise in the in-flight slot.
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    act(() => result.current.updateSource(key, 'First independent edit'));
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('First independent edit');
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    act(() => result.current.updateSource(key, 'Second independent edit'));
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Second independent edit');
    expect(result.current.saveStatus).toBe('saved');
  });

  it('commits input typed while a previous save is in flight before reporting saved', async () => {
    const { result } = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => {
      await result.current.saveNow();
    });
    const key = result.current.state!.workspace.selected;
    const actualWrite = persistence.writeWorkspace;
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    const write = vi
      .spyOn(persistence, 'writeWorkspace')
      .mockImplementationOnce(async (...args) => {
        entered = true;
        await blocked;
        return actualWrite(...args);
      });
    act(() => result.current.updateSource(key, 'Snapshot being saved'));
    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = result.current.saveNow();
    });
    expect(entered).toBe(true);
    act(() => result.current.updateSource(key, 'Newer text typed during save'));
    expect(result.current.saveStatus).toBe('saving');
    await act(async () => {
      release!();
      expect(await pending).toBe(true);
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Newer text typed during save');
    expect(result.current.saveStatus).toBe('saved');
  });

  it('retains stale-tab edits and returns false instead of overwriting a newer revision', async () => {
    const first = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(first.result.current.state).not.toBeNull());
    await act(async () => {
      await first.result.current.saveNow();
    });
    const second = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(second.result.current.state).not.toBeNull());
    const key = first.result.current.state!.workspace.selected;
    act(() => first.result.current.updateSource(key, 'Tab one published'));
    await act(async () => {
      expect(await first.result.current.saveNow()).toBe(true);
    });
    act(() =>
      second.result.current.updateSource(key, 'Tab two retained locally'),
    );
    await act(async () => {
      expect(await second.result.current.saveNow()).toBe(false);
    });
    expect(second.result.current.conflict).toBe(true);
    expect(second.result.current.saveStatus).toBe('conflict');
    expect(second.result.current.state!.workspace.files[key]).toBe(
      'Tab two retained locally',
    );
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Tab one published');
  });

  it('refuses oversize editor transactions with a clear message before changing authoritative text', async () => {
    const { result } = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => {
      await result.current.saveNow();
    });
    const key = result.current.state!.workspace.selected;
    const previous = result.current.state!.workspace.files[key];
    await act(async () => {
      expect(result.current.canUpdateSource(key, 'x'.repeat(500_001))).toBe(
        false,
      );
    });
    expect(result.current.error).toContain('not inserted');
    expect(result.current.state!.workspace.files[key]).toBe(previous);
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    expect(result.current.error).toBe('');
    expect(result.current.saveStatus).toBe('saved');
  });

  it('does not seed over unreadable storage and allows a later explicit reload', async () => {
    const read = vi
      .spyOn(persistence, 'readWorkspace')
      .mockRejectedValueOnce(new Error('Integrity check failed'));
    const { result } = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state).toBeNull();
    expect(result.current.saveStatus).toBe('error');
    expect(await persistence.readWorkspace()).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => {
      await result.current.reloadFromStorage();
    });
    expect(result.current.state).not.toBeNull();
  });

  it('retains input entered while a reload is reading an older saved snapshot', async () => {
    const { result } = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => {
      await result.current.saveNow();
    });
    const key = result.current.state!.workspace.selected;
    const previous = await persistence.readWorkspace();
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(persistence, 'readWorkspace').mockImplementationOnce(async () => {
      await blocked;
      return previous;
    });
    let reloading: Promise<void> | undefined;
    await act(async () => {
      reloading = result.current.reloadFromStorage();
    });
    act(() => result.current.updateSource(key, 'Typed during a slow reload'));
    await act(async () => {
      release!();
      await reloading;
    });
    expect(result.current.state!.workspace.files[key]).toBe(
      'Typed during a slow reload',
    );
    expect(result.current.error).toContain('newer edits were retained');
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Typed during a slow reload');
  });

  it('cancels reload when an editor draft opens while the previous save drains', async () => {
    const { result } = renderHook(useWebWorkspace);
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => {
      await result.current.saveNow();
    });
    const key = result.current.state!.workspace.selected;
    const actualWrite = persistence.writeWorkspace;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let saving = false;
    vi.spyOn(persistence, 'writeWorkspace').mockImplementationOnce(
      async (...args) => {
        saving = true;
        await blocked;
        return actualWrite(...args);
      },
    );
    const read = vi.spyOn(persistence, 'readWorkspace');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    act(() => result.current.updateSource(key, 'Keep this active document'));
    await waitFor(() => expect(saving).toBe(true));
    let reloading!: Promise<void>;
    act(() => {
      reloading = result.current.reloadFromStorage();
      result.current.setPendingEditorDraft(true);
    });
    await act(async () => {
      release();
      await reloading;
    });

    expect(read).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.state!.workspace.selected).toBe(key);
    expect(result.current.state!.workspace.files[key]).toBe(
      'Keep this active document',
    );
    expect(result.current.error).toContain('editor draft');
    expect(result.current.error).toContain('workspace was not replaced');
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Keep this active document');
  });

  it('completes real saves while optional storage permission stays pending and deduplicates the request', async () => {
    const { result } = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => {
      await result.current.saveNow();
    });
    const key = result.current.state!.workspace.selected;
    let release: ((value: boolean) => void) | undefined;
    const blocked = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const persist = vi.fn(() => blocked);
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { storage: { value: { persist } } }),
    );
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(result.current.persistentStorage).toBeNull();
    act(() =>
      result.current.updateSource(key, 'Typed during storage permission'),
    );
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Typed during storage permission');
    await act(async () => release!(false));
    expect(result.current.persistentStorage).toBe(false);
    expect(result.current.saveStatus).toBe('saved');
  });

  it('drains input arriving when optional permission is requested before allowing a reload', async () => {
    const { result } = renderHook(() => useWebWorkspace());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => {
      await result.current.saveNow();
    });
    const key = result.current.state!.workspace.selected;
    const persist = vi.fn(() => {
      result.current.updateSource(key, 'Latest input before reload');
      return new Promise<boolean>(() => {});
    });
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { storage: { value: { persist } } }),
    );
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Latest input before reload');
    expect(result.current.saveStatus).toBe('saved');
  });
});
