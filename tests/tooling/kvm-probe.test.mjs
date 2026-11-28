import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

for (const [name, file, count] of [
  [
    'hosted observer sanitizes cgroup metadata and closes descriptors without creating a VM',
    'kvm-probe-tests.py',
    23,
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
