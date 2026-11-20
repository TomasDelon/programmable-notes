/** Installed production app: dirty close cancellation, clean shutdown and reopen. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { preflight, launch, close, invoke } from './native-webdriver-lib.mjs';
import {
  rootPid,
  button,
  waitUi,
  dialog,
  appendSource,
  fileIdle,
  readSourceText,
  pause,
} from './native-ui-lib.mjs';
await preflight();
assert.ok(process.env.NATIVE_FIXTURE_DIR);
const file = join(process.env.NATIVE_FIXTURE_DIR, 'lifecycle.mdx');
await writeFile(file, '# Persist across restart\n');
async function open() {
  await button('Open files');
  dialog(await rootPid(), 'choose', 'Open documents and modules', file);
  await fileIdle();
}
function windowClose(pid) {
  console.log(
    execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
      encoding: 'utf8',
      timeout: 10000,
    }).trim(),
  );
}
try {
  await launch();
  await waitUi(`Boolean(document.querySelector('.cm-content'))`);
  await button('Stop preview');
  await invoke('stop_preview');
  await open();
  await appendSource('unsaved survives cancellation');
  const pid = await rootPid();
  windowClose(pid);
  dialog(pid, 'button', 'Unsaved source', 'Cancel');
  assert.match(await readSourceText(), /unsaved survives cancellation/);
  assert.equal(await readFile(file, 'utf8'), '# Persist across restart\n');
  console.log('DIRTY_WINDOW_CLOSE_CANCEL_PASS');
  await button('Save source');
  await fileIdle();
  const saved = await readFile(file, 'utf8');
  assert.match(saved, /unsaved survives cancellation/);
  windowClose(pid);
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
    await pause(100);
  }
  assert.throws(() => process.kill(pid, 0));
  try {
    await close();
  } catch {
    /* Browser was closed by actual window manager request. */
  }
  console.log('CLEAN_SHUTDOWN_PASS');
  await launch();
  await waitUi(`Boolean(document.querySelector('.cm-content'))`);
  await button('Stop preview');
  await invoke('stop_preview');
  await open();
  assert.match(await readSourceText(), /unsaved survives cancellation/);
  assert.equal(await readFile(file, 'utf8'), saved);
  console.log('FRESH_LAUNCH_REOPEN_PASS');
} finally {
  try {
    await invoke('stop_preview');
  } catch {
    /* preserve primary failure */
  }
  await close();
}
