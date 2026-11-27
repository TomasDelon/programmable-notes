import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Script, createContext } from 'node:vm';
import {
  validateRequest,
  validateRun,
  verifyDownloadedArtifact,
} from '../../scripts/verify-native-shared-artifact.mjs';

import { prepareNativeSharedObserver } from '../../scripts/prepare-native-shared-observer.mjs';

const expected = {
  runId: '1234',
  repository: 'owner/notes',
  headSha: 'a'.repeat(40),
  branch: 'fixture',
};
const run = () => ({
  id: 1234,
  name: 'CI · event=pull_request · ref=refs/pull/9/merge · group=ci-CI-refs/pull/9/merge-build',
  workflow_id: 421740247,
  path: '.github/workflows/ci.yml',
  head_sha: expected.headSha,
  head_branch: expected.branch,
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: expected.repository },
  head_repository: { full_name: expected.repository },
});
const workflowIdentity = () => ({
  id: 421740247,
  name: 'CI',
  path: '.github/workflows/ci.yml',
  state: 'active',
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
  validateRun(run(), jobs(), expected, workflowIdentity());
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
    { workflow_id: 421740248 },
    { workflow_id: '421740247' },
    { workflow_id: undefined },
    { repository: { full_name: 'other/repo' } },
    { head_repository: { full_name: 'fork/repo' } },
  ])
    assert.throws(() =>
      validateRun(
        { ...run(), ...changed },
        jobs(),
        expected,
        workflowIdentity(),
      ),
    );
  for (const changed of [
    { total_count: 101 },
    { jobs: jobs().jobs.slice(0, 1) },
    { jobs: jobs().jobs.map((job) => ({ ...job, conclusion: 'skipped' })) },
  ])
    assert.throws(() =>
      validateRun(
        run(),
        { ...jobs(), ...changed },
        expected,
        workflowIdentity(),
      ),
    );
});
test('canonical workflow metadata rejects wrong identities, paths, names and inactive workflows', () => {
  validateRun(
    { ...run(), name: 'Custom display title' },
    jobs(),
    expected,
    workflowIdentity(),
  );
  for (const changed of [
    { id: 421740248 },
    { id: '421740247' },
    { id: 0 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { path: 'other.yml' },
    { name: 'Other' },
    { state: 'disabled_manually' },
  ]) {
    assert.throws(() =>
      validateRun(run(), jobs(), expected, {
        ...workflowIdentity(),
        ...changed,
      }),
    );
  }
  assert.throws(() => validateRun(run(), jobs(), expected));
});
test('recorded public Actions API run with a dynamic PR title binds to its canonical CI workflow', () => {
  // Public responses read on 27 November after the hosted provenance refusal;
  // these fields are API provenance, without credentials or runtime evidence.
  const recordedRun = {
    ...run(),
    id: 46020089543,
    head_sha: '8ee2d60522e686d14ed86a4bc8f5dabc121dfef2',
    head_branch: 'fix/preview-markdown-input',
    repository: { full_name: 'TomasDelon/programmable-notes' },
    head_repository: { full_name: 'TomasDelon/programmable-notes' },
  };
  const recordedJobs = {
    total_count: 7,
    jobs: [
      ...jobs().jobs,
      ...[
        'deployment-check',
        'native-preflight',
        'preview-input-regression',
        'native-shared-editor',
        'native-vm',
      ].map((name) => ({ name, status: 'completed', conclusion: 'skipped' })),
    ],
  };
  const recordedExpected = {
    runId: String(recordedRun.id),
    repository: recordedRun.repository.full_name,
    headSha: recordedRun.head_sha,
    branch: recordedRun.head_branch,
  };
  validateRun(recordedRun, recordedJobs, recordedExpected, workflowIdentity());
  assert.throws(() =>
    validateRun(
      { ...recordedRun, workflow_id: 9 },
      recordedJobs,
      recordedExpected,
      workflowIdentity(),
    ),
  );
  assert.throws(() =>
    validateRun(
      recordedRun,
      { total_count: 1, jobs: [recordedJobs.jobs[0]] },
      recordedExpected,
      workflowIdentity(),
    ),
  );
  // Replay the public API records through the real CLI, checking its fixed
  // workflow endpoint as well as the run/jobs endpoints without network/token use.
  const endpoint = `https://api.github.com/repos/${recordedExpected.repository}/actions`;
  const responses = [
    [`${endpoint}/workflows/ci.yml`, workflowIdentity()],
    [`${endpoint}/runs/${recordedRun.id}`, recordedRun],
    [
      `${endpoint}/runs/${recordedRun.id}/jobs?filter=latest&per_page=100`,
      recordedJobs,
    ],
  ];
  const preload = `import assert from 'node:assert/strict'; const responses=new Map(${JSON.stringify(responses)}); globalThis.fetch=async url=>{assert.ok(responses.has(url),'Unexpected Actions endpoint'); return Response.json(responses.get(url));};`;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(preload)}`,
      'scripts/verify-native-shared-artifact.mjs',
      '--run',
    ],
    {
      env: {
        ...process.env,
        GH_TOKEN: 'synthetic-not-a-secret',
        PN_NATIVE_SHARED_RUN: recordedExpected.runId,
        GITHUB_REPOSITORY: recordedExpected.repository,
        GITHUB_SHA: recordedExpected.headSha,
        GITHUB_REF_NAME: recordedExpected.branch,
      },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'NATIVE_SHARED_REQUIRED_CI_VERIFIED\n');
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
  assert.ok(
    script.indexOf('chmod 700 "$pn_repo"') < script.indexOf('sudo useradd'),
  );
  assert.ok(
    script.indexOf('scripts/prepare-native-shared-observer.mjs') <
      script.indexOf('sudo useradd'),
  );
  assert.match(script, /test ! -x "\$pn_repo"/);
  assert.match(script, /test ! -w "\$pn_payload"/);
  assert.match(script, /bash -s -- "\$pn_payload" "\$pn_node"/);
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

const observerNames = [
  'native-shared-editor.mjs',
  'native-webdriver-lib.mjs',
  'native-ui-lib.mjs',
  'native-dialog.py',
  'native-close-window.py',
];
async function observerSource(t, mode = 0o700) {
  const source = await mkdtemp(join(tmpdir(), 'pn-observer-source-'));
  t.after(() => rm(source, { recursive: true, force: true }));
  await chmod(source, mode);
  await mkdir(join(source, 'scripts'));
  for (const name of observerNames)
    await writeFile(join(source, 'scripts', name), `public observer ${name}\n`);
  await writeFile(
    join(source, '.env'),
    'private sentinel must never be copied',
  );
  await mkdir(join(source, '.git'));
  await writeFile(join(source, '.git', 'config'), 'private sentinel');
  return source;
}
test('observer payload copies only public fixed files from private or writable checkouts and publishes readonly modes', async (t) => {
  for (const mode of [0o700, 0o777]) {
    const source = await observerSource(t, mode);
    const payload = await prepareNativeSharedObserver(source);
    t.after(() => rm(payload, { recursive: true, force: true }));
    assert.match(payload, /^\/tmp\/pn-shared-observer-[A-Za-z0-9]{6}$/);
    assert.deepEqual((await readdir(payload)).sort(), ['bin', 'scripts']);
    assert.deepEqual(await readdir(join(payload, 'bin')), ['node']);
    const node = join(payload, 'bin', 'node');
    assert.equal((await stat(node)).mode & 0o7777, 0o755);
    assert.equal(
      execFileSync(node, ['--version'], {
        env: { PATH: '/usr/bin:/bin' },
        encoding: 'utf8',
        timeout: 5000,
      }),
      process.version + '\n',
    );
    assert.deepEqual(
      (await readdir(join(payload, 'scripts'))).sort(),
      [...observerNames].sort(),
    );
    for (const file of observerNames) {
      assert.equal(
        await readFile(join(payload, 'scripts', file), 'utf8'),
        `public observer ${file}\n`,
      );
      const metadata = await stat(join(payload, 'scripts', file));
      assert.equal(metadata.mode & 0o777, 0o644);
      assert.equal(metadata.uid, process.getuid());
    }
    for (const directory of [
      payload,
      join(payload, 'scripts'),
      join(payload, 'bin'),
    ])
      assert.equal((await stat(directory)).mode & 0o777, 0o755);
    assert.equal(
      (await stat(source)).mode & 0o777,
      mode,
      'helper never changes source permissions',
    );
  }
});
test('observer payload rejects missing, oversized and linked public files or source directories', async (t) => {
  const missing = await observerSource(t);
  await rm(join(missing, 'scripts', observerNames[0]));
  await assert.rejects(prepareNativeSharedObserver(missing));
  const oversized = await observerSource(t);
  await writeFile(
    join(oversized, 'scripts', observerNames[0]),
    Buffer.alloc(256 * 1024 + 1),
  );
  await assert.rejects(prepareNativeSharedObserver(oversized));
  const leaf = await observerSource(t);
  await rm(join(leaf, 'scripts', observerNames[0]));
  await symlink(join(leaf, '.env'), join(leaf, 'scripts', observerNames[0]));
  await assert.rejects(prepareNativeSharedObserver(leaf));
  const parent = await observerSource(t);
  await rm(join(parent, 'scripts'), { recursive: true });
  await symlink(join(leaf, 'scripts'), join(parent, 'scripts'));
  await assert.rejects(prepareNativeSharedObserver(parent));
  const root = await observerSource(t);
  await symlink(root, root + '-link');
  t.after(() => rm(root + '-link'));
  await assert.rejects(prepareNativeSharedObserver(root + '-link'));
});

test('host annotations expose only closed stages, codes and denial categories rather than diagnostic data', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'pn-observer-report-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const diagnostic = join(directory, 'diagnostic');
  const sentinel = 'private-report-sentinel';
  await writeFile(
    diagnostic,
    `bwrap: Operation not permitted ${sentinel} https://private.invalid/token\n`,
  );
  const script = await readFile('scripts/run-native-shared-editor.sh', 'utf8');
  const report = script.split("<<'REPORT'\n")[1].split('\nREPORT\n')[0];
  for (const [stage, status, expectedStage, expectedCode] of [
    ['observer_access', '1', 'observer_access', 1],
    ['checkout_ancestor_exposed', '2', 'checkout_ancestor_exposed', 2],
    ['observer_tmp_exposed', '2', 'observer_tmp_exposed', 2],
    [`journey%0A::error::${sentinel}`, `bad-${sentinel}`, 'unknown', 255],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-', directory, diagnostic],
      {
        input: report,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PN_HOST_STAGE: stage,
          PN_HOST_STATUS: status,
          PN_HOST_CLEAN: 'true',
          PN_HOST_FORCED: 'false',
          PN_HOST_RESIDUAL: 'false',
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      new RegExp(
        `^::error title=Native shared editor::stage=${expectedStage}; exitCode=${expectedCode}; cleanup=true; forced=false; residual=false; denialClasses=bubblewrap_message,operation_not_permitted; journeyStage=unknown; startupPhase=unknown; failureKind=unknown; dialogClasses=none\\n$`,
      ),
    );
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /private-report-sentinel|https:|%0A/,
    );
    const record = JSON.parse(
      await readFile(join(directory, 'infrastructure.json'), 'utf8'),
    );
    assert.equal(record.result, 'failed');
    assert.equal(record.stage, expectedStage);
    assert.equal(record.exitCode, expectedCode);
    assert.deepEqual(record.denials, [
      'bubblewrap_message',
      'operation_not_permitted',
    ]);
    assert.doesNotMatch(
      JSON.stringify(record),
      /private-report-sentinel|https:/,
    );
  }
});

function assertAncestorRefusal(source) {
  const begin = source.indexOf('pn_stage=checkout_ancestor_exposed\n');
  const end = source.indexOf('pn_stage=observer_access\n', begin);
  assert(begin >= 0 && end > begin);
  assert(begin > source.indexOf('pn_stage=role_sudo\n'));
  assert(end < source.indexOf('pn_stage=desktop_session\n'));
  const body = source.slice(begin, end);
  assert.match(body, /pn_ancestor=\$\(dirname "\$pn_repo"\)/);
  const query = `if ! sudo -H -u "$pn_role" /bin/sh -c 'if test -w "$1"; then exit 42; fi; exit 0' sh "$pn_ancestor"; then exit 2; fi`;
  const root = 'if [[ $pn_ancestor == / ]]; then break; fi';
  assert(body.includes(query));
  assert(body.indexOf(query) < body.indexOf(root));
  assert(
    body.indexOf(root) < body.indexOf('pn_ancestor=$(dirname "$pn_ancestor")'),
  );
  assert.match(body, /while :; do[\s\S]+\ndone\n$/);
}
test('ancestor source guard refuses write or query failure before launch and cannot omit the root check', async () => {
  // This inspects the security control, not a simulated fresh UID permission test.
  // The hosted launcher performs each effective-access query under its real UID.
  const source = await readFile('scripts/run-native-shared-editor.sh', 'utf8');
  assertAncestorRefusal(source);
  const query = `if ! sudo -H -u "$pn_role" /bin/sh -c 'if test -w "$1"; then exit 42; fi; exit 0' sh "$pn_ancestor"; then exit 2; fi`;
  const root = 'if [[ $pn_ancestor == / ]]; then break; fi';
  for (const [before, after] of [
    ['pn_stage=checkout_ancestor_exposed\n', ''],
    ['if test -w "$1"; then exit 42', 'if test -r "$1"; then exit 42'],
    ['if test -w "$1"; then exit 42', 'if test -w "$1"; then exit 0'],
    [query, query.replace('if ! sudo', 'if sudo')],
    [query, query.replace('then exit 2; fi', 'then :; fi')],
    [query + '\n  ' + root, root + '\n  ' + query],
  ])
    assert.throws(() => assertAncestorRefusal(source.replace(before, after)));
  assert.match(
    source,
    /pn_stage=observer_tmp_exposed\n\[\[ -d \/tmp && ! -L \/tmp && \$\(realpath -e \/tmp\) == \/tmp && \$\(stat -c %u \/tmp\) == 0 && \$\(stat -c %a \/tmp\) == 1777 \]\]/,
  );
});

test('runner report executes the immutable Node snapshot, removes its own payload and preserves failure on deletion refusal', async (t) => {
  const source = await observerSource(t);
  const payload = await prepareNativeSharedObserver(source);
  t.after(() => rm(payload, { recursive: true, force: true }));
  const evidence = await mkdtemp(join(tmpdir(), 'pn-observer-self-clean-'));
  t.after(() => rm(evidence, { recursive: true, force: true }));
  const diagnostic = join(evidence, 'diagnostic');
  await writeFile(diagnostic, '');
  const script = await readFile('scripts/run-native-shared-editor.sh', 'utf8');
  const report = script.split("<<'REPORT'\n")[1].split('\nREPORT\n')[0];
  const result = spawnSync(
    join(payload, 'bin', 'node'),
    ['--input-type=module', '-', evidence, diagnostic, payload],
    {
      input: report,
      encoding: 'utf8',
      timeout: 15000,
      env: {
        PATH: '/usr/bin:/bin',
        PN_HOST_STATUS: '1',
        PN_HOST_STAGE: 'journey',
        PN_HOST_CLEAN: 'true',
        PN_HOST_FORCED: 'false',
        PN_HOST_RESIDUAL: 'false',
      },
    },
  );
  assert.equal(result.status, 1, result.stderr);
  await assert.rejects(stat(payload), { code: 'ENOENT' });
  assert.equal(
    JSON.parse(await readFile(join(evidence, 'infrastructure.json'), 'utf8'))
      .cleanupVerified,
    true,
  );
  // An invalid cleanup pathname must fail even when every journey receipt/status
  // would otherwise pass. This is a reporter unit fixture, not a native claim.
  await writeFile(
    join(evidence, 'native-shared-editor.json'),
    JSON.stringify({
      schema: 1,
      result: 'passed',
      cleanupVerified: true,
      forcedCleanup: false,
    }),
  );
  const refusal = spawnSync(
    process.execPath,
    ['--input-type=module', '-', evidence, diagnostic, evidence],
    {
      input: report,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        PATH: '/usr/bin:/bin',
        PN_HOST_STATUS: '0',
        PN_HOST_STAGE: 'journey_finished',
        PN_HOST_CLEAN: 'true',
        PN_HOST_FORCED: 'false',
        PN_HOST_RESIDUAL: 'false',
      },
    },
  );
  assert.equal(refusal.status, 1);
  assert.equal(
    JSON.parse(await readFile(join(evidence, 'infrastructure.json'), 'utf8'))
      .result,
    'failed',
  );
  assert((await stat(evidence)).isDirectory());
  assert.equal(
    JSON.parse(await readFile(join(evidence, 'infrastructure.json'), 'utf8'))
      .cleanupVerified,
    false,
  );
  assert.ok(
    script.indexOf('pn_node="$pn_payload/bin/node"') <
      script.indexOf('sudo useradd'),
  );
  assert.match(script, /test ! -w "\$pn_payload\/bin"/);
  assert.match(script, /test ! -w "\$pn_node"/);
  assert.ok(
    script.indexOf('PATH=/usr/bin:/bin\n') < script.indexOf('sudo useradd'),
  );
  assert.doesNotMatch(script, /pn_stage=node_path_exposed/);
});

async function runJourneyReport(
  t,
  receipt,
  diagnosticText = '',
  outerStage = 'journey',
  startupPng,
) {
  const directory = await mkdtemp(join(tmpdir(), 'pn-journey-report-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const diagnostic = join(directory, 'diagnostic');
  await writeFile(diagnostic, diagnosticText);
  if (startupPng !== undefined)
    await writeFile(join(directory, 'screenshot-startup.png'), startupPng);
  if (receipt !== undefined)
    await writeFile(
      join(directory, 'native-shared-editor.json'),
      typeof receipt === 'string' || Buffer.isBuffer(receipt)
        ? receipt
        : JSON.stringify(receipt),
    );
  const script = await readFile('scripts/run-native-shared-editor.sh', 'utf8');
  const report = script.split("<<'REPORT'\n")[1].split('\nREPORT\n')[0];
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-', directory, diagnostic],
    {
      input: report,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        PATH: '/usr/bin:/bin',
        PN_HOST_STAGE: outerStage,
        PN_HOST_STATUS: '1',
        PN_HOST_CLEAN: 'true',
        PN_HOST_FORCED: 'false',
        PN_HOST_RESIDUAL: 'false',
      },
    },
  );
  assert.equal(result.status, 1);
  return {
    ...result,
    directory,
    record: JSON.parse(
      await readFile(join(directory, 'infrastructure.json'), 'utf8'),
    ),
  };
}
const journeyScope =
  'Installed shared editor, real chooser/keyboard/autosave/close/reopen; no React or containment acceptance';
const failedJourney = (values = {}) => ({
  schema: 1,
  result: 'failed',
  scope: journeyScope,
  stage: 'installed_startup',
  startupPhase: 'driver_session',
  failureKind: 'webdriver_unknown_error',
  ...values,
});

test('chooser advisory classes recognize only fixed terminal helper exceptions', async (t) => {
  const terminals = [
    [
      'AssertionError: Native dialog not visible for PID 123: Choose local vault',
      'dialog_window_missing',
    ],
    [
      'AssertionError: Ambiguous native dialogs for PID 123: Choose local vault',
      'dialog_window_ambiguous',
    ],
    [
      'AssertionError: Native location entry did not focus',
      'dialog_location_unfocused',
    ],
    [
      'AssertionError: Native location entry did not echo the exact fixture path',
      'dialog_location_echo_mismatch',
    ],
    [
      'AssertionError: Native dialog did not acknowledge choose-folder: Choose local vault',
      'dialog_dismissal_unconfirmed',
    ],
    [
      "ModuleNotFoundError: No module named 'pyatspi'",
      'dialog_pyatspi_missing',
    ],
    [
      "RuntimeError: Native window query failed: '' 'private-helper-sentinel'",
      'dialog_window_query_failed',
    ],
  ];
  for (const stage of ['authorized_vault_chooser', 'fresh_launch_reopen']) {
    for (const [terminal, category] of terminals) {
      const observed = await runJourneyReport(
        t,
        failedJourney({
          stage,
          startupPhase: 'complete',
          failureKind: 'other',
        }),
        terminal + '\n',
      );
      assert.deepEqual(observed.record.dialogClasses, [category]);
      assert.match(
        observed.stdout,
        new RegExp(`; dialogClasses=${category}\\n$`),
      );
      assert.equal(observed.record.result, 'failed');
      assert.doesNotMatch(
        observed.stdout + observed.stderr + JSON.stringify(observed.record),
        /private-helper-sentinel|PID 123|AssertionError|ModuleNotFoundError|RuntimeError/,
      );
    }
  }
});

test('chooser diagnostics reject source lines, injected near-matches and foreign or unfinished journeys', async (t) => {
  const terminal = 'AssertionError: Native location entry did not focus';
  const receipt = failedJourney({
    stage: 'authorized_vault_chooser',
    startupPhase: 'complete',
    failureKind: 'other',
  });
  for (const diagnostic of [
    `    ${terminal}\n`,
    `'${terminal}'\n`,
    `assert False, '${terminal}'\n`,
    terminal + ' private-helper-sentinel\n',
    terminal + '%0A::error::private-helper-sentinel\n',
    'AssertionError:\nNative location entry did not focus\n',
    'Operation not permitted\n',
    'dbus.exceptions.DBusException: Operation not permitted\n',
    "ModuleNotFoundError: No module named 'private-helper-sentinel'\n",
    'AssertionError: Native dialog not visible for PID 123: foreign title\n',
  ]) {
    const observed = await runJourneyReport(t, receipt, diagnostic);
    assert.deepEqual(observed.record.dialogClasses, []);
    assert.doesNotMatch(
      observed.stdout + observed.stderr + JSON.stringify(observed.record),
      /private-helper-sentinel|%0A|foreign title/,
    );
  }
  for (const foreign of [
    undefined,
    'not JSON',
    failedJourney({ ...receipt, scope: 'foreign' }),
    failedJourney({ ...receipt, result: 'passed' }),
    failedJourney({ ...receipt, startupPhase: 'product_ready' }),
    failedJourney({ ...receipt, failureKind: 'os_eperm' }),
    failedJourney({ ...receipt, stage: 'source_autosave' }),
  ]) {
    const observed = await runJourneyReport(t, foreign, terminal + '\n');
    assert.deepEqual(observed.record.dialogClasses, []);
  }
  const setup = await runJourneyReport(
    t,
    receipt,
    terminal + '\n',
    'driver_start',
  );
  assert.deepEqual(setup.record.dialogClasses, []);
});

test('startup screenshot is captured once after product readiness and all fixed artifact lists include it', async () => {
  const script = await readFile('scripts/native-shared-editor.mjs', 'utf8');
  const capture = "await screenshot('screenshot-startup.png')";
  const at = script.indexOf(capture);
  assert.ok(at > script.indexOf('const first = await start()'));
  assert.ok(at < script.indexOf("stage = 'authorized_vault_chooser'"));
  assert.equal(script.split(capture).length - 1, 1);
  const launcher = await readFile(
    'scripts/run-native-shared-editor.sh',
    'utf8',
  );
  assert.match(
    launcher,
    /for pn_name in native-shared-editor\.json screenshot-startup\.png screenshot-source\.png screenshot-preview\.png;/,
  );
  assert.match(
    launcher,
    /for \(const name of \['screenshot-startup\.png', 'screenshot-source\.png', 'screenshot-preview\.png'\]\)/,
  );
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.equal(
    workflow.split('.cache/native-shared-evidence/screenshot-startup.png')
      .length - 1,
    1,
  );
});

test('startup PNG remains available after a chooser failure only within the existing header and size bounds', async (t) => {
  const receipt = failedJourney({
    stage: 'authorized_vault_chooser',
    startupPhase: 'complete',
    failureKind: 'other',
  });
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  const valid = await runJourneyReport(t, receipt, '', 'journey', png);
  assert.deepEqual(
    await readFile(join(valid.directory, 'screenshot-startup.png')),
    png,
  );
  assert.equal(valid.record.result, 'failed');
  for (const bytes of [
    Buffer.from('private-not-a-png'),
    Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]),
  ]) {
    const invalid = await runJourneyReport(t, receipt, '', 'journey', bytes);
    await assert.rejects(
      stat(join(invalid.directory, 'screenshot-startup.png')),
      { code: 'ENOENT' },
    );
    assert.equal(invalid.record.result, 'failed');
  }
});
test('host publishes only this journey scope and exact closed inner diagnostics', async (t) => {
  for (const stage of [
    'preflight',
    'installed_startup',
    'authorized_vault_chooser',
    'source_autosave',
    'undo_redo',
    'invalid_source_autosave',
    'source_preview_switch',
    'preview_caret_autosave',
    'preview_undo_redo',
    'document_close_reopen',
    'os_close',
    'fresh_launch_reopen',
    'final_os_close',
  ]) {
    const observed = await runJourneyReport(t, failedJourney({ stage }));
    assert.equal(observed.record.journeyStage, stage);
    assert.equal(observed.record.startupPhase, 'driver_session');
    assert.equal(observed.record.failureKind, 'webdriver_unknown_error');
    assert.match(
      observed.stdout,
      new RegExp(
        `journeyStage=${stage}; startupPhase=driver_session; failureKind=webdriver_unknown_error`,
      ),
    );
  }
  for (const receipt of [
    undefined,
    'not json',
    null,
    [],
    Buffer.alloc(65537, 32),
    failedJourney({ schema: 2 }),
    failedJourney({ scope: 'foreign scope' }),
    failedJourney({ result: 'arbitrary' }),
  ]) {
    const observed = await runJourneyReport(t, receipt);
    assert.equal(observed.record.journeyStage, 'unknown');
    assert.equal(observed.record.startupPhase, undefined);
    assert.equal(observed.record.failureKind, undefined);
  }
  const stale = await runJourneyReport(
    t,
    failedJourney(),
    '',
    'observer_access',
  );
  assert.equal(stale.record.journeyStage, 'unknown');
  assert.equal(stale.record.startupPhase, undefined);
});
test('journey annotation rejects injected/unknown values and recognizes only the exact namespace denial', async (t) => {
  const sentinel = 'private-inner-token';
  const injected = await runJourneyReport(
    t,
    failedJourney({
      stage: `installed_startup%0A${sentinel}`,
      startupPhase: `driver_session https://${sentinel}.invalid`,
      failureKind: { message: sentinel },
    }),
  );
  assert.equal(injected.record.journeyStage, 'unknown');
  assert.equal(injected.record.startupPhase, undefined);
  assert.equal(injected.record.failureKind, undefined);
  assert.doesNotMatch(
    injected.stdout + injected.stderr + JSON.stringify(injected.record),
    /private-inner-token|https:|%0A/,
  );
  const exact = 'bwrap: Creating new namespace failed: Operation not permitted';
  assert(
    (
      await runJourneyReport(t, undefined, exact + '\n')
    ).record.denials.includes('bubblewrap_namespace_denied'),
  );
  for (const text of [
    'Operation not permitted',
    'prefix ' + exact,
    exact + ' https://private.invalid',
  ])
    assert(
      !(await runJourneyReport(t, undefined, text)).record.denials.includes(
        'bubblewrap_namespace_denied',
      ),
    );
});

test('journey diagnostics preserve only exact OS errno classes and executable/process capture phases', async (t) => {
  for (const [startupPhase, failureKind] of [
    ['executable_identity', 'os_eperm'],
    ['process_capture', 'os_eacces'],
    ['executable_identity', 'os_enoent'],
    ['process_capture', 'os_esrch'],
  ]) {
    const observed = await runJourneyReport(
      t,
      failedJourney({ startupPhase, failureKind }),
    );
    assert.equal(observed.record.startupPhase, startupPhase);
    assert.equal(observed.record.failureKind, failureKind);
    assert.match(
      observed.stdout,
      new RegExp(`startupPhase=${startupPhase}; failureKind=${failureKind}`),
    );
  }
  for (const [startupPhase, failureKind] of [
    ['executable_identity_extra', 'os_enoent '],
    ['process_capture%0A::error::private-errno', 'EPERM'],
    [{ message: 'private-errno' }, { code: 'EACCES' }],
  ]) {
    const observed = await runJourneyReport(
      t,
      failedJourney({ startupPhase, failureKind }),
    );
    assert.equal(observed.record.journeyStage, 'installed_startup');
    assert.equal(observed.record.startupPhase, undefined);
    assert.equal(observed.record.failureKind, undefined);
    assert.doesNotMatch(
      observed.stdout + observed.stderr + JSON.stringify(observed.record),
      /private-errno|%0A|EPERM|EACCES|executable_identity_extra/,
    );
  }
});
