/** Actual packaged editor Save failure/retry. Disposable Linux desktop only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFile,
  writeFile,
  stat,
  chmod,
  open,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { assertEmptySmallTmpfs } from './native-disposable-filesystem.mjs';
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
  dialog,
  fileIdle,
  waitUi,
  pause,
} from './native-ui-lib.mjs';

assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
const root = process.env.NATIVE_SAVE_ENOSPC_DIR;
const capacity = await assertEmptySmallTmpfs(root);
assert.ok(process.env.NATIVE_EVIDENCE_DIR);
await preflight();
const file = join(root, 'note.mdx');
const sibling = join(root, 'sibling.mdx');
const fillerPath = join(root, 'filler');
const before = 'Original café 😀 paragraph.';
const after = 'Changed: 75% + tax.';
const original =
  '\uFEFF# Disk full\r\n\r\n' + before + '\r\n\r\n<div>Opaque JSX</div>\r\n';
const expected = original.replace(before, after);
await writeFile(file, original, { flag: 'wx', mode: 0o640 });
await chmod(file, 0o640);
await writeFile(sibling, 'Untouched sibling.\r\n', { flag: 'wx', mode: 0o640 });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let owned;
let fillerCreated = false;
const report = {
  observerSha256: hash(await readFile(new URL(import.meta.url))),
  originalSha256: hash(original),
  phase: 'fixtures-created',
};
const reportPath = join(process.env.NATIVE_EVIDENCE_DIR, 'save-enospc.json');
await writeFile(reportPath, '{}\n', { flag: 'wx' });
async function keys(pid, ...args) {
  const ids = execFileSync(
    'xdotool',
    ['search', '--onlyvisible', '--pid', String(pid)],
    { encoding: 'utf8', timeout: 10000 },
  )
    .trim()
    .split(/\s+/);
  assert.equal(ids.length, 1);
  execFileSync('xdotool', ['windowactivate', '--sync', ids[0], ...args], {
    timeout: 10000,
  });
}
async function bytes(value) {
  assert.equal(await readFile(file, 'utf8'), value);
  assert.equal((await stat(file)).mode & 0o777, 0o640);
  assert.equal(await readFile(sibling, 'utf8'), 'Untouched sibling.\r\n');
}
async function cleanupOwned() {
  if (!owned) return;
  // Bind a kernel pidfd before validating identity: no signal-by-numeric-PID
  // fallback, even if the process exits and its numeric PID gets reused.
  execFileSync(
    'python3',
    [
      '-c',
      `
import hashlib,os,select,signal,sys
pid=int(sys.argv[1])
try: fd=os.pidfd_open(pid)
except ProcessLookupError: sys.exit(0)
try:
 try:
  start=open(f'/proc/{pid}/stat').read().rsplit(') ',1)[1].split()[19]
  digest=hashlib.sha256(open(f'/proc/{pid}/exe','rb').read()).hexdigest()
  uid=os.stat(f'/proc/{pid}').st_uid
 except FileNotFoundError: sys.exit(0)
 if start!=sys.argv[2] or digest!=sys.argv[3] or uid!=int(sys.argv[4]):
  raise RuntimeError('Owned Root identity changed; no signal sent')
 try: signal.pidfd_send_signal(fd,signal.SIGTERM)
 except ProcessLookupError: sys.exit(0)
 if not select.select([fd],[],[],5)[0]: raise RuntimeError('Owned Root failed to exit')
finally: os.close(fd)
`,
      String(owned.pid),
      owned.start,
      owned.executableSha256,
      String(process.getuid()),
    ],
    { timeout: 10000 },
  );
}
let failure;
try {
  await launch();
  const pid = await rootPid();
  const start = (await readFile(`/proc/${pid}/stat`, 'utf8'))
    .split(') ')
    .at(-1)
    .split(' ')[19];
  owned = {
    pid,
    start,
    executableSha256: hash(await readFile(`/proc/${pid}/exe`)),
  };
  report.root = owned;
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  const automatic = await script(
    "arguments[arguments.length-1](Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Pause automatic recovery'));",
  );
  if (automatic) await button('Pause automatic recovery');
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', file);
  await fileIdle();
  await waitUi("document.querySelector('select')?.value.endsWith('note.mdx')");
  await button('Visual');
  await button(before);
  const element = await wd(`/session/${session}/element`, {
    using: 'css selector',
    value: 'textarea[aria-label="Paragraph text"]',
  });
  const id = element['element-6066-11e4-a52e-4f735466cecf'];
  await wd(`/session/${session}/element/${id}/clear`, {});
  await wd(`/session/${session}/element/${id}/click`, {});
  await keys(pid, 'type', '--clearmodifiers', '--delay', '1', after);
  await waitUi(
    `document.querySelector('textarea')?.value===${JSON.stringify(after)}`,
  );
  assert.equal(
    await script(
      "arguments[arguments.length-1](document.querySelector('textarea').value);",
    ),
    after,
  );
  await keys(pid, 'key', '--clearmodifiers', 'Return');
  await waitUi("!document.querySelector('textarea')");
  await bytes(original);
  report.phase = 'visual-edit-applied';
  const filler = await open(fillerPath, 'wx', 0o600);
  fillerCreated = true;
  try {
    let full = false;
    for (let written = 0; written <= capacity; written += 65536) {
      try {
        await filler.writeFile(Buffer.alloc(65536, 1));
      } catch (error) {
        assert.equal(error.code, 'ENOSPC');
        full = true;
        break;
      }
    }
    assert.ok(full, 'Bounded filler did not encounter actual ENOSPC');
  } finally {
    await filler.close();
  }
  await button('Save source');
  await fileIdle();
  await waitUi(
    "document.querySelector('[data-file-error]')?.textContent.includes('No space left')",
  );
  report.error = await script(
    "arguments[arguments.length-1](document.querySelector('[data-file-error]').textContent);",
  );
  await waitUi(
    "document.querySelector('[aria-label=\"Document status\"]')?.textContent==='Unsaved changes'",
  );
  await bytes(original);
  await writeFile(
    join(process.env.NATIVE_EVIDENCE_DIR, 'save-enospc-error.png'),
    Buffer.from(
      await wd(`/session/${session}/screenshot`, undefined, 'GET'),
      'base64',
    ),
  );
  await button('Undo');
  await waitUi(
    `Array.from(document.querySelectorAll('button.rendered-text')).some(b=>b.textContent===${JSON.stringify(before)})`,
  );
  await bytes(original);
  await button('Redo');
  await waitUi(
    `Array.from(document.querySelectorAll('button.rendered-text')).some(b=>b.textContent===${JSON.stringify(after)})`,
  );
  await bytes(original);
  report.phase = 'real-enospc-error-buffer-and-history-preserved';
  await unlink(fillerPath);
  fillerCreated = false;
  await button('Save source');
  await fileIdle();
  await waitUi(
    "document.querySelector('[aria-label=\"Document status\"]')?.textContent==='Saved.' && !document.querySelector('[data-file-error]')",
  );
  await bytes(expected);
  await button('Reopen source');
  await fileIdle();
  await waitUi(
    "document.querySelector('[aria-label=\"Document status\"]')?.textContent==='Reopened from disk.' && !document.querySelector('[data-file-error]')",
  );
  await bytes(expected);
  report.savedSha256 = hash(await readFile(file));
  report.phase = 'saved-and-reopened-exact';
  execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
    timeout: 10000,
  });
  for (let n = 0; n < 100; n++) {
    try {
      await stat(`/proc/${pid}`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    await pause(100);
  }
  await assert.rejects(stat(`/proc/${pid}`), { code: 'ENOENT' });
  report.phase = 'clean-exit-verified';
} catch (error) {
  failure = error;
  report.errorThrown = String(error);
} finally {
  try {
    if (fillerCreated) await unlink(fillerPath);
  } catch (error) {
    failure ||= error;
    report.fillerCleanupError = String(error);
  }
  try {
    await cleanupOwned();
  } catch (error) {
    failure ||= error;
    report.rootCleanupError = String(error);
  }
  try {
    await writeFile(
      join(process.env.NATIVE_EVIDENCE_DIR, 'note-final.mdx'),
      await readFile(file),
      { flag: 'wx' },
    );
    await writeFile(
      join(process.env.NATIVE_EVIDENCE_DIR, 'sibling-final.mdx'),
      await readFile(sibling),
      { flag: 'wx' },
    );
  } catch (error) {
    failure ||= error;
    report.fixtureCaptureError = String(error);
  }
  await close().catch(() => {});
  report.outcome = failure ? 'fail' : 'pass';
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}
if (failure) throw failure;
console.log(
  'NATIVE_REAL_SAVE_ENOSPC_VISIBLE_ERROR_EXACT_ORIGINAL_BUFFER_HISTORY_RETRY_REOPEN_PASS',
);
