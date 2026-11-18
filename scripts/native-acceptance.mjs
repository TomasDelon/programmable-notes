/** Actual installed Linux editor. Run only in a disposable desktop profile. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, lstat, chmod, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  wd,
  session,
  script,
} from './native-webdriver-lib.mjs';
import { rootPid, button, dialog, fileIdle, pause } from './native-ui-lib.mjs';

await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR);
const draft = join(
  process.env.XDG_DATA_HOME || join(homedir(), '.local/share'),
  'dev.programmablenotes.app/recovery/recovered.mdx',
);
await assert.rejects(lstat(draft), { code: 'ENOENT' });
const file = join(process.env.NATIVE_FIXTURE_DIR, 'inline-acceptance.mdx');
const source =
  "import React from 'react'\r\n\r\n##   Original title  ##\r\n\r\nA paragraph: 50% + tax.\r\n\r\n- First item\r\n- Second item\r\n\r\n<div><span>Nested JSX</span></div>\r\n\r\n{/* retain comment */}\r\n";
const saved = source
  .replace('Original title', 'Updated title')
  .replace(
    'A paragraph: 50% + tax.',
    'Updated: 75% + tax.\r\nSecond line / retained.',
  );
const unsaved = saved.replace('Second item', 'Recovered item');
await writeFile(file, source, { flag: 'wx' });
await chmod(file, 0o640);

async function waitUi(expression) {
  for (let i = 0; i < 100; i++) {
    if (
      await script(
        `const done=arguments[arguments.length-1]; done(Boolean(${expression}));`,
      )
    )
      return;
    await pause(100);
  }
  throw Error(`UI check did not pass: ${expression}`);
}
async function start() {
  await launch();
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  return rootPid();
}
async function open() {
  await button('Open files');
  dialog(await rootPid(), 'choose', 'Open documents and modules', file);
  await fileIdle();
  await waitUi(
    "document.querySelector('select')?.value.endsWith('inline-acceptance.mdx')",
  );
}
async function inline(before, label, after) {
  await button(before);
  const element = await wd(`/session/${session}/element`, {
    using: 'css selector',
    value: `textarea[aria-label="${label}"]`,
  });
  const id = element['element-6066-11e4-a52e-4f735466cecf'];
  await wd(`/session/${session}/element/${id}/clear`, {});
  const lines = after.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i) await pressKey('shift+Return');
    await wd(`/session/${session}/element/${id}/value`, { text: lines[i] });
  }
  await pressKey('Return');
}
async function pressKey(key) {
  const pid = await rootPid();
  const output = execFileSync(
    'xdotool',
    ['search', '--onlyvisible', '--pid', String(pid)],
    { encoding: 'utf8', timeout: 10000 },
  );
  const windows = output.trim().split(/\s+/);
  assert.equal(windows.length, 1);
  execFileSync(
    'xdotool',
    ['windowactivate', '--sync', windows[0], 'key', '--clearmodifiers', key],
    { timeout: 10000 },
  );
}
async function expectSource(text, present = true) {
  await waitUi(
    `Boolean(document.querySelector('.cm-content')?.innerText.includes(${JSON.stringify(text)})) === ${present}`,
  );
}
async function history(redo = false) {
  await button(redo ? 'Redo' : 'Undo');
}
async function shutdown(pid, discard = false) {
  const closeWindow = () =>
    execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
      timeout: 10000,
    });
  closeWindow();
  if (discard) {
    dialog(pid, 'button', 'Unsaved source', 'Cancel');
    await expectSource('Recovered item');
    closeWindow();
    dialog(pid, 'button', 'Unsaved source', 'OK');
  }
  for (let i = 0; i < 100; i++) {
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
  await open();
  await button('Source');
  await waitUi("document.querySelector('.preview-pane').hidden === true");
  await button('Split');
  await waitUi("document.querySelector('.preview-pane').hidden === false");
  await button('Visual');
  await waitUi(
    "document.querySelector('.source-editor').parentElement.hidden === true",
  );
  console.log('NATIVE_SOURCE_SPLIT_VISUAL_MODES_PASS');
  await inline('Original title', 'Heading text', 'Updated title');
  await expectSource('Updated title');
  await history();
  await expectSource('Original title');
  await history(true);
  await expectSource('Updated title');
  await inline(
    'A paragraph: 50% + tax.',
    'Paragraph text',
    'Updated: 75% + tax.\nSecond line / retained.',
  );
  await expectSource('Second line / retained.');
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(file, 'utf8'), saved);
  assert.equal((await stat(file)).mode & 0o777, 0o640);
  console.log(
    'NATIVE_INLINE_UNDO_REDO_SAVE_PASS exact UTF-8/CRLF, punctuation, multiline, mode 0640',
  );
  await inline('Second item', 'List item text', 'Recovered item');
  await waitUi(
    "document.querySelector('.cm-content')?.innerText.includes('Recovered item')",
  );
  await waitUi("(document.querySelector('details summary')?.click(),true)");
  await button('Keep recovery draft');
  await fileIdle();
  assert.equal(await readFile(draft, 'utf8'), unsaved);
  const collision = await invoke('recovery_draft', {
    action: 'keep',
    source: 'replacement',
  });
  assert.equal(collision.ok, false);
  assert.match(collision.error, /already exists/);
  assert.equal(await readFile(draft, 'utf8'), unsaved);
  await shutdown(first, true);
  console.log('NATIVE_DIRTY_CLOSE_CANCEL_AND_RESTART_PASS');

  const second = await start();
  assert.notEqual(second, first);
  await expectSource('Recovered item', false);
  await open();
  await expectSource('Updated title');
  await expectSource('Recovered item', false);
  await waitUi("(document.querySelector('details summary')?.click(),true)");
  await button('Restore as unsaved document');
  await fileIdle();
  await waitUi(
    "document.querySelector('select')?.value.endsWith('recovered.mdx')",
  );
  await expectSource('Recovered item');
  assert.equal(await readFile(file, 'utf8'), saved);
  console.log('NATIVE_EXPLICIT_RECOVERY_PASS original unchanged');
  await writeFile(draft, Buffer.from([0xc3, 0x28]));
  await button('Restore as unsaved document');
  await fileIdle();
  await waitUi("Boolean(document.querySelector('[data-file-error]'))");
  await expectSource('Recovered item');
  assert.equal(await readFile(file, 'utf8'), saved);
  await button('Delete recovery draft');
  await fileIdle();
  await assert.rejects(lstat(draft), { code: 'ENOENT' });
  await shutdown(second, true);
  console.log('NATIVE_INVALID_DRAFT_AND_EXPLICIT_DELETE_PASS');
} finally {
  await close().catch(() => {});
}
