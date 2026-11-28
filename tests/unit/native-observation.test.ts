import { describe, expect, it, vi } from 'vitest';
import { createNativeSessions } from '../../src/documents/nativeSessions';
import { MAX_FILE_BYTES } from '../../src/documents/workspace';

const watchId = 'a'.repeat(32);
const changed = {
  status: 'changed',
  baselineRevision: 'disk-0',
  revision: 'observed-1',
  source: '\uFEFFimport X from "./x"\r\n{/* 🌱 */}\n<Opaque />\r\n',
};
function setup() {
  const ports = {
    save: vi.fn(async () => ({ revision: 'saved', durable: true })),
    close: vi.fn(async () => {}),
    observe: vi.fn<(id: string, revision: string) => Promise<unknown>>(
      async () => changed,
    ),
    watch: vi.fn(async () => watchId),
    pollWatch: vi.fn<(id: string, watch: string) => Promise<unknown>>(
      async () => true,
    ),
    unwatch: vi.fn<(id: string, watch: string) => Promise<unknown>>(
      async () => {},
    ),
  };
  const h = createNativeSessions(ports);
  const source = h.attach('session-a', {
    id: 'private-grant',
    revision: 'disk-0',
    source: 'original',
    name: 'a.mdx',
    logicalPath: 'notes/a.mdx',
    displayPath: '/DISPLAY_IS_NOT_AUTHORITY/a.mdx',
    durabilityWarning: false,
  });
  return { h, ports, source };
}
describe('private native observation transport', () => {
  it('binds read and hint operations to captured grants without changing source or persistence', async () => {
    const { h, ports, source } = setup();
    const read = await h.observation!.read('session-a', 'disk-0');
    expect(read).toEqual(changed);
    const token = await h.observation!.watch('session-a', 'disk-0');
    expect(await h.observation!.poll('session-a', token)).toBe(true);
    await h.observation!.unwatch('session-a', token);
    expect(ports.observe).toHaveBeenCalledExactlyOnceWith(
      'private-grant',
      'disk-0',
    );
    expect(ports.watch).toHaveBeenCalledExactlyOnceWith(
      'private-grant',
      'disk-0',
    );
    expect(ports.pollWatch).toHaveBeenCalledExactlyOnceWith(
      'private-grant',
      watchId,
    );
    expect(ports.unwatch).toHaveBeenCalledExactlyOnceWith(
      'private-grant',
      watchId,
    );
    expect(source.witness.source).toBe('original');
    expect(h.controller.state('session-a').autosave.diskRevision).toBe(
      'disk-0',
    );
    expect(ports.save).not.toHaveBeenCalled();
    expect(ports.close).not.toHaveBeenCalled();
  });

  it('captures the complete port set and rejects partial observation support', async () => {
    const { h, ports } = setup();
    const original = ports.observe;
    ports.observe = vi.fn(async () => {
      throw Error('mutated port');
    });
    expect(await h.observation!.read('session-a', 'disk-0')).toEqual(changed);
    expect(original).toHaveBeenCalledTimes(1);
    expect(ports.observe).not.toHaveBeenCalled();
    expect(
      createNativeSessions({ save: ports.save, close: ports.close })
        .observation,
    ).toBeNull();
    expect(() =>
      createNativeSessions({
        save: ports.save,
        close: ports.close,
        observe: ports.observe,
      }),
    ).toThrow();
  });

  it('validates unchanged revisions and all closed read-failure codes without exposing original error contents', async () => {
    const { h, ports } = setup();
    ports.observe.mockResolvedValueOnce({
      status: 'unchanged',
      revision: 'disk-0',
    });
    expect(await h.observation!.read('session-a', 'disk-0')).toEqual({
      status: 'unchanged',
      revision: 'disk-0',
    });
    for (const reason of [
      'missing',
      'permission',
      'invalid',
      'unstable',
      'retired',
      'unreadable',
    ]) {
      ports.observe.mockResolvedValueOnce({ status: 'unavailable', reason });
      expect(await h.observation!.read('session-a', 'disk-0')).toEqual({
        status: 'unavailable',
        reason,
      });
    }
    for (const value of [
      { status: 'unavailable', reason: 'unexpected' },
      { status: 'unavailable', reason: 'missing', source: 'private' },
      { status: 'unchanged', revision: 'stale' },
    ]) {
      ports.observe.mockResolvedValueOnce(value);
      await expect(
        h.observation!.read('session-a', 'disk-0'),
      ).rejects.toThrow();
    }
  });

  it('rejects malformed, stale, oversized and lossy source replies before adoption', async () => {
    const { h, ports, source } = setup();
    for (const value of [
      null,
      [],
      { ...changed, extra: true },
      { ...changed, baselineRevision: 'stale' },
      { ...changed, revision: 'disk-0' },
      { ...changed, revision: '' },
      { ...changed, source: '\ud800' },
      { ...changed, source: 'a'.repeat(MAX_FILE_BYTES + 1) },
    ]) {
      ports.observe.mockResolvedValueOnce(value);
      await expect(
        h.observation!.read('session-a', 'disk-0'),
      ).rejects.toThrow();
      expect(source.witness.source).toBe('original');
      expect(ports.save).not.toHaveBeenCalled();
    }
    const getter = vi.fn(() => 'unsafe getter');
    const value = { ...changed };
    Object.defineProperty(value, 'source', { get: getter });
    ports.observe.mockResolvedValueOnce(value);
    await expect(h.observation!.read('session-a', 'disk-0')).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });

  it('validates opaque watch tokens and boolean hints without coercion', async () => {
    const { h, ports } = setup();
    for (const value of ['', '../path', 'b'.repeat(33), { watchId }]) {
      ports.watch.mockResolvedValueOnce(value as string);
      await expect(
        h.observation!.watch('session-a', 'disk-0'),
      ).rejects.toThrow();
    }
    ports.pollWatch.mockResolvedValueOnce({ invalidated: true });
    await expect(h.observation!.poll('session-a', watchId)).rejects.toThrow();
    await expect(h.observation!.poll('session-a', '../path')).rejects.toThrow();
    await expect(
      h.observation!.unwatch('session-a', '../path'),
    ).rejects.toThrow();
    expect(ports.unwatch).not.toHaveBeenCalled();
    ports.unwatch.mockResolvedValueOnce({ notAcknowledged: true });
    await expect(
      h.observation!.unwatch('session-a', watchId),
    ).rejects.toThrow();
    expect(ports.unwatch).toHaveBeenCalledExactlyOnceWith(
      'private-grant',
      watchId,
    );
  });

  it('rejects late read, watch and hint results after acknowledged session retirement', async () => {
    for (const kind of ['read', 'watch', 'poll'] as const) {
      const { h, ports } = setup();
      let resolve!: (value: unknown) => void;
      const pending = new Promise<unknown>((done) => {
        resolve = done;
      });
      if (kind === 'read') ports.observe.mockReturnValueOnce(pending);
      else if (kind === 'watch')
        ports.watch.mockReturnValueOnce(pending as Promise<string>);
      else ports.pollWatch.mockReturnValueOnce(pending);
      const operation =
        kind === 'read'
          ? h.observation!.read('session-a', 'disk-0')
          : kind === 'watch'
            ? h.observation!.watch('session-a', 'disk-0')
            : h.observation!.poll('session-a', watchId);
      await h.controller.close('session-a');
      resolve(kind === 'read' ? changed : kind === 'watch' ? watchId : true);
      await expect(operation).rejects.toThrow();
      await expect(
        h.observation!.read('session-a', 'disk-0'),
      ).rejects.toThrow();
      expect(ports.close).toHaveBeenCalledExactlyOnceWith('private-grant');
    }
  });
});
