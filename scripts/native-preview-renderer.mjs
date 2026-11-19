/** Installed preview-renderer loss and recovery; external identity-bound kill only. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  artifact,
  systemctl,
  script,
} from './native-webdriver-lib.mjs';
import { rootPid, button, pause, waitUi, previewUi } from './native-ui-lib.mjs';
assert.equal(
  process.argv.length,
  2,
  'Preview renderer probe accepts no options',
);
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_EVIDENCE_DIR);
const evidence = process.env.NATIVE_EVIDENCE_DIR;
const report = {
  scope:
    'installed production preview renderer loss, explicit restart and Stop',
  observerSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
};
let failure;
let group;
const ownedGroups = [];
async function identity(pid) {
  return {
    pid,
    startTick: (await readFile(`/proc/${pid}/stat`, 'utf8'))
      .split(') ')
      .at(-1)
      .split(' ')[19],
    executableSha256: createHash('sha256')
      .update(await readFile(`/proc/${pid}/exe`))
      .digest('hex'),
  };
}
async function cleanupRoot(root) {
  try {
    assert.deepEqual(await identity(root.pid), root);
    process.kill(root.pid, 'SIGTERM');
    for (let i = 0; i < 100; i++) {
      try {
        assert.deepEqual(await identity(root.pid), root);
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
        return;
      }
      await pause(100);
    }
    throw Error('Owned editor must exit after test cleanup');
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
  }
}
function rememberGroup(unit, path) {
  assert.match(
    unit,
    new RegExp(
      '^programmable-notes-preview-' + report.root.pid + '-[0-9]+\\.service$',
    ),
  );
  assert.ok(path.startsWith('/user.slice/') && path.endsWith('/' + unit));
  assert.ok(!path.split('/').includes('..'));
  ownedGroups.push({ unit, group: path });
}
async function groupEmpty(path) {
  for (let n = 0; n < 100; n++) {
    try {
      if (
        (
          await readFile('/sys/fs/cgroup' + path + '/cgroup.procs', 'utf8')
        ).trim() === ''
      )
        return true;
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      if (error.code !== 'ENODEV') throw error;
    }
    await pause(100);
  }
  return false;
}
async function noEditorNotice(pid) {
  const deadline = Date.now() + 2000;
  for (;;) {
    const r = spawnSync(
      'xdotool',
      [
        'search',
        '--all',
        '--onlyvisible',
        '--pid',
        String(pid),
        '--name',
        '^Editor stopped$',
      ],
      { encoding: 'utf8', timeout: 8000 },
    );
    if (
      r.status !== 0 &&
      /BadWindow|BadDrawable/.test(r.stderr) &&
      Date.now() < deadline
    ) {
      await pause(50);
      continue;
    }
    assert.equal(r.status, 1, String(r.error || r.stderr || r.stdout));
    assert.equal(r.stderr.trim(), '');
    assert.equal(r.stdout.trim(), '');
    return true;
  }
}
try {
  await launch();
  report.root = await identity(await rootPid());
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  const html = await artifact(
    await readFile('docs/handoff/samples/fixtures/counter.mdx', 'utf8'),
  );
  const requested = performance.now();
  const result = await invoke('start_preview', { html });
  assert.equal(result.ok, true);
  report.unit = result.value;
  const main = Number(
    systemctl('show', '--property=MainPID', '--value', report.unit),
  );
  assert.ok(main > 1);
  report.preview = await identity(main);
  group = systemctl(
    'show',
    '--property=ControlGroup',
    '--value',
    report.unit,
  ).trim();
  assert.ok(group.startsWith('/user.slice/'));
  rememberGroup(report.unit, group);
  report.group = group;
  previewUi(main, 'Count: 0');
  previewUi(main, 'Count: 1', 'find');
  report.beforeKillCounter = true;
  await writeFile(
    join(evidence, 'kill-preview-renderer.json'),
    JSON.stringify({
      root: report.root,
      preview: report.preview,
      unit: report.unit,
    }),
    { flag: 'wx' },
  );
  for (let i = 0; i < 300; i++) {
    try {
      report.receipt = JSON.parse(
        await readFile(join(evidence, 'preview-renderer-killed.json'), 'utf8'),
      );
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await pause(100);
    }
  }
  const receipt = report.receipt;
  assert.ok(receipt, 'External identity-bound kill receipt required');
  for (const key of ['pid', 'startTick', 'executableSha256'])
    assert.equal(receipt.root[key], report.root[key]);
  for (const key of ['pid', 'startTick'])
    assert.equal(receipt.preview[key], report.preview[key]);
  assert.equal(receipt.unit, report.unit);
  assert.equal(receipt.preview.uid, process.getuid());
  assert.equal(receipt.renderer.uid, process.getuid());
  assert.equal(
    receipt.renderer.exe,
    '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebProcess',
  );
  assert.ok(Number.isInteger(receipt.renderer.pid) && receipt.renderer.pid > 1);
  assert.match(receipt.renderer.executableSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.signal, 'SIGKILL');
  assert.equal(receipt.rootSurvived, true);
  assert.match(receipt.killMonotonicNs, /^[0-9]+$/);
  const killTime = BigInt(receipt.killMonotonicNs);
  assert.ok(killTime > 0n && killTime <= process.hrtime.bigint());
  report.samples = [];
  for (let i = 0; i < 10; i++) {
    const active = await invoke('preview_connection_active');
    assert.equal(active.ok, true);
    report.samples.push({
      elapsedMs: performance.now() - requested,
      sinceKillMs: Number(process.hrtime.bigint() - killTime) / 1e6,
      connectionActive: active.value,
    });
    if (!active.value) break;
    await pause(500);
  }
  console.log('PREVIEW_RENDERER_HEALTH', JSON.stringify(report));
  assert.ok(
    report.samples.at(-1).elapsedMs < 55000,
    'Natural expiry must not satisfy renderer-loss propagation',
  );
  assert.ok(
    report.samples.at(-1).sinceKillMs < 5000,
    'Disconnect must be observed within five seconds of the verified kill',
  );
  assert.equal(
    report.samples.at(-1).connectionActive,
    false,
    'Preview must promptly disconnect when its renderer is gone',
  );
  assert.equal((await invoke('host_probe')).ok, true);
  assert.equal(
    await script(
      'arguments[arguments.length-1](Boolean(document.querySelector(".cm-content")));',
    ),
    true,
  );
  report.noEditorNotice = await noEditorNotice(report.root.pid);
  assert.equal((await invoke('stop_preview')).ok, true);
  assert.equal(await groupEmpty(group), true);
  report.failedGroupEmpty = true;
  const restartedAt = performance.now();
  const restart = await invoke('start_preview', { html });
  assert.equal(restart.ok, true);
  report.restartedUnit = restart.value;
  assert.notEqual(report.restartedUnit, report.unit);
  group = systemctl(
    'show',
    '--property=ControlGroup',
    '--value',
    restart.value,
  ).trim();
  assert.ok(group.startsWith('/user.slice/'));
  rememberGroup(restart.value, group);
  report.restartedGroup = group;
  const rebuiltPid = Number(
    systemctl('show', '--property=MainPID', '--value', restart.value),
  );
  assert.ok(rebuiltPid > 1);
  report.restartedPreview = await identity(rebuiltPid);
  previewUi(rebuiltPid, 'Count: 0');
  previewUi(rebuiltPid, 'Count: 1', 'find');
  assert.deepEqual(await invoke('preview_connection_active'), {
    ok: true,
    value: true,
  });
  report.restartedCounter = true;
  report.stopRequestElapsedMs = performance.now() - restartedAt;
  assert.ok(
    report.stopRequestElapsedMs < 50000,
    'Reserve Stop observation time before earliest expiry',
  );
  assert.equal((await invoke('stop_preview')).ok, true);
  assert.equal(await groupEmpty(group), true);
  assert.ok(
    performance.now() - restartedAt < 55000,
    'Expiry cannot satisfy explicit Stop',
  );
  assert.deepEqual(await invoke('preview_connection_active'), {
    ok: true,
    value: false,
  });
  report.stopBeforeExpiry = true;
  assert.deepEqual(await identity(report.root.pid), report.root);
  report.noEditorNoticeAfterRestart = await noEditorNotice(report.root.pid);
  report.outcome = 'pass';
} catch (error) {
  failure = error;
  report.outcome = 'fail';
  report.error = String(error);
} finally {
  try {
    const stop = await invoke('stop_preview');
    assert.equal(stop.ok, true);
    if (group) assert.equal(await groupEmpty(group), true);
    report.cleanupGroupEmpty = true;
  } catch (error) {
    failure = new AggregateError(
      failure ? [failure, error] : [error],
      'Preview probe or owned group cleanup failed',
    );
    report.cleanupError = String(error);
  }
  try {
    await close();
  } catch (error) {
    failure = new AggregateError(
      failure ? [failure, error] : [error],
      'Preview probe or editor close failed',
    );
    report.closeError = String(error);
  }
  if (report.root) {
    try {
      await cleanupRoot(report.root);
      report.ownedRootAbsent = true;
    } catch (error) {
      failure = new AggregateError(
        failure ? [failure, error] : [error],
        'Probe or identity-bound Root cleanup failed',
      );
      report.rootCleanupError = String(error);
    }
  }
  for (const owned of ownedGroups) {
    try {
      if (!(await groupEmpty(owned.group))) systemctl('stop', owned.unit);
      assert.equal(await groupEmpty(owned.group), true);
    } catch (error) {
      failure = new AggregateError(
        failure ? [failure, error] : [error],
        'Owned cgroup cleanup failed',
      );
      report.fallbackGroupCleanupError = String(error);
    }
  }
  if (failure) report.outcome = 'fail';
  await writeFile(
    join(evidence, 'preview-renderer.json'),
    JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log('NATIVE_PREVIEW_RENDERER_RESULT', JSON.stringify(report));
}
if (failure) throw failure;
