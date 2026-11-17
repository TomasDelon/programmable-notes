import { render, waitFor } from '@testing-library/react';
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
