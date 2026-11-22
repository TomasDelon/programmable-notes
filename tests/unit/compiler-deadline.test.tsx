import { afterEach, it, expect, vi } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import { App } from '../../src/App';
const worker = vi.hoisted(() => ({
  created: vi.fn(),
  posted: vi.fn(),
  terminated: vi.fn(),
}));
vi.mock('../../src/compiler/compiler.worker?worker&inline', () => ({
  default: class {
    constructor() {
      worker.created();
    }
    postMessage() {
      worker.posted();
    }
    terminate() {
      worker.terminated();
    }
  },
}));
vi.mock('../../src/editor/SourceEditor', () => ({ SourceEditor: () => null }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('a late WASM initialization cannot resume compilation after its deadline', async () => {
  vi.useFakeTimers();
  let finish!: (m: WebAssembly.Module) => void;
  const pending = new Promise<WebAssembly.Module>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
  vi.spyOn(WebAssembly, 'compileStreaming').mockReturnValue(pending);
  render(<App />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(screen.getByRole('status')).toHaveTextContent('Build timed out');
  await act(async () => {
    finish(
      new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
    );
    await Promise.resolve();
  });
  expect(worker.created).not.toHaveBeenCalled();
  expect(worker.posted).not.toHaveBeenCalled();
});
