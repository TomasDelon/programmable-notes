import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const helper = 'scripts/ci-ubuntu-apt.sh';
const official = '/etc/apt/sources.list.d/ubuntu.sources';
const expected = `Dir::Etc::sourcelist "${official}";\nDir::Etc::sourceparts "-";\n`;
const config = () =>
  execFileSync('bash', [helper, '--print-config'], { encoding: 'utf8' });

test('fixed configuration selects one existing Ubuntu source and leaves authentication defaults intact', () => {
  assert.equal(config(), expected);
  const source = readFileSync(helper, 'utf8');
  assert.match(
    source,
    /\[\[ -f \$pn_ubuntu_source && -r \$pn_ubuntu_source && -s \$pn_ubuntu_source \]\]/,
  );
  assert.ok(
    source.indexOf('Expected Ubuntu source configuration is absent') <
      source.indexOf('install -m 0644'),
  );
  assert.doesNotMatch(
    source,
    /\brm\b|AllowUnauthenticated|AllowInsecure|AllowDowngradeToInsecure|Check-Valid-Until|Check-Date|trusted=yes|Trusted:/i,
  );
});

test('real APT URI planning excludes unrelated sources; omitting the filter exposes them', () => {
  const root = mkdtempSync(join(tmpdir(), 'pn-apt-selection-'));
  try {
    const etc = join(root, 'etc');
    const parts = join(etc, 'sources.list.d');
    const lists = join(root, 'lists');
    mkdirSync(parts, { recursive: true });
    mkdirSync(join(lists, 'partial'), { recursive: true });
    mkdirSync(join(etc, 'apt.conf.d'));
    writeFileSync(join(etc, 'apt.conf'), '');
    writeFileSync(
      join(parts, 'ubuntu.sources'),
      'Types: deb\nURIs: https://archive.ubuntu.com/ubuntu\nSuites: noble\nComponents: main\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n',
    );
    writeFileSync(
      join(parts, 'unrelated.list'),
      'deb https://packages.microsoft.com/repos/code stable main\n',
    );
    writeFileSync(
      join(etc, 'sources.list'),
      'deb https://unrelated.invalid/repository stable main\n',
    );
    const baseline = `Dir::Etc "${etc}";\nDir::Etc::main "${etc}/apt.conf";\nDir::Etc::parts "${etc}/apt.conf.d";\nDir::State::lists "${lists}";\nDir::Cache "${root}/cache";\nDebug::NoLocking "true";\n`;
    const plan = (filtered) => {
      const path = join(root, filtered ? 'filtered.conf' : 'baseline.conf');
      const filter = config().replace(official, join(parts, 'ubuntu.sources'));
      writeFileSync(path, baseline + (filtered ? filter : ''));
      return execFileSync('/usr/bin/apt-get', ['--print-uris', 'update'], {
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, APT_CONFIG: path, LC_ALL: 'C' },
      });
    };
    const filtered = plan(true);
    assert.match(
      filtered,
      /https:\/\/archive\.ubuntu\.com\/ubuntu\/dists\/noble\/InRelease/,
    );
    assert.doesNotMatch(
      filtered,
      /packages\.microsoft\.com|unrelated\.invalid/,
    );
    const omitted = plan(false);
    assert.match(omitted, /packages\.microsoft\.com/);
    assert.match(omitted, /unrelated\.invalid/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('shell syntax and argument validation require no privileged setup', () => {
  execFileSync('bash', ['-n', helper]);
  for (const args of [
    ['--repository', 'https://example.invalid'],
    ['--print-config', '/tmp/other'],
    ['--install'],
    ['--help'],
  ]) {
    const result = spawnSync('bash', [helper, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/);
    assert.equal(result.stdout, '');
  }
  const outsideCi = spawnSync('bash', [helper], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'false' },
  });
  assert.equal(outsideCi.status, 2);
  assert.match(outsideCi.stderr, /requires a disposable Ubuntu GitHub runner/);
});

function assertSetupBeforePackages(workflow) {
  const jobs = [...workflow.matchAll(/^ {2}([a-z][\w-]*):\n/gm)];
  const expectedJobs = [
    'check',
    'native-check',
    'deployment-check',
    'preview-input-regression',
    'native-preflight',
    'native-vm',
  ];
  for (const name of expectedJobs) {
    const index = jobs.findIndex((job) => job[1] === name);
    assert.ok(index >= 0);
    const section = workflow.slice(jobs[index].index, jobs[index + 1]?.index);
    const setup = section.indexOf('run: bash scripts/ci-ubuntu-apt.sh');
    const install = section.search(
      /apt-get |playwright install --with-deps|run: bash scripts\/native-hosted-preflight.sh/,
    );
    assert.ok(
      setup >= 0 && setup < install,
      `${name} must configure APT before any package install`,
    );
    assert.ok(section.indexOf('actions/checkout@') < setup);
    assert.equal(
      (section.match(/bash scripts\/ci-ubuntu-apt.sh/g) ?? []).length,
      1,
    );
  }
}

test('every direct or delegated APT/browser dependency job configures host sources first', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assertSetupBeforePackages(workflow);
  assert.throws(() =>
    assertSetupBeforePackages(
      workflow.replace('        run: bash scripts/ci-ubuntu-apt.sh\n', ''),
    ),
  );
});
