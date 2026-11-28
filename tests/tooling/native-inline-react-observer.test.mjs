import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test(
  'sealed inline observer validates real bounded files/pipes and simulated identity/input/expiry races without native execution',
  { skip: process.platform !== 'linux' },
  () => {
    const file = fileURLToPath(
      new URL('./native_inline_react_observer_test.py', import.meta.url),
    );
    const result = spawnSync('python3', ['-I', '-B', file], {
      encoding: 'utf8',
      timeout: 20000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Ran \d+ tests/);
    assert.match(result.stderr, /\bOK\b/);
  },
);
