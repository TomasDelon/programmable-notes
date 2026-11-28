import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Offline boundary check against the published SDK interface, not a driver or
// native runtime substitute. Updating the installed version requires review of
// the corresponding upstream CLI and intermediary loopback binding.
const help = readFileSync(
  new URL('../fixtures/tauri-driver-2.1.0-help.txt', import.meta.url),
  'utf8',
);
const optionTypes = new Map(
  [
    ...help
      .split('---\n')[1]
      .matchAll(/^ {2}(--[\w-]+) (NUMBER|HOST|PATH)\s/gm),
  ].map(([, option, type]) => [option, type]),
);
const launcher = readFileSync(
  new URL('../../scripts/run-native-shared-editor.sh', import.meta.url),
  'utf8',
);
const workflow = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);

function launchArguments(source) {
  const launches = source.match(/^pn-shared-tauri-driver .+ &$/gm);
  assert.equal(launches?.length, 1, 'one driver launch must be inspected');
  // Let Bash perform the launch line's actual argument expansion without
  // starting any service or executing the privileged desktop harness.
  return execFileSync(
    'bash',
    ['-c', `pn-shared-tauri-driver() { printf '%s\\0' "$@"; }\n${launches[0]}`],
    { encoding: 'utf8' },
  )
    .split('\0')
    .slice(0, -1);
}

function validateArguments(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const type = optionTypes.get(option);
    assert.ok(type, `unsupported tauri-driver 2.1.0 option: ${option}`);
    assert.ok(!options.has(option), `duplicate option: ${option}`);
    const value = args[index + 1];
    assert.ok(value && !value.startsWith('--'), `missing value: ${option}`);
    if (type === 'NUMBER') {
      assert.match(value, /^\d+$/);
      assert.ok(Number(value) > 0 && Number(value) <= 65535);
    }
    if (type === 'HOST') assert.equal(value, '127.0.0.1');
    if (type === 'PATH') assert.equal(value, '/usr/bin/WebKitWebDriver');
    options.set(option, value);
  }
  assert.equal(options.get('--native-host'), '127.0.0.1');
  assert.equal(options.get('--port'), '4444');
  assert.equal(options.get('--native-driver'), '/usr/bin/WebKitWebDriver');
}

test('shared desktop driver arguments conform to the published pinned CLI', () => {
  assert.equal(
    optionTypes.size,
    4,
    'read the complete upstream OPTIONS section',
  );
  validateArguments(launchArguments(launcher));
});

test('CLI contract rejects unsupported arguments, unsafe hosts and invalid values', () => {
  const good = [
    '--native-host',
    '127.0.0.1',
    '--port',
    '4444',
    '--native-driver',
    '/usr/bin/WebKitWebDriver',
  ];
  validateArguments(good);
  for (const bad of [
    good.map((value) => (value === '--native-host' ? '--host' : value)),
    good.map((value) => (value === '127.0.0.1' ? '0.0.0.0' : value)),
    good.map((value) => (value === '4444' ? '65536' : value)),
    good.slice(0, -1),
    [...good, '--unsupported', 'value'],
    [...good, '--native-host', '127.0.0.1'],
  ])
    assert.throws(() => validateArguments(bad));
});

test('installed driver version stays bound to the reviewed external CLI contract', () => {
  const installs = [
    ...workflow.matchAll(
      /cargo install tauri-driver --version (\S+) --locked/g,
    ),
  ];
  assert.equal(installs.length, 1);
  assert.equal(installs[0][1], '2.1.0');
});
