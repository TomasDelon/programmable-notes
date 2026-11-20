/** Real installed-app dialogs and on-disk writes. No mocked transport/save Blob. */
import assert from 'node:assert/strict';
import { readFile, writeFile, stat, chmod, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import {
  preflight,
  launch,
  close,
  invoke,
  systemctl,
  script,
} from './native-webdriver-lib.mjs';
import {
  rootPid,
  button,
  waitUi,
  dialog,
  appendSource,
  fileIdle,
  readSourceText,
  pause,
  previewUi,
} from './native-ui-lib.mjs';
await preflight();
assert.ok(
  process.env.NATIVE_FIXTURE_DIR && process.env.NATIVE_PID_FILE,
  'Run native-test-setup first',
);
const root = process.env.NATIVE_FIXTURE_DIR,
  path = join(root, 'note.mdx'),
  copy = join(root, 'saved-as.mdx');
const original =
  (
    await readFile('docs/handoff/samples/fixtures/counter.mdx', 'utf8')
  ).replaceAll('\n', '\r\n') + '\r\nUnicode café λ\r\n';
await writeFile(path, original, { mode: 0o640 });
execFileSync('setfacl', ['-m', 'u:65534:r--', path]);
const originalAcl = execFileSync('getfacl', ['-cp', path], {
  encoding: 'utf8',
});
let pid;
try {
  await launch();
  pid = await rootPid();
  await waitUi(`Boolean(document.querySelector('.cm-content'))`);
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  // Cancellation must preserve the old editor and create no authorization/write.
  const before = await readSourceText();
  await button('Open files');
  dialog(pid, 'cancel', 'Open documents and modules');
  await fileIdle();
  assert.equal(await readSourceText(), before);
  console.log('PICKER_CANCEL_PASS');
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', path);
  await fileIdle();
  await waitUi(`document.querySelector('select')?.value.includes('note.mdx')`);
  assert.equal(await readFile(path, 'utf8'), original);
  const forged = await invoke('save_document', {
    id: 'not-authorized',
    revision: 'none',
    source: 'unauthorized',
  });
  assert.equal(forged.ok, false);
  assert.match(forged.error, /Unknown document/);
  assert.equal(await readFile(path, 'utf8'), original);
  console.log('EDITOR_FORGED_GRANT_DENIED', JSON.stringify(forged));
  const inode = (await stat(path)).ino;
  const marker = '<button>X</button>';
  await appendSource(marker);
  const expected = original + '\r\n' + marker;
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(path, 'utf8'), expected);
  assert.notEqual((await stat(path)).ino, inode);
  assert.equal((await stat(path)).mode & 0o777, 0o640);
  assert.equal(
    execFileSync('getfacl', ['-cp', path], { encoding: 'utf8' }),
    originalAcl,
  );
  console.log(
    'NATIVE_ATOMIC_SAVE_PASS',
    JSON.stringify({
      path,
      utf8CrlfExact: true,
      mode: '0640',
      posixAclPreserved: true,
      replacedInode: true,
    }),
  );
  // Actual read-only error, retry, and no data loss.
  await appendSource('local edit');
  const unsaved = expected + '\r\nlocal edit';
  await chmod(path, 0o400);
  await button('Save source');
  await fileIdle();
  await waitUi(
    `document.querySelector('[data-file-error]')?.textContent.includes('read-only')`,
  );
  assert.equal(await readFile(path, 'utf8'), expected);
  assert.match(await readSourceText(), /local edit/);
  await chmod(path, 0o640);
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(path, 'utf8'), unsaved);
  console.log('READ_ONLY_RECOVERY_PASS');
  await appendSource('keep this');
  const preserved = unsaved + '\r\nkeep this';
  await writeFile(path, '# External disk version\r\n');
  await button('Save source');
  await fileIdle();
  await waitUi(
    `document.querySelector('[data-file-error]')?.textContent.includes('changed on disk')`,
  );
  assert.equal(await readFile(path, 'utf8'), '# External disk version\r\n');
  assert.match(await readSourceText(), /keep this/);
  await button('Reopen source');
  dialog(pid, 'button', 'Unsaved source', 'Cancel');
  await fileIdle();
  assert.match(await readSourceText(), /keep this/);
  // Preserve the unsaved version in an explicitly selected new file.
  await button('Save As');
  dialog(pid, 'choose', 'Save source as', copy);
  await fileIdle();
  assert.equal(await readFile(copy, 'utf8'), preserved);
  assert.equal(await readFile(path, 'utf8'), '# External disk version\r\n');
  console.log('CONFLICT_SAVE_AS_PASS');
  await writeFile(copy, original);
  await button('Reopen source');
  await fileIdle();
  await waitUi(
    `document.querySelector('.cm-content')?.innerText.includes('Unicode café')`,
  );
  assert.equal(await readFile(copy, 'utf8'), original);
  console.log('REOPEN_PASS');
  await appendSource(marker);
  await button('Save source');
  await fileIdle();
  assert.equal(await readFile(copy, 'utf8'), original + '\r\n' + marker);
  await button('Rebuild preview');
  await waitUi(
    `document.querySelector('[role=status]')?.textContent.startsWith('Compiled')`,
    40,
  );
  let active;
  for (let i = 0; i < 100; i++) {
    const units = systemctl(
      'list-units',
      '--all',
      '--no-legend',
      '--plain',
      `programmable-notes-preview-${pid}-*`,
    );
    active = units.split('\n').find((line) => /active\s+running/.test(line));
    if (active) break;
    await pause(100);
  }
  assert.ok(active, 'No source-built service');
  const unit = active.trim().split(/\s+/)[0],
    child = Number(systemctl('show', '--property=MainPID', '--value', unit));
  previewUi(child, 'Count: 0');
  previewUi(child, 'Count: 1');
  previewUi(child, 'Count: 2', 'find');
  previewUi(child, 'X', 'find');
  await button('Stop preview');
  await pause(200);
  assert.equal((await invoke('stop_preview')).ok, true);
  assert.ok(
    !(await readdir(root)).some((name) => name.startsWith('.pn-save-')),
  );
  console.log(
    'NATIVE_PERSISTENCE_PASS actual picker, atomic disk writes, permission/conflict/cancel/reopen, interactive release preview',
  );
} catch (error) {
  try {
    console.error(
      'FAILURE_UI',
      await script(
        `const done=arguments[arguments.length-1];done({body:document.body.innerText,selection:document.querySelector('select')?.value});`,
      ),
    );
  } catch {
    /* An exited app has no UI to inspect. */
  }
  throw error;
} finally {
  try {
    await invoke('stop_preview');
  } catch {
    /* Preserve original failure if the app already exited. */
  }
  await close();
}
