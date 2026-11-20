/** Download attempts from actual MDX, in the installed ordinary production child. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import {
  readFile,
  readlink,
  readdir,
  writeFile,
  access,
} from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import {
  preflight,
  launch,
  close,
  invoke,
  artifact,
  systemctl,
} from './native-webdriver-lib.mjs';
import { button, rootPid, previewUi, waitUi, pause } from './native-ui-lib.mjs';
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR);
assert.ok(process.env.NATIVE_EVIDENCE_DIR);
const prefix = 'pn-mdx-download-' + randomUUID();
const report = {
  scope: 'Installed production supervised MDX; no child automation',
  prefix,
};
const output = join(process.env.NATIVE_EVIDENCE_DIR, 'mdx-downloads.json');
await writeFile(output, '{}\n', { flag: 'wx' });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
report.observerSha256 = digest(await readFile(new URL(import.meta.url)));
const source = `import {useEffect, useState} from 'react';

export function Downloads() {
  const [label, setLabel] = useState('Download attempts starting');
  function attempt(kind) {
    const urls = ['data:text/plain,synthetic-canary', URL.createObjectURL(new Blob(['synthetic-canary'], {type:'text/plain'}))];
    urls.forEach((url, i) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = '${prefix}-' + kind + '-' + i + '.txt';
      document.body.append(a);
      a.click();
      a.remove();
    });
    URL.revokeObjectURL(urls[1]);
  }
  useEffect(() => { attempt('automatic'); setLabel('Automatic download attempts complete'); }, []);
  return <button onClick={() => { attempt('user'); setLabel('User download attempts complete'); }}>{label}</button>;
}

<Downloads />
`;
report.fixtureSha256 = digest(source);
let failure;
let stopped = false;
try {
  await launch();
  await waitUi("!!document.querySelector('.cm-content')");
  await button('Stop preview');
  const editorPid = await rootPid();
  report.executableSha256 = digest(await readFile(`/proc/${editorPid}/exe`));
  const html = await artifact(source);
  const requested = performance.now();
  const started = await invoke('start_preview', { html });
  assert.equal(started.ok, true, JSON.stringify(started));
  report.unit = started.value;
  assert.match(report.unit, /^programmable-notes-preview-\d+-\d+\.service$/);
  const group = systemctl(
    'show',
    '--property=ControlGroup',
    '--value',
    report.unit,
  );
  assert.ok(group.startsWith('/user.slice/'));
  report.group = group;
  const root = '/sys/fs/cgroup' + group;
  const pid = Number(
    systemctl('show', '--property=MainPID', '--value', report.unit),
  );
  assert.ok(pid > 0);
  report.pid = pid;
  assert.equal(
    digest(await readFile(`/proc/${pid}/exe`)),
    report.executableSha256,
    'Editor/preview executable mismatch',
  );
  const env = (await readFile(`/proc/${pid}/environ`, 'utf8')).split('\0');
  assert.ok(env.includes('TAURI_WEBVIEW_AUTOMATION=false'));
  assert.ok(
    !env.some((line) =>
      line.startsWith('WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS='),
    ),
  );
  assert.match(
    await readFile(`/proc/${pid}/status`, 'utf8'),
    /NoNewPrivs:\s+1/,
  );
  report.privateNetwork = await readlink(`/proc/${pid}/ns/net`);
  assert.notEqual(report.privateNetwork, await readlink('/proc/self/ns/net'));
  report.policy = {};
  for (const name of ['cpu.max', 'memory.max', 'memory.swap.max', 'pids.max']) {
    report.policy[name] = (await readFile(join(root, name), 'utf8')).trim();
  }
  assert.equal(report.policy['memory.max'], '536870912');
  assert.equal(report.policy['memory.swap.max'], '0');
  assert.equal(report.policy['pids.max'], '128');
  const [quota, period] = report.policy['cpu.max'].split(/\s+/).map(Number);
  assert.ok(quota > 0 && quota <= period / 4);
  report.childCwd = await readlink(`/proc/${pid}/cwd`);
  previewUi(pid, 'Automatic download attempts complete', 'find');
  report.automaticAttemptsObserved = true;
  previewUi(pid, 'Automatic download attempts complete');
  previewUi(pid, 'User download attempts complete', 'find');
  report.userAttemptsObserved = true;
  await pause(1000);
  report.scannedDirectories = [];
  for (const dir of new Set([
    homedir(),
    join(homedir(), 'Downloads'),
    process.cwd(),
    report.childCwd,
  ])) {
    try {
      const names = await readdir(dir);
      assert.deepEqual(
        names.filter((name) => name.startsWith(prefix)),
        [],
        'MDX wrote a download canary',
      );
      report.scannedDirectories.push(dir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  assert.deepEqual(await invoke('host_probe'), {
    ok: true,
    value: 'editor-host-only',
  });
  assert.equal((await invoke('stop_preview')).ok, true);
  stopped = true;
  await assert.rejects(access(root), { code: 'ENOENT' });
  report.stopCleanupElapsedMs = performance.now() - requested;
  assert.ok(
    report.stopCleanupElapsedMs < 60000,
    'Cleanup must finish before the earliest possible expiry',
  );
  report.groupRemovedAfterStop = true;
} catch (error) {
  failure = error;
  report.error = String(error);
} finally {
  if (!stopped) {
    try {
      report.failureStop = await invoke('stop_preview');
    } catch (error) {
      report.failureStop = String(error);
    }
  }
  await close().catch((error) => {
    failure ||= error;
    report.closeError = String(error);
  });
  report.outcome = failure ? 'fail' : 'pass';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('NATIVE_MDX_DOWNLOAD_EVIDENCE', output);
}
if (failure) throw failure;
console.log(
  'PASS actual automatic and clicked MDX data/Blob attempts, no download files, editor IPC and Stop',
);
