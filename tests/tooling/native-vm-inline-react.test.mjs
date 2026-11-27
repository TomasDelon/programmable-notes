import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('fixed inline driver validates synthetic artifacts and transport without a guest', () => {
  const result = spawnSync(
    'python3',
    ['-I', '-B', 'tests/tooling/native_vm_inline_react_test.py'],
    {
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 14 tests/);
  assert.match(result.stderr, /\bOK\b/);
});
