import { describe, expect, it, vi } from 'vitest';
import { createNativeSessions } from '../../src/documents/nativeSessions';
import type { NativeDocument } from '../../src/documents/workspace';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const baseline = (id = 'grant-a', source = 'original'): NativeDocument => ({
  id,
  source,
  revision: `disk-${id}`,
  logicalPath: 'notes/a.mdx',
  name: 'a.mdx',
  displayPath: '/display-only/a.mdx',
  durabilityWarning: false,
});
const setup = () => {
  const save = vi.fn<
    (
      id: string,
      revision: string,
      source: string,
    ) => Promise<{ revision: string; durable: boolean }>
  >(async () => ({
    revision: 'next-disk',
    durable: true,
  }));
  const close = vi.fn<(id: string) => Promise<void>>(async () => {});
  return { save, close, ...createNativeSessions({ save, close }) };
};
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe('private native session binding', () => {
  it('writes exact accepted source with copied native grant and disk CAS while observations expose only host identities', async () => {
    const h = setup();
    const session = h.attach('host-a', baseline());
    const source = '\uFEFF# É\r\n{/* opaque 😀 */}\n<Broken\r\n$unfinished';
    session.publish({ expected: session.witness, source });
    await h.controller.flush();
    expect(h.save).toHaveBeenCalledExactlyOnceWith(
      'grant-a',
      'disk-grant-a',
      source,
    );
    expect(h.controller.state('host-a')).toMatchObject({
      witness: { sessionId: 'host-a', editorRevision: 1, source },
      autosave: {
        documentId: 'host-a',
        diskRevision: 'next-disk',
        durable: true,
        status: 'saved',
      },
    });
    expect(JSON.stringify(h.controller.state('host-a'))).not.toContain(
      'grant-a',
    );
  });
  it('captures fields and ports once so later caller mutation cannot retarget a write or close', async () => {
    const document = baseline();
    const save = vi.fn(async () => ({ revision: 'saved', durable: true }));
    const close = vi.fn(async () => {});
    const ports = { save, close };
    const h = createNativeSessions(ports);
    const session = h.attach('host-a', document);
    Object.assign(document, {
      id: 'evil',
      revision: 'evil-disk',
      source: 'evil',
      logicalPath: 'evil.mdx',
      durabilityWarning: true,
    });
    ports.save = vi.fn(async () => {
      throw Error('mutated port');
    });
    ports.close = vi.fn(async () => {
      throw Error('mutated port');
    });
    expect(session.witness.source).toBe('original');
    session.publish({ expected: session.witness, source: 'accepted' });
    await h.controller.close('host-a');
    expect(save).toHaveBeenCalledExactlyOnceWith(
      'grant-a',
      'disk-grant-a',
      'accepted',
    );
    expect(close).toHaveBeenCalledExactlyOnceWith('grant-a');
  });
  it('keeps independent documents and late acknowledgements bound to their original grants', async () => {
    const pending = deferred<{ revision: string; durable: boolean }>();
    const h = setup();
    h.save.mockImplementation((id) =>
      id === 'grant-a'
        ? pending.promise
        : Promise.resolve({ revision: 'disk-b1', durable: true }),
    );
    const a = h.attach('host-a', baseline());
    const b = h.attach('host-b', baseline('grant-b', 'B'));
    a.publish({ expected: a.witness, source: 'A1' });
    await tick();
    b.publish({ expected: b.witness, source: 'B1' });
    await h.controller.flush('host-b');
    expect(h.controller.state('host-b').autosave.persisted.source).toBe('B1');
    expect(h.controller.state('host-a').autosave.status).toBe('writing');
    pending.resolve({ revision: 'disk-a1', durable: true });
    await h.controller.flush();
    expect(h.save.mock.calls).toEqual([
      ['grant-a', 'disk-grant-a', 'A1'],
      ['grant-b', 'disk-grant-b', 'B1'],
    ]);
    expect(h.controller.state('host-a').autosave.diskRevision).toBe('disk-a1');
  });
  it('maps non-durable native acknowledgements without pretending a published file was rolled back', async () => {
    const h = setup();
    h.save.mockResolvedValue({
      revision: 'published-revision',
      durable: false,
    });
    const session = h.attach('host-a', baseline());
    session.publish({ expected: session.witness, source: 'published' });
    await expect(h.controller.flush()).rejects.toThrow();
    expect(h.controller.state('host-a').autosave).toMatchObject({
      diskRevision: 'published-revision',
      durable: false,
      status: 'blocked',
      persisted: { source: 'published' },
    });
    expect(h.close).not.toHaveBeenCalled();
  });
  it('retains an authorized baseline durability warning instead of declaring it safely closed', async () => {
    const h = setup();
    h.attach('host-a', { ...baseline(), durabilityWarning: true });
    expect(h.controller.state('host-a').autosave).toMatchObject({
      durable: false,
      status: 'blocked',
      diskRevision: 'disk-grant-a',
    });
    await expect(h.controller.close('host-a')).rejects.toThrow();
    expect(h.controller.state('host-a').phase).toBe('open');
    expect(h.save).not.toHaveBeenCalled();
    expect(h.close).not.toHaveBeenCalled();
  });
  it('removes the binding only after close acknowledgement and permanently refuses used session/grant identities', async () => {
    const pending = deferred<void>();
    const h = setup();
    h.close.mockReturnValue(pending.promise);
    h.attach('host-a', baseline());
    const closing = h.controller.close('host-a');
    await tick();
    expect(() => h.attach('host-b', baseline())).toThrow();
    expect(() => h.attach('host-a', baseline('grant-b'))).toThrow();
    pending.resolve();
    await closing;
    expect(() => h.controller.state('host-a')).toThrow();
    expect(() => h.attach('host-b', baseline())).toThrow();
    expect(() => h.attach('host-a', baseline('grant-b'))).toThrow();
    h.attach('host-b', baseline('grant-b'));
    expect(h.close).toHaveBeenCalledExactlyOnceWith('grant-a');
  });
  it('retains a close-uncertain controller after backend rejection without silently retrying or releasing identity', async () => {
    const h = setup();
    h.close.mockRejectedValue(Error('close reply lost'));
    const session = h.attach('host-a', baseline());
    await expect(h.controller.close('host-a')).rejects.toThrow(
      'close reply lost',
    );
    expect(h.controller.state('host-a').phase).toBe('close-uncertain');
    expect(
      session.validate({ expected: session.witness, source: 'late' }),
    ).toBe(false);
    await expect(h.controller.close('host-a')).rejects.toThrow();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(() => h.attach('other', baseline())).toThrow();
  });
  it('rejects duplicate attachments without closing or replacing existing grants and leaves failed identities available', async () => {
    const h = setup();
    const original = h.attach('host-a', baseline());
    expect(() => h.attach('host-a', baseline('grant-b'))).toThrow();
    expect(() => h.attach('host-b', baseline())).toThrow();
    expect(() =>
      h.attach('failed', {
        ...baseline('new-grant'),
        source: 'x'.repeat(500_001),
      }),
    ).toThrow();
    const valid = h.attach('failed', baseline('new-grant'));
    original.publish({
      expected: original.witness,
      source: 'original still usable',
    });
    valid.publish({ expected: valid.witness, source: 'retry attachment' });
    await h.controller.flush();
    expect(h.save.mock.calls.map(([id]) => id)).toEqual([
      'grant-a',
      'new-grant',
    ]);
    expect(h.close).not.toHaveBeenCalled();
  });
  it('rejects grant/session identity aliasing and malformed native baselines before acquiring ownership', () => {
    const h = setup();
    expect(() => h.attach('grant-a', baseline())).toThrow();
    h.attach('host-a', baseline());
    expect(() => h.attach('grant-a', baseline('grant-b'))).toThrow();
    expect(() => h.attach('other', baseline('host-a'))).toThrow();
    for (const document of [
      { ...baseline('new'), id: '' },
      { ...baseline('new'), revision: '' },
      { ...baseline('new'), durabilityWarning: undefined },
    ])
      expect(() => h.attach('new-host', document as NativeDocument)).toThrow();
    expect(h.close).not.toHaveBeenCalled();
  });
});
