/** Real native automatic recovery. Synthetic fixtures, disposable profile only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  readFile,
  writeFile,
  open as openFile,
  unlink,
  statfs,
} from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  script,
} from './native-webdriver-lib.mjs';
import { rootPid, button, dialog, pause, fileIdle } from './native-ui-lib.mjs';
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR);
const original = join(process.env.NATIVE_FIXTURE_DIR, 'automatic-original.mdx');
const source =
  '\uFEFF# Automatic recovery\r\n\r\nCafé — original stays unchanged.\r\n';
await writeFile(original, source, { flag: 'wx' });
async function appendSource(text) {
  await script(
    `const done=arguments[arguments.length-1];document.querySelector('.cm-content').focus();done(true);`,
  );
  const pid = await rootPid();
  const windows = execFileSync(
    'xdotool',
    ['search', '--onlyvisible', '--pid', String(pid)],
    { encoding: 'utf8', timeout: 10000 },
  )
    .trim()
    .split(/\s+/);
  assert.equal(windows.length, 1);
  execFileSync(
    'xdotool',
    [
      'windowactivate',
      '--sync',
      windows[0],
      'key',
      '--clearmodifiers',
      'ctrl+End',
      'Return',
    ],
    { timeout: 10000 },
  );
  execFileSync('xdotool', ['type', '--clearmodifiers', '--delay', '1', text], {
    timeout: 10000,
  });
  await wait(
    `document.querySelector('.cm-content').innerText.includes(${JSON.stringify(text)})`,
  );
}
async function wait(expression) {
  for (let i = 0; i < 300; i++) {
    if (
      await script(
        `const done=arguments[arguments.length-1];done(Boolean(${expression}));`,
      )
    )
      return;
    await pause(100);
  }
  throw Error(`UI timeout: ${expression}`);
}
async function list() {
  const r = await invoke('recovery_draft', { action: 'list' });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
}
async function until(check) {
  for (let i = 0; i < 300; i++) {
    // Poll editor UI rather than contending with the writer's recovery lock.
    const snapshots = await script(
      `const done=arguments[arguments.length-1];done(Array.from(document.querySelectorAll('select[aria-label="Recovery version"] option')).map(o=>({file:o.value,metadata:{documentId:o.value.split('-')[0],generation:Number(o.value.split('-')[1])}})));`,
    );
    if (check({ snapshots })) {
      await idle();
      return list();
    }
    await pause(100);
  }
  throw Error('Automatic recovery did not reach expected versions');
}
async function idle() {
  await wait(
    "!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Keep versioned snapshot')?.disabled",
  );
}
async function start() {
  await launch();
  await wait("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  await invoke('stop_preview');
  await idle();
  return rootPid();
}
async function open(pid) {
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', original);
  await fileIdle();
  await wait(
    "Boolean(document.querySelector('.cm-content')) && document.querySelector('select[aria-label=\"Source file\"]').value.endsWith('automatic-original.mdx')",
  );
}
let applicationClosed = false;
async function exit(pid, dirty) {
  const request = () =>
    execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
      timeout: 10000,
    });
  request();
  if (dirty) {
    dialog(pid, 'button', 'Unsaved source', 'Cancel');
    assert.doesNotThrow(() => process.kill(pid, 0));
    request();
    dialog(pid, 'button', 'Unsaved source', 'OK');
  }
  for (let i = 0; i < 200; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
    await pause(100);
  }
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  applicationClosed = true;
  await close().catch(() => {});
}
const fillerPath = process.env.PN_RECOVERY_FILLER;
assert.equal(fillerPath, '/mnt/pn-automatic-recovery/filler');
const filesystem = await statfs('/mnt/pn-automatic-recovery');
assert.equal(filesystem.type, 0x1021994, 'Dedicated tmpfs required');
assert.ok(
  filesystem.blocks * filesystem.bsize <= 4 * 1024 * 1024,
  'Refuse filling a larger filesystem',
);
try {
  const pid = await start();
  assert.equal((await list()).snapshots.length, 0);
  await open(pid);
  await appendSource('BEFORE_FULL');
  const first = (await until((i) => i.snapshots.length === 1)).snapshots[0];
  const previous = source + '\r\nBEFORE_FULL';
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: first.file,
      })
    ).value.source,
    previous,
  );
  const filler = await openFile(fillerPath, 'wx', 0o600);
  try {
    let full = false;
    while (!full) {
      try {
        await filler.writeFile(Buffer.alloc(4096, 1));
      } catch (error) {
        assert.equal(error.code, 'ENOSPC');
        full = true;
      }
    }
  } finally {
    await filler.close();
  }
  await appendSource('DURING_FULL');
  await wait(
    'document.querySelector(\'[aria-label="Recovery status"][role="alert"]\')?.innerText.includes(\'No space left\')',
  );
  await idle();
  assert.equal((await list()).snapshots.length, 1);
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: first.file,
      })
    ).value.source,
    previous,
  );
  const edited = previous + '\r\nDURING_FULL';
  assert.equal(await readFile(original, 'utf8'), source);
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(original, 'utf8'), edited);
  console.log(
    'NATIVE_AUTO_ENOSPC_PAUSE_VISIBLE_ERROR_PRIOR_VERSION_AND_EXPLICIT_SAVE_PASS',
  );
  await unlink(fillerPath);
  await button('Resume automatic recovery');
  await idle();
  await appendSource('AFTER_RESUME');
  const second = (await until((i) => i.snapshots.length === 2)).snapshots.find(
    (s) => s.metadata.generation === 2,
  );
  assert.ok(second);
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: second.file,
      })
    ).value.source,
    edited + '\r\nAFTER_RESUME',
  );
  assert.equal(await readFile(original, 'utf8'), edited);
  console.log('NATIVE_AUTO_RECOVERY_EXPLICIT_RESUME_AFTER_REAL_ENOSPC_PASS');
  await wait("(document.querySelector('details').open=true,true)");
  await idle();
  for (let n = 2; n > 0; n--) {
    await button('Delete selected version');
    await idle();
    assert.equal((await list()).snapshots.length, n - 1);
  }
  await exit(pid, true);
} finally {
  // A failed WebDriver attempt must not leave automatic writes running after
  // the caller unmounts this disposable recovery filesystem.
  try {
    if (!applicationClosed) process.kill(await rootPid(), 'SIGTERM');
  } catch {
    /* Already exited. */
  }
  await close().catch(() => {});
}
