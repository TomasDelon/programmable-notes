import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const generator = fileURLToPath(
  new URL('../../scripts/web-offline.mjs', import.meta.url),
);
async function fixture(action) {
  const directory = await mkdtemp(join(tmpdir(), 'pn-pages-build-'));
  try {
    await mkdir(join(directory, 'dist/assets'), { recursive: true });
    await writeFile(
      join(directory, 'dist/index.html'),
      '<main>Real build fixture</main>',
    );
    await writeFile(
      join(directory, 'dist/assets/app.js'),
      'console.log("app")',
    );
    await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function generate(directory) {
  execFileSync(process.execPath, [generator], {
    cwd: directory,
    stdio: 'pipe',
  });
  const source = await readFile(join(directory, 'dist/sw.js'), 'utf8');
  return {
    cache: /const CACHE = '([^']+)'/.exec(source)[1],
    assets: JSON.parse(/const ASSETS = (.+);/.exec(source)[1]),
  };
}
test('consumed Pages metadata changes offline version without entering cache requests', async () => {
  await fixture(async (directory) => {
    const headers = join(directory, 'dist/_headers');
    await writeFile(headers, '/*\n  Referrer-Policy: no-referrer\n');
    await writeFile(join(directory, 'dist/_redirects'), '/old /new 302\n');
    const routes = join(directory, 'dist/_routes.json');
    await writeFile(
      routes,
      JSON.stringify({ version: 1, include: ['/api/*'] }),
    );
    const first = await generate(directory);
    assert.deepEqual(first.assets, ['/assets/app.js', '/index.html']);
    await writeFile(headers, '/*\n  Referrer-Policy: same-origin\n');
    const second = await generate(directory);
    assert.notEqual(
      second.cache,
      first.cache,
      'Header-only updates must replace cached response policies',
    );
    assert.deepEqual(second.assets, first.assets);
    await writeFile(
      routes,
      JSON.stringify({ version: 1, include: ['/api/storage/*'] }),
    );
    const third = await generate(directory);
    assert.notEqual(third.cache, second.cache);
    assert.deepEqual(third.assets, first.assets);
  });
});
test('ordinary builds still cache all application assets without Pages metadata', async () => {
  await fixture(async (directory) => {
    const first = await generate(directory);
    const second = await generate(directory);
    assert.deepEqual(first.assets, ['/assets/app.js', '/index.html']);
    assert.equal(
      second.cache,
      first.cache,
      'Unchanged assets must retain their offline release',
    );
  });
});
