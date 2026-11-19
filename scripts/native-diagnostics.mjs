/** Original-source compiler navigation in the installed, disposable desktop. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, chmod, stat } from 'node:fs/promises';
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
  fileIdle,
  waitUi,
  pause,
} from './native-ui-lib.mjs';
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR);
const file = join(process.env.NATIVE_FIXTURE_DIR, 'syntax-location.mdx');
const original = '\uFEFF# Café 😀\r\n\r\n<Broken';
await writeFile(file, original, { flag: 'wx' });
await chmod(file, 0o640);
try {
  await launch();
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  await button('Pause automatic recovery');
  const pid = await rootPid();
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', file);
  await fileIdle();
  await button('Rebuild preview');
  await waitUi(
    "Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Open syntax-location.mdx at line 3')",
  );
  await button('Open syntax-location.mdx at line 3');
  await waitUi(
    "document.querySelector('.preview-pane').hidden && document.activeElement?.classList.contains('cm-content')",
  );
  assert.equal(await readFile(file, 'utf8'), original);
  const windows = execFileSync(
    'xdotool',
    ['search', '--onlyvisible', '--pid', String(pid)],
    { encoding: 'utf8', timeout: 10000 },
  )
    .trim()
    .split(/\s+/);
  assert.equal(windows.length, 1);
  execFileSync('xdotool', ['windowactivate', '--sync', windows[0]], {
    timeout: 10000,
  });
  execFileSync(
    'xdotool',
    ['type', '--clearmodifiers', '--delay', '1', 'INSERT '],
    { timeout: 10000 },
  );
  // X events are queued; require the editor to consume the entire input before
  // requesting a save, rather than accidentally testing an earlier snapshot.
  await waitUi(
    "document.querySelector('.cm-content')?.textContent.includes('INSERT <Broken')",
  );
  await button('Save source');
  await fileIdle();
  assert.equal(
    await readFile(file, 'utf8'),
    original.replace('<Broken', 'INSERT <Broken'),
  );
  assert.equal((await stat(file)).mode & 0o777, 0o640);
  await button('Undo');
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(file, 'utf8'), original);
  console.log('NATIVE_COMPILER_ORIGINAL_LINE_FOCUS_EXACT_SAVE_AND_UNDO_PASS');
  execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
    timeout: 10000,
  });
  for (let i = 0; i < 200; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
    await pause(100);
  }
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
} catch (error) {
  console.error(
    'NATIVE_DIAGNOSTIC_UI_STATE',
    await script(
      'const done=arguments[arguments.length-1]; done({status:document.querySelector(".build-status")?.textContent,alerts:Array.from(document.querySelectorAll("[role=alert]")).map(n=>n.textContent),buttons:Array.from(document.querySelectorAll("button")).map(n=>n.textContent)});',
    ).catch(() => 'UI unavailable'),
  );
  throw error;
} finally {
  await close().catch(() => {});
}
