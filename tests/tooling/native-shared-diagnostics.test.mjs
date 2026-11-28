import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
  new URL('../../scripts/native-shared-editor.mjs', import.meta.url),
  'utf8',
);
function declaration(name) {
  const match = source.match(
    new RegExp(`(?:async )?function ${name}\\([^]*?^}`, 'm'),
  );
  assert.ok(match, `${name} is defined`);
  return match[0];
}

test('failure classification accepts only closed diagnostic categories', () => {
  const classify = runInNewContext(
    `${declaration('classifyFailure')}\nclassifyFailure`,
  );
  const webdriver = (error) =>
    new Error(
      JSON.stringify({ value: { error, message: 'PRIVATE RAW DIAGNOSTIC' } }),
    );
  for (const [kind, expected] of [
    ['session not created', 'webdriver_session_not_created'],
    ['unknown error', 'webdriver_unknown_error'],
    ['invalid session id', 'webdriver_invalid_session_id'],
    ['no such window', 'webdriver_no_such_window'],
    ['timeout', 'webdriver_timeout'],
    ['invalid argument', 'webdriver_invalid_argument'],
    ['no such element', 'webdriver_other'],
    ['element click intercepted', 'webdriver_element_click_intercepted'],
    ['element not interactable', 'webdriver_element_not_interactable'],
    ['stale element reference', 'webdriver_stale_element_reference'],
    ['javascript error', 'webdriver_javascript_error'],
    ['PRIVATE RAW DIAGNOSTIC', 'other'],
    ['constructor', 'other'],
    [{ toString: 'unknown error' }, 'other'],
  ])
    assert.equal(classify(webdriver(kind)), expected);
  assert.equal(
    classify(new Error('observation_deadline')),
    'observation_deadline',
  );
  assert.equal(
    classify(Object.assign(new Error('PRIVATE'), { code: 'ERR_ASSERTION' })),
    'assertion',
  );
  for (const error of [
    new Error('PRIVATE'),
    null,
    undefined,
    {},
    new Error('{'),
    new Error('x'.repeat(65_537)),
  ]) {
    assert.equal(classify(error), 'other');
  }
});

test('startup phase advances immediately before each existing observation', async () => {
  for (const failAt of [
    'driver_session',
    'pid_identity',
    'executable_identity',
    'process_capture',
    'product_ready',
    null,
  ]) {
    const seen = [];
    const context = {
      startupPhase: 'not_started',
      installed: '/usr/bin/programmable-notes',
      assert,
      protocol: { launch: async () => observe('driver_session') },
      rootPid: async () => {
        observe('pid_identity');
        return 123;
      },
      readlink: async () => {
        observe('executable_identity');
        return '/usr/bin/programmable-notes';
      },
      capture: async () => observe('process_capture'),
      waitFor: async (observeReady) => {
        observe('product_ready');
        assert.equal(await observeReady(), true);
      },
      sync: async () => true,
    };
    function observe(phase) {
      assert.equal(context.startupPhase, phase);
      seen.push(phase);
      if (failAt === phase) throw new Error('controlled failure');
    }
    const start = runInNewContext(`${declaration('start')}\nstart`, context);
    if (failAt) {
      await assert.rejects(start(), /controlled failure/);
      assert.equal(context.startupPhase, failAt);
    } else {
      assert.equal(await start(), 123);
      assert.equal(context.startupPhase, 'complete');
      assert.deepEqual(seen, [
        'driver_session',
        'pid_identity',
        'executable_identity',
        'process_capture',
        'product_ready',
      ]);
    }
  }
});

test('OS failures expose only exact closed errno categories', () => {
  const classify = runInNewContext(
    `${declaration('classifyFailure')}\nclassifyFailure`,
  );
  for (const [code, expected] of [
    ['EPERM', 'os_eperm'],
    ['EACCES', 'os_eacces'],
    ['ENOENT', 'os_enoent'],
    ['ESRCH', 'os_esrch'],
  ]) {
    assert.equal(
      classify(Object.assign(new Error('PRIVATE RAW DIAGNOSTIC'), { code })),
      expected,
    );
  }
  for (const code of ['PRIVATE', 'eperm', 'constructor', 1, {}]) {
    assert.equal(
      classify(Object.assign(new Error('PRIVATE RAW DIAGNOSTIC'), { code })),
      'other',
    );
  }
});

test('failure catch records a safe category and receipt exposes only derived fields', () => {
  const catchBody = source.match(
    /} catch \(error\) {\n {2}\/\/ Never expose[^\n]*\n([^]*?)\n} finally {/,
  );
  assert.ok(catchBody, 'main failure handler is inspected');
  const context = {
    error: new Error('PRIVATE RAW DIAGNOSTIC'),
    failureKind: 'none',
    stage: 'installed_startup',
    console: { error: () => {} },
    process: {},
  };
  runInNewContext(
    `${declaration('classifyFailure')}\n${declaration('classifyAssertion')}\n${catchBody[1]}`,
    context,
  );
  assert.equal(context.failureKind, 'other');
  assert.equal(context.process.exitCode, 1);
  const receipt = source.match(/JSON\.stringify\(\s*({[^]*?}),\s*null,\s*2,/);
  assert.ok(receipt);
  const record = runInNewContext(`(${receipt[1]})`, {
    passed: false,
    stage: 'installed_startup',
    startupPhase: 'driver_session',
    failureKind: context.failureKind,
    assertionKind: context.assertionKind,
    sourcePhase: 'not_started',
    fixtureId: 'pn-native-shared-TEST01',
    journey: 'editor',
    recoveryResult: null,
    interruptionState: 'not_started',
    binarySha256: 'a'.repeat(64),
    checkpoints: [],
    cleanupVerified: true,
    forcedCleanup: false,
  });
  assert.equal(record.startupPhase, 'driver_session');
  assert.equal(record.failureKind, 'other');
  assert.equal(record.assertionKind, 'none');
  assert.equal(record.sourcePhase, 'not_started');
  assert.equal(record.journey, 'editor');
  assert.equal(record.fixtureId, 'pn-native-shared-TEST01');
  assert.equal(record.interruptionState, 'not_started');
  assert.equal(record.recovery, null);
  assert.ok(!JSON.stringify(record).includes('PRIVATE'));
});

test('assertion diagnostics never expose arbitrary error text', () => {
  const classify = runInNewContext(
    `${declaration('classifyAssertion')}\nclassifyAssertion`,
  );
  for (const [message, expected] of [
    [
      'Expected real WebDriver element\nPRIVATE actual',
      'element_reference_missing',
    ],
    ['Original mode preserved\nPRIVATE actual', 'original_mode_mismatch'],
    ['PRIVATE source/path', 'assertion_other'],
    ['Expected real WebDriver element PRIVATE', 'assertion_other'],
  ])
    assert.equal(classify({ code: 'ERR_ASSERTION', message }), expected);
  for (const error of [null, {}, new Error('PRIVATE')])
    assert.equal(classify(error), 'none');
});

test('real strict assertion messages classify without publishing actual values', () => {
  const classify = runInNewContext(
    `${declaration('classifyAssertion')}\nclassifyAssertion`,
  );
  for (const [actual, expected, label, kind] of [
    [
      'undefined',
      'string',
      'Expected real WebDriver element',
      'element_reference_missing',
    ],
    [384, 416, 'Original mode preserved', 'original_mode_mismatch'],
  ]) {
    let error;
    try {
      assert.equal(actual, expected, label);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error);
    assert.equal(classify(error), kind);
  }
});

test('synthetic original starts at exact 0640 even under private launcher umask', () => {
  const start = source.indexOf('await writeFile(file, original,');
  const end = source.indexOf('const wrapper =', start);
  assert.ok(start > 0 && end > start);
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { chmod, mkdtemp, writeFile, stat } from 'node:fs/promises';
    process.umask(0o077);
    const directory = await mkdtemp('/tmp/pn-fixture-mode-regression-');
    const file = directory + '/primary.mdx', original = 'synthetic';
    ${source.slice(start, end)}
    assert.equal((await stat(file)).mode & 0o777, 0o640);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
  `,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
});
