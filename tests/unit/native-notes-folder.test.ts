import { act, renderHook } from '@testing-library/react';
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocuments } from '../../src/documents/useDocuments';
import {
  compilerFiles,
  MAX_FILES,
  type NativeDocument,
} from '../../src/documents/workspace';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke }));
const note: NativeDocument = {
  id: 'note-grant',
  revision: 'a',
  name: 'note.mdx',
  logicalPath: 'math/note.mdx',
  displayPath: '/home/test/My Notes/math/note.mdx',
  source:
    '\uFEFFimport Counter from "./widgets/Counter"\r\n\r\n# Area\r\n\r\n$x^2$\r\n\r\n<Counter />\r\n',
  durabilityWarning: false,
};
const module: NativeDocument = {
  ...note,
  id: 'module-grant',
  name: 'Counter.tsx',
  logicalPath: 'math/widgets/Counter.tsx',
  displayPath: '/home/test/My Notes/math/widgets/Counter.tsx',
  source:
    'export default function Counter() { return <button>Count</button>; }\r\n',
};
const defaultFiles = { 'example.mdx': '# Example' };

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  invoke.mockReset().mockImplementation((command: string) => {
    if (command === 'open_notes_folder') return Promise.resolve([note, module]);
    if (command === 'save_document')
      return Promise.resolve({ revision: 'b', durable: true });
    return Promise.resolve();
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('native notes folder IPC', () => {
  it('opens nested sources as one compiler group and saves exact text through the file grant', async () => {
    const { result } = renderHook(() =>
      useDocuments(defaultFiles, 'example.mdx'),
    );
    act(() => result.current.change('Previously unsaved source'));
    await act(async () => result.current.openFolder());
    expect(invoke).toHaveBeenCalledWith('open_notes_folder');
    const { workspace, notesFolder } = result.current;
    expect(notesFolder).toBe('/home/test/My Notes');
    expect(workspace.files['example.mdx']).toBe('Previously unsaved source');
    expect(workspace.selected).toBe('opened-1/math/note.mdx');
    expect(compilerFiles(workspace)).toEqual({
      'opened-1/math/note.mdx': note.source,
      'opened-1/math/widgets/Counter.tsx': module.source,
    });
    const changed = note.source.replace('# Area', '# Circle area');
    act(() => result.current.change(changed));
    await act(async () => result.current.save());
    expect(invoke).toHaveBeenCalledWith('save_document', {
      id: note.id,
      revision: note.revision,
      source: changed,
    });
    expect(result.current.workspace.saved[workspace.selected]).toBe(changed);
    expect(
      result.current.workspace.files['opened-1/math/widgets/Counter.tsx'],
    ).toBe(module.source);
    expect(result.current.dirty).toBe(true);
  });

  it('leaves accepted folder context, dirty source and selection intact after cancellation', async () => {
    const { result } = renderHook(() =>
      useDocuments(defaultFiles, 'example.mdx'),
    );
    await act(async () => result.current.openFolder());
    act(() => result.current.change(note.source + '\r\nMore text'));
    const prior = result.current.workspace;
    invoke.mockImplementation((command: string) =>
      Promise.resolve(command === 'open_notes_folder' ? [] : undefined),
    );
    await act(async () => result.current.openFolder());
    expect(result.current.workspace).toBe(prior);
    expect(result.current.notesFolder).toBe('/home/test/My Notes');
    expect(invoke).not.toHaveBeenCalledWith(
      'close_document',
      expect.anything(),
    );
  });

  it('releases newly returned grants if the current workspace cannot adopt the whole selection', async () => {
    const files = Object.fromEntries(
      Array.from({ length: MAX_FILES - 1 }, (_, index) => [
        `note-${index}.mdx`,
        '# Existing',
      ]),
    );
    const { result } = renderHook(() => useDocuments(files, 'note-0.mdx'));
    const prior = result.current.workspace;
    await act(async () => result.current.openFolder());
    expect(result.current.workspace).toBe(prior);
    expect(result.current.notesFolder).toBeNull();
    expect(result.current.fileError).toMatch(/32 files.*Source retained/);
    expect(invoke).toHaveBeenCalledWith('close_document', { id: note.id });
    expect(invoke).toHaveBeenCalledWith('close_document', { id: module.id });
  });

  it('refuses to open the picker while a visual draft is unapplied', async () => {
    const { result } = renderHook(() =>
      useDocuments(defaultFiles, 'example.mdx', true),
    );
    await act(async () => result.current.openFolder());
    expect(invoke).not.toHaveBeenCalledWith('open_notes_folder');
    expect(result.current.fileError).toMatch(/Apply or cancel the visual edit/);
  });

  it('copies a refused visual edit to native recovery and discards only that opaque version', async () => {
    const { result } = renderHook(() =>
      useDocuments(defaultFiles, 'example.mdx'),
    );
    await act(async () => result.current.openFolder());
    const key = result.current.workspace.selected;
    const candidate = '\uFEFFRecovered draft\r\n';
    invoke.mockImplementation((_command: string, args?: { action: string }) =>
      Promise.resolve(
        args?.action === 'append'
          ? {
              durable: true,
              snapshot: { id: 'version', file: 'opaque-version' },
            }
          : undefined,
      ),
    );
    await act(async () =>
      result.current.retainVisualAttempt(key, note.source, candidate),
    );
    expect(invoke).toHaveBeenCalledWith('recovery_draft', {
      action: 'append',
      input: {
        documentId: expect.stringMatching(/^[0-9a-f]{32}$/),
        name: note.name,
        source: candidate,
        baseline: createHash('sha256').update(note.source).digest('hex'),
        parent: null,
      },
    });
    expect(result.current.workspace.files[key]).toBe(note.source);
    await expect(
      result.current.resolveVisualAttempt('example.mdx', true),
    ).rejects.toThrow(/unavailable/);
    expect(invoke).not.toHaveBeenCalledWith('recovery_draft', {
      action: 'delete-version',
      file: expect.anything(),
    });
    await act(async () => result.current.resolveVisualAttempt(key, true));
    expect(invoke).toHaveBeenLastCalledWith('recovery_draft', {
      action: 'delete-version',
      file: 'opaque-version',
    });
  });
});
