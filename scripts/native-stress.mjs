/** Actual hostile JavaScript in WebKit, with the production supervisor unchanged. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import {
  preflight,
  launch,
  close,
  invoke,
  systemctl,
  artifact,
} from './native-webdriver-lib.mjs';
import { button, waitUi } from './native-ui-lib.mjs';
await preflight();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = process.env.NATIVE_EVIDENCE_DIR || 'test-results/native';
await mkdir(output, { recursive: true });
const reports = [];
const cpuSource = `import {useState} from 'react'

export function Attack() { const [armed,setArmed]=useState(false); return <button onClick={()=>{setArmed(true); setTimeout(()=>{while(true){}},3000)}}>{armed?'CPU loop armed':'Arm CPU loop'}</button> }

<Attack />`;
const memorySource = `export function Pressure() {
  const retained = [];
  while (true) {
    const block = new Uint8Array(16 * 1024 * 1024);
    block.fill(1);
    retained.push(block);
  }
  return null;
}

<Pressure />`;
const counterSource = await readFile(
  'docs/handoff/samples/fixtures/counter.mdx',
  'utf8',
);
const counter = await artifact(counterSource),
  cpu = await artifact(cpuSource),
  memory = await artifact(memorySource);
function fieldStats(value) {
  return Object.fromEntries(
    value.split('\n').map((line) => {
      const [key, value] = line.split(' ');
      return [key, Number(value)];
    }),
  );
}
async function sample(root) {
  const row = { time: Date.now() };
  for (const field of [
    'cpu.max',
    'cpu.stat',
    'memory.max',
    'memory.swap.max',
    'memory.current',
    'memory.peak',
    'memory.events',
    'pids.max',
    'cgroup.procs',
  ]) {
    try {
      row[field] = (await readFile(`${root}/${field}`, 'utf8')).trim();
    } catch (error) {
      if (error.code === 'ENODEV') {
        // kernfs can deactivate an opened controller file during unit removal.
        // An indeterminate sample is never evidence of an empty cgroup: retry
        // until a later sample proves emptiness/removal and known PIDs are gone.
        return { ...row, observerTransient: true, members: {} };
      }
      if (error.code !== 'ENOENT') throw error;
    }
  }
  row.members = {};
  for (const pid of (row['cgroup.procs'] || '').split(/\s+/).filter(Boolean)) {
    try {
      const stat = (await readFile(`/proc/${pid}/stat`, 'utf8'))
        .split(') ')
        .at(-1)
        .split(' ');
      row.members[pid] = { state: stat[0], start: stat[19] };
    } catch (error) {
      // procfs can return ESRCH after opening a task's stat file if it exits
      // before read. Keep the cgroup membership sample; do not infer emptiness.
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    }
  }
  return row;
}
async function start(code) {
  const requestedAt = Date.now();
  const requestedMonotonic = performance.now();
  const reply = await invoke('start_preview', { html: code });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  const unit = reply.value;
  assert.match(unit, /^programmable-notes-preview-\d+-\d+\.service$/);
  const group = systemctl('show', '--property=ControlGroup', '--value', unit);
  assert.ok(group.startsWith('/user.slice/'));
  const root = `/sys/fs/cgroup${group}`;
  const pid = Number(systemctl('show', '--property=MainPID', '--value', unit));
  assert.ok(pid > 0);
  const first = await sample(root);
  assert.equal(first['memory.max'], '536870912');
  assert.equal(first['memory.swap.max'], '0');
  assert.equal(first['pids.max'], '128');
  assert.equal(first['cpu.max'], '25000 100000');
  const target = {
    unit,
    root,
    pid,
    requestedAt,
    requestedMonotonic,
    started: Date.now(),
    samples: [first],
  };
  await sandbox(target);
  console.log(
    'PREVIEW_START_TIMING',
    JSON.stringify({
      unit,
      pid,
      invokeMs: target.started - requestedAt,
      sandboxObservedMs: Date.now() - requestedAt,
    }),
  );
  return target;
}
function ui(target, name, action = 'click') {
  const began = Date.now();
  try {
    const response = execFileSync(
      'python3',
      ['scripts/native-atspi.py', String(target.pid), name, action],
      { encoding: 'utf8', timeout: 65000 },
    );
    console.log('NATIVE_UI', response.trim());
  } finally {
    console.log(
      'NATIVE_UI_TIMING',
      JSON.stringify({
        unit: target.unit,
        pid: target.pid,
        name,
        action,
        observerMs: Date.now() - began,
        sinceRequestMs: Date.now() - target.requestedAt,
      }),
    );
  }
}
async function stopped(target, seconds = 75) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const row = await sample(target.root);
    target.samples.push(row);
    if (row.observerTransient) {
      await pause(100);
      continue;
    }
    if (!row['cgroup.procs']) {
      const known = Object.assign(
        {},
        ...target.samples.map((sample) => sample.members),
      );
      for (const [pid, info] of Object.entries(known)) {
        try {
          const stat = (await readFile(`/proc/${pid}/stat`, 'utf8'))
            .split(') ')
            .at(-1)
            .split(' ');
          assert.ok(
            stat[19] !== info.start || stat[0] === 'Z',
            `Live preview descendant survived: ${pid}`,
          );
        } catch (error) {
          if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
        }
      }
      reports.push({ ...target, ended: Date.now(), noLiveDescendants: true });
      return;
    }
    await pause(100);
  }
  throw Error(`Service still populated after deadline: ${target.unit}`);
}
function requireCause(target, pattern) {
  const journal = execFileSync(
    'journalctl',
    ['--user', '--no-pager', '-u', target.unit],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.match(
    journal,
    pattern,
    `Missing termination cause for ${target.unit}: ${journal}`,
  );
  const report = reports.find((report) => report.unit === target.unit);
  assert.ok(report);
  report.journal = journal;
  return journal;
}
function requireExpiry(target) {
  const elapsed = Date.now() - target.started;
  assert.ok(
    elapsed >= 55000 && elapsed < 75000,
    `Unexpected lifetime ${elapsed}ms`,
  );
  requireCause(target, /Service reached runtime time limit/);
}
async function responsive() {
  const begin = Date.now();
  assert.deepEqual(await invoke('host_probe'), {
    ok: true,
    value: 'editor-host-only',
  });
  const milliseconds = Date.now() - begin;
  assert.ok(milliseconds < 5000, `Editor host stalled ${milliseconds}ms`);
  return milliseconds;
}
async function recover(label) {
  const valid = await start(counter);
  ui(valid, 'Count: 0');
  ui(valid, 'Count: 1');
  ui(valid, 'Count: 2', 'find');
  valid.samples.push(await sample(valid.root));
  assert.equal((await invoke('stop_preview')).ok, true);
  await stopped(valid, 5);
  console.log('RECOVERY_PASS', label);
}
async function launchEditor() {
  await launch(process.env.NATIVE_PREVIEW_WRAPPER ? [] : ['--security-editor']);
  if (process.env.NATIVE_PREVIEW_WRAPPER) {
    await waitUi(`Boolean(document.querySelector('.cm-content'))`);
    await button('Stop preview');
    assert.equal((await invoke('stop_preview')).ok, true);
  }
}
async function sandbox(target) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const row = await sample(target.root);
    target.samples.push(row);
    for (const pid of Object.keys(row.members || {})) {
      try {
        const comm = (await readFile(`/proc/${pid}/comm`, 'utf8')).trim();
        if (!comm.startsWith('WebKitWeb')) continue;
        const status = await readFile(`/proc/${pid}/status`, 'utf8');
        assert.match(status, /NoNewPrivs:\s+1/);
        assert.match(status, /Seccomp:\s+2/);
        console.log(
          'WEBKIT_SANDBOX',
          JSON.stringify({
            unit: target.unit,
            pid,
            comm,
            seccomp: 2,
            noNewPrivileges: true,
          }),
        );
        return;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await pause(100);
  }
  throw Error('No sandboxed WebKit process appeared before lifetime');
}
const requested = process.argv
  .find((arg) => arg.startsWith('--case='))
  ?.slice(7);
const cases = ['cpu-stop', 'memory', 'expiry', 'editor-crash', 'window-close'];
assert.ok(!requested || cases.includes(requested), 'Unknown --case');
const failures = [];
async function runCase(name, task) {
  if (requested && requested !== name) return;
  try {
    await task();
    console.log('CASE_PASS', name);
  } catch (error) {
    failures.push(name);
    console.error('CASE_FAIL', name, error);
    try {
      await invoke('stop_preview');
    } catch {
      /* Deliberately killed editor. */
    }
  }
}
try {
  await launchEditor();
  await runCase('cpu-stop', async () => {
    const loop = await start(cpu);
    ui(loop, 'Arm CPU loop');
    ui(loop, 'CPU loop armed', 'find');
    await pause(4000);
    const before = await sample(loop.root);
    await pause(3000);
    const after = await sample(loop.root);
    loop.samples.push(before, after);
    const usage =
      fieldStats(after['cpu.stat']).usage_usec -
      fieldStats(before['cpu.stat']).usage_usec;
    const throttled =
      fieldStats(after['cpu.stat']).nr_throttled -
      fieldStats(before['cpu.stat']).nr_throttled;
    assert.ok(usage > 300000, 'Controlled JavaScript loop did not consume CPU');
    assert.ok(throttled > 0, 'No real CPU throttling observed');
    assert.ok(
      usage <= (after.time - before.time) * 250 + 150000,
      'CPU quota exceeded',
    );
    console.log(
      'WEBKIT_CPU',
      JSON.stringify({
        unit: loop.unit,
        usage_usec: usage,
        elapsed_ms: after.time - before.time,
        throttled_periods: throttled,
        editor_response_ms: await responsive(),
      }),
    );
    assert.equal((await invoke('stop_preview')).ok, true);
    await stopped(loop, 5);
    assert.ok(
      performance.now() - loop.requestedMonotonic < 60000,
      'Stop overlapped the earliest possible expiry; cannot attribute termination to Stop',
    );
    await recover('Stop while WebKit JS loop was busy');
  });
  await runCase('memory', async () => {
    const pressure = await start(memory);
    console.log('PRESSURE_UNIT', pressure.unit);
    await stopped(pressure);
    await responsive();
    await recover('Memory-pressure termination');
    requireCause(pressure, /[Oo][Oo][Mm]|oom-kill/);
  });
  await runCase('expiry', async () => {
    const expiry = await start(cpu);
    ui(expiry, 'Arm CPU loop');
    ui(expiry, 'CPU loop armed', 'find');
    console.log('EXPIRY_UNIT', expiry.unit);
    await stopped(expiry);
    requireExpiry(expiry);
    await responsive();
    await recover('Native loop lifetime expiry');
  });
  await runCase('editor-crash', async () => {
    const crash = await start(cpu);
    ui(crash, 'Arm CPU loop');
    ui(crash, 'CPU loop armed', 'find');
    const editorPid = Number(
      crash.unit.match(/^programmable-notes-preview-(\d+)-/)[1],
    );
    process.kill(editorPid, 'SIGKILL');
    console.log(
      'EDITOR_KILLED',
      JSON.stringify({ editorPid, unit: crash.unit }),
    );
    await stopped(crash);
    requireExpiry(crash);
    try {
      await close();
    } catch {
      /* The editor was deliberately killed; only session cleanup may fail. */
    }
    await launchEditor();
    await recover('Independent preview expiry after editor SIGKILL');
  });
  await runCase('window-close', async () => {
    const target = await start(counter);
    ui(target, 'Count: 0', 'find');
    target.samples.push(await sample(target.root));
    console.log(
      'NATIVE_WINDOW_CLOSE',
      execFileSync(
        'python3',
        ['scripts/native-close-window.py', String(target.pid)],
        { encoding: 'utf8', timeout: 10000 },
      ).trim(),
    );
    await stopped(target, 5);
    const closeElapsedMs = performance.now() - target.requestedMonotonic;
    assert.ok(
      closeElapsedMs < 60000,
      'Window close overlapped the earliest possible expiry; cannot attribute termination to close',
    );
    console.log(
      'WINDOW_CLOSED_BEFORE_EARLIEST_EXPIRY',
      JSON.stringify({ unit: target.unit, closeElapsedMs }),
    );
    await recover('Native preview window closed');
  });
  if (failures.length) {
    console.error('WEBKIT_STRESS_FAILED', failures);
    process.exitCode = 1;
  } else console.log('WEBKIT_STRESS_PASS', requested || 'all');
} finally {
  await writeFile(
    `${output}/webkit-stress.json`,
    JSON.stringify(reports, null, 2) + '\n',
  );
  try {
    await invoke('stop_preview');
  } catch {
    /* A deliberately killed editor cannot receive Stop. */
  }
  await close();
}
