import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { headersForPath } from '../../scripts/cloudflare-config.ts';

const html = Buffer.from(
  '<!doctype html><main>' + 'Prévisualisation. '.repeat(80) + '</main>\n',
);
const compressed = gzipSync(html);
const policy = headersForPath('/');
let server, origin, worker;

before(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pn-offline-navigation-'));
  try {
    await mkdir(join(directory, 'dist'));
    await writeFile(join(directory, 'dist/index.html'), html);
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('../../scripts/web-offline.mjs', import.meta.url),
        ),
      ],
      {
        cwd: directory,
        stdio: 'pipe',
      },
    );
    worker = await readFile(join(directory, 'dist/sw.js'), 'utf8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  server = createServer((request, response) => {
    if (request.url === '/index.html') {
      response.writeHead(308, { location: '/' }).end();
      return;
    }
    const gzip = request.headers['accept-encoding'] === 'gzip';
    const body = gzip ? compressed : html;
    response
      .writeHead(200, {
        ...policy,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': body.length,
        ...(gzip && { 'Content-Encoding': 'gzip' }),
      })
      .end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server?.listening) await server[Symbol.asyncDispose]();
});

function navigation(cached, pathname = '/') {
  let handler;
  runInNewContext(worker, {
    URL,
    Response,
    Headers,
    self: {
      location: new URL(origin),
      addEventListener(type, listener) {
        if (type === 'fetch') handler = listener;
      },
    },
    caches: {
      open: async () => ({
        match: async (path) => {
          assert.equal(path, '/index.html');
          return cached;
        },
      }),
    },
  });
  let result;
  handler({
    request: { method: 'GET', url: origin + pathname, mode: 'navigate' },
    respondWith(promise) {
      result = promise;
    },
  });
  return result;
}

test('private API and Access login navigation always go to the network', () => {
  for (const pathname of [
    '/api/storage',
    '/api/storage/head',
    '/api/storage/chunks/a',
    '/cdn-cgi/access/login',
    '/cdn-cgi/access/logout',
  ]) {
    assert.equal(navigation(new Response('cached app'), pathname), undefined);
  }
});

for (const encoding of ['gzip', 'identity']) {
  test(
    'serves decoded HTML and preserves navigation policy for a redirected ' +
      encoding +
      ' response',
    async () => {
      const cached = await fetch(origin + '/index.html', {
        headers: { 'Accept-Encoding': encoding },
      });
      assert.equal(cached.redirected, true);
      assert.equal(cached.url, origin + '/');
      assert.equal(
        cached.headers.get('content-encoding'),
        encoding === 'gzip' ? 'gzip' : null,
      );
      assert.equal(
        cached.headers.get('content-length'),
        String(encoding === 'gzip' ? compressed.length : html.length),
      );
      assert.deepEqual(Buffer.from(await cached.clone().arrayBuffer()), html);

      const served = await navigation(cached);
      assert.equal(served.redirected, false);
      assert.equal(served.status, cached.status);
      assert.equal(served.statusText, cached.statusText);
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), html);
      for (const [name, value] of Object.entries(policy))
        assert.equal(served.headers.get(name), value, name);
      assert.equal(
        served.headers.get('content-type'),
        'text/html; charset=utf-8',
      );
      assert.equal(served.headers.get('content-encoding'), null);
      assert.equal(served.headers.get('content-length'), null);
    },
  );
}

test('returns a direct cached response with its original transport metadata', async () => {
  const cached = await fetch(origin + '/', {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert.equal(cached.redirected, false);
  const served = await navigation(cached);
  assert.equal(served, cached);
  assert.equal(served.headers.get('content-encoding'), 'gzip');
  assert.equal(served.headers.get('content-length'), String(compressed.length));
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), html);
});
