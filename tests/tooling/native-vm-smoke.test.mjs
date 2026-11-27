import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test(
  'fixed guest OS smoke validates identities, refusal controls and owned shutdown without a guest',
  { skip: process.platform !== 'linux' },
  () => {
    const fixture = fileURLToPath(
      new URL('./native_vm_smoke_test.py', import.meta.url),
    );
    const result = spawnSync('python3', ['-I', '-B', fixture], {
      encoding: 'utf8',
      timeout: 20000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Ran 47 tests/);
    assert.match(result.stderr, /\bOK\b/);
  },
);
