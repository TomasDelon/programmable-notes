import { afterEach, it, expect, vi } from 'vitest';
import {
  act,
  render,
  screen,
  cleanup,
  fireEvent,
} from '@testing-library/react';
const api = vi.hoisted(() => ({
  invoke: vi.fn(),
  worker: null as null | {
    onmessage:
      ((e: { data: { code?: string; error?: string } }) => void) | null;
  },
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: api.invoke,
}));
vi.mock('../../src/compiler/compiler.worker?worker&inline', () => ({
  default: class {
    onmessage:
      ((e: { data: { code?: string; error?: string } }) => void) | null = null;
    constructor() {
      api.worker = this;
    }
    postMessage() {}
    terminate() {}
  },
}));
vi.mock('../../src/editor/SourceEditor', () => ({ SourceEditor: () => null }));
vi.mock('../../src/documents/RecoveryHistory', () => ({
  RecoveryHistory: () => null,
}));
vi.mock('../../src/preview/document', () => ({
  previewDocument: async (code: string) => code,
}));
import { App } from '../../src/App';
const pendingCleanups: (() => void)[] = [];
afterEach(async () => {
  cleanup();
  await act(async () => {
    while (pendingCleanups.length) pendingCleanups.shift()!();
    await Promise.resolve();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function start() {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
  vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
  );
  render(<App />);
  await act(async () => {
    await import('../../src/desktop/NativeWorkspaceShell');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Show document modes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Split' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  await act(async () => {
    api.worker!.onmessage!({ data: { code: 'native artifact' } });
  });
  expect(api.invoke).toHaveBeenCalledWith('start_preview', {
    html: 'native artifact',
  });
}
it('confirms native Stop only after success and allows a fresh explicit retry after failure', async () => {
  let reject!: (e: Error) => void;
  let stops = 0;
  api.invoke.mockReset().mockImplementation((command: string) => {
    if (command === 'stop_preview' && ++stops === 1)
      return new Promise((_resolve, r) => {
        reject = r;
        pendingCleanups.push(() => r(Error('test cleanup')));
      });
    return Promise.resolve();
  });
  await start();
  fireEvent.click(screen.getByRole('button', { name: 'Stop preview' }));
  expect(
    screen.getByRole('status', { name: 'Document status' }),
  ).toHaveTextContent('Stopping preview');
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    reject(Error('injected Stop failure'));
  });
  expect(
    screen.getByRole('status', { name: 'Document status' }),
  ).toHaveTextContent('Preview stop failed');
  expect(screen.getByRole('alert')).toHaveTextContent('injected Stop failure');
  expect(stops).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Stop preview' }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(stops).toBe(2);
  expect(
    screen.getByRole('status', { name: 'Document status' }),
  ).toHaveTextContent('Preview stopped');
  expect(screen.queryByRole('alert')).toBeNull();
});
it.each(['success', 'failure'])(
  'ignores superseded Stop %s after a manually rebuilt preview',
  async (outcome) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    api.invoke.mockReset().mockImplementation((command: string) =>
      command === 'stop_preview'
        ? new Promise<void>((r, fail) => {
            resolve = r;
            reject = fail;
            pendingCleanups.push(r);
          })
        : Promise.resolve(),
    );
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Stop preview' }));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild preview' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole('status', { name: 'Document status' }),
    ).toHaveTextContent('Compiling');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await act(async () => {
      api.worker!.onmessage!({ data: { error: 'current compiler failure' } });
    });
    expect(
      screen.getByRole('status', { name: 'Document status' }),
    ).toHaveTextContent('Build failed');
    await act(async () => {
      if (outcome === 'failure') reject(Error('superseded failure'));
      else resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'current compiler failure',
    );
    expect(
      screen.getByRole('status', { name: 'Document status' }),
    ).toHaveTextContent('Build failed');
  },
);
it.each(['success', 'failure'])(
  'a newer explicit Stop owns feedback after older %s',
  async (outcome) => {
    const pending: { resolve: () => void; reject: (error: Error) => void }[] =
      [];
    api.invoke.mockReset().mockImplementation((command: string) =>
      command === 'stop_preview'
        ? new Promise<void>((resolve, reject) => {
            pending.push({ resolve, reject });
            pendingCleanups.push(resolve);
          })
        : Promise.resolve(),
    );
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Stop preview' }));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop preview' }));
    await act(async () => {
      if (outcome === 'failure')
        pending[0]!.reject(Error('superseded failure'));
      else pending[0]!.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(pending).toHaveLength(2);
    expect(
      screen.getByRole('status', { name: 'Document status' }),
    ).toHaveTextContent('Stopping preview');
    await act(async () => {
      pending[1]!.resolve();
    });
    expect(
      screen.getByRole('status', { name: 'Document status' }),
    ).toHaveTextContent('Preview stopped');
  },
);
