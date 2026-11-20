/** Unapplied inline input in the installed editor; disposable synthetic data only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
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
assert.ok(process.env.NATIVE_EVIDENCE_DIR);
const file = join(process.env.NATIVE_FIXTURE_DIR, 'pending-inline.mdx');
const original = process.argv.includes('--leading-bom')
  ? '\uFEFFOriginal paragraph.\r\n\r\nSecond paragraph.\r\n\r\n<div>Opaque JSX 😀</div>\r\n'
  : '\uFEFF---\r\ntitle: Native pending input\r\n---\r\n\r\nOriginal paragraph.\r\n\r\nSecond paragraph.\r\n\r\n<div>Opaque JSX 😀</div>\r\n';
const replacement = 'Applied native paragraph.';
const shortcuts = process.argv.includes('--shortcuts');
await writeFile(file, original, { flag: 'wx', mode: 0o640 });
async function screenshot(name) {
  await mkdir(process.env.NATIVE_EVIDENCE_DIR, { recursive: true });
  const png = await wd(`/session/${session}/screenshot`, undefined, 'GET');
  await writeFile(
    join(process.env.NATIVE_EVIDENCE_DIR, name),
    Buffer.from(png, 'base64'),
  );
}
async function keys(pid, key) {
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
    ['windowactivate', '--sync', windows[0], 'key', '--clearmodifiers', key],
    { timeout: 10000 },
  );
}
async function input(value) {
  const field = await wd(`/session/${session}/element`, {
    using: 'css selector',
    value: 'textarea[aria-label="Paragraph text"]',
  });
  const id = field['element-6066-11e4-a52e-4f735466cecf'];
  await wd(`/session/${session}/element/${id}/clear`, {});
  await wd(`/session/${session}/element/${id}/value`, { text: value });
  await waitUi(
    `document.querySelector('textarea[aria-label="Paragraph text"]')?.value===${JSON.stringify(value)}`,
  );
}
function closeWindow(pid) {
  execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
    timeout: 10000,
  });
}
async function disk(source) {
  assert.equal(await readFile(file, 'utf8'), source);
  assert.equal((await stat(file)).mode & 0o777, 0o640);
}
try {
  await launch();
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  await button('Pause automatic recovery');
  const initial = await invoke('recovery_draft', { action: 'list' });
  assert.equal(initial.ok, true);
  assert.equal(
    initial.value.snapshots.length,
    0,
    'Use an empty disposable profile',
  );
  const pid = await rootPid();
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', file);
  await fileIdle();
  await waitUi(
    "document.querySelector('select[aria-label=\"Source file\"]')?.value.endsWith('pending-inline.mdx')",
  );
  await button('Visual');
  await button('Original paragraph.');
  await input('Unapplied native text.');
  if (shortcuts) {
    await keys(pid, 'ctrl+s');
    await waitUi(
      "document.querySelector('textarea')?.value==='Unapplied native text.'",
    );
  }
  await waitUi(
    "document.querySelector('[aria-label=\"Document status\"]')?.textContent==='Unapplied visual edit'",
  );
  const guarded = await script(
    `const done=arguments[arguments.length-1];const names=['Save source','Save As','Open files','Reopen source','Close source','New note','Second paragraph.'];done(names.every(name=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===name)?.disabled) && document.querySelector('select[aria-label="Source file"]').disabled);`,
  );
  assert.equal(guarded, true);
  await disk(original);
  await screenshot('native-pending.png');
  closeWindow(pid);
  dialog(pid, 'button', 'Unsaved source', 'Cancel');
  assert.doesNotThrow(() => process.kill(pid, 0));
  await waitUi(
    "document.querySelector('textarea')?.value==='Unapplied native text.'",
  );
  await disk(original);
  console.log(
    'NATIVE_PENDING_GUARDS_UNCHANGED_ORIGINAL_AND_ACTUAL_DIRTY_CLOSE_CANCEL_PASS',
  );
  await button('Source');
  await button('Visual');
  await waitUi(
    "document.querySelector('textarea')?.value==='Unapplied native text.'",
  );
  await keys(pid, 'Escape');
  await fileIdle();
  await disk(original);
  await button('Original paragraph.');
  await input(replacement);
  await keys(pid, 'Return');
  await fileIdle();
  await waitUi(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent===${JSON.stringify(replacement)})`,
  );
  const saved = original.replace('Original paragraph.', replacement);
  if (shortcuts) {
    await keys(pid, 'ctrl+s');
    await waitUi(
      "document.querySelector('[aria-label=\"Document status\"]')?.textContent==='Saved.'",
    );
  } else await button('Save source');
  await fileIdle();
  await disk(saved);
  await button('Undo');
  await button('Save source');
  await fileIdle();
  await disk(original);
  await button('Redo');
  await button('Save source');
  await fileIdle();
  await disk(saved);
  await button('Reopen source');
  await fileIdle();
  await disk(saved);
  await screenshot('native-applied.png');
  assert.equal(
    (await invoke('recovery_draft', { action: 'list' })).value.snapshots.length,
    0,
  );
  console.log(
    'NATIVE_PENDING_ESCAPE_APPLY_EXACT_BOM_CRLF_SAVE_UNDO_REDO_REOPEN_0640_PASS',
  );
  if (shortcuts) {
    const copy = join(process.env.NATIVE_FIXTURE_DIR, 'keyboard-save-as.mdx');
    await button('Source');
    await script(
      'const done=arguments[arguments.length-1];document.querySelector(".cm-content").focus();done(true);',
    );
    await keys(pid, 'ctrl+shift+s');
    dialog(pid, 'cancel', 'Save source as');
    await fileIdle();
    await disk(saved);
    await keys(pid, 'ctrl+shift+s');
    dialog(pid, 'choose', 'Save source as', copy);
    await fileIdle();
    await disk(saved);
    assert.equal(await readFile(copy, 'utf8'), saved);
    console.log(
      'NATIVE_TRUSTED_CTRL_SAVE_PENDING_GUARD_AND_SHIFT_SAVE_AS_CANCEL_EXACT_COPY_PASS',
    );
  }
  closeWindow(pid);
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
    await pause(100);
  }
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  console.log('NATIVE_PENDING_CLEAN_EXIT_PASS');
} finally {
  await close().catch(() => {});
}
