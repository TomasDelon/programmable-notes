/** Real keyboard/disk regression. Use only a fresh disposable desktop profile. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, realpath, writeFile, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  script,
} from './native-webdriver-lib.mjs';
import { rootPid, button, dialog, fileIdle, waitUi } from './native-ui-lib.mjs';

await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR);
assert.ok(process.env.NATIVE_EVIDENCE_DIR);
const file = join(process.env.NATIVE_FIXTURE_DIR, 'source-whitespace.mdx');
const original = '\uFEFF# Whitespace\r\n\r\nExplicit\u00a0NBSP stays.\r\n';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const output = join(process.env.NATIVE_EVIDENCE_DIR, 'source-whitespace.json');
await writeFile(output, '{"incomplete":true}\n', { flag: 'wx' });
await writeFile(file, original, { flag: 'wx', mode: 0o640 });
await chmod(file, 0o640);
const report = {
  passed: false,
  observerSha256: digest(await readFile(new URL(import.meta.url))),
};

async function save(expected) {
  await waitUi(
    "document.querySelector('[aria-label=\"Document status\"]')?.textContent==='Unsaved changes'",
  );
  await button('Save source');
  await fileIdle();
  await waitUi(
    "document.querySelector('[aria-label=\"Document status\"]')?.textContent==='Saved.'",
  );
  assert.equal(await readFile(file, 'utf8'), expected);
  assert.equal((await stat(file)).mode & 0o777, 0o640);
}
try {
  await launch();
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  const pid = await rootPid();
  const installed = await realpath(`/proc/${pid}/exe`);
  report.executableSha256 = digest(await readFile(installed));
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', file);
  await fileIdle();
  await button('Source');
  await waitUi(
    "document.querySelector('.cm-content')?.textContent.includes('Explicit')",
  );
  report.styles = await script(
    `const e=document.querySelector('.cm-content');const before=getComputedStyle(e).whiteSpace;const denied=document.createElement('style');denied.textContent='.cm-content{white-space:normal!important}';document.head.append(denied);arguments[arguments.length-1]({before,after:getComputedStyle(e).whiteSpace,hostNoncePresent:!!document.querySelector('style[nonce]')?.nonce});`,
  );
  assert.match(report.styles.before, /^(pre-wrap|break-spaces)$/);
  assert.equal(
    report.styles.after,
    report.styles.before,
    'Unauthorized CSS must remain denied',
  );
  await script(
    `document.querySelector('.cm-content').focus();arguments[arguments.length-1](true);`,
  );
  const windows = execFileSync(
    'xdotool',
    ['search', '--onlyvisible', '--pid', String(pid)],
    { encoding: 'utf8', timeout: 10000 },
  )
    .trim()
    .split(/\s+/);
  assert.equal(windows.length, 1);
  for (const key of ['ctrl+End', 'space'])
    execFileSync(
      'xdotool',
      ['windowactivate', '--sync', windows[0], 'key', '--clearmodifiers', key],
      { timeout: 10000 },
    );
  await waitUi(
    "document.querySelector('[aria-label=\"Document status\"]')?.textContent==='Unsaved changes'",
  );
  await save(original + ' ');
  await button('Undo');
  await save(original);
  await button('Redo');
  await save(original + ' ');
  const reopened = original.replace('Whitespace', 'Reloaded whitespace') + ' ';
  // Change only this owned fixture while the editor is clean, then prove that
  // Reopen reads the changed disk bytes instead of accepting a no-op click.
  await writeFile(file, reopened);
  await button('Reopen source');
  await fileIdle();
  await waitUi(
    "document.querySelector('.cm-content')?.textContent.includes('Reloaded whitespace')",
  );
  await script(
    `document.querySelector('.cm-content').focus();arguments[arguments.length-1](true);`,
  );
  for (const key of ['ctrl+End', 'space'])
    execFileSync(
      'xdotool',
      ['windowactivate', '--sync', windows[0], 'key', '--clearmodifiers', key],
      { timeout: 10000 },
    );
  await save(reopened + ' ');
  report.exactSaveHistoryAndReopen = true;
  report.originalSha256 = digest(original);
  report.savedSha256 = digest(await readFile(file));
  report.passed = true;
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  try {
    await close();
    report.sessionClosed = true;
  } catch (error) {
    report.closeError = String(error);
    report.passed = false;
    process.exitCode = 1;
  }
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('NATIVE_SOURCE_WHITESPACE_RESULT', JSON.stringify(report));
}
