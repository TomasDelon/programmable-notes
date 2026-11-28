// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cloudD1 } from '../helpers/cloudD1';
import { createStorageHandler } from '../../backend/server';
import type { StorageEnvironment } from '../../backend/types';

const crypto = webcrypto as unknown as Crypto;
const issuer = 'https://owner.cloudflareaccess.com';
const origin = 'https://notes.example';
let database: ReturnType<typeof cloudD1>;
let env: StorageEnvironment;
let handle: ReturnType<typeof createStorageHandler>;
let token: string;
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
let clock: number;
function b64(value: string | Uint8Array) {
  return Buffer.from(value).toString('base64url');
}
async function jwt(claims: Record<string, unknown> = {}, key = privateKey) {
  const content =
    b64(JSON.stringify({ alg: 'RS256', kid: 'owner-key', typ: 'JWT' })) +
    '.' +
    b64(
      JSON.stringify({
        iss: issuer,
        aud: ['notes-audience'],
        sub: 'owner-subject',
        exp: 2000,
        nbf: 900,
        ...claims,
      }),
    );
  return (
    content +
    '.' +
    b64(
      new Uint8Array(
        await crypto.subtle.sign(
          'RSASSA-PKCS1-v1_5',
          key,
          new TextEncoder().encode(content),
        ),
      ),
    )
  );
}
beforeEach(async () => {
  database = cloudD1();
  clock = 1_000_000;
  env = {
    NOTES_DB: database.db,
    APP_ORIGIN: origin,
    ACCESS_ISSUER: issuer,
    ACCESS_AUD: 'notes-audience',
    OWNER_SUBJECT: 'owner-subject',
  };
  const key = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  privateKey = key.privateKey;
  const jwk = await crypto.subtle.exportKey('jwk', key.publicKey);
  publicJwk = {
    ...jwk,
    kid: 'owner-key',
    alg: 'RS256',
    use: 'sig',
  } as JsonWebKey;
  handle = createStorageHandler({
    crypto,
    now: () => clock,
    fetch: async (input, options) => {
      expect(options?.redirect).toBe('manual');
      expect(String(input)).toBe(issuer + '/cdn-cgi/access/certs');
      return Response.json({
        keys: [{ ...jwk, kid: 'owner-key', alg: 'RS256', use: 'sig' }],
      });
    },
  });
  token = await jwt();
});
afterEach(() => database.close());
it('requires the editor marker for private data reads', async () => {
  const response = await request('head', 'GET', undefined, {
    'X-Programmable-Notes': '',
  });
  expect(response.status).toBe(403);
  expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
});
it('reauthenticates a separate-tab navigation without returning data or changing storage', async () => {
  const response = await request('session', 'GET', undefined, {
    'X-Programmable-Notes': '',
    'Sec-Fetch-Site': 'cross-site',
  });
  expect(response.status).toBe(303);
  expect(response.headers.get('Location')).toBe('/');
  expect(await response.text()).toBe('');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await (await request('head')).json()).toEqual({
    version: 0,
    manifest: null,
  });
  expect(
    (await request('session', 'GET', undefined, { Origin: 'null' })).status,
  ).toBe(403);
  token = 'forged';
  expect(
    (await request('session', 'GET', undefined, { 'X-Programmable-Notes': '' }))
      .status,
  ).toBe(401);
});
function request(
  path: string,
  method = 'GET',
  body?: BodyInit | Uint8Array,
  extra: Record<string, string> = {},
) {
  return handle(
    new Request(origin + '/api/storage/' + path, {
      method,
      body: body instanceof Uint8Array ? new Uint8Array(body) : body,
      headers: {
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        'Cf-Access-Jwt-Assertion': token,
        Origin: origin,
        'X-Programmable-Notes': 'storage-v1',
        ...extra,
      },
    }),
    env,
  );
}
async function hash(bytes: Uint8Array) {
  return Buffer.from(
    await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
  ).toString('hex');
}
async function stage(bytes: Uint8Array) {
  const checksum = await hash(bytes);
  const response = await request(
    'stage',
    'POST',
    JSON.stringify({ checksum, byteSize: bytes.length, chunks: [checksum] }),
  );
  expect(response.status).toBe(201);
  return { id: (await response.json()).id as string, checksum };
}
it('publishes opaque exact bytes only after all chunks exist, then reads the versioned head', async () => {
  expect(await (await request('head')).json()).toEqual({
    version: 0,
    manifest: null,
  });
  const bytes = new TextEncoder().encode(
    '\uFEFF{"source":"Café\\r\\n<Thing />"}',
  );
  const manifest = await stage(bytes);
  const commit = () =>
    request(
      'commit',
      'POST',
      JSON.stringify({ expectedVersion: 0, manifestId: manifest.id }),
    );
  expect((await commit()).status).toBe(422);
  expect(
    (await request('chunks/' + manifest.checksum, 'PUT', bytes)).status,
  ).toBe(204);
  const published = await commit();
  expect(published.status).toBe(200);
  expect(await published.json()).toEqual({
    version: 1,
    manifest: {
      id: manifest.id,
      checksum: manifest.checksum,
      byteSize: bytes.length,
      chunks: [manifest.checksum],
    },
  });
  expect(
    new Uint8Array(
      await (await request('chunks/' + manifest.checksum)).arrayBuffer(),
    ),
  ).toEqual(bytes);
  expect((await commit()).status).toBe(200);
});
it.each([
  { aud: ['other'] },
  { exp: 1000 },
  { nbf: 1001 },
  { sub: 'other' },
  { iss: 'https://other.cloudflareaccess.com' },
])('denies invalid claims %j', async (claims) => {
  token = await jwt(claims);
  expect((await request('head')).status).toBe(401);
});
it('denies unsigned, forged, opaque-preview and cross-origin mutations without CORS', async () => {
  const forged = token.split('.');
  forged[2] = b64(new Uint8Array(256));
  token = forged.join('.');
  expect((await request('head')).status).toBe(401);
  token = await jwt();
  for (const Origin of ['null', 'https://evil.example']) {
    const reply = await request('stage', 'POST', '{}', { Origin });
    expect(reply.status).toBe(403);
    expect(reply.headers.has('Access-Control-Allow-Origin')).toBe(false);
  }
  expect(
    (
      await handle(
        new Request('https://alternate.example/api/storage/head', {
          headers: {
            'Cf-Access-Jwt-Assertion': token,
            'X-Programmable-Notes': 'storage-v1',
          },
        }),
        env,
      )
    ).status,
  ).toBe(403);
});

it('accepts a valid Access token without optional nbf', async () => {
  token = await jwt({ nbf: undefined });
  expect((await request('head')).status).toBe(200);
});

async function upload(bytes: Uint8Array) {
  const manifest = await stage(bytes);
  expect(
    (await request('chunks/' + manifest.checksum, 'PUT', bytes)).status,
  ).toBe(204);
  return manifest;
}
const publish = (id: string, expectedVersion: number) =>
  request(
    'commit',
    'POST',
    JSON.stringify({ expectedVersion, manifestId: id }),
  );
it('serializes competing commits with real SQL CAS and preserves the losing stage for a deliberate retry', async () => {
  const a = await upload(new Uint8Array([1])),
    b = await upload(new Uint8Array([2]));
  const replies = await Promise.all([publish(a.id, 0), publish(b.id, 0)]);
  expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
  const winner = replies[0]!.status === 200 ? a : b;
  const loser = winner === a ? b : a;
  expect((await (await request('head')).json()).version).toBe(1);
  expect((await request('chunks/' + loser.checksum)).status).toBe(200);
  expect((await publish(loser.id, 1)).status).toBe(200);
  expect((await request('chunks/' + winner.checksum)).status).toBe(404);
  expect((await (await request('head')).json()).version).toBe(2);
});
it('a commit response is the head captured in its own atomic batch', async () => {
  const a = await upload(new Uint8Array([3])),
    b = await upload(new Uint8Array([4]));
  const original = database.db.batch;
  let interrupt = true;
  database.db.batch = async (statements) => {
    const result = await original(statements);
    if (interrupt && statements.length === 5) {
      interrupt = false;
      expect((await publish(b.id, 1)).status).toBe(200);
    }
    return result;
  };
  const reply = await publish(a.id, 0);
  expect(reply.status).toBe(200);
  expect((await reply.json()).version).toBe(1);
  expect((await (await request('head')).json()).version).toBe(2);
});
it('preserves chunks referenced by concurrent staging when replacing a published head', async () => {
  const a = await upload(new Uint8Array([5]));
  await publish(a.id, 0);
  const retained = await stage(new Uint8Array([5]));
  const b = await upload(new Uint8Array([6]));
  await publish(b.id, 1);
  expect((await request('chunks/' + a.checksum)).status).toBe(200);
  expect((await publish(retained.id, 2)).status).toBe(200);
  expect((await request('chunks/' + b.checksum)).status).toBe(404);
});
it('an interrupted partial upload never changes the published head and expires safely', async () => {
  const initial = await upload(new Uint8Array([7]));
  await publish(initial.id, 0);
  const first = new Uint8Array(1024 * 1024).fill(8),
    last = new Uint8Array([9]);
  const hashes = [await hash(first), await hash(last)];
  const reply = await request(
    'stage',
    'POST',
    JSON.stringify({
      checksum: 'f'.repeat(64),
      byteSize: first.length + 1,
      chunks: hashes,
    }),
  );
  const id = (await reply.json()).id;
  await request('chunks/' + hashes[0], 'PUT', first);
  expect((await publish(id, 1)).status).toBe(422);
  expect((await (await request('head')).json()).manifest.id).toBe(initial.id);
  clock += 601000;
  await stage(new Uint8Array([10]));
  expect((await request('chunks/' + hashes[0])).status).toBe(404);
  expect((await request('chunks/' + initial.checksum)).status).toBe(200);
});
it('limits concurrent staging atomically to four and offers existing hashes in missing metadata', async () => {
  const bytes = new Uint8Array([11]);
  const checksum = await hash(bytes);
  const replies = await Promise.all(
    Array.from({ length: 7 }, () =>
      request(
        'stage',
        'POST',
        JSON.stringify({ checksum, byteSize: 1, chunks: [checksum] }),
      ),
    ),
  );
  expect(replies.filter((r) => r.status === 201)).toHaveLength(4);
  expect(replies.filter((r) => r.status === 429)).toHaveLength(3);
  expect((await request('chunks/' + checksum, 'PUT', bytes)).status).toBe(204);
  const id = (await replies.find((r) => r.status === 201)!.json()).id;
  await publish(id, 0);
  const next = await request(
    'stage',
    'POST',
    JSON.stringify({ checksum, byteSize: 1, chunks: [checksum] }),
  );
  expect(await next.json()).toMatchObject({ missing: [] });
});
it('rejects unstaged, mismatched, wrong-sized and oversized chunk bodies without publication', async () => {
  const bytes = new Uint8Array([12]);
  const checksum = await hash(bytes);
  expect((await request('chunks/' + checksum, 'PUT', bytes)).status).toBe(422);
  const staged = await stage(bytes);
  expect(
    (await request('chunks/' + checksum, 'PUT', new Uint8Array([13]))).status,
  ).toBe(400);
  expect(
    (
      await request(
        'chunks/' + checksum,
        'PUT',
        new Uint8Array(1024 * 1024 + 1),
      )
    ).status,
  ).toBe(413);
  const wrong = await request(
    'stage',
    'POST',
    JSON.stringify({ checksum, byteSize: 2, chunks: [checksum] }),
  );
  expect((await request('chunks/' + checksum, 'PUT', bytes)).status).toBe(204);
  expect((await publish((await wrong.json()).id, 0)).status).toBe(422);
  expect((await publish(staged.id, 0)).status).toBe(200);
});
it('fails closed on missing configuration and returns only sanitized policy-protected errors', async () => {
  for (const key of [
    'APP_ORIGIN',
    'ACCESS_ISSUER',
    'ACCESS_AUD',
    'OWNER_SUBJECT',
    'NOTES_DB',
  ] as const) {
    const incomplete = { ...env };
    delete incomplete[key];
    const reply = await handle(
      new Request(origin + '/api/storage/head'),
      incomplete,
    );
    expect(reply.status).toBe(503);
    expect(reply.headers.get('Cache-Control')).toBe('no-store');
    expect(reply.headers.get('Content-Security-Policy')).toContain(
      "default-src 'none'",
    );
    expect(reply.headers.has('Access-Control-Allow-Origin')).toBe(false);
  }
  const reply = await request('stage', 'POST', '{}', {
    'X-Programmable-Notes': '',
  });
  expect(reply.status).toBe(403);
  expect(
    (await request('head', 'GET', undefined, { Origin: 'null' })).status,
  ).toBe(403);
});
it('enforces the real 256 MiB SQL trigger atomically and reports its quota without deleting staged chunks', async () => {
  const hashes = Array.from({ length: 256 }, (_, i) =>
    i.toString(16).padStart(64, '0'),
  );
  for (let start = 0; start < hashes.length; start += 96) {
    const chunkHashes = hashes.slice(start, start + 96);
    const reply = await request(
      'stage',
      'POST',
      JSON.stringify({
        checksum: 'e'.repeat(64),
        byteSize: chunkHashes.length * 1024 * 1024,
        chunks: chunkHashes,
      }),
    );
    expect(reply.status).toBe(201);
  }
  database.sqlite
    .exec(`WITH RECURSIVE n(i) AS (VALUES(0) UNION ALL SELECT i+1 FROM n WHERE i<255)
    INSERT INTO storage_chunks SELECT printf('%064x',i),zeroblob(1048576),1048576 FROM n`);
  expect(
    database.sqlite
      .prepare('SELECT SUM(byte_size) AS bytes FROM storage_chunks')
      .get()!.bytes,
  ).toBe(268435456);
  const bytes = new Uint8Array([14]);
  const staged = await stage(bytes);
  expect(
    (await request('chunks/' + staged.checksum, 'PUT', bytes)).status,
  ).toBe(507);
  expect(
    database.sqlite
      .prepare('SELECT COUNT(*) AS count FROM storage_chunks')
      .get()!.count,
  ).toBe(256);
  expect((await publish(staged.id, 0)).status).toBe(422);
});

it('never follows an identity-provider redirect and bounds unreadable JWKS responses', async () => {
  for (const response of [
    new Response(null, {
      status: 302,
      headers: { Location: 'https://evil.example/keys' },
    }),
    Response.json({ keys: Array(17).fill({}) }),
    new Response('x'.repeat(65537)),
  ]) {
    let calls = 0;
    const isolated = createStorageHandler({
      crypto,
      now: () => clock,
      fetch: async (input, options) => {
        calls++;
        expect(String(input)).toBe(issuer + '/cdn-cgi/access/certs');
        expect(options?.redirect).toBe('manual');
        return response;
      },
    });
    const reply = await isolated(
      new Request(origin + '/api/storage/head', {
        headers: {
          'Cf-Access-Jwt-Assertion': token,
          'X-Programmable-Notes': 'storage-v1',
        },
      }),
      env,
    );
    expect(reply.status).toBe(401);
    expect(calls).toBe(1);
    expect(await reply.json()).toEqual({
      error: 'Owner authentication required.',
    });
  }
});
it('rejects missing tokens, unsigned algorithm substitutions, and client-selected signing URLs', async () => {
  expect(
    (await request('head', 'GET', undefined, { 'Cf-Access-Jwt-Assertion': '' }))
      .status,
  ).toBe(401);
  for (const header of [
    { alg: 'none', kid: 'owner-key' },
    { alg: 'RS256', kid: 'owner-key', jku: 'https://evil.example/keys' },
  ]) {
    token =
      b64(JSON.stringify(header)) +
      '.' +
      token.split('.')[1] +
      '.' +
      b64(new Uint8Array(256));
    expect((await request('head')).status).toBe(401);
  }
});
it('checks stage expiration after receiving a slow commit body', async () => {
  const manifest = await upload(new Uint8Array([15]));
  const payload = JSON.stringify({
    expectedVersion: 0,
    manifestId: manifest.id,
  });
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        clock += 601000;
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const response = await handle(
    new Request(origin + '/api/storage/commit', {
      method: 'POST',
      body: stream,
      duplex: 'half',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'X-Programmable-Notes': 'storage-v1',
        'Cf-Access-Jwt-Assertion': token,
      },
    } as RequestInit),
    env,
  );
  expect(response.status).toBe(422);
  expect(await (await request('head')).json()).toEqual({
    version: 0,
    manifest: null,
  });
});

it('rejects a token that expires while the pinned JWKS response is pending', async () => {
  const isolated = createStorageHandler({
    crypto,
    now: () => clock,
    fetch: async () => {
      clock = 2_000_000;
      return Response.json({ keys: [publicJwk] });
    },
  });
  const reply = await isolated(
    new Request(origin + '/api/storage/head', {
      headers: {
        'Cf-Access-Jwt-Assertion': token,
        'X-Programmable-Notes': 'storage-v1',
      },
    }),
    env,
  );
  expect(reply.status).toBe(401);
});
it('rejects ambiguous duplicate signing key identities', async () => {
  const isolated = createStorageHandler({
    crypto,
    now: () => clock,
    fetch: async () => Response.json({ keys: [publicJwk, publicJwk] }),
  });
  const reply = await isolated(
    new Request(origin + '/api/storage/head', {
      headers: {
        'Cf-Access-Jwt-Assertion': token,
        'X-Programmable-Notes': 'storage-v1',
      },
    }),
    env,
  );
  expect(reply.status).toBe(401);
});

it('recovers a lost commit response only while that exact publication is still current', async () => {
  const first = await upload(new Uint8Array([31]));
  const second = await upload(new Uint8Array([32]));
  const acknowledged = await publish(first.id, 0);
  expect(acknowledged.status).toBe(200);
  const original = await acknowledged.json();
  const replay = await publish(first.id, 0);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(original);
  expect(await (await request('head')).json()).toEqual(original);
  const next = await publish(second.id, 1);
  expect(next.status).toBe(200);
  const newer = await next.json();
  expect(newer.version).toBe(2);
  expect((await publish(first.id, 0)).status).toBe(409);
  expect(await (await request('head')).json()).toEqual(newer);
  expect(newer.manifest.id).toBe(second.id);
});
