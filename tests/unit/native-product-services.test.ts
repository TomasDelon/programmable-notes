import { expect, it, vi } from 'vitest';
import { createNativeProductServices } from '../../src/desktop/nativeProductServices';
import type {
  SnapshotInput,
  SnapshotWritten,
} from '../../src/documents/recovery';

function fixture() {
  const copies = new Map<string, SnapshotInput>();
  let sequence = 0;
  const ports = {
    dirty: vi.fn(async () => {}),
    snapshot: vi.fn(async (input: SnapshotInput): Promise<SnapshotWritten> => {
      const id = `snapshot-${++sequence}`;
      const file = `${id}.json`;
      copies.set(file, { ...input });
      return {
        durable: true,
        warning: null,
        snapshot: {
          id,
          file,
          metadata: {
            schema: 1,
            documentId: input.documentId,
            name: input.name,
            baseline: input.baseline,
            parent: input.parent,
            generation: sequence,
            createdAtMs: 1,
            sourceBytes: new TextEncoder().encode(input.source).length,
          },
        },
      };
    }),
    restoreSnapshot: vi.fn(async (file: string) => {
      const input = copies.get(file)!;
      return { name: input.name, source: input.source };
    }),
  };
  return {
    ports,
    services: createNativeProductServices(ports, () => 'private-test-identity'),
  };
}
const input = () => ({
  sessionId: 'session-a',
  logicalPath: 'notes/plain.md',
  batch: {
    expected: {
      sessionId: 'session-a',
      editorRevision: 2,
      source: '\uFEFFbase\r\n',
    },
    source: '\uFEFFattempt\r\n😀',
  },
});
it('acknowledges captured recovery bytes only after matching metadata and exact readback', async () => {
  const h = fixture();
  const attempt = input();
  const pending = h.services.preserveAttempt(attempt);
  attempt.batch.source = 'caller mutation';
  attempt.logicalPath = 'other.mdx';
  expect(await pending).toEqual({ durable: true });
  expect(h.ports.snapshot.mock.calls[0]![0]).toMatchObject({
    name: 'plain.md',
    source: '\uFEFFattempt\r\n😀',
    parent: null,
  });
  await h.services.preserveAttempt(input());
  expect(h.ports.snapshot.mock.calls[1]![0].parent).toBe('snapshot-1');
  expect(h.ports.restoreSnapshot).toHaveBeenCalledTimes(2);
});
it('refuses cross-session attempts before IPC and cannot turn a mismatching readback into durable recovery', async () => {
  const h = fixture();
  await expect(
    h.services.preserveAttempt({ ...input(), sessionId: 'session-b' }),
  ).rejects.toThrow();
  expect(h.ports.snapshot).not.toHaveBeenCalled();
  h.ports.restoreSnapshot.mockResolvedValueOnce({
    name: 'plain.md',
    source: 'other bytes',
  });
  await expect(h.services.preserveAttempt(input())).rejects.toThrow(/readback/);
});
it('does not acknowledge non-durable or foreign snapshot metadata', async () => {
  for (const changed of ['durability', 'identity'] as const) {
    const h = fixture();
    const append = h.ports.snapshot.getMockImplementation()!;
    h.ports.snapshot.mockImplementationOnce(async (value) => {
      const receipt = await append(value);
      if (changed === 'durability') receipt.durable = false;
      else receipt.snapshot.metadata.documentId = 'foreign';
      return receipt;
    });
    await expect(h.services.preserveAttempt(input())).rejects.toThrow(
      /acknowledgement/,
    );
    expect(h.ports.restoreSnapshot).not.toHaveBeenCalled();
  }
});
