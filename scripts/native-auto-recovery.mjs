/** Real native automatic recovery. Synthetic fixtures, disposable profile only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  script,
} from './native-webdriver-lib.mjs';
import {
  rootPid,
  button,
  dialog,
  appendSource,
  pause,
  fileIdle,
} from './native-ui-lib.mjs';
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR);
const original = join(process.env.NATIVE_FIXTURE_DIR, 'automatic-original.mdx');
const copy = join(process.env.NATIVE_FIXTURE_DIR, 'automatic-restored.mdx');
const source =
  '\uFEFF# Automatic recovery\r\n\r\nCafé — original stays unchanged.\r\n';
await writeFile(original, source, { flag: 'wx' });
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
async function exit(pid, dirty) {
  const crash = dirty && process.env.NATIVE_CRASH_RESTART === '1';
  if (crash) {
    process.kill(pid, 'SIGKILL');
    console.log('NATIVE_ACTUAL_ROOT_SIGKILL', pid);
  } else {
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
  await close().catch(() => {});
}
try {
  const first = await start();
  assert.equal(
    (await list()).snapshots.length,
    0,
    'Use an empty disposable version collection',
  );
  await open(first);
  await appendSource('AUTOMATIC_A');
  const initial = await until((i) => i.snapshots.length === 1);
  const a = initial.snapshots[0];
  const aBytes = source + '\r\nAUTOMATIC_A';
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: a.file,
      })
    ).value.source,
    aBytes,
  );
  assert.equal(await readFile(original, 'utf8'), source);
  // Open the same original again: both dirty buffers must retain independent histories.
  await open(first);
  await appendSource('AUTOMATIC_B');
  let current = await until((i) => i.snapshots.length === 2);
  const b = current.snapshots.find(
    (s) => s.metadata.documentId !== a.metadata.documentId,
  );
  assert.ok(b);
  for (let n = 2; n <= 6; n++) {
    await appendSource(`AUTOMATIC_B_${n}`);
    current = await until((i) =>
      i.snapshots.some(
        (s) =>
          s.metadata.documentId === b.metadata.documentId &&
          s.metadata.generation === n,
      ),
    );
  }
  assert.equal(
    current.snapshots.filter(
      (s) => s.metadata.documentId === b.metadata.documentId,
    ).length,
    5,
  );
  assert.ok(current.snapshots.some((s) => s.file === a.file));
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: a.file,
      })
    ).value.source,
    aBytes,
  );
  assert.equal(await readFile(original, 'utf8'), source);
  console.log(
    'NATIVE_AUTOMATIC_MULTI_BUFFER_INDEPENDENT_RETENTION_AND_UNCHANGED_ORIGINAL_PASS',
  );
  await exit(first, true);
  const second = await start();
  assert.notEqual(second, first);
  await button('Pause automatic recovery');
  await wait("(document.querySelector('details').open=true,true)");
  await idle();
  await wait(
    'document.querySelectorAll(\'select[aria-label="Recovery version"] option\').length===6',
  );
  console.log('NATIVE_AUTOMATIC_DISCOVERY_AFTER_ACTUAL_RESTART_PASS');
  await script(
    `const done=arguments[arguments.length-1];const select=document.querySelector('select[aria-label="Recovery version"]');select.value=arguments[0];select.dispatchEvent(new Event('change',{bubbles:true}));done(true);`,
    [a.file],
  );
  await button('Restore selected version');
  await fileIdle();
  await idle();
  await button('Save source');
  dialog(second, 'cancel', 'Save source as');
  await fileIdle();
  assert.equal(await readFile(original, 'utf8'), source);
  await button('Save source');
  dialog(second, 'choose', 'Save source as', copy);
  await fileIdle();
  assert.equal(await readFile(copy, 'utf8'), aBytes);
  assert.equal(await readFile(original, 'utf8'), source);
  console.log(
    'NATIVE_AUTOMATIC_RESTORE_UNSAVED_CANCEL_AND_EXPLICIT_EXACT_SAVE_PASS',
  );
  for (let n = 6; n > 0; n--) {
    await button('Delete selected version');
    await idle();
    assert.equal((await list()).snapshots.length, n - 1);
  }
  await exit(second, false);
} finally {
  await close().catch(() => {});
}
