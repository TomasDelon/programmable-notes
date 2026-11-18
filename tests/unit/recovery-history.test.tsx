import { afterEach, expect, it, vi } from 'vitest';
import {
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
  vi.unstubAllGlobals();
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
