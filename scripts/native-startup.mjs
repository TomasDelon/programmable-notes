/** Diagnose accessible content startup under unchanged production limits. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { readFile, readlink, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  systemctl,
  artifact,
} from './native-webdriver-lib.mjs';
import { rootPid, button, waitUi, pause } from './native-ui-lib.mjs';

await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR);
assert.ok(process.env.NATIVE_EVIDENCE_DIR);
const metadata = JSON.parse(
  await readFile(join(process.env.NATIVE_FIXTURE_DIR, 'manifest.json'), 'utf8'),
);
const installed = await realpath(metadata.installed);
const reports = [];
const output = join(process.env.NATIVE_EVIDENCE_DIR, 'startup.json');
await writeFile(output, JSON.stringify({ incomplete: true }), { flag: 'wx' });
const run = promisify(execFile);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const executableSha256 = digest(await readFile(installed));
const observerSha256 = digest(await readFile(new URL(import.meta.url)));
console.log('NATIVE_STARTUP_EVIDENCE', output);
let executableUnchanged;
const counter = await artifact(
  await readFile('docs/handoff/samples/fixtures/counter.mdx', 'utf8'),
);
const staticHtml =
  "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; base-uri 'none'; form-action 'none'\"><button>Static ready</button>";

async function snapshot(target) {
  const row = { elapsedMs: performance.now() - target.requested, members: {} };
  for (const field of [
    'cpu.stat',
    'cpu.pressure',
    'memory.current',
    'memory.peak',
    'memory.events',
    'pids.current',
    'cgroup.procs',
  ]) {
    try {
      row[field] = (await readFile(`${target.root}/${field}`, 'utf8')).trim();
    } catch (error) {
      if (error.code === 'ENODEV') {
        row.transient = true;
        continue;
      }
      if (error.code !== 'ENOENT') throw error;
      if (field === 'cgroup.procs') row.groupGone = true;
    }
  }
  for (const pid of (row['cgroup.procs'] || '').split(/\s+/).filter(Boolean)) {
    assert.match(pid, /^[1-9][0-9]*$/);
    try {
      const stat = (await readFile(`/proc/${pid}/stat`, 'utf8'))
        .split(') ')
        .at(-1)
        .split(' ');
      const status = await readFile(`/proc/${pid}/status`, 'utf8');
      const member = {
        start: stat[19],
        state: stat[0],
        userTicks: stat[11],
        systemTicks: stat[12],
        comm: (await readFile(`/proc/${pid}/comm`, 'utf8')).trim(),
        noNewPrivileges: /NoNewPrivs:\s+1/.test(status),
        seccomp: /Seccomp:\s+2/.test(status),
      };
      try {
        member.waitChannel = (
          await readFile(`/proc/${pid}/wchan`, 'utf8')
        ).trim();
      } catch (error) {
        member.waitChannelUnavailable = error.code;
      }
      row.members[pid] = member;
      target.known[pid] = member;
      if (
        target.sandboxObservedMs === undefined &&
        member.comm.startsWith('WebKitWeb') &&
        member.noNewPrivileges &&
        member.seccomp
      )
        target.sandboxObservedMs = row.elapsedMs;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    }
  }
  target.samples.push(row);
  return row;
}
async function gone(target) {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const row = await snapshot(target);
    if (!row.transient && (row.groupGone || row['cgroup.procs'] === '')) {
      for (const [pid, prior] of Object.entries(target.known)) {
        try {
          const stat = (await readFile(`/proc/${pid}/stat`, 'utf8'))
            .split(') ')
            .at(-1)
            .split(' ');
          assert.ok(
            stat[19] !== prior.start || stat[0] === 'Z',
            `Known live descendant survived: ${pid}`,
          );
        } catch (error) {
          if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
        }
      }
      target.cleanupMs = performance.now() - target.requested;
      assert.ok(
        target.cleanupMs < 60000,
        'Cleanup overlaps earliest expiry; cannot attribute it to Stop',
      );
      target.noKnownLiveDescendants = true;
      return;
    }
    await pause(100);
  }
  throw Error(
    'Cgroup removal/empty membership and known-process exit not verified',
  );
}
async function ui(target, name, action = 'find') {
  const remaining = Math.floor(58000 - (performance.now() - target.requested));
  assert.ok(remaining > 0, 'No remaining startup/interaction budget');
  let result;
  try {
    result = await run(
      'python3',
      ['scripts/native-atspi.py', String(target.pid), name, action],
      {
        encoding: 'utf8',
        timeout: Math.min(55000, remaining),
      },
    );
  } catch (error) {
    target.ui.push({
      elapsedMs: performance.now() - target.requested,
      name,
      action,
      failed: {
        message: String(error),
        code: error.code,
        signal: error.signal,
        killed: error.killed,
        stderr: error.stderr?.slice(0, 2000),
      },
    });
    throw error;
  }
  target.ui.push({
    elapsedMs: performance.now() - target.requested,
    result: JSON.parse(result.stdout),
  });
}
async function compare(kind, html) {
  const target = {
    kind,
    htmlBytes: Buffer.byteLength(html),
    htmlSha256: digest(html),
    requested: performance.now(),
    samples: [],
    known: {},
    ui: [],
    errors: [],
  };
  reports.push(target);
  let observing = false;
  let observer = Promise.resolve();
  try {
    const reply = await invoke('start_preview', { html });
    assert.equal(reply.ok, true, JSON.stringify(reply));
    target.invokeMs = performance.now() - target.requested;
    target.unit = reply.value;
    assert.match(
      target.unit,
      /^programmable-notes-preview-[0-9]+-[0-9]+\.service$/,
    );
    const group = systemctl(
      'show',
      '--property=ControlGroup',
      '--value',
      target.unit,
    );
    assert.ok(group.startsWith('/user.slice/'));
    target.root = `/sys/fs/cgroup${group}`;
    target.pid = Number(
      systemctl('show', '--property=MainPID', '--value', target.unit),
    );
    assert.ok(target.pid > 0);
    assert.equal(await realpath(`/proc/${target.pid}/exe`), installed);
    target.policy = {};
    for (const [field, expected] of Object.entries({
      'cpu.max': '25000 100000',
      'memory.max': '536870912',
      'memory.swap.max': '0',
      'pids.max': '128',
    })) {
      target.policy[field] = (
        await readFile(`${target.root}/${field}`, 'utf8')
      ).trim();
      assert.equal(target.policy[field], expected);
    }
    target.privateNetwork = await readlink(`/proc/${target.pid}/ns/net`);
    assert.notEqual(target.privateNetwork, await readlink('/proc/self/ns/net'));
    assert.match(
      await readFile(`/proc/${target.pid}/status`, 'utf8'),
      /NoNewPrivs:\s+1/,
    );
    assert.ok(
      (await readFile(`/proc/${target.pid}/environ`, 'utf8'))
        .split('\0')
        .includes('TAURI_WEBVIEW_AUTOMATION=false'),
    );
    await snapshot(target);
    observing = true;
    observer = (async () => {
      while (observing) {
        await snapshot(target);
        await pause(500);
      }
    })();
    // Attach a rejection handler immediately; an observer failure is retained
    // and fails the case after UI completion rather than becoming unhandled.
    observer.catch((error) => target.errors.push(`observer: ${String(error)}`));
    const name = kind === 'static' ? 'Static ready' : 'Count: 0';
    await ui(target, name);
    target.accessibleReadyMs = performance.now() - target.requested;
    if (kind === 'counter') {
      await ui(target, name, 'click');
      await ui(target, 'Count: 1');
    }
    assert.ok(
      target.sandboxObservedMs !== undefined,
      'No real sandboxed WebKit process observed',
    );
  } catch (error) {
    target.errors.push(String(error));
  } finally {
    observing = false;
    await observer.catch(() => {});
    if (target.unit) {
      try {
        assert.equal((await invoke('stop_preview')).ok, true);
        if (target.root) await gone(target);
      } catch (error) {
        target.errors.push(`cleanup: ${String(error)}`);
      }
      try {
        target.unitResult = systemctl(
          'show',
          '--property=Result',
          '--value',
          target.unit,
        );
      } catch (error) {
        target.unitResultUnavailable = String(error);
      }
      try {
        target.journal = (
          await run('journalctl', ['--user', '--no-pager', '-u', target.unit], {
            encoding: 'utf8',
            timeout: 10000,
          })
        ).stdout;
      } catch (error) {
        target.journalUnavailable = String(error);
      }
    }
    console.log(
      'NATIVE_STARTUP_OBSERVATION',
      JSON.stringify({
        kind,
        invokeMs: target.invokeMs,
        sandboxObservedMs: target.sandboxObservedMs,
        accessibleReadyMs: target.accessibleReadyMs,
        cleanupMs: target.cleanupMs,
        errors: target.errors,
      }),
    );
  }
  return target;
}
try {
  await launch();
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  assert.equal(await realpath(`/proc/${await rootPid()}/exe`), installed);
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  const first = await compare('static', staticHtml);
  assert.ok(
    first.noKnownLiveDescendants,
    'Static cleanup not verified; do not launch another preview',
  );
  await compare('counter', counter);
} finally {
  await invoke('stop_preview').catch(() => {});
  await close().catch(() => {});
  executableUnchanged = executableSha256 === digest(await readFile(installed));
  await writeFile(
    output,
    JSON.stringify(
      {
        executableSha256,
        observerSha256,
        executableUnchanged,
        accessibleObservationsOnly: true,
        noPolicyChanges: true,
        reports,
      },
      null,
      2,
    ) + '\n',
  );
}
if (
  !executableUnchanged ||
  reports.length !== 2 ||
  reports.some((r) => r.errors.length || r.accessibleReadyMs === undefined)
)
  process.exitCode = 1;
