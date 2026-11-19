/** External disposable installed-app probe; no author-controlled native signal. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import { preflight, launch, close, invoke } from './native-webdriver-lib.mjs';
import { rootPid, button, dialog, pause, waitUi } from './native-ui-lib.mjs';
const args = process.argv.slice(2);
assert.ok(
  args.length === 0 || (args.length === 1 && args[0] === '--picker'),
  'Expected no options or --picker',
);
const picker = args.includes('--picker');
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_EVIDENCE_DIR);
let owned;
let failure;
async function identity(pid) {
  const s = (await readFile(`/proc/${pid}/stat`, 'utf8'))
    .split(') ')
    .at(-1)
    .split(' ');
  return {
    pid,
    startTick: s[19],
    executableSha256: createHash('sha256')
      .update(await readFile(`/proc/${pid}/exe`))
      .digest('hex'),
  };
}
async function visible(pid, title) {
  const end = Date.now() + 2000;
  for (;;) {
    const r = spawnSync(
      'xdotool',
      [
        'search',
        '--all',
        '--onlyvisible',
        '--pid',
        String(pid),
        '--name',
        '^' + title + '$',
      ],
      { encoding: 'utf8', timeout: 8000 },
    );
    if (
      r.status !== 0 &&
      /BadWindow|BadDrawable/.test(r.stderr) &&
      Date.now() < end
    ) {
      await pause(50);
      continue;
    }
    assert.ok(r.status === 0 || r.status === 1, String(r.error || r.stderr));
    if (r.status === 1) {
      assert.equal(r.stdout.trim(), '');
      assert.equal(r.stderr.trim(), '');
      return false;
    }
    assert.match(r.stdout.trim(), /^\d+(?:\s+\d+)*$/);
    return true;
  }
}

try {
  await launch();
  const pid = await rootPid();
  owned = await identity(pid);
  console.log('EDITOR_FAILURE_PROBE_IDENTITY', JSON.stringify(owned));
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  const pending = invoke('confirm_discard');
  await pause(250);
  dialog(pid, 'button', 'Unsaved source', 'Cancel');
  assert.deepEqual(await pending, { ok: true, value: false });
  console.log('NATIVE_DIALOG_POSITIVE_CONTROL_PASS');
  assert.equal(
    (await invoke('set_documents_dirty', { dirty: false, busy: true })).ok,
    true,
  );
  execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
    timeout: 10000,
  });
  dialog(pid, 'button', 'File operation in progress', 'OK');
  assert.doesNotThrow(() => process.kill(pid, 0));
  assert.equal((await invoke('host_probe')).ok, true);
  console.log('HEALTHY_EDITOR_BUSY_CLOSE_GUARD_PASS');
  if (picker) {
    await button('Open files');
    for (
      let i = 0;
      i < 100 && !(await visible(pid, 'Open documents and modules'));
      i++
    )
      await pause(100);
    assert.ok(await visible(pid, 'Open documents and modules'));
    console.log('OPEN_PICKER_POSITIVE_CONTROL_PASS');
  }
  await writeFile(
    join(process.env.NATIVE_EVIDENCE_DIR, 'kill-editor-renderer.json'),
    JSON.stringify(owned),
    { flag: 'wx' },
  );
  let receipt;
  for (let i = 0; i < 300; i++) {
    try {
      receipt = JSON.parse(
        await readFile(
          join(process.env.NATIVE_EVIDENCE_DIR, 'editor-renderer-killed.json'),
          'utf8',
        ),
      );
      break;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      await pause(100);
    }
  }
  assert.ok(receipt, 'Owned renderer kill receipt required');
  assert.equal(receipt.root.pid, owned.pid);
  assert.equal(receipt.root.startTick, owned.startTick);
  assert.equal(receipt.root.executableSha256, owned.executableSha256);
  assert.equal(
    receipt.renderer.exe,
    '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebProcess',
  );
  assert.ok(Number.isInteger(receipt.renderer.pid) && receipt.renderer.pid > 1);
  assert.match(receipt.renderer.executableSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.renderer.uid, process.getuid());
  assert.equal(receipt.signal, 'SIGKILL');
  assert.equal(receipt.rootSurvived, true);
  console.log('EDITOR_RENDERER_KILL_RECEIPT', JSON.stringify(receipt));
  if (picker) {
    let observed = false;
    for (let i = 0; i < 100; i++) {
      const lines = execFileSync(
        'journalctl',
        ['--user', '--no-pager', '-o', 'json', '_PID=' + pid],
        { encoding: 'utf8', timeout: 8000 },
      );
      observed = lines
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .some(
          (row) =>
            row._EXE === '/usr/bin/programmable-notes' &&
            row.MESSAGE === 'NATIVE_EDITOR_RENDERER_STOPPED reason=Crashed',
        );
      if (observed) break;
      await pause(100);
    }
    assert.ok(
      observed,
      'Actual native signal must be handled before testing serialization',
    );
    for (let i = 0; i < 8; i++) {
      assert.ok(
        await visible(pid, 'Open documents and modules'),
        'Picker must remain open',
      );
      assert.equal(
        await visible(pid, 'Editor stopped'),
        false,
        'Failure notice must not overlap the existing picker',
      );
      await pause(250);
    }
    dialog(pid, 'cancel', 'Open documents and modules');
    console.log('PICKER_CANCELLED_AFTER_NATIVE_FAILURE_SIGNAL');
  }
  for (let i = 0; i < 100 && !(await visible(pid, 'Editor stopped')); i++)
    await pause(100);
  assert.ok(
    await visible(pid, 'Editor stopped'),
    'Native failure notice must become visible',
  );
  execFileSync(
    'python3',
    [
      '-c',
      'import gi,sys; gi.require_version("Gdk","3.0"); from gi.repository import Gdk; Gdk.init([]); w=Gdk.get_default_root_window(); p=Gdk.pixbuf_get_from_window(w,0,0,w.get_width(),w.get_height()); assert p; p.savev(sys.argv[1],"png",[],[])',
      join(process.env.NATIVE_EVIDENCE_DIR, 'editor-stopped.png'),
    ],
    { timeout: 10000 },
  );
  try {
    dialog(pid, 'button', 'Editor stopped', 'Quit editor');
  } catch (error) {
    try {
      execFileSync('python3', ['scripts/native-close-window.py', String(pid)], {
        timeout: 10000,
      });
      dialog(pid, 'button', 'File operation in progress', 'OK');
      assert.doesNotThrow(() => process.kill(pid, 0));
      console.log('STALE_CLIENT_BUSY_BLOCKS_NORMAL_CLOSE_CONFIRMED');
    } catch (diagnostic) {
      console.error('CLOSE_DIAGNOSTIC', String(diagnostic));
    }
    throw error;
  }
  for (let i = 0; i < 200; i++) {
    try {
      process.kill(pid, 0);
    } catch (e) {
      if (e.code === 'ESRCH') break;
      throw e;
    }
    await pause(100);
  }
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  console.log('NATIVE_EDITOR_FAILURE_EXPLICIT_QUIT_WITH_STALE_BUSY_PASS');
} catch (error) {
  failure = error;
} finally {
  await close().catch(() => {});
  if (owned) {
    try {
      assert.deepEqual(await identity(owned.pid), owned);
      process.kill(owned.pid, 'SIGTERM');
      console.log('OWNED_PROBE_ROOT_CLEANUP', JSON.stringify(owned));
    } catch (e) {
      if (e.code !== 'ENOENT' && e.code !== 'ESRCH')
        failure = new AggregateError(
          failure ? [failure, e] : [e],
          'Probe or owned cleanup failed',
        );
    }
  }
}

if (failure) throw failure;
