import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, normalizePath, resolveConfig } from 'vite';

test(
  'real dev server denies private audit/scanner/env data while serving generated runtime',
  { timeout: 30000 },
  async () => {
    const id = randomUUID();
    const marker = `UNUSED_PRIVATE_FIXTURE_${id}`;
    const directory = resolve('.cache', `security-scan-fixture-${id}`);
    const standard = resolve('.cache', `dev-serving-fixture-${id}`);
    const files = [
      resolve('.cache/public-audit', `serving-control-${id}.txt`),
      resolve(directory, 'history.json'),
      resolve(`.env.serving-control-${id}`),
      ...['crt', 'pem', 'key', 'p12', 'pfx', 'cer', 'der'].map((extension) =>
        resolve(standard, `unused.${extension}`),
      ),
      resolve(standard, '.npmrc'),
      resolve(standard, '.yarnrc.yml'),
    ];
    const created = [];
    let server;
    const directoriesCreated = [];
    try {
      await mkdir(resolve('.cache/public-audit'), {
        recursive: true,
        mode: 0o700,
      });
      for (const path of [directory, standard]) {
        await mkdir(path, { mode: 0o700 });
        directoriesCreated.push(path);
      }
      for (const file of files) {
        await writeFile(file, JSON.stringify({ fixture: marker }), {
          flag: 'wx',
          mode: 0o600,
        });
        created.push(file);
      }
      server = await createServer({
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0, strictPort: true },
      });
      const defaults = await resolveConfig(
        { configFile: false, envFile: false, logLevel: 'silent' },
        'serve',
      );
      const denied = new Set(server.config.server.fs.deny);
      assert.ok(
        defaults.server.fs.deny.every((pattern) => denied.has(pattern)),
        'Custom policy must retain every installed Vite security default',
      );
      await server.listen();
      const address = server.httpServer.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const runtime = await fetch(`${base}/.cache/runtime.js?raw`);
      assert.equal(
        runtime.status,
        200,
        'Required generated runtime must remain available',
      );
      assert.match(await runtime.text(), /export default.*React/s);
      for (const file of files) {
        const relative = normalizePath(file).slice(
          normalizePath(resolve('.')).length,
        );
        for (const path of [
          relative,
          '/@fs/' + normalizePath(file),
          relative + '?raw',
          '/@fs/' + normalizePath(file) + '?raw',
          relative.replace('.', '%2e') + '?raw',
        ]) {
          const response = await fetch(base + path);
          const body = await response.text();
          assert.equal(
            body.includes(marker),
            false,
            'Private synthetic payload was exposed',
          );
          assert.equal(
            response.status,
            403,
            'Private source request must be denied explicitly',
          );
        }
      }
    } finally {
      await server?.close();
      for (const file of created) await unlink(file);
      for (const directory of directoriesCreated.reverse())
        await rmdir(directory);
    }
  },
);
