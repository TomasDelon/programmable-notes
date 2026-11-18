/** Actual installed Linux editor. Run only in a disposable desktop profile. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, lstat } from 'node:fs/promises';
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
} from './native-webdriver-lib.mjs';
import {
  rootPid,
  button,
  waitUi,
  dialog,
  fileIdle,
  readSourceText,
  pause,
} from './native-ui-lib.mjs';

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
  "import React from 'react'\r\n\r\n##   Original title  ##\r\n\r\n- First item\r\n- Second item\r\n\r\n<div><span>Nested JSX</span></div>\r\n\r\n{/* retain comment */}\r\n";
const saved = source.replace('Original title', 'Updated title');
const unsaved = saved.replace('Second item', 'Recovered item');
await writeFile(file, source, { flag: 'wx' });

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
async function inline(before, label, after, commit = true) {
  await button(before);
  const element = await wd(`/session/${session}/element`, {
    using: 'css selector',
    value: `input[aria-label="${label}"]`,
  });
  const id = element['element-6066-11e4-a52e-4f735466cecf'];
  await wd(`/session/${session}/element/${id}/clear`, {});
  await wd(`/session/${session}/element/${id}/value`, {
    text: after + (commit ? '\uE007' : '\uE00C'),
  });
}
async function history(redo = false) {
  const modifiers = redo ? ['\uE009', '\uE008'] : ['\uE009'];
  await wd(`/session/${session}/actions`, {
    actions: [
      {
        type: 'key',
        id: 'history',
        actions: [
          ...modifiers.map((value) => ({ type: 'keyDown', value })),
          { type: 'keyDown', value: 'z' },
          { type: 'keyUp', value: 'z' },
          ...modifiers.reverse().map((value) => ({ type: 'keyUp', value })),
        ],
      },
    ],
  });
}
async function shutdown(pid, discard = false) {
  const closeWindow = () =>
    execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
      timeout: 10000,
    });
  closeWindow();
  if (discard) {
    dialog(pid, 'button', 'Unsaved source', 'Cancel');
    assert.match(await readSourceText(), /Recovered item/);
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
  await button('Edit rendered Markdown');
  await inline('Original title', 'Heading text', 'Cancelled text', false);
  assert.match(await readSourceText(), /Original title/);
  await inline('Original title', 'Heading text', 'Updated title');
  assert.match(await readSourceText(), /Updated title/);
  await history();
  assert.match(await readSourceText(), /Original title/);
  await history(true);
  assert.match(await readSourceText(), /Updated title/);
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(file, 'utf8'), saved);
  console.log('NATIVE_INLINE_UNDO_REDO_SAVE_PASS exact UTF-8/CRLF');
  await inline('Second item', 'List item text', 'Recovered item');
  await waitUi(
    "document.querySelector('.cm-content')?.innerText.includes('Recovered item')",
  );
  assert.deepEqual(
    await invoke('recovery_draft', { action: 'keep', source: unsaved }),
    { ok: true, value: null },
  );
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
  assert.doesNotMatch(await readSourceText(), /Recovered item/);
  await open();
  assert.match(await readSourceText(), /Updated title/);
  assert.doesNotMatch(await readSourceText(), /Recovered item/);
  await waitUi("(document.querySelector('details summary')?.click(),true)");
  await button('Restore as unsaved document');
  await fileIdle();
  await waitUi(
    "document.querySelector('select')?.value.endsWith('recovered.mdx')",
  );
  assert.match(await readSourceText(), /Recovered item/);
  assert.equal(await readFile(file, 'utf8'), saved);
  console.log('NATIVE_EXPLICIT_RECOVERY_PASS original unchanged');
  await writeFile(draft, Buffer.from([0xc3, 0x28]));
  await button('Restore as unsaved document');
  await fileIdle();
  await waitUi("Boolean(document.querySelector('[data-file-error]'))");
  assert.match(await readSourceText(), /Recovered item/);
  assert.equal(await readFile(file, 'utf8'), saved);
  await button('Delete recovery draft');
  await fileIdle();
  await assert.rejects(lstat(draft), { code: 'ENOENT' });
  await shutdown(second, true);
  console.log('NATIVE_INVALID_DRAFT_AND_EXPLICIT_DELETE_PASS');
} finally {
  await close().catch(() => {});
}
