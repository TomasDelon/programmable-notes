// Local acceptance only. Cloudflare Pages remains the actual hosting server.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { preview } from 'vite';
import { cloudflareHeaders, headersForPath } from './cloudflare-config.ts';

assert.equal(
  await readFile('dist/_headers', 'utf8'),
  cloudflareHeaders(),
  'Build the Cloudflare target before previewing its response policies',
);
const server = await preview({
  configFile: false,
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  plugins: [
    {
      name: 'pages-response-policies',
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          let pathname;
          try {
            pathname = decodeURIComponent(
              new URL(request.url || '/', 'http://localhost').pathname,
            );
          } catch {
            response.statusCode = 400;
            response.end();
            return;
          }
          const headers = headersForPath(pathname);
          // Vite sets asset cache headers after middleware; apply ours at emission.
          const writeHead = response.writeHead;
          response.writeHead = function (...args) {
            for (const [name, value] of Object.entries(headers))
              this.setHeader(name, value);
            return writeHead.apply(this, args);
          };
          // Pages canonicalizes HTML filenames to extensionless routes.
          if (pathname === '/index.html') {
            response.statusCode = 308;
            response.setHeader('Location', '/');
            response.end();
            return;
          }
          if (
            pathname === '/_headers' ||
            pathname === '/_redirects' ||
            pathname === '/_routes.json'
          ) {
            response.statusCode = 404;
            response.end('Not found');
            return;
          }
          next();
        });
      },
    },
  ],
});
server.printUrls();
