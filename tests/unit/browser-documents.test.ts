import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useDocuments } from '../../src/documents/useDocuments';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));

function selection(...sources: string[]) {
  const files = sources.map(
    (source, i) => new File([source], `source-${i}.mdx`),
  );
  const reads = files.map((file) => vi.spyOn(file, 'arrayBuffer'));
  return { list: files as unknown as FileList, reads };
}

it('rejects an over-count selection before reading any files and retains dirty source', async () => {
  const hook = renderHook(() =>
    useDocuments({ 'note.mdx': 'original' }, 'note.mdx'),
  );
  act(() => hook.result.current.change('Retain dirty café 😀.\r\n'));
  const before = hook.result.current.workspace;
  const { list, reads } = selection(
    ...Array.from({ length: 32 }, () => '# New'),
  );
  await act(() => hook.result.current.openBrowser(list));
  expect(hook.result.current.fileError).toContain('32 files');
  expect(hook.result.current.workspace).toBe(before);
  for (const read of reads) expect(read).not.toHaveBeenCalled();
});

it('rejects aggregate bytes before reading a selection of individually valid files', async () => {
  const hook = renderHook(() =>
    useDocuments({ 'note.mdx': 'original' }, 'note.mdx'),
  );
  const before = hook.result.current.workspace;
  const { list, reads } = selection(
    ...Array.from({ length: 17 }, () => 'x'.repeat(500_000)),
  );
  await act(() => hook.result.current.openBrowser(list));
  expect(hook.result.current.fileError).toContain('8 MiB');
  expect(hook.result.current.workspace).toBe(before);
  for (const read of reads) expect(read).not.toHaveBeenCalled();
});

it('preflights later oversized files using UTF8 bytes rather than reading earlier valid files', async () => {
  const hook = renderHook(() =>
    useDocuments({ 'note.mdx': 'original' }, 'note.mdx'),
  );
  const before = hook.result.current.workspace;
  const { list, reads } = selection('# Valid', '😀'.repeat(125_001));
  await act(() => hook.result.current.openBrowser(list));
  expect(hook.result.current.fileError).toContain('500 KB');
  expect(hook.result.current.workspace).toBe(before);
  for (const read of reads) expect(read).not.toHaveBeenCalled();
});

it('accepts the exact aggregate byte limit without changing BOM, Unicode or line endings', async () => {
  const files = Object.fromEntries(
    Array.from({ length: 16 }, (_, i) => [`old-${i}.mdx`, 'x'.repeat(500_000)]),
  );
  const prefix = '\uFEFF# café 😀\r\n\r\n';
  const source =
    prefix + 'x'.repeat(388_608 - new TextEncoder().encode(prefix).byteLength);
  const { list, reads } = selection(source);
  const hook = renderHook(() => useDocuments(files, 'old-0.mdx'));
  await act(() => hook.result.current.openBrowser(list));
  expect(hook.result.current.fileError).toBe('');
  expect(
    hook.result.current.workspace.files[hook.result.current.workspace.selected],
  ).toBe(source);
  expect(
    hook.result.current.workspace.saved[hook.result.current.workspace.selected],
  ).toBe(source);
  expect(hook.result.current.workspace.files['old-0.mdx']).toBe(
    files['old-0.mdx'],
  );
  expect(reads[0]).toHaveBeenCalledOnce();
});

it('revalidates the latest workspace after asynchronous reads and never discards intervening edits', async () => {
  const files = Object.fromEntries(
    Array.from({ length: 16 }, (_, i) => [`old-${i}.mdx`, 'x'.repeat(499_999)]),
  );
  const source = 'y'.repeat(388_624);
  const { list, reads } = selection(source);
  let resolve!: (bytes: ArrayBuffer) => void;
  reads[0]!.mockImplementation(
    () =>
      new Promise<ArrayBuffer>((done) => {
        resolve = done;
      }),
  );
  const hook = renderHook(() => useDocuments(files, 'old-0.mdx'));
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.openBrowser(list);
  });
  expect(reads[0]).toHaveBeenCalledOnce();
  act(() => hook.result.current.change(files['old-0.mdx'] + 'z'));
  const edited = hook.result.current.workspace;
  await act(async () => {
    resolve(new TextEncoder().encode(source).buffer);
    await pending;
  });
  expect(hook.result.current.fileError).toContain('8 MiB');
  expect(hook.result.current.workspace).toBe(edited);
  expect(hook.result.current.dirty).toBe(true);
  expect(hook.result.current.workspace.saved['old-0.mdx']).toBe(
    files['old-0.mdx'],
  );
});
