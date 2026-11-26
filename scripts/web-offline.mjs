import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('dist');
async function filesIn(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...(await filesIn(absolute)));
    else result.push(absolute);
  }
  return result;
}
const files = (await filesIn(root))
  .filter((file) => !file.endsWith('/sw.js'))
  .sort();
const digest = createHash('sha256');
for (const file of files) {
  digest.update(path.relative(root, file));
  digest.update(await readFile(file));
}
const version = digest.digest('hex').slice(0, 16);
// Pages consumes these files instead of serving them as application assets.
// Keep their bytes in the version digest: header-only updates need a new cache.
const consumed = new Set(['_headers', '_redirects']);
const paths = files
  .filter((file) => !consumed.has(path.relative(root, file)))
  .map((file) => '/' + path.relative(root, file).split(path.sep).join('/'));
const script = `/* Generated from the exact production assets. Notes never enter this cache. */
const CACHE = 'programmable-notes-web-${version}';
const ASSETS = ${JSON.stringify(paths)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('programmable-notes-web-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // A release's HTML and lazy chunks stay together until an explicit update.
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match('/index.html');
      if (!cached) return fetch(request);
      if (!cached.redirected) return cached;
      // Pages redirects /index.html to /. A navigation needs a fresh response.
      // Fetch decoded the stream. Its original encoding and length describe the wire bytes.
      const headers = new Headers(cached.headers);
      headers.delete('Content-Encoding');
      headers.delete('Content-Length');
      return new Response(cached.body, {status: cached.status, statusText: cached.statusText, headers});
    }));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  }
});
`;
await writeFile(path.join(root, 'sw.js'), script);
console.log(`Offline release ${version}: ${paths.length} assets`);
