import { webcrypto } from 'node:crypto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as persistence from '../../src/web/persistence';
import { useWebWorkspace } from '../../src/web/useWebWorkspace';
import { trashDocument, updateDocumentSource } from '../../src/web/workspace';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

async function openSavedTab() {
  const tab = renderHook(useWebWorkspace);
  await waitFor(() => expect(tab.result.current.state).not.toBeNull());
  await act(async () => {
    expect(await tab.result.current.saveNow()).toBe(true);
  });
  return tab;
}

describe('workspace navigation across tabs', () => {
  it("rebases a stale mode switch onto the other tab's saved text", async () => {
    const first = await openSavedTab();
    const second = await openSavedTab();
    const key = first.result.current.state!.workspace.selected;
    act(() => first.result.current.updateSource(key, 'Saved in the first tab'));
    await act(async () => {
      expect(await first.result.current.saveNow()).toBe(true);
    });
    act(() => second.result.current.setMode('live'));
    await act(async () => {
      expect(await second.result.current.saveNow()).toBe(true);
    });
    expect(second.result.current.conflict).toBe(false);
    expect(second.result.current.state!.mode).toBe('live');
    expect(second.result.current.state!.workspace.files[key]).toBe(
      'Saved in the first tab',
    );
    const stored = await persistence.readWorkspace();
    expect(stored!.state.workspace.files[key]).toBe('Saved in the first tab');
    expect(stored!.state.mode).toBe('live');
  });

  it("does not mistake another tab's theme change for a competing text edit", async () => {
    const first = await openSavedTab();
    const second = await openSavedTab();
    const key = first.result.current.state!.workspace.selected;
    act(() => first.result.current.setTheme('dark'));
    await act(async () => {
      expect(await first.result.current.saveNow()).toBe(true);
    });
    act(() => second.result.current.updateSource(key, 'My new paragraph'));
    await act(async () => {
      expect(await second.result.current.saveNow()).toBe(true);
    });
    expect(second.result.current.conflict).toBe(false);
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('My new paragraph');
  });

  it('refreshes a clean tab on focus without changing its reading mode', async () => {
    const first = await openSavedTab();
    act(() => first.result.current.setMode('live'));
    await act(async () => {
      await first.result.current.saveNow();
    });
    const second = await openSavedTab();
    const key = first.result.current.state!.workspace.selected;
    act(() => {
      first.result.current.updateSource(
        key,
        'Published while tab two was idle',
      );
      first.result.current.setMode('source');
    });
    await act(async () => {
      await first.result.current.saveNow();
    });
    const saved = await persistence.readWorkspace();
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() =>
      expect(second.result.current.state!.workspace.files[key]).toBe(
        'Published while tab two was idle',
      ),
    );
    expect(second.result.current.state!.mode).toBe('live');
    expect(second.result.current.conflict).toBe(false);
    expect(second.result.current.saveStatus).toBe('saved');
    // Merely reading the newer version does not publish another revision.
    expect((await persistence.readWorkspace())!.revision).toBe(saved!.revision);
  });

  it('never refreshes over a dirty tab or merges two competing edits', async () => {
    const first = await openSavedTab();
    const second = await openSavedTab();
    const key = first.result.current.state!.workspace.selected;
    act(() =>
      first.result.current.updateSource(key, 'Published by the first tab'),
    );
    await act(async () => {
      await first.result.current.saveNow();
    });
    act(() => {
      second.result.current.updateSource(
        key,
        'Unsaved draft in the second tab',
      );
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => {
      expect(await second.result.current.saveNow()).toBe(false);
    });
    expect(second.result.current.conflict).toBe(true);
    expect(second.result.current.state!.workspace.files[key]).toBe(
      'Unsaved draft in the second tab',
    );
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Published by the first tab');
  });

  it('retains input entered while a focus refresh is reading', async () => {
    const tab = await openSavedTab();
    const baseline = (await persistence.readWorkspace())!;
    const key = baseline.state.workspace.selected;
    const remote = await persistence.writeWorkspace(
      updateDocumentSource(baseline.state, key, 'Remote publication'),
      baseline.revision,
    );
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(persistence, 'readWorkspace').mockImplementationOnce(async () => {
      await blocked;
      return remote;
    });
    act(() => window.dispatchEvent(new Event('focus')));
    act(() =>
      tab.result.current.updateSource(key, 'Typed during focus refresh'),
    );
    await act(async () => release!());
    expect(tab.result.current.state!.workspace.files[key]).toBe(
      'Typed during focus refresh',
    );
    await act(async () => {
      expect(await tab.result.current.saveNow()).toBe(false);
    });
    expect(tab.result.current.conflict).toBe(true);
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Remote publication');
  });

  it('does not discard input arriving during a view-only conflict rebase', async () => {
    const tab = await openSavedTab();
    const baseline = (await persistence.readWorkspace())!;
    const key = baseline.state.workspace.selected;
    const remote = await persistence.writeWorkspace(
      updateDocumentSource(baseline.state, key, 'Remote publication'),
      baseline.revision,
    );
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reading = false;
    vi.spyOn(persistence, 'readWorkspace').mockImplementationOnce(async () => {
      reading = true;
      await blocked;
      return remote;
    });
    act(() => tab.result.current.setMode('live'));
    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = tab.result.current.saveNow();
    });
    await waitFor(() => expect(reading).toBe(true));
    act(() =>
      tab.result.current.updateSource(key, 'Typed during conflict read'),
    );
    await act(async () => {
      release!();
      expect(await pending).toBe(false);
    });
    expect(tab.result.current.state!.workspace.files[key]).toBe(
      'Typed during conflict read',
    );
    expect(tab.result.current.conflict).toBe(true);
    expect(
      (await persistence.readWorkspace())!.state.workspace.files[key],
    ).toBe('Remote publication');
  });

  it('keeps a note mounted when remote Trash changes arrive during a pending equation draft', async () => {
    const tab = await openSavedTab();
    const baseline = (await persistence.readWorkspace())!;
    const key = baseline.state.workspace.selected;
    act(() => tab.result.current.setPendingEditorDraft(true));
    const remote = await persistence.writeWorkspace(
      trashDocument(baseline.state, key),
      baseline.revision,
    );
    const read = vi.spyOn(persistence, 'readWorkspace');

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(read).not.toHaveBeenCalled();
    expect(tab.result.current.state!.workspace.selected).toBe(key);
    expect(tab.result.current.state!.workspace.files[key]).toBe(
      baseline.state.workspace.files[key],
    );
    expect(tab.result.current.state!.documents[key]!.trashedAt).toBeFalsy();
    expect(tab.result.current.conflict).toBe(false);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    // Closing/applying the draft allows a later focus refresh to adopt Trash.
    act(() => {
      tab.result.current.setPendingEditorDraft(false);
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() =>
      expect(tab.result.current.state!.documents[key]!.trashedAt).toBeTruthy(),
    );
    expect(tab.result.current.state!.workspace.selected).not.toBe(key);
    expect((await persistence.readWorkspace())!.revision).toBe(remote.revision);
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  });

  it('retains the source when an editor draft starts during a clean focus read', async () => {
    const tab = await openSavedTab();
    const baseline = (await persistence.readWorkspace())!;
    const key = baseline.state.workspace.selected;
    const remote = await persistence.writeWorkspace(
      updateDocumentSource(baseline.state, key, 'Remote equation replacement'),
      baseline.revision,
    );
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(persistence, 'readWorkspace').mockImplementationOnce(async () => {
      await blocked;
      return remote;
    });
    act(() => window.dispatchEvent(new Event('focus')));
    act(() => tab.result.current.setPendingEditorDraft(true));
    await act(async () => release!());

    expect(tab.result.current.state!.workspace.selected).toBe(key);
    expect(tab.result.current.state!.workspace.files[key]).toBe(
      baseline.state.workspace.files[key],
    );
    expect(tab.result.current.conflict).toBe(false);
    expect((await persistence.readWorkspace())!.revision).toBe(remote.revision);
  });

  it.each(['before saving', 'during the conflict read'])(
    'refuses remote content adoption when an editor draft starts %s',
    async (when) => {
      const tab = await openSavedTab();
      const baseline = (await persistence.readWorkspace())!;
      const key = baseline.state.workspace.selected;
      const remote = await persistence.writeWorkspace(
        updateDocumentSource(baseline.state, key, 'Remote publication'),
        baseline.revision,
      );
      let release: (() => void) | undefined;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reading = false;
      vi.spyOn(persistence, 'readWorkspace').mockImplementationOnce(
        async () => {
          reading = true;
          await blocked;
          return remote;
        },
      );
      act(() => {
        if (when === 'before saving')
          tab.result.current.setPendingEditorDraft(true);
        tab.result.current.setMode('live');
      });
      let pending: Promise<boolean> | undefined;
      await act(async () => {
        pending = tab.result.current.saveNow();
      });
      await waitFor(() => expect(reading).toBe(true));
      if (when === 'during the conflict read')
        act(() => tab.result.current.setPendingEditorDraft(true));
      await act(async () => {
        release!();
        expect(await pending).toBe(false);
      });

      expect(tab.result.current.state!.mode).toBe('live');
      expect(tab.result.current.state!.workspace.files[key]).toBe(
        baseline.state.workspace.files[key],
      );
      expect(tab.result.current.conflict).toBe(true);
      expect(
        (await persistence.readWorkspace())!.state.workspace.files[key],
      ).toBe('Remote publication');
    },
  );

  it('allows a remote view-only rebase without disturbing an editor draft', async () => {
    const tab = await openSavedTab();
    const baseline = (await persistence.readWorkspace())!;
    const key = baseline.state.workspace.selected;
    await persistence.writeWorkspace(
      { ...baseline.state, theme: 'dark' },
      baseline.revision,
    );
    act(() => {
      tab.result.current.setPendingEditorDraft(true);
      tab.result.current.setMode('live');
    });
    await act(async () => {
      expect(await tab.result.current.saveNow()).toBe(true);
    });

    expect(tab.result.current.conflict).toBe(false);
    expect(tab.result.current.state!.workspace.selected).toBe(key);
    expect(tab.result.current.state!.workspace.files[key]).toBe(
      baseline.state.workspace.files[key],
    );
    expect((await persistence.readWorkspace())!.state.mode).toBe('live');
  });
});

describe('core plugin view preferences across tabs', () => {
  it('rebases toggles on newer saved source without overwriting it or creating a text conflict', async () => {
    const first = await openSavedTab();
    const second = await openSavedTab();
    const key = first.result.current.state!.workspace.selected;
    const exact = '\uFEFF# Other tab\r\n\r\n$x$\r\n';
    act(() => first.result.current.updateSource(key, exact));
    await act(async () => {
      expect(await first.result.current.saveNow()).toBe(true);
    });
    act(() => {
      second.result.current.setCorePlugin('react', false);
      second.result.current.setShowComponentSource(true);
    });
    await act(async () => {
      expect(await second.result.current.saveNow()).toBe(true);
    });
    const stored = (await persistence.readWorkspace())!.state;
    expect(stored.workspace.files[key]).toBe(exact);
    expect(stored.corePlugins?.react).toBe(false);
    expect(stored.previewPreferences?.showComponentSource).toBe(true);
    expect(second.result.current.conflict).toBe(false);
  });
});
