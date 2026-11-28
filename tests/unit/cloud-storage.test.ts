import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudStorage } from '../../src/web/cloudStorage';
import { WorkspaceConflictError } from '../../src/web/persistence';
import {
  createWebState,
  importSources,
  updateDocumentSource,
} from '../../src/web/workspace';
import { pngAsset } from './web-assets-fixtures';

interface SnapshotDescriptor {
  checksum: string;
  byteSize: number;
  chunks: string[];
}
interface Manifest extends SnapshotDescriptor {
  id: string;
}
const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((ready) => {
    resolve = ready;
  });
  return { promise, resolve };
}

function fakeServer() {
  let head: { version: number; manifest: Manifest | null } = {
    version: 0,
    manifest: null,
  };
  const chunks = new Map<string, Uint8Array<ArrayBuffer>>();
  const stages = new Map<string, Manifest>();
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const method = init?.method ?? 'GET';
    const path = String(input).replace(/^\/api\/storage\//, '');
    expect(init).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
    if (method !== 'GET')
      expect(new Headers(init?.headers).get('X-Programmable-Notes')).toBe(
        'storage-v1',
      );
    if (path === 'head' && method === 'GET') return Response.json(head);
    if (path === 'stage' && method === 'POST') {
      const descriptor = JSON.parse(String(init?.body)) as SnapshotDescriptor;
      const id = `stage-${stages.size + 1}`;
      stages.set(id, { ...descriptor, id });
      return Response.json({
        id,
        missing: [...new Set(descriptor.chunks)].filter(
          (hash) => !chunks.has(hash),
        ),
      });
    }
    if (path.startsWith('chunks/')) {
      const hash = path.slice('chunks/'.length);
      if (method === 'PUT') {
        const bytes = init?.body as Uint8Array<ArrayBuffer>;
        expect(digest(bytes)).toBe(hash);
        chunks.set(hash, bytes.slice());
        return new Response(null, { status: 204 });
      }
      const bytes = chunks.get(hash);
      return bytes ? new Response(bytes) : new Response(null, { status: 404 });
    }
    if (path === 'commit' && method === 'POST') {
      const { expectedVersion, manifestId } = JSON.parse(
        String(init?.body),
      ) as { expectedVersion: number; manifestId: string };
      if (
        head.version === expectedVersion + 1 &&
        head.manifest?.id === manifestId
      )
        return Response.json(head);
      if (expectedVersion !== head.version)
        return new Response(null, { status: 409 });
      const manifest = stages.get(manifestId)!;
      if (!manifest.chunks.every((hash) => chunks.has(hash)))
        return new Response(null, { status: 422 });
      head = { version: head.version + 1, manifest };
      return Response.json(head);
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  });
  return {
    transport,
    client: createCloudStorage(transport),
    chunks,
    head: () => head,
    replaceManifest(value: unknown) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      const hash = digest(bytes);
      chunks.set(hash, bytes);
      head = {
        version: head.version,
        manifest: {
          id: 'damaged',
          checksum: hash,
          byteSize: bytes.length,
          chunks: [hash],
        },
      };
    },
  };
}

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cloud workspace storage', () => {
  it('round-trips multiple chunks and waits for the remote commit acknowledgment', async () => {
    const server = fakeServer();
    const initial = createWebState(1);
    expect(await server.client.readWorkspace()).toBeNull();
    const state = importSources(
      initial,
      [0, 1, 2].map((number) => ({
        logicalPath: `note-${number}.mdx`,
        source: '\uFEFF# Exact\r\n' + String(number).repeat(400_000) + '\r\n',
      })),
      2,
    );
    const fetch = server.transport.getMockImplementation()!;
    const started = deferred();
    const ready = deferred();
    server.transport.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/commit')) {
        started.resolve();
        await ready.promise;
      }
      return fetch(input, init);
    });
    let confirmed = false;
    const save = server.client.writeWorkspace(state, 0).then((record) => {
      confirmed = true;
      return record;
    });
    await started.promise;
    expect(confirmed).toBe(false);
    expect(await server.client.readWorkspace()).toBeNull();
    ready.resolve();
    expect(await save).toMatchObject({ revision: 1 });
    expect(server.head().manifest!.chunks).toHaveLength(2);
    expect((await server.client.readWorkspace())!.state).toEqual(state);
  });

  it('rejects an incomplete commit without exposing staged state', async () => {
    const server = fakeServer();
    const initial = createWebState(1);
    await server.client.writeWorkspace(initial, 0);
    const fetch = server.transport.getMockImplementation()!;
    server.transport.mockImplementation(async (input, init) =>
      init?.method === 'PUT'
        ? new Response(null, { status: 204 })
        : fetch(input, init),
    );
    const changed = updateDocumentSource(
      initial,
      initial.workspace.selected,
      'Uncommitted edit',
    );
    await expect(server.client.writeWorkspace(changed, 1)).rejects.toThrow(
      /incomplete/i,
    );
    expect(server.head().version).toBe(1);
    expect((await server.client.readWorkspace())!.state).toEqual(initial);
  });

  it.each(['fetch', 'body'] as const)(
    'aborts a stalled stage %s and allows a retry using the retained draft',
    async (stall) => {
      const server = fakeServer();
      const initial = createWebState(1);
      await server.client.writeWorkspace(initial, 0);
      const source = '\uFEFFDraft to retry\r\n';
      const key = initial.workspace.selected;
      const draft = updateDocumentSource(initial, key, source);
      const timeout = new AbortController();
      const deadline = vi
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(timeout.signal);
      const ready = deferred();
      const fetch = server.transport.getMockImplementation()!;
      let stageSignal: AbortSignal | null | undefined;
      server.transport.mockImplementation(async (input, init) => {
        if (!String(input).endsWith('/stage')) return fetch(input, init);
        const signal = init?.signal;
        stageSignal = signal;
        ready.resolve();
        if (!signal) throw new Error('Stage request has no deadline.');
        if (stall === 'fetch')
          return new Promise<Response>((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          });
        return new Response(
          new ReadableStream({
            start(stream) {
              signal.addEventListener(
                'abort',
                () => stream.error(signal.reason),
                {
                  once: true,
                },
              );
            },
          }),
        );
      });
      const failed = server.client.writeWorkspace(draft, 1);
      const rejected = expect(failed).rejects.toThrow(/too long|interrupted/i);
      await ready.promise;
      timeout.abort(
        new DOMException('Stage deadline exceeded', 'TimeoutError'),
      );
      await rejected;
      expect(deadline).toHaveBeenCalledWith(30_000);
      expect(stageSignal).toBe(timeout.signal);
      expect(server.head().version).toBe(1);
      expect(draft.workspace.files[key]).toBe(source);
      server.transport.mockImplementation(fetch);
      deadline.mockRestore();
      expect(await server.client.writeWorkspace(draft, 1)).toMatchObject({
        revision: 2,
        state: draft,
      });
    },
  );

  it.each(['fetch', 'body'] as const)(
    'replays the same staged commit when its %s acknowledgment is lost',
    async (lost) => {
      const server = fakeServer();
      const state = createWebState(1);
      const fetch = server.transport.getMockImplementation()!;
      const commitRequests: string[] = [];
      server.transport.mockImplementation(async (input, init) => {
        const actual = await fetch(input, init);
        if (!String(input).endsWith('/commit')) return actual;
        commitRequests.push(String(init?.body));
        if (commitRequests.length > 1) return actual;
        if (lost === 'fetch') throw new TypeError('Lost commit response.');
        return new Response(
          new ReadableStream({
            start(stream) {
              stream.error(new TypeError('Commit response ended early.'));
            },
          }),
        );
      });
      expect(await server.client.writeWorkspace(state, 0)).toMatchObject({
        revision: 1,
        state,
      });
      expect(commitRequests).toHaveLength(2);
      expect(commitRequests[1]).toBe(commitRequests[0]);
      expect(server.head().version).toBe(1);
    },
  );

  it('preserves a newer workspace after a lost acknowledgment and commit replay', async () => {
    const server = fakeServer();
    const other = createCloudStorage(server.transport);
    const initial = createWebState(1);
    const changed = updateDocumentSource(
      initial,
      initial.workspace.selected,
      'A newer accepted edit',
    );
    const fetch = server.transport.getMockImplementation()!;
    let loseCommit = true;
    server.transport.mockImplementation(async (input, init) => {
      const actual = await fetch(input, init);
      if (loseCommit && String(input).endsWith('/commit')) {
        loseCommit = false;
        await other.writeWorkspace(changed, 1);
        throw new TypeError('Lost commit response.');
      }
      return actual;
    });
    await expect(
      server.client.writeWorkspace(initial, 0),
    ).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(server.head().version).toBe(2);
    expect((await server.client.readWorkspace())!.state).toEqual(changed);
  });

  it('does not duplicate a retained edit already included in a competing publication', async () => {
    const server = fakeServer();
    const other = createCloudStorage(server.transport);
    const fetch = server.transport.getMockImplementation()!;
    let loseCommit = true;
    server.transport.mockImplementation(async (input, init) => {
      const actual = await fetch(input, init);
      if (loseCommit && String(input).endsWith('/commit')) {
        loseCommit = false;
        await other.writeRetainedAttempt('second.mdx', 0, '', 'Other draft');
        throw new TypeError('Lost commit response.');
      }
      return actual;
    });
    const first = await server.client.writeRetainedAttempt(
      'first.mdx',
      0,
      '',
      'First draft',
    );
    const { attempts } = await server.client.readRetainedAttempts();
    expect(attempts).toHaveLength(2);
    expect(attempts).toContainEqual(first);
    expect(attempts).toContainEqual(
      expect.objectContaining({ text: 'Other draft' }),
    );
    expect(server.head().version).toBe(2);
  });

  it('does not replay a commit explicitly denied by cloud access', async () => {
    const server = fakeServer();
    const fetch = server.transport.getMockImplementation()!;
    let commitRequests = 0;
    server.transport.mockImplementation(async (input, init) => {
      if (!String(input).endsWith('/commit')) return fetch(input, init);
      commitRequests++;
      return new Response(null, { status: 401 });
    });
    await expect(
      server.client.writeWorkspace(createWebState(1), 0),
    ).rejects.toThrow(/sign in/i);
    expect(commitRequests).toBe(1);
    expect(server.head().version).toBe(0);
  });

  it.each(['missing', 'changed'] as const)(
    'refuses a %s chunk and never replaces the inventory',
    async (damage) => {
      const server = fakeServer();
      const initial = createWebState(1);
      await server.client.writeWorkspace(initial, 0);
      const saved = server.head();
      const hash = saved.manifest!.chunks[0]!;
      if (damage === 'missing') server.chunks.delete(hash);
      else {
        const bytes = server.chunks.get(hash)!;
        bytes[0] = bytes[0]! ^ 1;
      }
      await expect(server.client.readWorkspace()).rejects.toThrow(/chunk/i);
      await expect(server.client.writeWorkspace(initial, 1)).rejects.toThrow(
        /chunk/i,
      );
      expect(server.head()).toBe(saved);
    },
  );

  it('re-reads a published head when another writer supersedes it during download', async () => {
    const server = fakeServer();
    const initial = createWebState(1);
    await server.client.writeWorkspace(initial, 0);
    const oldHash = server.head().manifest!.chunks[0]!;
    const other = createCloudStorage(server.transport);
    const changed = updateDocumentSource(
      initial,
      initial.workspace.selected,
      'New head',
    );
    const actualFetch = server.transport.getMockImplementation()!;
    let race = true;
    server.transport.mockImplementation(async (input, init) => {
      if (race && String(input).endsWith('/chunks/' + oldHash)) {
        race = false;
        await other.writeWorkspace(changed, 1);
        server.chunks.delete(oldHash);
      }
      return actualFetch(input, init);
    });
    expect((await server.client.readWorkspace())!.state).toEqual(changed);
  });

  it('verifies whole inventory checksums and workspace record metadata independently', async () => {
    const server = fakeServer();
    await server.client.writeWorkspace(createWebState(1), 0);
    const saved = server.head().manifest!;
    saved.checksum = 'a'.repeat(64);
    await expect(server.client.readWorkspace()).rejects.toThrow(
      /inventory.*integrity/i,
    );
    const state = createWebState(1);
    server.replaceManifest({
      version: 1,
      current: {
        revision: 1,
        updated: 1,
        checksum: 'a'.repeat(64),
        byteSize: 1,
        state,
      },
      recovery: [],
      attempts: [],
    });
    await expect(server.client.readWorkspace()).rejects.toThrow(
      /workspace.*integrity/i,
    );
    await expect(server.client.readWorkspaceRevision()).rejects.toThrow(
      /workspace.*integrity/i,
    );
  });

  it('verifies attachment bytes even when the inventory and record digests match', async () => {
    const server = fakeServer();
    const asset = await pngAsset();
    const initial = {
      ...createWebState(1),
      assets: { [asset.id]: asset },
    };
    const invalidId = 'sha256:' + 'a'.repeat(64);
    const damaged = {
      ...initial,
      assets: { [invalidId]: { ...asset, id: invalidId } },
    };
    await expect(server.client.writeWorkspace(damaged, 0)).rejects.toThrow(
      /attachment integrity/i,
    );
    expect(server.head().version).toBe(0);
    const stored = await server.client.writeWorkspace(initial, 0);
    expect((await server.client.readWorkspace())!.state).toEqual(initial);
    const bytes = new TextEncoder().encode(JSON.stringify(damaged));
    server.replaceManifest({
      version: 1,
      current: {
        ...stored,
        state: damaged,
        byteSize: bytes.byteLength,
        checksum: digest(bytes),
      },
      recovery: [],
      attempts: [],
    });
    await expect(server.client.readWorkspace()).rejects.toThrow(
      /attachment integrity/i,
    );
  });

  it('never creates a workspace on a denied, redirected, or unreachable cloud request', async () => {
    const server = fakeServer();
    server.transport.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(server.client.readWorkspace()).rejects.toThrow(/sign in/i);
    server.transport.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(server.client.readWorkspace()).rejects.toThrow(
      /connection|sign in/i,
    );
    expect(server.head().version).toBe(0);
  });

  it('rejects stale workspace editors while preserving a concurrent retained edit', async () => {
    const server = fakeServer();
    const other = createCloudStorage(server.transport);
    const initial = createWebState(1);
    const key = initial.workspace.selected;
    await server.client.writeWorkspace(initial, 0);
    const fetch = server.transport.getMockImplementation()!;
    const started = deferred();
    const ready = deferred();
    let pauseCommit = true;
    server.transport.mockImplementation(async (input, init) => {
      if (pauseCommit && String(input).endsWith('/commit')) {
        pauseCommit = false;
        started.resolve();
        await ready.promise;
      }
      return fetch(input, init);
    });
    const changed = updateDocumentSource(initial, key, 'My edit');
    const save = server.client.writeWorkspace(changed, 1);
    await started.promise;
    const attempt = await other.writeRetainedAttempt(
      key,
      1,
      initial.workspace.files[key]!,
      'Unapplied draft',
    );
    ready.resolve();
    expect(await save).toMatchObject({ revision: 2, state: changed });
    expect(server.head().version).toBe(3);
    expect(await other.readRetainedAttempts()).toEqual({
      attempts: [attempt],
      error: '',
    });
    await expect(other.writeWorkspace(initial, 1)).rejects.toBeInstanceOf(
      WorkspaceConflictError,
    );
  });

  it('restores previous checkpoints and consumes one exact retained attempt in a single acknowledgment', async () => {
    const server = fakeServer();
    const initial = createWebState(1);
    const key = initial.workspace.selected;
    await server.client.writeWorkspace(initial, 0);
    const attempt = await server.client.writeRetainedAttempt(
      key,
      1,
      initial.workspace.files[key]!,
      '\uFEFFRecovered\r\n',
    );
    const recovered = updateDocumentSource(initial, key, attempt.text);
    const before = server.head().version;
    await expect(
      server.client.writeWorkspace(
        recovered,
        1,
        true,
        [{ state: initial, updated: 1 }],
        {
          ...attempt,
          text: 'different',
        },
      ),
    ).rejects.toThrow(/retained edit.*integrity/i);
    expect(server.head().version).toBe(before);
    const record = await server.client.writeWorkspace(
      recovered,
      1,
      true,
      [{ state: initial, updated: 1 }],
      attempt,
    );
    expect(server.head().version).toBe(before + 1);
    expect(record.revision).toBe(3);
    expect((await server.client.readWorkspace())!.state).toEqual(recovered);
    expect(
      (await server.client.listRecoveryVersions()).map(
        ({ revision }) => revision,
      ),
    ).toEqual([2, 1]);
    expect(await server.client.readRecoverySnapshots()).toEqual([
      { state: initial, updated: expect.any(Number) },
      { state: initial, updated: 1 },
    ]);
    expect(await server.client.readRetainedAttempts()).toEqual({
      attempts: [],
      error: '',
    });
  });
});
