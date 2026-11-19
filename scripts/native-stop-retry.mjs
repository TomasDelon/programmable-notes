/** Actual installed native session feedback and manual recovery. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  script,
  invoke,
  systemctl,
} from './native-webdriver-lib.mjs';
import {
  rootPid,
  waitUi,
  button,
  dialog,
  fileIdle,
  pause,
} from './native-ui-lib.mjs';
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
const source =
  "import React from 'react'\n\nexport function SessionProbe(){const[n,setN]=React.useState(0);return <button onClick={()=>setN(n+1)}>Session count {n}</button>}\n\n<SessionProbe />\n";
const file = join(process.env.NATIVE_FIXTURE_DIR, 'stop-retry.mdx');
await writeFile(file, source, { flag: 'wx', mode: 0o640 });
const report = {
  scope:
    'installed UI-only Stop; optional external exec-failure and explicit retry',
  observerSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
};
const output = join(process.env.NATIVE_EVIDENCE_DIR, 'stop-retry.json');
let failure;
const ui = () =>
  script(
    `const done=arguments[arguments.length-1];done({build:document.querySelector('.build-status')?.textContent,session:document.querySelector('[aria-label="Native preview status"]')?.textContent??null,nativeNote:Array.from(document.querySelectorAll('p[role="note"]')).map(e=>e.textContent).filter(v=>v.includes('separate resource-limited')),alerts:Array.from(document.querySelectorAll('[role="alert"]')).map(e=>e.textContent)});`,
  );
const list = (pid) =>
  systemctl(
    'list-units',
    '--all',
    '--plain',
    '--no-legend',
    `programmable-notes-preview-${pid}-*.service`,
  )
    .split('\n')
    .filter(Boolean)
    .map((row) => row.trim().split(/\s+/)[0]);
try {
  await launch();
  const pid = await rootPid();
  report.editorPid = pid;
  report.executableSha256 = createHash('sha256')
    .update(await readFile(`/proc/${pid}/exe`))
    .digest('hex');
  await waitUi("!!document.querySelector('.cm-content')");
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  await button('Pause automatic recovery');
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', file);
  await fileIdle();
  const old = new Set(list(pid));
  await button('Rebuild preview');
  await waitUi(
    "document.querySelector('.build-status')?.textContent.startsWith('Compiled')",
  );
  for (let i = 0; i < 200; i++) {
    const candidate = list(pid).find((unit) => !old.has(unit));
    if (candidate) {
      const p = Number(
        systemctl('show', '--property=MainPID', '--value', candidate),
      );
      if (p > 0) {
        report.unit = candidate;
        report.previewPid = p;
        break;
      }
    }
    await pause(100);
  }
  assert.ok(report.unit, 'No new preview unit');
  report.policy = systemctl(
    'show',
    report.unit,
    '--property=MemoryMax,MemorySwapMax,CPUQuotaPerSecUSec,TasksMax,RuntimeMaxUSec,PrivateNetwork,ControlGroup',
  );
  execFileSync(
    'python3',
    [
      'scripts/native-atspi.py',
      String(report.previewPid),
      'Session count 0',
      'click',
    ],
    { timeout: 65000 },
  );
  execFileSync(
    'python3',
    [
      'scripts/native-atspi.py',
      String(report.previewPid),
      'Session count 1',
      'find',
    ],
    { timeout: 65000 },
  );
  await waitUi(
    `document.querySelector('[aria-label="Native preview status"]')?.textContent.includes('connected')`,
  );
  report.before = await ui();
  assert.equal(report.before.build, 'Compiled MDX');
  assert.equal(report.before.session, 'Preview session is connected.');
  assert.deepEqual(await invoke('preview_connection_active'), {
    ok: true,
    value: true,
  });
  const group = systemctl(
    'show',
    '--property=ControlGroup',
    '--value',
    report.unit,
  );
  const activationUsec = Number(
    systemctl(
      'show',
      '--property=ActiveEnterTimestampMonotonic',
      '--value',
      report.unit,
    ),
  );
  const monotonicUsec = () =>
    Number(
      execFileSync(
        'python3',
        [
          '-c',
          'import time; print(time.clock_gettime_ns(time.CLOCK_MONOTONIC) // 1000)',
        ],
        { encoding: 'utf8', timeout: 10000 },
      ).trim(),
    );
  assert.ok(Number.isSafeInteger(activationUsec) && activationUsec > 0);
  report.stopAgeUsec = monotonicUsec() - activationUsec;
  assert.ok(
    report.stopAgeUsec >= 0 && report.stopAgeUsec + 5000000 < 60000000,
    'Stop must fit before actual unit expiry',
  );
  if (process.argv.includes('--exec-stop-fault')) {
    const record = await readFile(`/proc/${pid}/stat`, 'utf8');
    await writeFile(
      join(process.env.NATIVE_EVIDENCE_DIR, 'fault-request.json'),
      JSON.stringify({
        pid,
        startTicks: record.slice(record.lastIndexOf(') ') + 2).split(' ')[19],
        executableSha256: report.executableSha256,
      }),
      { flag: 'wx' },
    );
    report.externalFaultRequested = true;
    await faultMarker('fault-ready', 15000);
    await button('Stop preview');
    await waitUi(
      `document.querySelector('.build-status')?.textContent==='Preview stop failed'`,
    );
    report.failedStop = await ui();
    assert.ok(
      report.failedStop.alerts.some((message) =>
        message.includes('Native stop failed'),
      ),
    );
    await access('/sys/fs/cgroup' + group);
    assert.deepEqual(await invoke('preview_connection_active'), {
      ok: true,
      value: true,
    });
    report.failedStopRetainedLiveGroup = true;
    await writeFile(
      join(process.env.NATIVE_EVIDENCE_DIR, 'fault-observed'),
      'UI Stop failed',
    );
    await faultMarker('fault-detached', 5000);
    report.explicitRetry = true;
  }
  report.retryAgeUsec = monotonicUsec() - activationUsec;
  assert.ok(
    report.retryAgeUsec + 3000000 < 60000000,
    'Retry observation must fit before expiry',
  );
  const stopRequested = performance.now();
  await button('Stop preview');
  while (performance.now() < stopRequested + 3000) {
    try {
      await access('/sys/fs/cgroup' + group);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      report.uiStopRemovedCgroup = true;
      break;
    }
    await pause(50);
  }
  assert.ok(
    monotonicUsec() < activationUsec + 60000000,
    'Natural expiry cannot establish Stop',
  );
  assert.equal(
    report.uiStopRemovedCgroup,
    true,
    'UI Stop did not remove cgroup within 3 seconds',
  );
  await waitUi(
    `document.querySelector('.build-status')?.textContent==='Preview stopped'`,
  );
  assert.deepEqual(await invoke('preview_connection_active'), {
    ok: true,
    value: false,
  });
  report.afterStop = await ui();
  assert.equal(report.afterStop.session, null);
  assert.ok(
    !report.afterStop.alerts.some((message) =>
      message.includes('Native stop failed'),
    ),
  );
  assert.equal(await readFile(file, 'utf8'), source);
  assert.equal((await stat(file)).mode & 0o777, 0o640);
  report.outcome = 'pass';
} catch (error) {
  failure = error;
  report.outcome = 'fail';
  report.error = String(error);
  report.failureUi = await ui().catch((error) => ({ error: String(error) }));
  if (report.unit) {
    report.unitDiagnostics = systemctl(
      'show',
      report.unit,
      '--property=ActiveState,Result,ExecMainStatus,CPUUsageNSec,MemoryPeak',
    );
    report.journal = execFileSync(
      'journalctl',
      ['--user', '-u', report.unit, '--no-pager', '-o', 'short-iso'],
      { encoding: 'utf8', timeout: 10000 },
    );
  }
} finally {
  if (report.externalFaultRequested) {
    await writeFile(
      join(process.env.NATIVE_EVIDENCE_DIR, 'fault-observed'),
      'cleanup',
    ).catch(() => undefined);
    await faultMarker('fault-detached', 5000).catch((error) => {
      report.detachError = String(error);
    });
  }
  report.sourceUnchanged = await readFile(file, 'utf8')
    .then((value) => value === source)
    .catch(() => false);
  await invoke('stop_preview').catch((error) => {
    report.cleanupError = String(error);
  });
  await close().catch((error) => {
    report.closeError = String(error);
  });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('NATIVE_STOP_RETRY', output);
}
if (failure) throw failure;
async function faultMarker(name, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await access(join(process.env.NATIVE_EVIDENCE_DIR, name));
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await pause(50);
  }
  throw Error('External fault controller did not acknowledge ' + name);
}
