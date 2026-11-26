import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const preflight = fileURLToPath(
  new URL('../../scripts/native-hosted-preflight.sh', import.meta.url),
);
const fixture = fileURLToPath(
  new URL('./fixtures/native-preflight-probes.py', import.meta.url),
);

test('native preflight refuses a non-hosted runner before external setup', () => {
  const result = spawnSync('/bin/bash', [preflight], {
    env: { PATH: '/nonexistent' },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'NATIVE_PREFLIGHT_BLOCKED runner-type\n');
});

test('native preflight exposes a fixed GitHub error annotation before self-hosted setup', () => {
  const result = spawnSync('/bin/bash', [preflight], {
    env: {
      GITHUB_ACTIONS: 'true',
      RUNNER_ENVIRONMENT: 'self-hosted',
      PATH: '/nonexistent',
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.equal(
    result.stdout,
    '::error::NATIVE_PREFLIGHT_BLOCKED runner-type\n',
  );
  assert.equal(result.stderr, 'NATIVE_PREFLIGHT_BLOCKED runner-type\n');
});

test('native preflight preserves each failure and reaps owned service units after helper timeout', () => {
  const result = spawnSync('python3', ['-I', fixture], {
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'cpu-quota',
    'tasks-limit',
    'memory-maximum',
    'swap-maximum',
    'cgroup-path',
    'no-new-privileges',
    'service-namespace-observer',
    'service-startup',
    'unexpected-exit',
    'timeout',
    'timeout-cleanup-fails',
    'cleanup-fails',
    'success',
  ]);
});

test('native preflight checks a private bus as its owner and waits for the dedicated manager', () => {
  const result = spawnSync('python3', ['-I', fixture, '--session'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'owner-visible',
    'activate',
    'activation-fails',
    'still-missing',
    'transport-fails',
    'transport-timeout',
    'manager-timeout',
    'manager-failed',
    'degraded',
  ]);
});
