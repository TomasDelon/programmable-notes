import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

for (const [name, file, count] of [
  [
    'hosted KVM observer checks only the device API and always closes an opened descriptor',
    'kvm-probe-tests.py',
    19,
  ],
  [
    'hosted KVM role verifies credentials and cgroup identity and cleans up after failures',
    'kvm-role-tests.py',
    11,
  ],
]) {
  test(name, { skip: process.platform !== 'linux' }, () => {
    const fixture = fileURLToPath(
      new URL(`./fixtures/${file}`, import.meta.url),
    );
    const result = spawnSync('python3', ['-I', '-B', fixture], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, new RegExp(`Ran ${count} tests`));
    assert.match(result.stderr, /\bOK\b/);
  });
}
