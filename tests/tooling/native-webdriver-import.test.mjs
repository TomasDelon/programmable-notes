import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { artifact } from '../../scripts/native-webdriver-lib.mjs';

test('the real observer helper imports alone without compiler dependencies or network access', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'pn-webdriver-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const helper = join(directory, 'native-webdriver-lib.mjs');
  await copyFile('scripts/native-webdriver-lib.mjs', helper);
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `globalThis.fetch = () => { throw Error('Import attempted network access'); };
       const helper = await import(${JSON.stringify(pathToFileURL(helper).href)});
       if (typeof helper.launch !== 'function' || typeof helper.artifact !== 'function' || helper.session !== undefined) process.exit(2);`,
    ],
    {
      cwd: directory,
      env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

async function waitFor(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Compiled React did not settle');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('real MDX artifacts retain their hash CSP, inert script delimiters and interactive React hooks', async (t) => {
  const source = `import { useState } from 'react'

export function Counter() { const [count, setCount] = useState(0); return <button onClick={() => setCount(count + 1)}>Count: {count}</button> }

# Trusted fixture

<Counter />

<span>{'</script>'}</span>
`;
  const html = await artifact(source);
  const script = html.match(/<script>([\s\S]*)<\/script>$/)?.[1];
  assert.equal(typeof script, 'string');
  assert.doesNotMatch(script, /<\/script/i);
  const digest = createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes(`script-src 'sha256-${digest}'`));
  for (const directive of [
    "default-src 'none'",
    "connect-src 'none'",
    "img-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ])
    assert.ok(html.includes(directive));
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM('<div id="preview"></div>', {
    runScripts: 'outside-only',
    virtualConsole: console,
  });
  t.after(() => dom.window.close());
  dom.window.eval(script);
  await waitFor(() => dom.window.document.querySelector('button'));
  const button = dom.window.document.querySelector('button');
  assert.equal(
    dom.window.document.querySelector('h1')?.textContent,
    'Trusted fixture',
  );
  assert.equal(
    dom.window.document.querySelector('span')?.textContent,
    '</script>',
  );
  assert.equal(button.textContent, 'Count: 0');
  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => button.textContent === 'Count: 1');
  assert.deepEqual(errors, []);
});

test('invalid MDX still rejects and a later valid artifact remains compilable', async () => {
  await assert.rejects(artifact('export const ='));
  assert.match(
    await artifact('# Corrected'),
    /<div id="preview"><\/div><script>/,
  );
});
