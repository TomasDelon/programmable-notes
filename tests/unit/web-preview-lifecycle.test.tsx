import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useWebPreview } from '../../src/web/useWebPreview';

const workers = vi.hoisted(() => ({
  instances: [] as {
    onmessage?: (event: MessageEvent) => void;
    onerror?: (event: ErrorEvent) => void;
    terminate: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('../../src/compiler/compiler.worker?worker&inline', () => ({
  default: class {
    onmessage?: (event: MessageEvent) => void;
    onerror?: (event: ErrorEvent) => void;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      workers.instances.push(this);
    }
  },
}));
vi.mock('../../src/web/previewDocument', () => ({
  webPreviewDocument: async (code: string) => `<p>${code}</p>`,
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  workers.instances.length = 0;
});

describe('web compilation lifecycle', () => {
  it('retries stalled initialization, preserves the new cache after a late failure, and ignores stale work', async () => {
    vi.useFakeTimers();
    let rejectFirst!: (error: Error) => void;
    const pending = new Promise<Response>((_, reject) => {
      rejectFirst = reject;
    });
    const download = vi
      .fn()
      .mockImplementationOnce(() => pending)
      .mockResolvedValue(
        new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
      );
    vi.stubGlobal('fetch', download);
    vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(
      new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
    );
    const first = {
      files: { 'note.mdx': '# First' },
      entry: 'note.mdx',
      theme: 'dark' as 'light' | 'dark',
    };
    const { result, rerender } = renderHook((props) => useWebPreview(props), {
      initialProps: first,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15300);
    });
    expect(result.current.status).toBe('Build timed out');
    expect(download.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(workers.instances).toHaveLength(0);

    act(() => result.current.rebuild());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(download).toHaveBeenCalledTimes(2);
    expect(workers.instances).toHaveLength(1);
    // Simulate a transport that ignores abort and rejects after the replacement
    // compiler has already finished initialization.
    await act(async () => {
      rejectFirst(new Error('Late transport failure'));
      await Promise.resolve();
    });
    expect(result.current.status).toBe('Compiling');
    act(() => result.current.rebuild());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(download).toHaveBeenCalledTimes(2);
    const oldWorker = workers.instances[1]!;
    const firstId = oldWorker.postMessage.mock.calls[0]![0].id;
    const latest = { ...first, files: { 'note.mdx': '# Latest' } };
    rerender(latest);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(oldWorker.terminate).toHaveBeenCalled();
    await act(async () => {
      oldWorker.onmessage?.(
        new MessageEvent('message', { data: { id: firstId, code: 'stale' } }),
      );
    });
    expect(result.current.html).toBe('');

    const latestWorker = workers.instances[2]!;
    const latestId = latestWorker.postMessage.mock.calls[0]![0].id;
    await act(async () => {
      latestWorker.onmessage?.(
        new MessageEvent('message', { data: { id: latestId, code: 'latest' } }),
      );
    });
    expect(result.current.html).toBe('<p>latest</p>');
    expect(result.current.status).toBe('Preview ready');
    rerender({ ...latest, theme: 'light' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(workers.instances).toHaveLength(3);
    expect(result.current.html).toBe('<p>latest</p>');
    act(() => result.current.stop());
    await act(async () => {
      latestWorker.onmessage?.(
        new MessageEvent('message', {
          data: { id: latestId, code: 'after stop' },
        }),
      );
    });
    expect(result.current.html).toBe('');
    expect(result.current.status).toBe('Preview stopped');
  });
});
