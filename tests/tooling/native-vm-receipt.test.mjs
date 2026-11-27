import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve('scripts/report-native-vm-receipt.py');
const base = {
  version: 1,
  scope: 'guest-os-admission-only',
  native_app_tested: false,
};
const failed = {
  ...base,
  status: 'failed',
  stage: 'boot_wait',
  reason: 'refused',
  ssh_error: 'authentication',
  returncode: 255,
  guard_status: 2,
};
const passed = {
  ...base,
  status: 'passed',
  wrong_pin_rejected: true,
  wrong_key_rejected: true,
  guard_normal_exit: true,
  uid: 1001,
  pid1_systemd: true,
  cgroup_v2: true,
  mounts_allowed: true,
  root_ext4_vda: true,
  agent_absent: true,
  container_absent: true,
  logind_active: true,
  authorized_count: 1,
  authorized_sha256: 'a'.repeat(64),
};

function fixture(t, value) {
  const directory = mkdtempSync(join(tmpdir(), 'pn-vm-receipt-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'receipt.json');
  writeFileSync(
    file,
    typeof value === 'string' ? value : JSON.stringify(value),
    { mode: 0o600 },
  );
  return { directory, file };
}
function run(file, extra = []) {
  const result = spawnSync('python3', ['-I', '-B', script, file, ...extra], {
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  return result;
}
function refused(result) {
  assert.equal(result.status, 2);
  assert.equal(result.stdout, 'NATIVE_VM_RECEIPT_REFUSED\n');
  assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, /PRIVATE_CANARY|::(?:error|notice)/);
}

test('publishes only fixed failure categories as a GitHub check annotation', (t) => {
  const result = run(fixture(t, failed).file);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    '::error title=Guest OS admission::status=failed stage=boot_wait reason=refused ssh_error=authentication returncode=255 guard_status=2 native_app_tested=false\n',
  );
});

test('reports OS-only success without promoting native application security or printing public key data', (t) => {
  const result = run(fixture(t, passed).file);
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    '::notice title=Guest OS admission::status=passed scope=guest-os-admission-only native_app_tested=false\n',
  );
  assert.doesNotMatch(result.stdout, /a{64}/);
});

test('requires both full OS admission facts to be present and exactly true', (t) => {
  for (const field of ['container_absent', 'logind_active']) {
    const missing = { ...passed };
    delete missing[field];
    refused(run(fixture(t, missing).file));
    for (const value of [false, 1, 'true', null])
      refused(run(fixture(t, { ...passed, [field]: value }).file));
  }
});

test('reports only paired fixed advisory boot markers for boot failure or its cleanup', (t) => {
  for (const scope of [
    { ...failed, reason: 'timeout' },
    {
      ...failed,
      stage: 'cleanup',
      reason: 'cleanup_failed',
      origin_stage: 'boot_wait',
    },
  ]) {
    const result = run(
      fixture(t, {
        ...scope,
        boot_markers: ['linux_kernel_started', 'sshd_started'],
        serial_bytes: 8192,
      }).file,
    );
    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /boot_markers=linux_kernel_started,sshd_started serial_bytes=8192 /,
    );
  }
  const empty = run(
    fixture(t, { ...failed, boot_markers: [], serial_bytes: 0 }).file,
  );
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /boot_markers=none serial_bytes=0 /);
  const markers = [
    'crng_ready',
    'emergency',
    'initramfs_shell',
    'kernel_panic',
    'linux_kernel_started',
    'multiuser',
    'network_wait',
    'root_device_timeout',
    'sshd_started',
    'systemd_started',
  ];
  const all = run(
    fixture(t, { ...failed, boot_markers: markers, serial_bytes: 16777216 })
      .file,
  );
  assert.equal(all.status, 0);
  assert.ok(
    all.stdout.includes(
      `boot_markers=${markers.join(',')} serial_bytes=16777216 `,
    ),
  );
});

test('refuses injected, noncanonical, unpaired or misplaced serial observations', (t) => {
  const observations = {
    boot_markers: ['linux_kernel_started'],
    serial_bytes: 1,
  };
  for (const change of [
    { boot_markers: ['PRIVATE_CANARY%0A::error::injected'] },
    { boot_markers: ['sshd_started', 'linux_kernel_started'] },
    { boot_markers: ['linux_kernel_started', 'linux_kernel_started'] },
    { boot_markers: 'linux_kernel_started' },
    { boot_markers: [true] },
    { boot_markers: undefined },
    { serial_bytes: undefined },
    { serial_bytes: true },
    { serial_bytes: -1 },
    { serial_bytes: 16777217 },
    { stage: 'probe', ssh_error: 'protocol' },
    { stage: 'cleanup', origin_stage: 'probe', reason: 'cleanup_failed' },
  ])
    refused(run(fixture(t, { ...failed, ...observations, ...change }).file));
  refused(run(fixture(t, { ...passed, ...observations }).file));
});

test('reports only fixed failed-probe checks and rejects misplaced or injected diagnostics', (t) => {
  const probe = { ...failed, stage: 'probe', ssh_error: 'protocol' };
  for (const probe_check of [
    'schema',
    'version',
    'uid',
    'authorized_count',
    'authorized_sha256',
    'pid1_systemd',
    'cgroup_v2',
    'mounts_allowed',
    'root_ext4_vda',
    'agent_absent',
    'container_absent',
    'logind_active',
  ]) {
    for (const scope of [
      probe,
      {
        ...probe,
        stage: 'cleanup',
        origin_stage: 'probe',
        reason: 'cleanup_failed',
      },
    ]) {
      const result = run(fixture(t, { ...scope, probe_check }).file);
      assert.equal(result.status, 0);
      assert.ok(result.stdout.includes(`probe_check=${probe_check} `));
    }
  }
  for (const value of [
    { ...probe, probe_check: 'PRIVATE_CANARY%0A::error::injected' },
    { ...probe, probe_check: ['uid'] },
    { ...failed, probe_check: 'uid' },
    { ...probe, reason: 'timeout', probe_check: 'uid' },
    { ...probe, ssh_error: 'authentication', probe_check: 'uid' },
    {
      ...probe,
      stage: 'cleanup',
      origin_stage: 'pin',
      reason: 'cleanup_failed',
      probe_check: 'uid',
    },
  ])
    refused(run(fixture(t, value).file));
});

test('refuses forged scope, unsafe categories, message injection, unknown fields and misleading success', (t) => {
  for (const change of [
    { scope: 'PRIVATE_CANARY' },
    { native_app_tested: true },
    { version: true },
    { stage: 'boot_wait%0A::error::PRIVATE_CANARY' },
    { reason: 'PRIVATE_CANARY' },
    { ssh_error: 'PRIVATE_CANARY' },
    { raw: 'PRIVATE_CANARY' },
    { returncode: true },
    { returncode: 256 },
    { origin_stage: 'probe' },
    { status: 'PRIVATE_CANARY' },
  ])
    refused(run(fixture(t, { ...failed, ...change }).file));
  for (const change of [
    { guard_normal_exit: false },
    { uid: true },
    { uid: 0 },
    { authorized_sha256: 'PRIVATE_CANARY' },
    { raw: 'PRIVATE_CANARY' },
  ])
    refused(run(fixture(t, { ...passed, ...change }).file));
});

test('preserves failed cleanup and validates its original stage', (t) => {
  const value = {
    ...failed,
    stage: 'cleanup',
    reason: 'cleanup_failed',
    origin_stage: 'guard_exit',
  };
  const result = run(fixture(t, value).file);
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /status=failed stage=cleanup reason=cleanup_failed/,
  );
  assert.match(result.stdout, /origin_stage=guard_exit/);
  for (const change of [
    { origin_stage: 'PRIVATE_CANARY' },
    { reason: 'refused' },
    { origin_stage: undefined },
  ])
    refused(run(fixture(t, { ...value, ...change }).file));
});

test('reports a writer-shaped probe protocol failure and its cleanup variant', (t) => {
  for (const change of [
    { stage: 'probe', reason: 'refused' },
    { stage: 'cleanup', reason: 'cleanup_failed', origin_stage: 'probe' },
  ]) {
    const result = run(
      fixture(t, { ...failed, ...change, ssh_error: 'protocol' }).file,
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /status=failed/);
    assert.match(result.stdout, /ssh_error=protocol/);
  }
});

test('refuses duplicate JSON, oversized input, symlinks, unsafe file modes and extra arguments', (t) => {
  refused(
    run(
      fixture(
        t,
        JSON.stringify(failed).replace(
          '"version":1',
          '"version":1,"version":1',
        ),
      ).file,
    ),
  );
  refused(run(fixture(t, ' '.repeat(16385) + JSON.stringify(passed)).file));
  const good = fixture(t, passed);
  const alias = join(good.directory, 'alias.json');
  symlinkSync(good.file, alias);
  refused(run(alias));
  chmodSync(good.file, 0o644);
  refused(run(good.file));
  chmodSync(good.file, 0o600);
  refused(run(good.file, ['PRIVATE_CANARY']));
});
