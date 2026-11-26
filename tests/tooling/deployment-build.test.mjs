import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { verifyDeploymentBuild } from '../../scripts/verify-deployment-build.mjs';

const origin = 'https://preview.example';
const release = '0123456789abcdef';
const expectedWorker = Buffer.from(
  `const CACHE = 'programmable-notes-web-${release}';\n// fixture\n`,
);
const staleWorker = Buffer.from(
  expectedWorker.toString().replace(release, 'fedcba9876543210'),
);
function probe(response, overrides = {}) {
  const requests = [];
  const waits = [];
  const result = verifyDeploymentBuild({
    origin,
    expectedWorker,
    fetchWorker: async (url, options) => {
      requests.push({ url, options });
      return response(requests.length);
    },
    wait: async (ms) => {
      waits.push(ms);
    },
    ...overrides,
  });
  return { requests, waits, result };
}

test('accepts the exact build after two stale responses', async () => {
  const { result, requests, waits } = probe(
    (n) => new Response(n > 2 ? expectedWorker : staleWorker),
  );
  assert.deepEqual(await result, {
    release,
    workerSha: createHash('sha256').update(expectedWorker).digest('hex'),
  });
  assert.deepEqual(waits, [5000, 5000]);
  assert.equal(requests.length, 3);
  for (const { url, options } of requests) {
    assert.equal(String(url), origin + '/sw.js');
    assert.equal(options.cache, 'no-cache');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
  }
});

for (const [name, response] of [
  ['a previous valid release', () => new Response(staleWorker)],
  [
    'changed bytes under the same release',
    () =>
      new Response(
        Buffer.from(expectedWorker.toString().replace('fixture', 'changed')),
      ),
  ],
  [
    'a partial response with matching bytes',
    () => new Response(expectedWorker, { status: 206 }),
  ],
  ['a redirect', () => Response.redirect('https://account.example/secret')],
  [
    'a network failure',
    () => {
      throw new Error('sensitive network detail');
    },
  ],
]) {
  test('stops after bounded retries for ' + name, async () => {
    const { requests, waits, result } = probe(response);
    await assert.rejects(result, {
      message: 'Deployed service worker did not match the expected build.',
    });
    assert.equal(requests.length, 12);
    assert.deepEqual(waits, Array(11).fill(5000));
  });
}

test('rejects a missing, malformed or ambiguous local cache declaration before fetching', async () => {
  for (const text of [
    '// missing',
    expectedWorker.toString().replace(release, release.toUpperCase()),
    expectedWorker.toString() + expectedWorker.toString(),
    expectedWorker.toString() + "const CACHE = 'other';\n",
  ]) {
    const { result, requests } = probe(() => new Response(), {
      expectedWorker: Buffer.from(text),
    });
    await assert.rejects(result, {
      message: 'Invalid local service worker identity.',
    });
    assert.equal(requests.length, 0);
  }
});

test('requires an explicit validated deployment origin', async () => {
  for (const value of [
    undefined,
    '',
    ' ',
    origin + '/sw.js',
    'https://user:secret@preview.example',
    'not-an-origin',
  ]) {
    const { result, requests } = probe(() => new Response(), { origin: value });
    await assert.rejects(result, { message: 'Invalid deployment origin.' });
    assert.equal(requests.length, 0);
  }
});

test('CLI rejects invalid configuration without disclosing the input or a stack', () => {
  const cli = spawnSync(
    process.execPath,
    ['scripts/verify-deployment-build.mjs'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PN_DEPLOYMENT_URL: 'https://account:sensitive@preview.example',
      },
    },
  );
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.equal(cli.stderr.trim(), 'Invalid deployment origin.');
});
