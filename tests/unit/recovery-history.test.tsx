import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { RecoveryHistory } from '../../src/documents/RecoveryHistory';
const api = vi.hoisted(() => ({
  snapshots: vi.fn(),
  snapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  migrateRecovery: vi.fn(),
}));
vi.mock('../../src/documents/native', () => ({ nativeDocuments: api }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const version = {
  file: 'opaque-version',
  id: 'a'.repeat(64),
  metadata: {
    documentId: 'b'.repeat(32),
    name: 'note.mdx',
    generation: 1,
    createdAtMs: 0,
    sourceBytes: 5,
    schema: 1,
    parent: null,
    baseline: null,
  },
};
it('discovers persisted versions and restores only on explicit selection', async () => {
  vi.stubGlobal('crypto', webcrypto);
  api.snapshots.mockResolvedValue({
    snapshots: [version],
    errors: [],
    capacityExceeded: false,
  });
  const restore = vi.fn().mockResolvedValue(undefined);
  render(
    <RecoveryHistory
      documentKey="note.mdx"
      name="note.mdx"
      source="draft"
      busy={false}
      restore={restore}
    />,
  );
  await screen.findByRole('option', { name: /note.mdx/ });
  expect(restore).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Restore selected version' }),
  );
  await waitFor(() => expect(restore).toHaveBeenCalledWith('opaque-version'));
});
it('a failed snapshot keeps source available and reports the write error', async () => {
  vi.stubGlobal('crypto', webcrypto);
  api.snapshots.mockResolvedValue({
    snapshots: [],
    errors: [],
    capacityExceeded: false,
  });
  api.snapshot.mockRejectedValue(new Error('No space left on device'));
  const source = '\uFEFF# Draft\r\n';
  render(
    <RecoveryHistory
      documentKey="note.mdx"
      name="note.mdx"
      source={source}
      busy={false}
      restore={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Keep versioned snapshot' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Keep versioned snapshot' }),
  );
  await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
    'No space left',
  );
  expect(api.snapshot.mock.calls[0]?.[0].source).toBe(source);
});

it('debounces and coalesces automatic snapshots for every modified buffer', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', webcrypto);
  api.snapshots.mockResolvedValue({
    snapshots: [],
    errors: [],
    capacityExceeded: false,
  });
  api.snapshot.mockImplementation(async (input) => ({
    snapshot: {
      ...version,
      metadata: { ...version.metadata, documentId: input.documentId },
    },
    durable: true,
    warning: null,
  }));
  const dirty = (source: string) => [
    { documentKey: 'a.mdx', name: 'a.mdx', source, baseline: 'saved A' },
    {
      documentKey: 'b.tsx',
      name: 'b.tsx',
      source: 'export const n = 2',
      baseline: 'export const n = 1',
    },
    {
      documentKey: 'clean.mdx',
      name: 'clean.mdx',
      source: 'unchanged',
      baseline: 'unchanged',
    },
  ];
  const props = {
    documentKey: 'a.mdx',
    name: 'a.mdx',
    source: 'draft A',
    busy: false,
    restore: vi.fn(),
  };
  const view = render(
    <RecoveryHistory {...props} candidates={dirty('draft A')} />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  view.rerender(
    <RecoveryHistory
      {...props}
      source="latest A"
      candidates={dirty('latest A')}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999);
  });
  expect(api.snapshot).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(2));
  });
  expect(api.snapshot.mock.calls.map(([input]) => input.source)).toEqual([
    'latest A',
    'export const n = 2',
  ]);
});

it('automatic write failure pauses further writes and preserves an explicit retry', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', webcrypto);
  api.snapshots.mockResolvedValue({
    snapshots: [],
    errors: [],
    capacityExceeded: false,
  });
  api.snapshot.mockRejectedValue(new Error('No space left on device'));
  render(
    <RecoveryHistory
      documentKey="a.mdx"
      name="a.mdx"
      source="draft"
      busy={false}
      restore={vi.fn()}
      candidates={[
        {
          documentKey: 'a.mdx',
          name: 'a.mdx',
          source: 'draft',
          baseline: 'saved',
        },
      ]}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(1));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('No space left');
  expect(
    screen.getByRole('button', { name: 'Resume automatic recovery' }),
  ).toBeEnabled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
  expect(api.snapshot).toHaveBeenCalledTimes(1);
});

it('keeps one write in flight and drops queued data for a closed document', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', webcrypto);
  api.snapshots.mockResolvedValue({
    snapshots: [],
    errors: [],
    capacityExceeded: false,
  });
  let finish!: (value: unknown) => void;
  api.snapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const candidate = {
    documentKey: 'a.mdx',
    name: 'a.mdx',
    source: 'draft A',
    baseline: 'saved A',
  };
  const props = { ...candidate, busy: false, restore: vi.fn() };
  const view = render(
    <RecoveryHistory
      {...props}
      candidates={[
        candidate,
        {
          documentKey: 'b.mdx',
          name: 'b.mdx',
          source: 'draft B',
          baseline: 'saved B',
        },
      ]}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(1));
  });
  view.rerender(<RecoveryHistory {...props} candidates={[candidate]} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(api.snapshot).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ snapshot: version, durable: true, warning: null });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(api.snapshot).toHaveBeenCalledTimes(1);
});

it('keeps independent recovery lineages when an already snapshotted buffer shares a native path', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', webcrypto);
  let stored: (typeof version)[] = [];
  api.snapshots.mockImplementation(async () => ({
    snapshots: stored,
    errors: [],
    capacityExceeded: false,
  }));
  api.snapshot.mockImplementation(async (input) => {
    const snapshot = {
      ...version,
      id: String(stored.length + 1).repeat(64),
      metadata: {
        ...version.metadata,
        documentId: input.documentId,
        name: input.name,
      },
    };
    stored = [snapshot, ...stored];
    return { snapshot, durable: true, warning: null };
  });
  const first = {
    documentKey: 'first',
    name: 'note.mdx',
    source: 'unsaved A',
    baseline: 'saved',
    displayPath: '/synthetic/note.mdx',
  };
  const second = { ...first, documentKey: 'second', source: 'unsaved B' };
  const props = { ...first, busy: false, restore: vi.fn() };
  const view = render(<RecoveryHistory {...props} candidates={[first]} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(1));
  });
  view.rerender(<RecoveryHistory {...props} candidates={[first, second]} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(2));
  });
  expect(api.snapshot.mock.calls[1]?.[0].documentId).not.toBe(
    api.snapshot.mock.calls[0]?.[0].documentId,
  );
  expect(api.snapshot.mock.calls[1]?.[0].parent).toBeNull();
  expect(stored).toHaveLength(2);
});

it.each([
  {
    durable: false,
    warning: 'Published but durability uncertain: I/O error',
    errorText: 'Published but durability uncertain',
  },
  {
    durable: true,
    warning: 'Snapshot saved; retention cleanup failed: I/O error',
    errorText: 'Snapshot saved; retention cleanup failed',
  },
  {
    durable: false,
    warning: null,
    errorText: 'Snapshot publication could not be confirmed durable',
  },
])(
  'keeps a published version restorable but pauses automatic writes on $errorText',
  async ({ durable, warning, errorText }) => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', webcrypto);
    let published = false;
    api.snapshots.mockImplementation(async () => ({
      snapshots: published ? [version] : [],
      errors: [],
      capacityExceeded: false,
    }));
    api.snapshot.mockImplementation(async () => {
      published = true;
      return { snapshot: version, durable, warning };
    });
    const restore = vi.fn().mockResolvedValue(undefined);
    const health = vi.fn();
    render(
      <RecoveryHistory
        documentKey="a.mdx"
        name="a.mdx"
        source={'\uFEFF# Unsaved\r\n😀'}
        busy={false}
        restore={restore}
        onHealth={health}
        candidates={[
          {
            documentKey: 'a.mdx',
            name: 'a.mdx',
            source: '\uFEFF# Unsaved\r\n😀',
            baseline: 'saved',
          },
        ]}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep versioned snapshot' }),
    );
    await act(async () => {
      await vi.waitFor(() => expect(api.snapshots).toHaveBeenCalledTimes(2));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(errorText);
    expect(
      screen.getByRole('button', { name: 'Resume automatic recovery' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Restore selected version' }),
    ).toBeEnabled();
    expect(health).toHaveBeenLastCalledWith({
      message: expect.stringContaining(errorText),
      error: true,
    });
    expect(restore).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(api.snapshot).toHaveBeenCalledTimes(1);
    expect(api.snapshot.mock.calls[0]?.[0].source).toBe(
      '\uFEFF# Unsaved\r\n😀',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore selected version' }),
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(restore).toHaveBeenCalledWith('opaque-version'),
      );
    });
  },
);
