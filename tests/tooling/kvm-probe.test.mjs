import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(
  new URL('./fixtures/kvm-probe-tests.py', import.meta.url),
);

test(
  'hosted KVM observer checks only the device API and always closes an opened descriptor',
  { skip: process.platform !== 'linux' },
  () => {
    const result = spawnSync('python3', ['-I', '-B', fixture], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Ran 17 tests/);
    assert.match(result.stderr, /\bOK\b/);
  },
);
