import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const path = 'scripts/run-native-shared-editor-local.sh';
const source = await readFile(path, 'utf8');
test('local runner parses and rejects malformed invocations without privileged work', () => {
  assert.equal(spawnSync('bash', ['-n', path]).status, 0);
  for (const args of [[], ['x'], ['1', '2', '3', '4', '5', '6', '7']]) {
    const result = spawnSync('bash', [path, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /NATIVE_SHARED_LOCAL_REFUSED arguments/);
  }
});
test('ordinary callers cannot enter privileged setup', () => {
  if (process.getuid() === 0) return;
  const result = spawnSync('bash', [path, ...Array(6).fill('x')], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /administrator-required/);
});
test('local and hosted identities stay separate and retained data has no deletion path', () => {
  assert.doesNotMatch(
    source,
    /GITHUB_ACTIONS|RUNNER_ENVIRONMENT|userdel|\brm\b|pkill|chmod|chown/,
  );
  assert.match(source, /\$VERSION_ID == 26\.04/);
  assert.match(source, /pn-local-20261128/);
  assert.match(source, /role test ! -x "\$pn_owner_home"/);
  assert.match(source, /role-busy/);
  assert.match(source, /display-busy/);
  assert.match(source, /driver-port-busy/);
});
test('application and pinned tools are bound to hashes before execution as the ordinary role', () => {
  for (const name of [
    'application-digest',
    'node-digest',
    'driver-digest',
    'node-version',
    'driver-capabilities',
    'payload-writable',
  ])
    assert.ok(source.includes(name));
  assert.match(source, /\/usr\/sbin\/runuser -u "\$pn_role" -- env -i/);
  assert.match(source, /v24\.22\.1/);
  assert.doesNotMatch(source, /tauri-driver" --version/);
  assert.match(source, /tauri-driver" --help/);
  assert.match(
    source,
    /os\.setgroups\(\[\]\); os\.setgid\(account\.pw_gid\); os\.setuid\(uid\)/,
  );
  assert.match(source, /os\.O_EXCL\|os\.O_NOFOLLOW/);
  assert.match(source, /identity\(pid\)==start/);
  assert.match(source, /no React or containment acceptance/);
});

test('administrative launcher resolves under the exact restricted root PATH', () => {
  assert.match(source, /role\(\) \{ \/usr\/sbin\/runuser /);
  assert.doesNotMatch(source, /(?:^|[|;{]\s*)runuser /m);
  const result = spawnSync('/usr/sbin/runuser', ['--version'], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /runuser/);
});
test('failed cleanup still reaches collection and cannot report success', () => {
  const start = source.indexOf('cleanup() {');
  const end = source.indexOf('\ntrap cleanup EXIT', start);
  let cleanup = source.slice(start, end);
  cleanup = cleanup.replace(
    /if \/usr\/bin\/python3[^\n]*<<'PY'\n[\s\S]*?\nPY/,
    'if false',
  );
  cleanup = cleanup.replace(
    / {2}role "\$pn_payload\/bin\/node"[^\n]*<<'COLLECT'[\s\S]*?\nCOLLECT/,
    '  printf COLLECTED',
  );
  const result = spawnSync(
    'bash',
    ['-c', `set -e; ${cleanup}\ntrap cleanup EXIT\nexit 7`],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, 'COLLECTED');
});

const localDriver = '.cache/local-toolchain/tauri-driver/bin/tauri-driver';
test(
  'real pinned local driver supports the admitted help capabilities',
  {
    skip: existsSync(localDriver)
      ? false
      : 'Local-only pinned driver is not installed',
  },
  () => {
    const result = spawnSync(localDriver, ['--help'], {
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    for (const capability of [
      'USAGE: tauri-driver [FLAGS] [OPTIONS]',
      '--native-driver PATH',
      '--native-host HOST',
      '--port NUMBER',
    ])
      assert.ok(result.stdout.includes(capability));
  },
);

test('private runtime exists before starting the fresh desktop bus', () => {
  const create = source.indexOf('role mkdir -m 700 "$pn_evidence/runtime"');
  const launch = source.indexOf('role env DISPLAY');
  assert.ok(create > 0 && launch > create);
  assert.doesNotMatch(source.slice(launch), /mkdir -m 700 "\$XDG_RUNTIME_DIR"/);
});

test('cleanup refuses success when a child appears after the initial process snapshot', async () => {
  const directory = await mkdtemp('/tmp/pn-late-cleanup-regression-');
  const cleanup = source
    .slice(source.indexOf('cleanup() {'))
    .match(/if \/usr\/bin\/python3[^\n]*<<'PY'\n([\s\S]*?)\nPY/)[1];
  // Deterministically model /proc changing during SIGTERM. Execute the actual
  // receipt producer; never enumerate or signal the developer's processes.
  const result = spawnSync(
    '/usr/bin/python3',
    [
      '-c',
      `
import builtins, io, os, sys, types
real_open = builtins.open
real_stat = os.stat
real_listdir = os.listdir
processes = {101: 'start-parent'}
def listdir(path):
    return list(map(str, processes)) if path == '/proc' else real_listdir(path)
def stat(path, *args, **kwargs):
    if str(path).startswith('/proc/'):
        pid = int(str(path).split('/')[2])
        if pid not in processes: raise FileNotFoundError()
        return types.SimpleNamespace(st_uid=os.getuid())
    return real_stat(path, *args, **kwargs)
def opened(path, *args, **kwargs):
    if str(path).startswith('/proc/'):
        pid = int(str(path).split('/')[2])
        if pid not in processes: raise FileNotFoundError()
        return io.StringIO(str(pid) + ' (fixture) ' + ' '.join(['0']*19 + [processes[pid]]))
    return real_open(path, *args, **kwargs)
def kill(pid, sig):
    if pid == 101:
        processes.pop(101, None)
        processes[202] = 'start-late-child'
    else: raise AssertionError('Uncaptured process must not be signalled')
os.listdir, os.stat, builtins.open, os.kill = listdir, stat, opened, kill
os.setgroups = os.setgid = os.setuid = lambda *args: None
sys.argv = ['cleanup', str(os.getuid()), ${JSON.stringify(directory)}, '0']
exec(${JSON.stringify(cleanup)})
`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1, result.stderr);
  const receipt = JSON.parse(
    await readFile(directory + '/local-infrastructure.json', 'utf8'),
  );
  assert.equal(receipt.cleanupVerified, false);
});

test('launcher admits only the fixed recovery journey before privileged work', () => {
  const args = Array(6).fill('x');
  const recovery = spawnSync('bash', [path, ...args, 'recovery'], {
    encoding: 'utf8',
  });
  assert.equal(recovery.status, 2);
  assert.match(
    recovery.stderr,
    /NATIVE_SHARED_LOCAL_REFUSED (?:administrator-required|owner)\n/,
  );
  for (const mode of ['unknown', '../recovery', 'recovery;anything']) {
    const refused = spawnSync('bash', [path, ...args, mode], {
      encoding: 'utf8',
    });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /NATIVE_SHARED_LOCAL_REFUSED arguments/);
  }
});
