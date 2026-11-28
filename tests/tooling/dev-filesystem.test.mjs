import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  unlink,
  rmdir,
  rm,
  stat,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, normalizePath, resolveConfig } from 'vite';

test(
  'real dev server denies private cache/audit/env data while serving only public generated cache assets',
  { timeout: 30000 },
  async () =>
    withIsolatedCheckout(false, async ({ root, server, base }) => {
      const id = randomUUID();
      const marker = `UNUSED_PRIVATE_FIXTURE_${id}`;
      const publicMarker = `UNUSED_PUBLIC_FIXTURE_${id}`;
      const publicCases = [];
      const delimiter = process.platform === 'win32' ? '#' : '?';
      const directory = resolve(root, '.cache', `security-scan-fixture-${id}`);
      const standard = resolve(root, '.cache', `dev-serving-fixture-${id}`);
      const deep = resolve(standard, 'nested');
      const queryFiles = [
        resolve(root, '.cache', `runtime.js${delimiter}private-${id}`),
        resolve(root, '.cache', `web-fonts.txt${delimiter}private-${id}`),
      ];
      const files = [
        resolve(root, '.cache/public-audit', `serving-control-${id}.txt`),
        resolve(directory, 'history.json'),
        resolve(root, `.env.serving-control-${id}`),
        ...['crt', 'pem', 'key', 'p12', 'pfx', 'cer', 'der'].map((extension) =>
          resolve(standard, `unused.${extension}`),
        ),
        resolve(standard, '.npmrc'),
        resolve(standard, '.yarnrc.yml'),
        // Synthetic data only: never read a developer's actual keys or native logs.
        resolve(root, '.cache', `native-serving-fixture-${id}.py`),
        resolve(root, '.cache', `serving-control-${id}.log`),
        resolve(root, '.cache', `serving-control-${id}.json`),
        resolve(root, '.cache', `.serving-control-${id}`),
        resolve(root, '.cache', `runtime.js.${id}.private`),
        resolve(root, '.cache', `web-fonts.txt.${id}.private`),
        resolve(standard, 'controller_ed25519'),
        resolve(standard, 'native-sdk-source.py'),
        resolve(standard, 'native-output.log'),
        resolve(standard, 'private-receipt.json'),
        // Public basenames are allowed only at the cache root, not in subtrees.
        resolve(standard, 'runtime.js'),
        resolve(standard, 'web-fonts.txt'),
        resolve(deep, '.private-state'),
        resolve(deep, 'transport.log'),
        resolve(deep, 'runtime.js'),
      ];
      const created = [];
      const directoriesCreated = [];
      try {
        await mkdir(resolve(root, '.cache/public-audit'), {
          recursive: true,
          mode: 0o700,
        });
        for (const path of [directory, standard, deep]) {
          await mkdir(path, { mode: 0o700 });
          directoriesCreated.push(path);
        }
        for (const file of [...files, ...queryFiles]) {
          await writeFile(file, JSON.stringify({ fixture: marker }), {
            flag: 'wx',
            mode: 0o600,
          });
          created.push(file);
        }
        // This checkout is uniquely owned. On a case-folding filesystem the
        // uppercase name aliases the copied public asset: prove that with metadata
        // and never overwrite/delete it as a newly-created case-control fixture.
        for (const [name, contents] of [
          ['RUNTIME.JS', /React/s],
          ['WEB-FONTS.TXT', /font-face/s],
        ]) {
          const file = resolve(root, '.cache', name);
          let existing;
          try {
            existing = await stat(file);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          if (existing) {
            const canonical = await stat(
              resolve(root, '.cache', name.toLowerCase()),
            );
            assert.equal(existing.dev, canonical.dev);
            assert.equal(existing.ino, canonical.ino);
            publicCases.push({ file, contents });
          } else {
            await writeFile(file, `/* ${publicMarker} */`, {
              flag: 'wx',
              mode: 0o600,
            });
            created.push(file);
            publicCases.push({ file, contents: new RegExp(publicMarker) });
          }
        }
        const defaults = await resolveConfig(
          { configFile: false, envFile: false, logLevel: 'silent' },
          'serve',
        );
        const denied = new Set(server.config.server.fs.deny);
        assert.ok(
          defaults.server.fs.deny.every((pattern) => denied.has(pattern)),
          'Custom policy must retain every installed Vite security default',
        );
        const shellResponse = await fetch(base + '/');
        assert.equal(shellResponse.status, 200);
        const appShell = await shellResponse.text();
        assert.match(
          appShell,
          /http-equiv="Content-Security-Policy"[^>]*frame-src 'none'/,
          'Dev serving must preserve the public application CSP',
        );
        for (const [asset, contents] of [
          ['runtime.js', /React/s],
          ['web-fonts.txt', /font-face/s],
        ]) {
          const file = normalizePath(resolve(root, '.cache', asset));
          // Text raw modules use Vite's import query; a plain .txt?raw fetch is
          // correctly served as text rather than a transformed JavaScript module.
          const modulePath = `/.cache/${asset}${asset.endsWith('.txt') ? '?import&raw' : '?raw'}`;
          for (const path of new Set([
            modulePath,
            `/.cache/${asset}?raw`,
            `/.cache/${asset}`,
            '/@fs/' + file + '?raw',
            `/%2ecache/${asset}?raw`,
          ])) {
            const response = await fetch(base + path);
            assert.equal(
              response.status,
              200,
              'Required generated cache asset must remain available',
            );
            const body = await response.text();
            assert.match(body, contents);
            if (path === modulePath)
              assert.ok(
                /export default.*(?:React|font-face)/s.test(body),
                `Canonical ${asset} raw import must export its source text (${response.headers.get('content-type')})`,
              );
          }
        }
        for (const { file, contents } of publicCases) {
          const relative = normalizePath(file).slice(
            normalizePath(root).length,
          );
          for (const path of [
            relative,
            relative + '?raw',
            '/@fs/' + normalizePath(file) + '?raw',
          ]) {
            const response = await fetch(base + path);
            assert.equal(
              response.status,
              200,
              'Compiler asset basename reservations are case-insensitive',
            );
            assert.match(await response.text(), contents);
          }
        }
        const requestPaths = (file) => {
          const relative = normalizePath(file).slice(
            normalizePath(root).length,
          );
          const encodedRelative = relative
            .replaceAll('?', '%3F')
            .replaceAll('#', '%23');
          const encodedAbsolute = normalizePath(file)
            .replaceAll('?', '%3F')
            .replaceAll('#', '%23');
          return [
            encodedRelative,
            '/@fs/' + encodedAbsolute,
            encodedRelative + '?raw',
            '/@fs/' + encodedAbsolute + '?raw',
            encodedRelative.replace('.', '%2e') + '?raw',
          ];
        };
        for (const [fileIndex, file] of files.entries()) {
          for (const path of requestPaths(file)) {
            const response = await fetch(base + path);
            const body = await response.text();
            assert.equal(
              body.includes(marker),
              false,
              `Private synthetic payload was exposed (HTTP ${response.status})`,
            );
            assert.equal(
              response.status,
              403,
              `Private synthetic fixture ${fileIndex} must be denied explicitly (public asset response: ${/React|font-face/.test(body)})`,
            );
          }
        }
        // Encoded literal-URL-delimiter filenames may normalize to an unaddressable
        // resource and SPA fallback. Windows cannot create '?' filenames, so that
        // platform probes its supported '#' filename instead. That is not an explicit filesystem denial:
        // require no private payload, and accept only403 or the exact public HTML.
        for (const file of queryFiles) {
          for (const path of requestPaths(file)) {
            const response = await fetch(base + path);
            const body = await response.text();
            assert.equal(
              body.includes(marker),
              false,
              'Private delimiter-filename payload was exposed',
            );
            if (response.status === 200) {
              assert.match(
                response.headers.get('content-type') || '',
                /^text\/html(?:;|$)/i,
              );
              assert.equal(
                body,
                appShell,
                'Normalized unsupported filename may serve only the canonical public shell',
              );
            } else {
              assert.equal(response.status, 403);
            }
          }
        }
      } finally {
        for (const file of created) await unlink(file);
        for (const directory of directoriesCreated.reverse())
          await rmdir(directory);
      }
    }),
);

async function withIsolatedCheckout(ancestorCache, check) {
  const temporary = await mkdtemp(resolve(tmpdir(), 'pn-vite-root-'));
  const root = resolve(
    temporary,
    ...(ancestorCache ? ['.cache'] : []),
    'checkout[glob](literal)+@!{root}',
  );
  let server;
  try {
    await mkdir(resolve(root, '.cache'), { recursive: true, mode: 0o700 });
    await mkdir(resolve(root, 'src'), { mode: 0o700 });
    await mkdir(resolve(root, 'public'), { mode: 0o700 });
    await writeFile(resolve(root, 'package.json'), '{"type":"module"}', {
      flag: 'wx',
    });
    await writeFile(
      resolve(root, 'index.html'),
      '<!doctype html><meta http-equiv="Content-Security-Policy" content="frame-src \'none\'"><title>Public fixture</title><script type="module" src="/src/main.js"></script>',
      { flag: 'wx' },
    );
    await writeFile(
      resolve(root, 'src/main.js'),
      'export const publicEntry = "PN_PUBLIC_ENTRY";',
      { flag: 'wx' },
    );
    await writeFile(
      resolve(root, 'public/marker.txt'),
      'PN_PUBLIC_STATIC_ASSET',
      { flag: 'wx' },
    );
    for (const asset of ['runtime.js', 'web-fonts.txt'])
      await writeFile(
        resolve(root, '.cache', asset),
        await readFile(resolve('.cache', asset)),
        { flag: 'wx' },
      );
    server = await createServer({
      configFile: resolve('vite.config.ts'),
      root,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    await check({ root, server, base: `http://127.0.0.1:${address.port}` });
  } finally {
    await server?.close();
    await rm(temporary, { recursive: true, force: true });
  }
}

test(
  'nested project cache cannot reuse root public compiler asset exceptions',
  { timeout: 30000 },
  async () => {
    await withIsolatedCheckout(false, async ({ root, base }) => {
      const nested = resolve(root, 'nested/.cache');
      await mkdir(nested, { recursive: true, mode: 0o700 });
      const marker = 'UNUSED_NESTED_PRIVATE_CACHE_FIXTURE';
      for (const asset of ['runtime.js', 'web-fonts.txt']) {
        const file = resolve(nested, asset);
        await writeFile(file, JSON.stringify({ fixture: marker }), {
          flag: 'wx',
          mode: 0o600,
        });
        for (const path of [
          `/nested/.cache/${asset}`,
          `/nested/.cache/${asset}?raw`,
          '/@fs/' + normalizePath(file) + '?raw',
          `/nested/%2ecache/${asset}?raw`,
        ]) {
          const response = await fetch(base + path);
          assert.equal(
            (await response.text()).includes(marker),
            false,
            'Nested private marker was exposed',
          );
          assert.equal(response.status, 403);
        }
      }
    });
  },
);

test(
  'configured checkout under ancestor cache and glob characters retains public assets and denies own private cache',
  { timeout: 30000 },
  async () => {
    await withIsolatedCheckout(true, async ({ root, base }) => {
      for (const [path, contents] of [
        ['/', /Public fixture/],
        ['/src/main.js', /PN_PUBLIC_ENTRY/],
        ['/marker.txt', /PN_PUBLIC_STATIC_ASSET/],
        ['/.cache/runtime.js?raw', /export default.*React/s],
        ['/.cache/web-fonts.txt?import&raw', /export default.*font-face/s],
      ]) {
        const response = await fetch(base + path);
        assert.equal(
          response.status,
          200,
          'Ancestor cache must not deny configured project public assets',
        );
        assert.match(await response.text(), contents);
      }
      const marker = 'UNUSED_GLOB_ROOT_PRIVATE_CACHE_FIXTURE';
      await writeFile(
        resolve(root, '.cache/private.json'),
        JSON.stringify({ fixture: marker }),
        { flag: 'wx', mode: 0o600 },
      );
      const response = await fetch(base + '/.cache/private.json?raw');
      assert.equal(
        (await response.text()).includes(marker),
        false,
        'Root glob metacharacters must be literal',
      );
      assert.equal(response.status, 403);
    });
  },
);
