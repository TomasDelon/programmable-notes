import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useWebPreview } from '../../src/web/useWebPreview';

const fixture = vi.hoisted(() => ({
  workers: [] as {
    onmessage?: (event: MessageEvent) => void;
    onerror?: (event: ErrorEvent) => void;
    terminate: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
  }[],
  document: vi.fn<(code: string) => Promise<string>>(),
}));
vi.mock('../../src/compiler/compiler.worker?worker&inline', () => ({
  default: class {
    onmessage?: (event: MessageEvent) => void;
    onerror?: (event: ErrorEvent) => void;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      fixture.workers.push(this);
    }
  },
}));
vi.mock('../../src/web/previewDocument', () => ({
  webPreviewDocument: (code: string) => fixture.document(code),
}));
beforeEach(() => {
  vi.useFakeTimers();
  fixture.document.mockImplementation(async (code) => `<p>${code}</p>`);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
      ),
  );
  vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fixture.document.mockReset();
  fixture.workers.length = 0;
});
const props = {
  files: { 'note.mdx': '# Note' },
  entry: 'note.mdx',
  theme: 'light' as const,
};
async function launch() {
  const rendered = renderHook((input) => useWebPreview(input), {
    initialProps: props,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  return rendered;
}
function reply(index: number, data: Record<string, unknown>) {
  const worker = fixture.workers[index]!;
  const id = worker.postMessage.mock.calls[0]![0].id;
  worker.onmessage?.(new MessageEvent('message', { data: { id, ...data } }));
}

describe('integrated runtime lifecycle regression controls', () => {
  it('keeps one deadline through hashing and ignores its eventual late completion', async () => {
    let finish!: (document: string) => void;
    fixture.document.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await launch();
    await act(async () => {
      reply(0, { code: 'compiled' });
    });
    expect(result.current.status).toBe('Preparing preview');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_700);
    });
    expect(result.current.status).toBe('Build timed out');
    await act(async () => {
      finish('<p>too late</p>');
    });
    expect(result.current.html).toBe('');
    expect(result.current.status).toBe('Build timed out');
  });

  it('accepts one compiler result only and ignores late worker errors', async () => {
    const { result } = await launch();
    await act(async () => {
      reply(0, { code: 'first' });
      reply(0, { code: 'second' });
      fixture.workers[0]!.onerror?.(
        new ErrorEvent('error', { message: 'late worker error' }),
      );
    });
    expect(fixture.document).toHaveBeenCalledExactlyOnceWith('first');
    expect(result.current.status).toBe('Preview ready');
    expect(result.current.html).toBe('<p>first</p>');
  });

  it('rejects stale preparation after a source change and retains the newer document', async () => {
    let finishOld!: (document: string) => void;
    fixture.document.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const { result, rerender } = await launch();
    await act(async () => {
      reply(0, { code: 'old' });
    });
    rerender({ ...props, files: { 'note.mdx': '# Changed' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      reply(1, { code: 'new' });
    });
    await act(async () => {
      finishOld('<p>old</p>');
    });
    expect(result.current.html).toBe('<p>new</p>');
    expect(result.current.error).toBe('');
  });

  it('contains preparation failures and recovers through explicit rebuild', async () => {
    fixture.document.mockRejectedValueOnce(new Error('hash unavailable'));
    const { result } = await launch();
    await act(async () => {
      reply(0, { code: 'first' });
    });
    expect(result.current.status).toBe('Build failed');
    expect(result.current.error).toContain('hash unavailable');
    act(() => result.current.rebuild());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      reply(1, { code: 'recovered' });
    });
    expect(result.current.status).toBe('Preview ready');
    expect(result.current.html).toBe('<p>recovered</p>');
  });

  it('stopping retires preparation, runtime errors and all late worker messages', async () => {
    let finish!: (document: string) => void;
    fixture.document.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await launch();
    await act(async () => {
      reply(0, { code: 'in flight' });
    });
    act(() => result.current.stop());
    await act(async () => {
      finish('<p>late</p>');
      result.current.reportRuntimeError('stale iframe');
      reply(0, { code: 'another late reply' });
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.status).toBe('Preview stopped');
    expect(result.current.html).toBe('');
    expect(result.current.error).toBe('');
    expect(fixture.workers).toHaveLength(1);
  });

  it('bounds genuine runtime errors without remounting the current document', async () => {
    const { result } = await launch();
    await act(async () => {
      reply(0, { code: 'ready' });
    });
    act(() => result.current.reportRuntimeError('x'.repeat(3_000)));
    expect(result.current.status).toBe('Runtime error');
    expect(result.current.error).toHaveLength(2_000);
    expect(result.current.html).toBe('<p>ready</p>');
  });
});
