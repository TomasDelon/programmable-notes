/** Actual native saves/close protection when a different source is dirty. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  script,
  wd,
  session,
} from './native-webdriver-lib.mjs';
import {
  button,
  rootPid,
  waitUi,
  fileIdle,
  dialog,
  appendSource,
  pause,
} from './native-ui-lib.mjs';
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR && process.env.NATIVE_EVIDENCE_DIR);
const alpha = join(process.env.NATIVE_FIXTURE_DIR, 'alpha.mdx');
const beta = join(process.env.NATIVE_FIXTURE_DIR, 'beta.mdx');
const originalAlpha = '\uFEFF# Alpha\r\n\r\n<div>Opaque 😀</div>\r\n';
const originalBeta = '\uFEFF# Beta unchanged\r\n';
await writeFile(alpha, originalAlpha, { flag: 'wx', mode: 0o640 });
await writeFile(beta, originalBeta, { flag: 'wx', mode: 0o640 });
const report = {
  observerSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
};
const output = join(process.env.NATIVE_EVIDENCE_DIR, 'document-status.json');
await writeFile(output, '{}\n', { flag: 'wx' });
async function status(text) {
  await waitUi(
    `document.querySelector('[aria-label="Document status"]')?.textContent===${JSON.stringify(text)}`,
  );
}
async function screenshot(name) {
  const png = await wd(`/session/${session}/screenshot`, undefined, 'GET');
  await writeFile(
    join(process.env.NATIVE_EVIDENCE_DIR, name),
    Buffer.from(png, 'base64'),
    { flag: 'wx' },
  );
}
async function select(key) {
  assert.equal(
    await script(
      `const done=arguments[arguments.length-1];const s=document.querySelector('select[aria-label="Source file"]');if(!s||s.disabled)return done(false);s.value=arguments[0];s.dispatchEvent(new Event('change',{bubbles:true}));done(true);`,
      [key],
    ),
    true,
  );
}
async function selection() {
  return script(
    `arguments[arguments.length-1](document.querySelector('select[aria-label="Source file"]').value);`,
  );
}
async function exactFiles(alphaSource) {
  assert.equal(await readFile(alpha, 'utf8'), alphaSource);
  assert.equal(await readFile(beta, 'utf8'), originalBeta);
  for (const path of [alpha, beta])
    assert.equal((await stat(path)).mode & 0o777, 0o640);
}
function closeWindow(pid) {
  execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
    timeout: 10000,
  });
}
let failure;
try {
  await launch();
  const pid = await rootPid();
  report.executableSha256 = createHash('sha256')
    .update(await readFile(`/proc/${pid}/exe`))
    .digest('hex');
  await waitUi("!!document.querySelector('.cm-content')");
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
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', alpha);
  await fileIdle();
  await button('Source');
  const alphaKey = await selection();
  assert.ok(alphaKey.endsWith('/alpha.mdx'));
  await appendSource('Alpha unsaved');
  await status('Unsaved changes');
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', beta);
  await fileIdle();
  const betaKey = await selection();
  assert.ok(betaKey.endsWith('/beta.mdx'));
  await status('Source unchanged');
  await waitUi(
    `document.querySelector('[aria-label="Workspace status"]')?.textContent==='1 other source has unsaved changes.'`,
  );
  await exactFiles(originalAlpha);
  await screenshot('native-clean-selected-dirty-sibling.png');
  await button('Save source');
  await fileIdle();
  await status('Saved.');
  await exactFiles(originalAlpha);
  await screenshot('native-saved-selected-dirty-sibling.png');
  closeWindow(pid);
  dialog(pid, 'button', 'Unsaved source', 'Cancel');
  process.kill(pid, 0);
  await status('Saved.');
  report.savedSiblingAndActualDirtyCloseCancel = true;
  await select(alphaKey);
  await status('Unsaved changes');
  await button('Save source');
  await fileIdle();
  await status('Saved.');
  const expectedAlpha = originalAlpha + '\r\nAlpha unsaved';
  await exactFiles(expectedAlpha);
  await waitUi(`!document.querySelector('[aria-label="Workspace status"]')`);
  await select(betaKey);
  await status('Source unchanged');
  await button('Reopen source');
  await fileIdle();
  await status('Reopened from disk.');
  await exactFiles(expectedAlpha);
  report.exactBomCrlfSavesMode0640ReopenAndNoticeOwnership = true;
  const final = await invoke('recovery_draft', { action: 'list' });
  assert.equal(final.ok, true);
  assert.equal(final.value.snapshots.length, 0);
  closeWindow(pid);
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') break;
      throw error;
    }
    await pause(100);
  }
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  report.actualCleanExit = true;
} catch (error) {
  failure = error;
  report.error = String(error);
} finally {
  await close().catch((error) => {
    failure ||= error;
    report.closeError = String(error);
  });
  report.outcome = failure ? 'fail' : 'pass';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('NATIVE_DOCUMENT_STATUS_EVIDENCE', output);
}
if (failure) throw failure;
console.log(
  'PASS selected native status, dirty sibling cancellation, exact saves/reopen, modes and clean exit',
);
