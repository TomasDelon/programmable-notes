import { describe, expect, it, vi } from 'vitest';
import {
  AutosaveCoordinator,
  type DocumentWriter,
  type WriteReceipt,
} from '../../src/application/autosave';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const base = {
  documentId: 'a',
  editorRevision: 0,
  source: '\uFEFFA\r\nB\n',
  diskRevision: 'disk-0',
};
const disk = {
  ...base,
  editorRevision: 1,
  source: '\uFEFFDisk\r\nB\n',
  diskRevision: 'observed-1',
};
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
function setup() {
  const attempts: ReturnType<typeof deferred<WriteReceipt>>[] = [];
  const writer = vi.fn<DocumentWriter>(() => {
    const attempt = deferred<WriteReceipt>();
    attempts.push(attempt);
    return attempt.promise;
  });
  const autosave = new AutosaveCoordinator(writer);
  autosave.attach(base);
  return { autosave, writer, attempts };
}

describe('observation persistence reservation (DATA-01 / A04–A05)', () => {
  it('stops a scheduled write before dispatch and resumes the latest accepted source after release', async () => {
    const { autosave, writer, attempts } = setup();
    autosave.accept({ ...base, editorRevision: 1, source: 'local' });
    const reservation = autosave.reserve('a');
    await reservation.settled();
    expect(writer).not.toHaveBeenCalled();
    await expect(autosave.flush()).rejects.toThrow();
    reservation.release();
    await tick();
    expect(writer).toHaveBeenCalledExactlyOnceWith({
      documentId: 'a',
      expectedDiskRevision: 'disk-0',
      source: 'local',
    });
    attempts[0]!.resolve({ diskRevision: 'disk-1', durable: true });
    await autosave.flush();
  });

  it('lets an in-flight acknowledgement settle but stops both its loop and finally restart from dispatching newer input', async () => {
    const { autosave, writer, attempts } = setup();
    autosave.accept({ ...base, editorRevision: 1, source: 'first' });
    await tick();
    const reservation = autosave.reserve('a');
    autosave.accept({ ...base, editorRevision: 2, source: 'second' });
    let settled = false;
    const settling = reservation.settled().then(() => {
      settled = true;
    });
    await tick();
    expect(settled).toBe(false);
    attempts[0]!.resolve({ diskRevision: 'disk-1', durable: true });
    await settling;
    await tick();
    expect(writer).toHaveBeenCalledTimes(1);
    expect(autosave.state('a')).toMatchObject({
      latest: { source: 'second' },
      persisted: { source: 'first' },
      diskRevision: 'disk-1',
    });
    reservation.release();
    await tick();
    expect(writer.mock.calls[1]![0]).toEqual({
      documentId: 'a',
      expectedDiskRevision: 'disk-1',
      source: 'second',
    });
    attempts[1]!.resolve({ diskRevision: 'disk-2', durable: true });
    await autosave.flush();
  });

  it('adopts exact observed bytes and their precondition without a write, then uses that revision for the next actual edit', async () => {
    const { autosave, writer, attempts } = setup();
    const reservation = autosave.reserve('a');
    await reservation.settled();
    reservation.adopt(base, disk);
    expect(autosave.state('a')).toMatchObject({
      latest: { editorRevision: 1, source: disk.source },
      persisted: { editorRevision: 1, source: disk.source },
      diskRevision: disk.diskRevision,
      durable: true,
      status: 'saved',
    });
    reservation.release();
    await autosave.flush();
    expect(writer).not.toHaveBeenCalled();
    autosave.accept({
      ...disk,
      editorRevision: 2,
      source: disk.source + 'Typed',
    });
    await tick();
    expect(writer).toHaveBeenCalledExactlyOnceWith({
      documentId: 'a',
      expectedDiskRevision: disk.diskRevision,
      source: disk.source + 'Typed',
    });
    attempts[0]!.resolve({ diskRevision: 'disk-2', durable: true });
    await autosave.flush();
  });

  it('requires current editor, source, disk and document identities, including same-byte history ABA', async () => {
    const { autosave, writer } = setup();
    const reservation = autosave.reserve('a');
    await reservation.settled();
    for (const expected of [
      { ...base, source: 'wrong' },
      { ...base, diskRevision: 'stale' },
      { ...base, documentId: 'b' },
    ])
      expect(() => reservation.adopt(expected, disk)).toThrow();
    for (const next of [
      { ...disk, documentId: 'b' },
      { ...disk, editorRevision: 0 },
      { ...disk, diskRevision: '' },
    ])
      expect(() => reservation.adopt(base, next)).toThrow();
    autosave.accept({ ...base, editorRevision: 1, source: 'temporary' });
    autosave.accept({ ...base, editorRevision: 2 });
    expect(() => reservation.adopt(base, disk)).toThrow();
    reservation.adopt(
      { ...base, editorRevision: 2 },
      { ...disk, editorRevision: 3 },
    );
    reservation.release();
    await autosave.flush();
    expect(writer).not.toHaveBeenCalled();
  });

  it('retains concurrent local input instead of treating a held read as permission to replace it', async () => {
    const { autosave, writer, attempts } = setup();
    const reservation = autosave.reserve('a');
    await reservation.settled();
    autosave.accept({ ...base, editorRevision: 1, source: 'new local' });
    expect(() => reservation.adopt(base, disk)).toThrow();
    expect(() =>
      reservation.adopt(
        { ...base, editorRevision: 1, source: 'new local' },
        { ...disk, editorRevision: 2 },
      ),
    ).toThrow();
    expect(autosave.state('a').latest.source).toBe('new local');
    expect(writer).not.toHaveBeenCalled();
    reservation.release();
    await tick();
    attempts[0]!.resolve({ diskRevision: 'disk-local', durable: true });
    await autosave.flush();
  });

  it('does not erase uncertain or non-durable writing state on observation', async () => {
    for (const failed of [true, false]) {
      const { autosave, attempts } = setup();
      autosave.accept({ ...base, editorRevision: 1, source: 'pending' });
      await tick();
      const reservation = autosave.reserve('a');
      if (failed) attempts[0]!.reject(Error('Lost acknowledgement'));
      else attempts[0]!.resolve({ diskRevision: 'published', durable: false });
      await reservation.settled();
      const current = {
        ...base,
        editorRevision: 1,
        source: 'pending',
        diskRevision: autosave.state('a').diskRevision,
      };
      expect(() =>
        reservation.adopt(current, { ...disk, editorRevision: 2 }),
      ).toThrow();
      expect(() => autosave.retry('a')).toThrow();
      expect(() => autosave.release('a')).toThrow();
      reservation.release();
      expect(autosave.state('a')).toMatchObject({
        durable: false,
        status: 'blocked',
        latest: { source: 'pending' },
      });
    }
  });

  it('blocks close while held and makes stale release unable to revoke a later reservation', async () => {
    const { autosave, writer } = setup();
    const old = autosave.reserve('a');
    await old.settled();
    expect(() => autosave.reserve('a')).toThrow();
    expect(() => autosave.release('a')).toThrow();
    await expect(autosave.flush('a')).rejects.toThrow();
    old.release();
    const current = autosave.reserve('a');
    old.release();
    expect(() => old.adopt(base, disk)).toThrow();
    await expect(old.settled()).rejects.toThrow();
    expect(() => autosave.release('a')).toThrow();
    current.release();
    autosave.release('a');
    expect(writer).not.toHaveBeenCalled();
  });
});
