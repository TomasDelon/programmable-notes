/** Read-only provenance/hash gate; CLI also runs the existing production inspector. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = /^[a-f0-9]{40}$/;
export function validateRequest(expected) {
  assert.match(expected.runId, /^[1-9][0-9]{0,15}$/);
  assert.ok(Number.isSafeInteger(Number(expected.runId)));
  assert.match(
    expected.repository,
    /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/,
  );
  assert.match(expected.headSha, revision);
  assert.equal(typeof expected.branch, 'string');
  assert.ok(
    expected.branch.length > 0 &&
      expected.branch.length <= 255 &&
      !/[\r\n\0]/.test(expected.branch),
  );
}
export function validateRun(run, jobs, expected) {
  validateRequest(expected);
  assert.equal(String(run.id), expected.runId);
  assert.equal(run.name, 'CI');
  assert.equal(run.path, '.github/workflows/ci.yml');
  assert.equal(run.head_sha, expected.headSha);
  assert.equal(run.head_branch, expected.branch);
  assert.equal(run.repository?.full_name, expected.repository);
  assert.equal(run.head_repository?.full_name, expected.repository);
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  assert.ok(Number.isSafeInteger(jobs.total_count) && jobs.total_count <= 100);
  assert.equal(jobs.jobs?.length, jobs.total_count);
  for (const name of ['check', 'native-check']) {
    const matches = jobs.jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].status, 'completed');
    assert.equal(matches[0].conclusion, 'success');
  }
}
async function regularFile(path, limit) {
  const metadata = await lstat(path);
  assert.ok(
    metadata.isFile() && metadata.size > 0 && metadata.size <= limit,
    'Invalid artifact file',
  );
  return readFile(path);
}
export async function verifyDownloadedArtifact(
  directory,
  expectedTree,
  config,
) {
  assert.match(expectedTree, revision);
  assert.ok(
    (await lstat(directory)).isDirectory(),
    'Invalid artifact directory',
  );
  const manifest = JSON.parse(
    await regularFile(join(directory, 'build.json'), 65536),
  );
  const filename = `${config.productName}_${config.version}_amd64.deb`;
  assert.ok(!/[/\\\r\n\0]/.test(filename));
  assert.equal(manifest.file, filename);
  assert.equal(manifest.version, config.version);
  assert.match(manifest.sourceRevision, revision);
  // A PR merge revision can differ from the branch head. Identical trees are
  // required; silently accepting a package built from different source is not.
  assert.equal(manifest.sourceTree, expectedTree);
  assert.equal(manifest.platform, 'linux-amd64-deb');
  assert.equal(manifest.installedRuntimeVerified, false);
  assert.equal(manifest.productionSecurityReadiness, false);
  assert.equal(manifest.deliveryClass, 'engineering-test');
  assert.ok(Number.isSafeInteger(manifest.bytes) && manifest.bytes > 0);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  const packagePath = join(resolve(directory), filename);
  const bytes = await regularFile(packagePath, 1024 * 1024 * 1024);
  assert.equal(bytes.length, manifest.bytes);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    manifest.sha256,
  );
  assert.equal(
    String(await regularFile(join(directory, 'SHA256SUMS'), 4096)),
    `${manifest.sha256}  ${filename}\n`,
  );
  return packagePath;
}
async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--run') {
    const expected = {
      runId: process.env.PN_NATIVE_SHARED_RUN,
      repository: process.env.GITHUB_REPOSITORY,
      headSha: process.env.GITHUB_SHA,
      branch: process.env.GITHUB_REF_NAME,
    };
    validateRequest(expected);
    assert.ok(process.env.GH_TOKEN, 'Missing read-only Actions credential');
    const endpoint = `https://api.github.com/repos/${expected.repository}/actions/runs/${expected.runId}`;
    const request = async (path) => {
      const response = await fetch(path, {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(20000),
      });
      assert.equal(response.ok, true, 'Actions metadata unavailable');
      return response.json();
    };
    const run = await request(endpoint);
    const jobs = await request(`${endpoint}/jobs?filter=latest&per_page=100`);
    validateRun(run, jobs, expected);
    console.log('NATIVE_SHARED_REQUIRED_CI_VERIFIED');
    return;
  }
  assert.equal(process.argv.length, 4);
  assert.equal(process.argv[2], '--artifact');
  const config = JSON.parse(
    await readFile('src-tauri/tauri.conf.json', 'utf8'),
  );
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    encoding: 'utf8',
  }).trim();
  const pkg = await verifyDownloadedArtifact(
    resolve(process.argv[3]),
    tree,
    config,
  );
  execFileSync(process.execPath, ['scripts/verify-linux-package.mjs', pkg], {
    stdio: 'inherit',
    timeout: 60000,
  });
  assert.ok(process.env.GITHUB_OUTPUT, 'Missing workflow output file');
  assert.ok(!/[\r\n]/.test(pkg));
  await appendFile(process.env.GITHUB_OUTPUT, `package=${pkg}\n`);
  console.log('NATIVE_SHARED_PRODUCTION_ARTIFACT_VERIFIED');
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch {
    console.error('NATIVE_SHARED_ARTIFACT_REFUSED');
    process.exitCode = 1;
  }
}
