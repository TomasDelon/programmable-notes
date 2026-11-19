/** Production package only, in a disposable Linux desktop profile. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
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
const directory = join(
  process.env.XDG_DATA_HOME || join(homedir(), '.local/share'),
  'dev.programmablenotes.app/recovery',
);
const original = join(process.env.NATIVE_FIXTURE_DIR, 'recovery-original.mdx');
const restored = join(process.env.NATIVE_FIXTURE_DIR, 'restored-version.mdx');
const source = '\uFEFF# Recovery\r\n\r\nCafé and unchanged source.\r\n';
await writeFile(original, source, { flag: 'wx' });
async function wait(expression) {
  for (let i = 0; i < 200; i++) {
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
async function inventory() {
  const result = await invoke('recovery_draft', { action: 'list' });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}
async function recoveryIdle() {
  await wait(
    "!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Keep versioned snapshot')?.disabled",
  );
}
async function start() {
  await launch();
  await wait("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  const automatic = await script(
    `const done=arguments[arguments.length-1];done(Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Pause automatic recovery'));`,
  );
  if (automatic) await button('Pause automatic recovery');
  await invoke('stop_preview');
  await recoveryIdle();
  return rootPid();
}
async function shut(pid, dirty) {
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
  await close().catch(() => {});
}
async function openRecovery() {
  await wait("(document.querySelector('details').open=true,true)");
  await recoveryIdle();
}
try {
  const first = await start();
  assert.equal(
    (await inventory()).snapshots.length,
    0,
    'Use an empty disposable recovery profile',
  );
  await button('Open files');
  dialog(first, 'choose', 'Open documents and modules', original);
  await fileIdle();
  await openRecovery();
  await button('Keep versioned snapshot');
  await recoveryIdle();
  const one = (await inventory()).snapshots[0];
  assert.ok(one);
  await appendSource('NEW_NATIVE_DRAFT');
  await wait(
    "document.querySelector('.cm-content').innerText.includes('NEW_NATIVE_DRAFT')",
  );
  await button('Keep versioned snapshot');
  await recoveryIdle();
  const all = (await inventory()).snapshots;
  assert.equal(all.length, 2);
  const two = all.find((s) => s.metadata.generation === 2);
  assert.ok(two);
  const latest = await invoke('recovery_draft', {
    action: 'restore-version',
    file: two.file,
  });
  assert.equal(latest.ok, true);
  assert.equal(latest.value.source, source + '\r\nNEW_NATIVE_DRAFT');
  assert.equal(await readFile(original, 'utf8'), source);
  console.log('NATIVE_VERSIONS_EXACT_CRLF_AND_NO_ORIGINAL_WRITE_PASS');
  await shut(first, true);
  const second = await start();
  assert.notEqual(second, first);
  await openRecovery();
  await wait(
    'document.querySelectorAll(\'select[aria-label="Recovery version"] option\').length===2',
  );
  console.log('NATIVE_VERSION_DISCOVERY_AFTER_ACTUAL_RESTART_PASS');
  await script(
    `const done=arguments[arguments.length-1];const select=document.querySelector('select[aria-label="Recovery version"]');select.value=arguments[0];select.dispatchEvent(new Event('change',{bubbles:true}));done(true);`,
    [one.file],
  );
  await button('Restore selected version');
  await fileIdle();
  await recoveryIdle();
  await wait(
    "document.querySelector('select[aria-label=\"Source file\"]').value.endsWith('recovery-original.mdx')",
  );
  await button('Save source');
  dialog(second, 'cancel', 'Save source as');
  await fileIdle();
  assert.equal(await readFile(original, 'utf8'), source);
  await button('Save source');
  dialog(second, 'choose', 'Save source as', restored);
  await fileIdle();
  assert.equal(await readFile(restored, 'utf8'), source);
  assert.equal(await readFile(original, 'utf8'), source);
  console.log('NATIVE_RESTORE_UNSAVED_SAVE_AS_CANCEL_AND_EXACT_SAVE_PASS');
  const damaged = join(directory, two.file);
  const bytes = await readFile(damaged);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(damaged, bytes);
  await button('Refresh recovery versions');
  await recoveryIdle();
  await wait(
    "document.querySelector('[aria-label=\"Versioned recovery\"]').innerText.includes('integrity check failed')",
  );
  const refused = await invoke('recovery_draft', {
    action: 'restore-version',
    file: two.file,
  });
  assert.equal(refused.ok, false);
  assert.equal(await readFile(original, 'utf8'), source);
  assert.equal(await readFile(restored, 'utf8'), source);
  await button('Delete damaged version');
  await recoveryIdle();
  await button('Delete selected version');
  await recoveryIdle();
  assert.equal((await inventory()).snapshots.length, 0);
  console.log(
    'NATIVE_CORRUPT_VERSION_REFUSAL_VALID_OLDER_RECOVERY_AND_EXPLICIT_DELETE_PASS',
  );
  await shut(second, false);
} finally {
  await close().catch(() => {});
}
