import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { compileFixture } from '../../scripts/native-inline-react-v1/compile.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifact = await compileFixture();

test('fixed fixture yields reproducible public bytes bound to current sources, lock and actual pinned packages', async () => {
  assert.ok(Buffer.isBuffer(artifact.html));
  assert.ok(Buffer.isBuffer(artifact.manifest));
  const again = await compileFixture();
  assert.deepEqual(again, artifact);
  const manifest = JSON.parse(artifact.manifest);
  assert.equal(manifest.profile, 'inline-react-guarded-v2');
  assert.equal(manifest.scope, 'fixed-fixture-build-only');
  assert.equal(manifest.nativeTested, false);
  assert.equal(manifest.generatedCodeEvaluatedOnHost, false);
  const root = new URL('../../', import.meta.url);
  for (const [key, path] of Object.entries({
    sourceSha256: 'scripts/native-inline-react-v1/document.mdx',
    compilerSha256: 'scripts/native-inline-react-v1/compile.mjs',
    browserGuardsSha256: 'src-tauri/src/preview_browser_guards.rs',
    activationSha256: 'src-tauri/src/preview_activation.rs',
    packageJsonSha256: 'package.json',
    packageLockSha256: 'package-lock.json',
  }))
    assert.equal(
      manifest.inputs[key],
      digest(await readFile(new URL(path, root))),
    );
  assert.equal(manifest.artifacts.htmlBytes, artifact.html.length);
  assert.equal(manifest.artifacts.htmlSha256, digest(artifact.html));
  for (const name of [
    '@mdx-js/mdx',
    'esbuild',
    'react',
    'react-dom',
    'scheduler',
  ]) {
    const bytes = await readFile(
      new URL(`node_modules/${name}/package.json`, root),
    );
    assert.deepEqual(manifest.dependencies[name], {
      version: JSON.parse(bytes).version,
      packageJsonSha256: digest(bytes),
    });
  }
  assert.doesNotMatch(
    artifact.manifest.toString(),
    /\/workspace\/|PRIVATE KEY/,
  );
});

test('bundled browser artifact has one script, parses without host execution, and retains restriction and license notices', () => {
  const html = artifact.html.toString('utf8');
  // Parse HTML with execution disabled: React's bundle also contains literal
  // "<script>" strings, which are script text rather than additional elements.
  const dom = new JSDOM(html);
  const scripts = dom.window.document.querySelectorAll('script');
  assert.equal(scripts.length, 1);
  assert.equal((html.match(/<\/script>/gi) || []).length, 1);
  assert.equal(scripts[0].getAttribute('nonce'), 'inline-react-guarded-v2');
  const javascript = scripts[0].textContent;
  const manifest = JSON.parse(artifact.manifest);
  assert.equal(manifest.artifacts.javascriptSha256, digest(javascript));
  assert.equal(
    manifest.artifacts.javascriptBytes,
    Buffer.byteLength(javascript),
  );
  const parsed = spawnSync(
    process.execPath,
    ['--check', '--input-type=commonjs'],
    { input: javascript, encoding: 'utf8', timeout: 5000 },
  );
  assert.ifError(parsed.error);
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const policy of [
    "default-src 'none'",
    "script-src 'nonce-inline-react-guarded-v2'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ])
    assert.ok(html.includes(policy));
  assert.match(javascript, /React|react/);
  assert.match(javascript, /license|MIT/);
  assert.equal(
    dom.window.document.querySelectorAll('script[src],iframe').length,
    0,
  );
  assert.equal(dom.window.document.title, '');
  assert.equal(dom.window.document.querySelector('#counter'), null);
  assert.doesNotMatch(html, /__TAURI/);
  dom.window.close();
});

test('compile accepts no caller payload/path and never evaluates generated bootstrap in the host', async () => {
  for (const value of [
    'untrusted.mdx',
    { source: 'throw Error("must not run")' },
    undefined,
  ])
    await assert.rejects(compileFixture(value), /accepts no arguments/);
  Object.defineProperty(globalThis, '__pnFixtureReport', {
    configurable: true,
    get() {
      throw Error('Generated fixture was evaluated on host');
    },
    set() {
      throw Error('Generated bootstrap was evaluated on host');
    },
  });
  try {
    assert.deepEqual(await compileFixture(), artifact);
  } finally {
    delete globalThis.__pnFixtureReport;
  }
});
