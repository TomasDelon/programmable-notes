import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Script, createContext } from 'node:vm';
import {
  validateRequest,
  validateRun,
  verifyDownloadedArtifact,
} from '../../scripts/verify-native-shared-artifact.mjs';

const expected = {
  runId: '1234',
  repository: 'owner/notes',
  headSha: 'a'.repeat(40),
  branch: 'fixture',
};
const run = () => ({
  id: 1234,
  name: 'CI',
  path: '.github/workflows/ci.yml',
  head_sha: expected.headSha,
  head_branch: expected.branch,
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: expected.repository },
  head_repository: { full_name: expected.repository },
});
const jobs = () => ({
  total_count: 2,
  jobs: ['check', 'native-check'].map((name) => ({
    name,
    status: 'completed',
    conclusion: 'success',
  })),
});
test('run reuse requires a canonical numeric ID and exact successful required CI head/repository/branch', () => {
  validateRequest(expected);
  validateRun(run(), jobs(), expected);
  for (const runId of [
    '0',
    '01',
    '-1',
    '1;touch canary',
    '$(id)',
    '1\n',
    '9007199254740992',
  ])
    assert.throws(() => validateRequest({ ...expected, runId }));
  for (const changed of [
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'other' },
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { path: 'other.yml' },
    { id: 456 },
    { repository: { full_name: 'other/repo' } },
    { head_repository: { full_name: 'fork/repo' } },
  ])
    assert.throws(() =>
      validateRun({ ...run(), ...changed }, jobs(), expected),
    );
  for (const changed of [
    { total_count: 101 },
    { jobs: jobs().jobs.slice(0, 1) },
    { jobs: jobs().jobs.map((job) => ({ ...job, conclusion: 'skipped' })) },
  ])
    assert.throws(() =>
      validateRun(run(), { ...jobs(), ...changed }, expected),
    );
});
async function artifact(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pn-shared-artifact-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = JSON.parse(
    await readFile('src-tauri/tauri.conf.json', 'utf8'),
  );
  const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    encoding: 'utf8',
  }).trim();
  const bytes = Buffer.from(
    'synthetic package bytes, not an installable package',
  );
  const file = `${config.productName}_${config.version}_amd64.deb`;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    version: config.version,
    sourceRevision: 'b'.repeat(40),
    sourceTree,
    platform: 'linux-amd64-deb',
    file,
    bytes: bytes.length,
    sha256,
    installedRuntimeVerified: false,
    productionSecurityReadiness: false,
    deliveryClass: 'engineering-test',
    ...overrides,
  };
  await writeFile(join(directory, file), bytes);
  await writeFile(join(directory, 'build.json'), JSON.stringify(manifest));
  await writeFile(join(directory, 'SHA256SUMS'), `${sha256}  ${file}\n`);
  return { directory, config, sourceTree, file, manifest };
}
test('artifact metadata matches checkout tree and bytes even when a PR merge revision differs', async (t) => {
  const a = await artifact(t);
  assert.equal(
    await verifyDownloadedArtifact(a.directory, a.sourceTree, a.config),
    join(a.directory, a.file),
  );
});
test('artifact gate refuses mismatched tree, version, paths, length and package hashes', async (t) => {
  for (const changed of [
    { sourceTree: 'c'.repeat(40) },
    { version: '9.0' },
    { file: '../outside.deb' },
    { bytes: 1 },
    { sha256: 'd'.repeat(64) },
    { platform: 'linux-arm64-deb' },
    { installedRuntimeVerified: true },
  ]) {
    const a = await artifact(t, changed);
    await assert.rejects(
      verifyDownloadedArtifact(a.directory, a.sourceTree, a.config),
    );
  }
  const a = await artifact(t);
  await writeFile(join(a.directory, a.file), 'different bytes');
  await assert.rejects(
    verifyDownloadedArtifact(a.directory, a.sourceTree, a.config),
  );
});
test('artifact gate refuses replaced checksums and package symlinks', async (t) => {
  const a = await artifact(t);
  await writeFile(
    join(a.directory, 'SHA256SUMS'),
    'foreign package checksum\n',
  );
  await assert.rejects(
    verifyDownloadedArtifact(a.directory, a.sourceTree, a.config),
  );
  const b = await artifact(t);
  await rm(join(b.directory, b.file));
  await symlink(join(a.directory, a.file), join(b.directory, b.file));
  await assert.rejects(
    verifyDownloadedArtifact(b.directory, b.sourceTree, b.config),
  );
});
test('CLI refuses nonproduction package content even with a matching manifest/hash before publishing an install path', async (t) => {
  const a = await artifact(t);
  const output = join(a.directory, 'github-output');
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-native-shared-artifact.mjs', '--artifact', a.directory],
    {
      env: { ...process.env, GITHUB_OUTPUT: output },
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(output), { code: 'ENOENT' });
});
test('shared mode is exclusive for every other dispatch combination and uses an isolated standard-host group', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  const conditions = [
    ...workflow.matchAll(/^ {2}([a-z-]+):\n {4}if: (.+)$/gm),
  ].map(([, name, expression]) => [name, new Script(`(${expression})`)]);
  const flags = [
    'native_vm',
    'native_inline_react',
    'native_debian13',
    'native_preflight',
    'kvm_role_probe',
    'browser_qa',
    'review_artifacts',
    'editing_qa',
    'editing_core_only',
  ];
  for (let mask = 0; mask < 512; mask++) {
    const inputs = Object.fromEntries(
      flags.map((flag, index) => [flag, Boolean(mask & (1 << index))]),
    );
    Object.assign(inputs, {
      native_shared_run: '1234',
      editing_scope: 'all',
      editing_browser: 'all',
      deployment_url: '',
    });
    const context = createContext({
      inputs,
      github: { event_name: 'workflow_dispatch', run_id: 77 },
      format: (template, value) => template.replace('{0}', String(value)),
    });
    for (const [name, condition] of conditions)
      assert.equal(
        Boolean(condition.runInContext(context)),
        name === 'native-shared-editor',
      );
  }
  const section = workflow.slice(
    workflow.indexOf('\n  native-shared-editor:'),
    workflow.indexOf('\n  check:'),
  );
  const rejection = section.match(/ {8}if: \$\{\{ (.+) \}\}/)[1];
  const reject = new Script(`(${rejection})`);
  const defaults = Object.fromEntries(flags.map((flag) => [flag, false]));
  Object.assign(defaults, {
    native_shared_run: '1234',
    editing_scope: 'all',
    editing_browser: 'all',
    deployment_url: '',
  });
  assert.equal(
    Boolean(reject.runInContext(createContext({ inputs: defaults }))),
    false,
  );
  for (const flag of flags)
    assert.equal(
      Boolean(
        reject.runInContext(
          createContext({ inputs: { ...defaults, [flag]: true } }),
        ),
      ),
      true,
    );
  for (const changed of [
    { editing_scope: 'core' },
    { editing_browser: 'webkit' },
    { deployment_url: 'https://fixture.example/' },
  ])
    assert.equal(
      Boolean(
        reject.runInContext(
          createContext({ inputs: { ...defaults, ...changed } }),
        ),
      ),
      true,
    );
  assert.ok(
    section.indexOf('Reject combined shared-editor') <
      section.indexOf('actions/checkout@'),
  );
  assert.match(section, /runs-on: ubuntu-24\.04/);
  assert.match(section, /actions: read/);
  assert.match(section, /contents: read/);
  assert.match(section, /persist-credentials: false/);
  assert.match(section, /tauri-driver --version 2\.1\.0 --locked/);
  assert.match(section, /name: linux-amd64-testing/);
  assert.doesNotMatch(
    section,
    /native:package|secrets\.|self-hosted|continue-on-error|permissions:.*write/,
  );
  assert.ok(
    section.indexOf('--run') < section.indexOf('actions/download-artifact@'),
  );
  assert.ok(
    section.indexOf('--artifact') <
      section.indexOf('install -y "$PN_NATIVE_PACKAGE"'),
  );
  assert.match(
    workflow,
    /inputs\.native_shared_run && format\('native-shared-\{0\}', github\.run_id\)/,
  );
});
test('runtime boundary refuses other hosts before commands and strips inherited runner authority', async () => {
  const result = spawnSync(
    '/bin/bash',
    ['scripts/run-native-shared-editor.sh'],
    { env: { PATH: '/nonexistent' }, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /NATIVE_SHARED_HOST_BLOCKED runner-type/);
  const script = await readFile('scripts/run-native-shared-editor.sh', 'utf8');
  assert.match(script, /sudo -H -u "\$pn_role" env -i/);
  assert.match(script, /timeout -k 5s 260s/);
  assert.match(script, /dbus-run-session/);
  assert.match(script, /Xvfb .* -nolisten tcp -auth/);
  assert.doesNotMatch(
    script,
    /DISABLE_SANDBOX|disable-web-security|no-sandbox|unprivileged_userns|sysctl|native-vm/,
  );
  assert.doesNotMatch(script, /cp -[a-z]*r|tar .*HOME|GITHUB_TOKEN=/);
  const report = script.split("<<'REPORT'\n")[1].split('\nREPORT\n')[0];
  const checked = spawnSync(
    process.execPath,
    ['--check', '--input-type=module'],
    { input: report, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(checked.status, 0, checked.stderr);
});
