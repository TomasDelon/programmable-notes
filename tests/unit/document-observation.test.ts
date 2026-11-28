import { describe, expect, it, vi } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import type {
  DocumentWriter,
  WriteReceipt,
} from '../../src/application/autosave';

const original = '\uFEFFA\r\nB\n';
const external = { source: '\uFEFFDisk 🌱\r\nB\n', diskRevision: 'observed-1' };
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup() {
  const writer = vi.fn<DocumentWriter>(async () => ({
    diskRevision: 'written',
    durable: true,
  }));
  const close = vi.fn(async () => {});
  const controller = new DocumentSessions(writer, close);
  const session = controller.attach({
    witness: { sessionId: 'a', editorRevision: 0, source: original },
    logicalPath: 'note.mdx',
    diskRevision: 'disk-0',
  });
  return { controller, session, writer, close };
}

describe('canonical external-source adoption (DATA-01 / EDIT-01)', () => {
  it('publishes canonical source and the observed persistence baseline as one transaction without a save echo', async () => {
    const { controller, session, writer } = setup();
    const seen: string[] = [];
    controller.subscribe('a', (state) => {
      expect(state.witness.source).toBe(state.autosave.latest.source);
      seen.push(state.witness.source);
    });
    const before = session.witness;
    const observation = controller.reserveObservation('a');
    await observation.settled();
    const receipt = observation.adopt(before, 'disk-0', external);
    expect(session.witness).toEqual({
      sessionId: 'a',
      editorRevision: 1,
      source: external.source,
    });
    expect(receipt).toEqual(session.witness);
    expect(session.isCurrent(before)).toBe(false);
    expect(controller.state('a')).toMatchObject({
      autosave: {
        status: 'saved',
        diskRevision: 'observed-1',
        persisted: { source: external.source },
      },
      externalCheckpoint: before,
    });
    observation.release();
    await controller.flush();
    expect(writer).not.toHaveBeenCalled();
    await tick();
    expect(seen.at(-1)).toBe(external.source);
    session.publish({ expected: receipt, source: external.source + 'Typed' });
    await controller.flush();
    expect(writer).toHaveBeenCalledExactlyOnceWith({
      documentId: 'a',
      expectedDiskRevision: 'observed-1',
      source: external.source + 'Typed',
    });
  });

  it('keeps accepted local input and refuses adoption or normal close while an observation owns persistence', async () => {
    const { controller, session, writer, close } = setup();
    const observation = controller.reserveObservation('a');
    await observation.settled();
    const before = session.witness;
    session.publish({ expected: before, source: 'pending local' });
    expect(() => observation.adopt(before, 'disk-0', external)).toThrow();
    expect(() =>
      observation.adopt(session.witness, 'disk-0', external),
    ).toThrow();
    expect(session.witness.source).toBe('pending local');
    expect(writer).not.toHaveBeenCalled();
    expect(() => controller.beginAggregateClose()).toThrow();
    await expect(controller.close('a')).rejects.toThrow();
    expect(close).not.toHaveBeenCalled();
    observation.release();
    await controller.flush();
    expect(writer).toHaveBeenCalledTimes(1);
  });

  it('defers adoption for an unapplied composition or retained draft even when canonical source has not changed', async () => {
    for (const retained of [false, true]) {
      const { controller, session, writer } = setup();
      const observation = controller.reserveObservation('a');
      await observation.settled();
      if (retained)
        session.retainFailure({
          expected: session.witness,
          source: 'unapplied draft',
        });
      else controller.setUnapplied('a', true);
      expect(() =>
        observation.adopt(session.witness, 'disk-0', external),
      ).toThrow();
      expect(session.witness.source).toBe(original);
      expect(controller.state('a').externalCheckpoint).toBeUndefined();
      observation.release();
      expect(writer).not.toHaveBeenCalled();
    }
  });

  it('binds adoption to exact source, session, disk revision and reservation lifetime', async () => {
    const { controller, session } = setup();
    const before = session.witness;
    const retired = controller.reserveObservation('a');
    await retired.settled();
    expect(() =>
      retired.adopt({ ...before, sessionId: 'other' }, 'disk-0', external),
    ).toThrow();
    expect(() =>
      retired.adopt({ ...before, source: 'stale' }, 'disk-0', external),
    ).toThrow();
    expect(() => retired.adopt(before, 'stale', external)).toThrow();
    retired.release();
    const current = controller.reserveObservation('a');
    await current.settled();
    retired.release();
    expect(() => retired.adopt(before, 'disk-0', external)).toThrow();
    await expect(retired.settled()).rejects.toThrow();
    current.adopt(before, 'disk-0', external);
    current.release();
    await controller.close('a');
    expect(() => current.adopt(before, 'disk-0', external)).toThrow();
    expect(() =>
      controller.attach({
        witness: before,
        logicalPath: 'note.mdx',
        diskRevision: 'disk-0',
      }),
    ).toThrow();
  });

  it('checks aggregate source budgets before changing either canonical or persisted state', async () => {
    const writer = vi.fn<DocumentWriter>();
    const controller = new DocumentSessions(writer, async () => {}, {
      maxDocumentBytes: 4,
      maxLoadedBytes: 6,
      maxSessions: 2,
    });
    const session = controller.attach({
      witness: { sessionId: 'a', editorRevision: 0, source: 'aa' },
      logicalPath: 'a.md',
      diskRevision: 'disk-0',
    });
    controller.attach({
      witness: { sessionId: 'b', editorRevision: 0, source: 'bbbb' },
      logicalPath: 'b.md',
      diskRevision: 'disk-b',
    });
    const observation = controller.reserveObservation('a');
    await observation.settled();
    for (const source of ['12345', '123'])
      expect(() =>
        observation.adopt(session.witness, 'disk-0', {
          source,
          diskRevision: 'disk-new',
        }),
      ).toThrow();
    expect(controller.state('a')).toMatchObject({
      witness: { source: 'aa', editorRevision: 0 },
      autosave: {
        latest: { source: 'aa' },
        persisted: { source: 'aa' },
        diskRevision: 'disk-0',
      },
    });
    observation.adopt(session.witness, 'disk-0', {
      source: 'a',
      diskRevision: 'disk-new',
    });
    observation.release();
    await controller.flush();
    expect(writer).not.toHaveBeenCalled();
  });

  it('waits for an existing write and rejects its old precondition before accepting a subsequent external revision', async () => {
    let acknowledge!: (receipt: WriteReceipt) => void;
    const pending = new Promise<WriteReceipt>((resolve) => {
      acknowledge = resolve;
    });
    const { controller, session, writer } = setup();
    writer.mockImplementationOnce(() => pending);
    session.publish({ expected: session.witness, source: 'published local' });
    await tick();
    const observation = controller.reserveObservation('a');
    expect(() =>
      observation.adopt(session.witness, 'disk-0', external),
    ).toThrow();
    acknowledge({ diskRevision: 'disk-local', durable: true });
    await observation.settled();
    expect(() =>
      observation.adopt(session.witness, 'disk-0', external),
    ).toThrow();
    observation.adopt(session.witness, 'disk-local', external);
    observation.release();
    await controller.flush();
    expect(writer).toHaveBeenCalledTimes(1);
    expect(session.witness).toEqual({
      sessionId: 'a',
      editorRevision: 2,
      source: external.source,
    });
    const checkpoint = controller.state('a').externalCheckpoint!;
    expect(checkpoint).toEqual({
      sessionId: 'a',
      editorRevision: 1,
      source: 'published local',
    });
    Object.assign(checkpoint, { source: 'tampered returned copy' });
    expect(controller.state('a').externalCheckpoint?.source).toBe(
      'published local',
    );
  });
});

describe('retained external versions own the persistence pause', () => {
  it('requires settled ownership and never adopts a version different from the retained disk input', async () => {
    const { controller, session, writer } = setup();
    const lease = controller.reserveObservation('a');
    expect(() =>
      lease.retainExternal(session.witness, 'disk-0', external),
    ).toThrow();
    expect(() =>
      lease.retainReadFailure(session.witness, 'disk-0', 'missing'),
    ).toThrow();
    await lease.settled();
    lease.retainExternal(session.witness, 'disk-0', external);
    expect(() =>
      lease.adopt(session.witness, 'disk-0', {
        ...external,
        source: 'stale disk',
      }),
    ).toThrow();
    lease.release();
    const next = controller.reserveObservation('a');
    await next.settled();
    next.adopt(session.witness, 'disk-0', external);
    next.release();
    await controller.flush();
    expect(controller.state('a').externalObservation).toBeUndefined();
    expect(session.witness.source).toBe(external.source);
    expect(writer).not.toHaveBeenCalled();
  });

  it('retains base and foreign source across worker release, local typing and reacquisition', async () => {
    const { controller, session, writer, close } = setup();
    const observation = controller.reserveObservation('a');
    await observation.settled();
    session.publish({ expected: session.witness, source: 'local one' });
    observation.retainExternal(session.witness, 'disk-0', external);
    observation.release();
    session.publish({ expected: session.witness, source: 'local two' });
    await tick();
    expect(writer).not.toHaveBeenCalled();
    expect(controller.state('a').externalObservation).toMatchObject({
      base: { sessionId: 'a', editorRevision: 0, source: original },
      diskRevision: 'disk-0',
      observed: external,
    });
    await expect(controller.flush()).rejects.toThrow();
    await expect(controller.retrySave('a')).rejects.toThrow();
    await expect(controller.close('a')).rejects.toThrow();
    expect(() => controller.beginAggregateClose()).toThrow();
    expect(close).not.toHaveBeenCalled();
    const restarted = controller.reserveObservation('a');
    await restarted.settled();
    observation.release();
    restarted.retainReadFailure(session.witness, 'disk-0', 'missing');
    expect(controller.state('a').externalObservation).toMatchObject({
      observed: external,
      issue: 'missing',
    });
    expect(() => restarted.confirmUnchanged('disk-0')).toThrow();
    restarted.release();
    await tick();
    expect(writer).not.toHaveBeenCalled();
    expect(session.witness.source).toBe('local two');
  });

  it('clears an unavailable read only after checked unchanged confirmation, without a write echo', async () => {
    const { controller, session, writer } = setup();
    const first = controller.reserveObservation('a');
    await first.settled();
    first.retainReadFailure(session.witness, 'disk-0', 'permission');
    first.release();
    const second = controller.reserveObservation('a');
    await second.settled();
    expect(() => first.confirmUnchanged('disk-0')).toThrow();
    expect(() => second.confirmUnchanged('stale')).toThrow();
    second.confirmUnchanged('disk-0');
    second.release();
    expect(controller.state('a').externalObservation).toBeUndefined();
    await controller.flush();
    expect(writer).not.toHaveBeenCalled();
    await controller.close('a');
  });

  it('rejects stale captures and exposes copies while keeping the original common base', async () => {
    const { controller, session } = setup();
    const observation = controller.reserveObservation('a');
    await observation.settled();
    const old = session.witness;
    session.publish({ expected: old, source: 'local' });
    expect(() => observation.retainExternal(old, 'disk-0', external)).toThrow();
    expect(() =>
      observation.retainExternal(session.witness, 'stale', external),
    ).toThrow();
    observation.retainExternal(session.witness, 'disk-0', external);
    const snapshot = controller.state('a').externalObservation!;
    Object.assign(snapshot.base, { source: 'tampered' });
    Object.assign(snapshot.observed!, { source: 'tampered' });
    observation.retainExternal(session.witness, 'disk-0', {
      source: 'second foreign',
      diskRevision: 'observed-2',
    });
    expect(controller.state('a').externalObservation).toMatchObject({
      base: { source: original },
      observed: { source: 'second foreign', diskRevision: 'observed-2' },
    });
    observation.release();
  });

  it('releases retained read failure after clean adoption and saves subsequent input against the observed revision', async () => {
    const { controller, session, writer } = setup();
    const first = controller.reserveObservation('a');
    await first.settled();
    first.retainReadFailure(session.witness, 'disk-0', 'unreadable');
    first.release();
    const second = controller.reserveObservation('a');
    await second.settled();
    second.adopt(session.witness, 'disk-0', external);
    second.release();
    expect(controller.state('a').externalObservation).toBeUndefined();
    session.publish({
      expected: session.witness,
      source: external.source + 'local',
    });
    await controller.flush();
    expect(writer).toHaveBeenCalledExactlyOnceWith({
      documentId: 'a',
      expectedDiskRevision: 'observed-1',
      source: external.source + 'local',
    });
  });
});
