import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('optional observer exceptions admit only bounded fixed fields and frozen own-source frames', () => {
  const file = fileURLToPath(
    new URL('./native_inline_react_diagnostics_test.py', import.meta.url),
  );
  const result = spawnSync('python3', ['-I', '-B', file], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran \d+ tests/);
  assert.match(result.stderr, /\bOK\b/);
});
