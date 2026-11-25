import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateEvidence } from '../../scripts/check-agent-evidence.mjs';

const script = new URL(
  '../../scripts/check-agent-evidence.mjs',
  import.meta.url,
);
const valid = () => ({
  version: 1,
  subject: 'externally-computed-source-tests-config-identity',
  required: [{ gate: 'unit', kind: 'unit' }],
  evidence: [
    {
      gate: 'unit',
      kind: 'unit',
      subject: 'externally-computed-source-tests-config-identity',
      command: 'node --test',
      log: 'unopened-log-reference',
      status: 'passed',
      exitCode: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
    },
  ],
});

test('accepts a consistent record for each required gate', () => {
  assert.deepEqual(validateEvidence(valid()), []);
});

const rejected = [
  ['stale subject', (r) => (r.evidence[0].subject = 'old'), 'SUBJECT_MISMATCH'],
  [
    'compile cannot satisfy runtime',
    (r) => {
      r.required[0].kind = 'native-runtime';
      r.evidence[0].kind = 'native-compile';
    },
    'KIND_MISMATCH',
  ],
  ['failed status', (r) => (r.evidence[0].status = 'failed'), 'NOT_PASSED'],
  ['blocked status', (r) => (r.evidence[0].status = 'blocked'), 'NOT_PASSED'],
  ['not run', (r) => (r.evidence[0].status = 'not-run'), 'NOT_PASSED'],
  ['nonzero exit', (r) => (r.evidence[0].exitCode = 1), 'NOT_ZERO'],
  ['failed tests', (r) => (r.evidence[0].failed = 1), 'NOT_ZERO'],
  ['flaky tests', (r) => (r.evidence[0].flaky = 1), 'NOT_ZERO'],
  ['unapproved skips', (r) => (r.evidence[0].skipped = 1), 'SKIP_LIMIT'],
  [
    'excess skips',
    (r) => {
      r.required[0].allowedSkips = 1;
      r.evidence[0].skipped = 2;
    },
    'SKIP_LIMIT',
  ],
  ['missing gate', (r) => (r.evidence = []), 'MISSING_EVIDENCE'],
  [
    'duplicate evidence',
    (r) => r.evidence.push({ ...r.evidence[0] }),
    'DUPLICATE_GATE',
  ],
  [
    'duplicate required',
    (r) => r.required.push({ ...r.required[0] }),
    'DUPLICATE_GATE',
  ],
  ['unknown kind', (r) => (r.evidence[0].kind = 'imaginary'), 'INVALID_KIND'],
  [
    'unknown required kind',
    (r) => (r.required[0].kind = 'imaginary'),
    'INVALID_KIND',
  ],
  ['unexpected gate', (r) => (r.evidence[0].gate = 'extra'), 'UNEXPECTED_GATE'],
  ['empty command', (r) => (r.evidence[0].command = ' '), 'INVALID_STRING'],
  ['missing log', (r) => delete r.evidence[0].log, 'INVALID_STRING'],
  ['missing version', (r) => delete r.version, 'INVALID_VERSION'],
  ['wrong version', (r) => (r.version = 2), 'INVALID_VERSION'],
  ['empty requirements', (r) => (r.required = []), 'INVALID_ARRAY'],
  ['wrong evidence shape', (r) => (r.evidence = {}), 'INVALID_ARRAY'],
  ['null evidence', (r) => (r.evidence[0] = null), 'INVALID_OBJECT'],
  ['negative skips', (r) => (r.evidence[0].skipped = -1), 'INVALID_COUNT'],
  [
    'fractional allowance',
    (r) => (r.required[0].allowedSkips = 0.5),
    'INVALID_COUNT',
  ],
  ['string result count', (r) => (r.evidence[0].failed = '0'), 'NOT_ZERO'],
];
for (const [name, mutate, code] of rejected) {
  test(`rejects ${name}`, () => {
    const record = valid();
    mutate(record);
    assert.ok(
      validateEvidence(record).some((diagnostic) => diagnostic.code === code),
    );
  });
}

test('rejects non-object input', () => {
  for (const value of [null, [], 'record', 1]) {
    assert.ok(validateEvidence(value).some((d) => d.code === 'INVALID_OBJECT'));
  }
});

test('accepts an explicit skip allowance', () => {
  const record = valid();
  record.required[0].allowedSkips = 2;
  record.evidence[0].skipped = 2;
  assert.deepEqual(validateEvidence(record), []);
});

test('CLI reads JSON, returns failure safely, and never echoes supplied fields', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-evidence-'));
  const path = join(directory, 'record.json');
  const run = (...args) =>
    spawnSync(process.execPath, [script.pathname, ...args], {
      encoding: 'utf8',
    });
  try {
    writeFileSync(path, JSON.stringify(valid()));
    assert.equal(run(path).status, 0);
    const record = valid();
    const sentinel = 'PRIVATE_SENTINEL_67f91';
    record.evidence[0] = {
      ...record.evidence[0],
      gate: sentinel,
      kind: sentinel,
      subject: sentinel,
      command: sentinel,
      log: sentinel,
    };
    writeFileSync(path, JSON.stringify(record));
    const failure = run(path);
    assert.equal(failure.status, 1);
    assert.match(failure.stdout + failure.stderr, /UNEXPECTED_GATE/);
    assert.ok(!(failure.stdout + failure.stderr).includes(sentinel));
    writeFileSync(path, '{"PRIVATE_SENTINEL_67f91":');
    const malformed = run(path);
    assert.equal(malformed.status, 1);
    assert.ok(!(malformed.stdout + malformed.stderr).includes(sentinel));
    const missing = run(join(directory, sentinel));
    assert.equal(missing.status, 1);
    assert.ok(!(missing.stdout + missing.stderr).includes(sentinel));
    assert.equal(run().status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
