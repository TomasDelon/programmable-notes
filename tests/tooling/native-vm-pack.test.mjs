import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test(
  'packing admits only public context and fixed outputs through bounded Docker control paths',
  { skip: process.platform !== 'linux' },
  () => {
    const fixture = fileURLToPath(
      new URL('./native_vm_pack_test.py', import.meta.url),
    );
    const result = spawnSync('python3', ['-I', '-B', fixture], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Ran \d+ tests/);
    assert.match(result.stderr, /\bOK\b/);
  },
);
