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
  systemctl,
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
const file = join(process.env.NATIVE_FIXTURE_DIR, 'fidelity-acceptance.mdx');
const mixedEol = process.argv.includes('--mixed-eol');
const paragraph = mixedEol
  ? 'A paragraph: 50% + tax.\nRetain physical LF.\r\nRetain physical CRLF.'
  : 'A paragraph: 50% + tax.';
const replacement = mixedEol
  ? 'Updated: 75% + tax.\nRetain physical LF.\nRetain physical CRLF.'
  : 'Updated: 75% + tax.\nSecond line / retained.';
const source =
  "﻿---\r\ntitle: Protected 😀 metadata\r\n---\r\n\r\nimport React from 'react'\r\n\r\nexport function Probe() {\r\n  const [n,setN]=React.useState(0)\r\n  return <button onClick={()=>setN(n+1)}>Native probe {n}</button>\r\n}\r\n\r\n<Probe />\r\n\r\n##   Original title  ##\r\n\r\nA paragraph: 50% + tax.\r\n\r\n- First item\r\n- Second item\r\n\r\n<div><span>Nested JSX</span></div>\r\n\r\n{/* retain comment */}\r\n\r\n```tsx\r\nconst literal = <NeverEvaluate />\r\n```\r\n";
const fixture = mixedEol
  ? source.replace('A paragraph: 50% + tax.', paragraph)
  : source;
const saved = fixture
  .replace('Original title', 'Updated title')
  .replace(
    paragraph,
    mixedEol
      ? paragraph.replace('A paragraph: 50% + tax.', 'Updated: 75% + tax.')
      : replacement.replace(/\n/g, '\r\n'),
  );
const unsaved = saved.replace('Second item', 'Recovered item');
await writeFile(file, fixture, { flag: 'wx' });
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
  const automatic = await script(
    `const done=arguments[arguments.length-1];done(Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Pause automatic recovery'));`,
  );
  if (automatic) await button('Pause automatic recovery');
  assert.equal((await invoke('stop_preview')).ok, true);
  return rootPid();
}
async function open() {
  await button('Open files');
  dialog(await rootPid(), 'choose', 'Open documents and modules', file);
  await fileIdle();
  await waitUi(
    "document.querySelector('select')?.value.endsWith('fidelity-acceptance.mdx')",
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
  await button('Rebuild preview');
  let previewPid;
  for (let attempt = 0; attempt < 100; attempt++) {
    const unit = systemctl(
      'list-units',
      '--all',
      '--plain',
      '--no-legend',
      `programmable-notes-preview-${first}-*.service`,
    )
      .split('\n')
      .find((line) => /active\s+running/.test(line));
    if (unit) {
      previewPid = Number(
        systemctl(
          'show',
          '--property=MainPID',
          '--value',
          unit.trim().split(/\s+/)[0],
        ),
      );
      break;
    }
    await pause(100);
  }
  if (!previewPid) {
    console.error(
      'NATIVE_PREVIEW_NOT_STARTED',
      JSON.stringify(
        await script(
          `const done=arguments[arguments.length-1];done({status:document.querySelector('[role="status"]')?.textContent,alerts:Array.from(document.querySelectorAll('[role="alert"]')).map(e=>e.textContent),source:document.querySelector('.cm-content')?.innerText});`,
        ),
      ),
    );
  }
  assert.ok(previewPid, 'Actual compiled native preview must run');
  execFileSync(
    'python3',
    ['scripts/native-atspi.py', String(previewPid), 'Native probe 0', 'click'],
    { timeout: 65000 },
  );
  execFileSync(
    'python3',
    ['scripts/native-atspi.py', String(previewPid), 'Native probe 1', 'find'],
    { timeout: 65000 },
  );
  await button('Stop preview');
  await invoke('stop_preview');
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(file, 'utf8'), fixture);
  console.log('NATIVE_MIXED_MDX_PREVIEW_AND_UNCHANGED_BOM_CRLF_SAVE_PASS');
  await button('Source');
  await waitUi("document.querySelector('.preview-pane').hidden === true");
  await button('Split');
  await waitUi("document.querySelector('.preview-pane').hidden === false");
  await button('Visual');
  await waitUi(
    "!Array.from(document.querySelector('[aria-label=\"Markdown editing\"]').querySelectorAll('button')).some(b=>b.textContent.includes('title: Protected')||b.textContent.includes('NeverEvaluate'))",
  );
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
  await inline(paragraph, 'Paragraph text', replacement);
  await expectSource(
    mixedEol ? 'Retain physical CRLF.' : 'Second line / retained.',
  );
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(file, 'utf8'), saved);
  assert.equal((await stat(file)).mode & 0o777, 0o640);
  console.log(
    'NATIVE_INLINE_UNDO_REDO_SAVE_PASS exact UTF-8/CRLF, punctuation, multiline, mode 0640',
  );
  if (mixedEol) {
    await history();
    await button('Save source');
    await fileIdle();
    assert.equal(
      await readFile(file, 'utf8'),
      fixture.replace('Original title', 'Updated title'),
    );
    await history(true);
    await button('Save source');
    await fileIdle();
    assert.equal(await readFile(file, 'utf8'), saved);
    console.log('NATIVE_INTERNAL_MIXED_LF_CRLF_EDIT_SAVE_UNDO_REDO_EXACT_PASS');
  }
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
