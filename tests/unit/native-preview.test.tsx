import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { NativePreview } from '../../src/preview/NativePreview';
it('surfaces unavailable containment and orders cleanup before subsequent starts', async () => {
  invoke
    .mockRejectedValueOnce('cgroup unavailable')
    .mockResolvedValue(undefined);
  const error = vi.fn();
  const view = render(<NativePreview html="old" onError={error} />);
  await waitFor(() =>
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('cgroup unavailable'),
    ),
  );
  view.rerender(<NativePreview html="new" onError={error} />);
  await waitFor(() =>
    expect(invoke).toHaveBeenLastCalledWith('start_preview', { html: 'new' }),
  );
  expect(invoke.mock.calls.slice(0, 3)).toEqual([
    ['start_preview', { html: 'old' }],
    ['stop_preview'],
    ['start_preview', { html: 'new' }],
  ]);
  view.unmount();
  await waitFor(() => expect(invoke).toHaveBeenLastCalledWith('stop_preview'));
});

async function flushNativeQueue() {
  await act(async () => {
    await Promise.resolve();
  });
}

it('reports a disconnected session without restarting or continuing to poll', async () => {
  vi.useFakeTimers();
  let active = true;
  invoke.mockReset();
  invoke.mockImplementation(async (command: string) =>
    command === 'preview_connection_active' ? active : undefined,
  );
  const view = render(<NativePreview html="session" onError={vi.fn()} />);
  try {
    await flushNativeQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByLabelText('Native preview status')).toHaveTextContent(
      'connected',
    );
    active = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByLabelText('Native preview status')).toHaveTextContent(
      'ended or disconnected',
    );
    expect(screen.getByLabelText('Native preview status')).toHaveTextContent(
      'Rebuild preview',
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === 'preview_connection_active',
      ),
    ).toHaveLength(2);
    expect(
      invoke.mock.calls.filter(([command]) => command === 'start_preview'),
    ).toHaveLength(1);
  } finally {
    view.unmount();
    await flushNativeQueue();
    vi.useRealTimers();
  }
});

it.each(['malformed', 'rejected'] as const)(
  'treats %s lifecycle checks as unknown rather than stopped',
  async (kind) => {
    vi.useFakeTimers();
    const error = vi.fn();
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
      if (command === 'preview_connection_active') {
        if (kind === 'rejected') throw Error('native query unavailable');
        return 'false';
      }
    });
    const view = render(<NativePreview html="session" onError={error} />);
    try {
      await flushNativeQueue();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.getByLabelText('Native preview status')).toHaveTextContent(
        'unavailable',
      );
      expect(
        screen.getByLabelText('Native preview status'),
      ).not.toHaveTextContent('ended');
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('status unavailable'),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(
        invoke.mock.calls.filter(
          ([command]) => command === 'preview_connection_active',
        ),
      ).toHaveLength(1);
    } finally {
      view.unmount();
      await flushNativeQueue();
      vi.useRealTimers();
    }
  },
);

it('keeps one pending check and ignores its late reply after a newer build', async () => {
  vi.useFakeTimers();
  let resolveOld!: (value: boolean) => void;
  let checks = 0;
  invoke.mockReset();
  invoke.mockImplementation((command: string) => {
    if (command === 'preview_connection_active' && ++checks === 1)
      return new Promise<boolean>((resolve) => {
        resolveOld = resolve;
      });
    return Promise.resolve(
      command === 'preview_connection_active' ? true : undefined,
    );
  });
  const error = vi.fn();
  const view = render(<NativePreview html="old-session" onError={error} />);
  try {
    await flushNativeQueue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === 'preview_connection_active',
      ),
    ).toHaveLength(1);
    view.rerender(<NativePreview html="new-session" onError={error} />);
    await flushNativeQueue();
    expect(invoke).toHaveBeenCalledWith('start_preview', {
      html: 'new-session',
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === 'preview_connection_active',
      ),
    ).toHaveLength(1);
    await act(async () => {
      resolveOld(false);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByLabelText('Native preview status')).toHaveTextContent(
      'connected',
    );
    expect(
      screen.getByLabelText('Native preview status'),
    ).not.toHaveTextContent('ended');
    expect(error).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    await flushNativeQueue();
    vi.useRealTimers();
  }
});
