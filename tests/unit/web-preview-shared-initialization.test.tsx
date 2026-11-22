import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useWebPreview } from '../../src/web/useWebPreview';

const workers = vi.hoisted(() => ({
  instances: [] as {
    onmessage?: (event: MessageEvent) => void;
    terminate: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('../../src/compiler/compiler.worker?worker&inline', () => ({
  default: class {
    onmessage?: (event: MessageEvent) => void;
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

const props = {
  files: { 'note.mdx': '# Note' },
  entry: 'note.mdx',
  theme: 'light' as const,
};
async function tick(milliseconds = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('shared compiler initialization leases', () => {
  it('releases once across stop, rebuild and cleanup, and aborts only the last waiting consumer', async () => {
    vi.useFakeTimers();
    const download = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', download);
    const first = renderHook(() => useWebPreview(props));
    const second = renderHook(() => useWebPreview(props));
    await tick();
    expect(download).toHaveBeenCalledTimes(1);
    const signal = (
      download.mock.calls[0] as unknown as [string, RequestInit]
    )[1].signal!;
    expect(signal.aborted).toBe(false);

    act(() => first.result.current.stop());
    expect(signal.aborted).toBe(false);
    // A stop releases synchronously, and React also runs the effect cleanup.
    // Rebuild must reacquire without letting that duplicate release consume B's lease.
    act(() => first.result.current.rebuild());
    await tick();
    expect(download).toHaveBeenCalledTimes(1);
    first.unmount();
    expect(signal.aborted).toBe(false);
    second.unmount();
    expect(signal.aborted).toBe(true);
    expect(workers.instances).toHaveLength(0);

    const third = renderHook(() => useWebPreview(props));
    await tick();
    expect(download).toHaveBeenCalledTimes(2);
    const nextSignal = (
      download.mock.calls[1] as unknown as [string, RequestInit]
    )[1].signal!;
    expect(nextSignal.aborted).toBe(false);
    third.unmount();
    expect(nextSignal.aborted).toBe(true);
  });

  it('lets a surviving island complete after another is disabled and reuses the completed module', async () => {
    vi.useFakeTimers();
    let resolveDownload!: (response: Response) => void;
    const download = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    vi.stubGlobal('fetch', download);
    vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(
      new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
    );
    const first = renderHook(
      (enabled) => useWebPreview({ ...props, enabled }),
      { initialProps: true },
    );
    const second = renderHook(() => useWebPreview(props));
    await tick();
    const signal = (
      download.mock.calls[0] as unknown as [string, RequestInit]
    )[1].signal!;
    first.rerender(false);
    expect(signal.aborted).toBe(false);
    await act(async () => {
      resolveDownload(
        new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
      );
    });
    expect(workers.instances).toHaveLength(1);
    const worker = workers.instances[0]!;
    await act(async () => {
      worker.onmessage?.(
        new MessageEvent('message', {
          data: {
            id: worker.postMessage.mock.calls[0]![0].id,
            code: 'survivor',
          },
        }),
      );
    });
    expect(second.result.current.status).toBe('Preview ready');
    expect(second.result.current.html).toBe('<p>survivor</p>');
    expect(second.result.current.error).toBe('');
    first.unmount();
    second.unmount();
    expect(signal.aborted).toBe(false);

    const third = renderHook(() => useWebPreview(props));
    await tick();
    expect(download).toHaveBeenCalledTimes(1);
    expect(workers.instances).toHaveLength(2);
    third.unmount();
  });
});
