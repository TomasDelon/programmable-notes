// Disposable, loopback-only local acceptance. Never deploy this identity shim.
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';
import { cloudTestRuntime } from './cloud-test-runtime.mjs';
import { headersForPath } from './cloudflare-config.ts';

const origin = 'https://127.0.0.1:4185';
const certificates = await mkdtemp(join(tmpdir(), 'pn-cloud-local-'));
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-keyout',
    join(certificates, 'key.pem'),
    '-out',
    join(certificates, 'cert.pem'),
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ],
  { stdio: 'ignore' },
);
const runtime = await cloudTestRuntime(origin);
const assets = await preview({
  configFile: false,
  root: '.',
  build: { outDir: '.cache/cloud-acceptance/dist' },
  preview: { host: '127.0.0.1', port: 4186, strictPort: true },
});
const server = createServer(
  {
    key: await readFile(join(certificates, 'key.pem')),
    cert: await readFile(join(certificates, 'cert.pem')),
  },
  async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? '/', origin);
      let response;
      if (
        url.pathname === '/api/storage' ||
        url.pathname.startsWith('/api/storage/')
      ) {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers))
          if (typeof value === 'string') headers.set(name, value);
        const body = [];
        let size = 0;
        for await (const piece of incoming) {
          size += piece.length;
          if (size > 1024 * 1024 + 1024)
            throw new Error('Local request too large');
          body.push(piece);
        }
        const request = new Request(url, {
          method: incoming.method,
          headers,
          body: body.length ? Buffer.concat(body) : undefined,
        });
        // Synthetic HttpOnly test identity stands in for Access's trusted edge.
        // Never forward caller-supplied assertion headers through this shim.
        response = await runtime.dispatch(
          request,
          /(?:^|;\s*)pn_cloud_test_owner=1(?:;|$)/.test(
            incoming.headers.cookie ?? '',
          ),
        );
      } else {
        response = await fetch(
          new URL(url.pathname + url.search, 'http://127.0.0.1:4186'),
          { redirect: 'manual' },
        );
      }
      for (const [name, value] of response.headers) {
        if (
          !['content-encoding', 'content-length', 'transfer-encoding'].includes(
            name,
          )
        )
          outgoing.setHeader(name, value);
      }
      if (!url.pathname.startsWith('/api/')) {
        for (const [name, value] of Object.entries(
          headersForPath(url.pathname),
        ))
          outgoing.setHeader(name, value);
      }
      outgoing.writeHead(response.status);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing
        .writeHead(500, { 'Cache-Control': 'no-store' })
        .end('Local acceptance request failed');
    }
  },
);
server.listen(4185, '127.0.0.1');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  await assets.close();
  await runtime.close();
  await rm(certificates, { recursive: true, force: true });
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
