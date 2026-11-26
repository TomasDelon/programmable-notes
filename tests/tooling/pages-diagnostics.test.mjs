import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const match = workflow.match(
  / {6}- name: Repeat selected authoring or Pages checks without retries\n {8}run: \|\n((?: {10}.*\n)+)/,
);
assert.ok(match, 'Expected the diagnostic command step');
const script = match[1].replace(/^ {10}/gm, '');

function dispatch(scope, browser = 'firefox', core = 'false') {
  const directory = mkdtempSync(join(tmpdir(), 'pn-pages-command-'));
  const log = join(directory, 'calls.jsonl');
  try {
    for (const command of ['npm', 'npx']) {
      writeFileSync(
        join(directory, command),
        '#!' +
          process.execPath +
          '\nconst fs = require("node:fs");\n' +
          'fs.appendFileSync(process.env.PN_TEST_LOG, JSON.stringify([' +
          JSON.stringify(command) +
          ', ...process.argv.slice(2)]) + "\\n");\n',
        { mode: 0o755 },
      );
    }
    const result = spawnSync('/bin/bash', ['-euc', script], {
      env: {
        PATH: directory,
        PN_TEST_LOG: log,
        PN_EDITING_SCOPE: scope,
        PN_EDITING_BROWSER: browser,
        PN_EDITING_CORE_ONLY: core,
      },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('Pages diagnostics prepare real policies and repeat all Firefox cases with zero retries', () => {
  assert.deepEqual(dispatch('pages'), [
    ['npm', 'run', 'prepare:cloudflare'],
    [
      'npx',
      'playwright',
      'test',
      'tests/deployment/cloudflare.spec.ts',
      '--config',
      'playwright.cloudflare.config.ts',
      '--project',
      'firefox',
      '--repeat-each=3',
      '--retries=0',
    ],
  ]);
});
test('Pages diagnostics can select all configured engines', () => {
  const calls = dispatch('pages', 'all');
  assert.equal(calls.length, 2);
  assert.ok(!calls[1].includes('--project'));
  assert.ok(calls[1].includes('playwright.cloudflare.config.ts'));
});
test('the existing core-only override keeps its default config and avoids Pages preparation', () => {
  const calls = dispatch('pages', 'webkit', 'true');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('tests/e2e/web-core-plugins.spec.ts'));
  assert.ok(calls[0].includes('webkit'));
  assert.ok(!calls[0].includes('--config'));
  assert.ok(calls[0].includes('--retries=0'));
});
test('existing repeated authoring keeps five repetitions and the default server', () => {
  const calls = dispatch('authoring');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('tests/e2e/web-authoring-acceptance.spec.ts'));
  assert.ok(calls[0].includes('--repeat-each=5'));
  assert.ok(!calls[0].includes('--config'));
});
