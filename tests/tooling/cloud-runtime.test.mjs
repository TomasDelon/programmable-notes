import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createHash } from 'node:crypto';
import { cloudTestRuntime } from '../../scripts/cloud-test-runtime.mjs';

const origin = 'https://127.0.0.1:4185';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let runtime;
before(async () => {
  runtime = await cloudTestRuntime(origin);
});
after(async () => {
  await runtime?.close();
});

function request(
  path,
  method = 'GET',
  body,
  requestOrigin = origin,
  authenticated = true,
) {
  const headers = { 'X-Programmable-Notes': 'storage-v1' };
  if (method !== 'GET') headers.Origin = requestOrigin;
  if (body && !(body instanceof Uint8Array))
    headers['Content-Type'] = 'application/json';
  return runtime.dispatch(
    new Request(origin + '/api/storage/' + path, {
      method,
      headers,
      body:
        body instanceof Uint8Array
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    }),
    authenticated,
  );
}

test('real workerd verifies signed owner identity and rejects missing/opaque-origin authority', async () => {
  assert.equal(
    (await request('head', 'GET', undefined, origin, false)).status,
    401,
  );
  const empty = await request('head');
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { version: 0, manifest: null });
  const denied = await request(
    'commit',
    'POST',
    { expectedVersion: 0, manifestId: 'invented' },
    'null',
  );
  assert.equal(denied.status, 403);
  assert.match(denied.headers.get('Cache-Control'), /no-store/);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});

test('real D1 preserves binary chunks and publishes only a complete atomic manifest', async () => {
  const first = new Uint8Array(1024 * 1024).fill(0xc3);
  const second = new TextEncoder().encode('\uFEFF# Exact\r\nλ &amp; $x$\r\n');
  const descriptor = {
    checksum: hash(Buffer.concat([first, second])),
    byteSize: first.length + second.length,
    chunks: [hash(first), hash(second)],
  };
  const staged = await request('stage', 'POST', descriptor);
  assert.equal(staged.status, 201);
  const stage = await staged.json();
  assert.deepEqual(stage.missing, descriptor.chunks);
  assert.equal(
    (
      await request('commit', 'POST', {
        expectedVersion: 0,
        manifestId: stage.id,
      })
    ).status,
    422,
  );
  assert.equal(
    (await request('chunks/' + descriptor.chunks[0], 'PUT', first)).status,
    204,
  );
  assert.equal(
    (await request('chunks/' + descriptor.chunks[1], 'PUT', second)).status,
    204,
  );
  const response = await request('commit', 'POST', {
    expectedVersion: 0,
    manifestId: stage.id,
  });
  assert.equal(response.status, 200);
  const head = await response.json();
  assert.deepEqual(head, {
    version: 1,
    manifest: { id: stage.id, ...descriptor },
  });
  const replay = await request('commit', 'POST', {
    expectedVersion: 0,
    manifestId: stage.id,
  });
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), head);
  const restored = await request('chunks/' + descriptor.chunks[0]);
  assert.equal(restored.status, 200);
  assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), first);

  const again = await request('stage', 'POST', descriptor);
  const other = await again.json();
  assert.deepEqual(other.missing, []);
  // A stale CAS cannot replace/delete the current head or its referenced data.
  assert.equal(
    (
      await request('commit', 'POST', {
        expectedVersion: 0,
        manifestId: other.id,
      })
    ).status,
    409,
  );
  assert.deepEqual(await (await request('head')).json(), head);
  assert.equal((await request('chunks/' + descriptor.chunks[1])).status, 200);
  assert.equal(
    (
      await request('commit', 'POST', {
        expectedVersion: 1,
        manifestId: other.id,
      })
    ).status,
    200,
  );
  assert.equal((await request('chunks/' + descriptor.chunks[0])).status, 200);
});
