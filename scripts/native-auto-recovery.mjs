/** Real native automatic recovery. Synthetic fixtures, disposable profile only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
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
const args = process.argv.slice(2);
assert.ok(
  args.length <= 1 &&
    args.every((arg) =>
      ['--new-notes', '--extension-case', '--renderer-restart'].includes(arg),
    ),
  'Expected at most one of --new-notes or --extension-case or --renderer-restart',
);
const newNotes = args.includes('--new-notes');
const rendererRestart = args.includes('--renderer-restart');
const extensionCase = args.includes('--extension-case') || rendererRestart;
assert.ok(
  !rendererRestart || process.env.NATIVE_CRASH_RESTART !== '1',
  'Do not combine renderer restart with NATIVE_CRASH_RESTART',
);
await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_FIXTURE_DIR);
const recoveryDirectory = join(
  process.env.XDG_DATA_HOME || join(homedir(), '.local/share'),
  'dev.programmablenotes.app/recovery',
);
const originalName = extensionCase
  ? 'automatic-original.MdX'
  : 'automatic-original.mdx';
const copyName = extensionCase
  ? 'automatic-restored.MdX'
  : 'automatic-restored.mdx';
const original = join(process.env.NATIVE_FIXTURE_DIR, originalName);
const copy = join(process.env.NATIVE_FIXTURE_DIR, copyName);
const source =
  '\uFEFF# Automatic recovery\r\n\r\nCafé — original stays unchanged.\r\n';
await writeFile(original, source, { flag: 'wx', mode: 0o640 });
// Establish a synthetic permission fixture independently of the session umask.
await chmod(original, 0o640);
async function wait(expression) {
  for (let i = 0; i < 300; i++) {
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
async function list() {
  const r = await invoke('recovery_draft', { action: 'list' });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
}
async function until(check) {
  for (let i = 0; i < 300; i++) {
    // Poll editor UI rather than contending with the writer's recovery lock.
    let snapshots = await script(
      `const done=arguments[arguments.length-1];done(Array.from(document.querySelectorAll('select[aria-label="Recovery version"] option')).map(o=>({file:o.value,metadata:{documentId:o.value.split('-')[0],generation:Number(o.value.split('-')[1])}})));`,
    );
    if (newNotes) {
      const committed = [];
      for (const snapshot of snapshots) {
        assert.match(
          snapshot.file,
          /^[a-f0-9]{32}-[0-9]{20}-[a-f0-9]{64}\.pnrec$/,
        );
        try {
          // Observe immutable published metadata without racing the writer's
          // advisory lock through repeated IPC list calls.
          const [magic, header] = (
            await readFile(join(recoveryDirectory, snapshot.file), 'utf8')
          ).split('\n', 2);
          assert.equal(magic, 'PNRECOVERY1');
          const { metadata } = JSON.parse(header);
          assert.equal(metadata.documentId, snapshot.metadata.documentId);
          assert.equal(metadata.generation, snapshot.metadata.generation);
          committed.push({ ...snapshot, metadata });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      snapshots = committed;
    }
    if (check({ snapshots })) {
      await idle();
      return list();
    }
    await pause(100);
  }
  throw Error('Automatic recovery did not reach expected versions');
}
async function idle() {
  await wait(
    "!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Keep versioned snapshot')?.disabled",
  );
}
const identities = new Map();
async function processIdentity(pid) {
  const startTick = (await readFile(`/proc/${pid}/stat`, 'utf8'))
    .split(') ')
    .at(-1)
    .split(' ')[19];
  const executableSha256 = createHash('sha256')
    .update(await readFile(`/proc/${pid}/exe`))
    .digest('hex');
  return { pid, startTick, executableSha256 };
}
async function start() {
  await launch();
  const pid = await rootPid();
  const identity = await processIdentity(pid);
  identities.set(pid, identity);
  console.log(
    'NATIVE_AUTOMATIC_IDENTITY',
    JSON.stringify({
      ...identity,
      observerSha256: createHash('sha256')
        .update(await readFile(new URL(import.meta.url)))
        .digest('hex'),
      mode: rendererRestart
        ? 'renderer-restart'
        : extensionCase
          ? 'extension-case'
          : newNotes
            ? 'new-notes'
            : 'ordinary',
    }),
  );
  await wait("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  await invoke('stop_preview');
  await idle();
  return pid;
}
async function open(pid) {
  if (newNotes) {
    await button('New note');
    await wait(
      "Boolean(document.querySelector('.cm-content')) && /Untitled-[0-9]+\\.mdx$/.test(document.querySelector('select[aria-label=\"Source file\"]').value) && !document.querySelector('[aria-label=\"Native document\"]')",
    );
    return;
  }
  await button('Open files');
  dialog(pid, 'choose', 'Open documents and modules', original);
  await fileIdle();
  await wait(
    `Boolean(document.querySelector('.cm-content')) && document.querySelector('select[aria-label="Source file"]').value.endsWith(${JSON.stringify(originalName)})`,
  );
}
async function exit(pid, dirty) {
  if (rendererRestart && dirty) {
    assert.ok(process.env.NATIVE_EVIDENCE_DIR);
    // Emulate the dead frontend's busy hint; no Rust file operation is in flight.
    assert.equal(
      (await invoke('set_documents_dirty', { dirty: true, busy: true })).ok,
      true,
    );
    await writeFile(
      join(process.env.NATIVE_EVIDENCE_DIR, 'kill-editor-renderer.json'),
      JSON.stringify(identities.get(pid)),
      { flag: 'wx' },
    );
    let receipt;
    for (let attempt = 0; attempt < 300; attempt++) {
      try {
        receipt = JSON.parse(
          await readFile(
            join(
              process.env.NATIVE_EVIDENCE_DIR,
              'editor-renderer-killed.json',
            ),
            'utf8',
          ),
        );
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await pause(100);
      }
    }
    assert.ok(receipt, 'External owned-renderer termination receipt required');
    assert.equal(receipt.root.pid, pid);
    assert.equal(receipt.root.startTick, identities.get(pid).startTick);
    assert.equal(
      receipt.root.executableSha256,
      identities.get(pid).executableSha256,
    );
    assert.equal(
      receipt.renderer.exe,
      '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebProcess',
    );
    assert.ok(
      Number.isInteger(receipt.renderer.pid) && receipt.renderer.pid > 1,
    );
    assert.match(receipt.renderer.executableSha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.signal, 'SIGKILL');
    assert.equal(receipt.renderer.uid, process.getuid());
    assert.equal(receipt.rootSurvived, true);
    dialog(pid, 'button', 'Editor stopped', 'Keep window open');
    assert.doesNotThrow(() => process.kill(pid, 0));
    console.log(
      'NATIVE_EDITOR_RENDERER_KEEP_OPEN_AND_STALE_BUSY_RECOVERY',
      JSON.stringify(receipt),
    );
  }
  const crash = dirty && process.env.NATIVE_CRASH_RESTART === '1';
  if (crash) {
    assert.deepEqual(
      await processIdentity(pid),
      identities.get(pid),
      'Refuse to signal a changed process identity',
    );
    process.kill(pid, 'SIGKILL');
    console.log('NATIVE_ACTUAL_ROOT_SIGKILL', pid);
  } else {
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
try {
  const first = await start();
  assert.equal(
    (await list()).snapshots.length,
    0,
    'Use an empty disposable version collection',
  );
  await open(first);
  await appendSource('AUTOMATIC_A');
  const aBytes = newNotes ? '\nAUTOMATIC_A' : source + '\r\nAUTOMATIC_A';
  const initial = await until((i) =>
    newNotes
      ? i.snapshots.some(
          (s) => s.metadata.sourceBytes === Buffer.byteLength(aBytes),
        )
      : i.snapshots.length === 1,
  );
  const a = newNotes
    ? initial.snapshots.find(
        (s) => s.metadata.sourceBytes === Buffer.byteLength(aBytes),
      )
    : initial.snapshots[0];
  assert.ok(a);
  if (newNotes) assert.equal(a.metadata.baseline, null);
  else {
    assert.equal(a.metadata.name, originalName);
    assert.equal(
      a.metadata.baseline,
      createHash('sha256').update(source).digest('hex'),
    );
  }
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: a.file,
      })
    ).value.source,
    aBytes,
  );
  assert.equal(await readFile(original, 'utf8'), source);
  // Both same-file buffers and unbound new notes need independent histories.
  await open(first);
  await appendSource('AUTOMATIC_B');
  let bBytes = newNotes ? '\nAUTOMATIC_B' : source + '\r\nAUTOMATIC_B';
  let current = await until((i) =>
    newNotes
      ? i.snapshots.some(
          (s) =>
            s.metadata.documentId !== a.metadata.documentId &&
            s.metadata.sourceBytes === Buffer.byteLength(bBytes),
        )
      : i.snapshots.length === 2,
  );
  const b = current.snapshots.find(
    (s) =>
      s.metadata.documentId !== a.metadata.documentId &&
      (!newNotes || s.metadata.sourceBytes === Buffer.byteLength(bBytes)),
  );
  assert.ok(b);
  if (newNotes) assert.equal(b.metadata.baseline, null);
  else {
    assert.equal(b.metadata.name, originalName);
    assert.equal(b.metadata.baseline, a.metadata.baseline);
  }
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: b.file,
      })
    ).value.source,
    bBytes,
  );
  for (let n = 2; n <= 6; n++) {
    await appendSource(`AUTOMATIC_B_${n}`);
    bBytes += `${newNotes ? '\n' : '\r\n'}AUTOMATIC_B_${n}`;
    current = await until((i) =>
      i.snapshots.some(
        (s) =>
          s.metadata.documentId === b.metadata.documentId &&
          s.metadata.generation === b.metadata.generation + n - 1 &&
          (!newNotes || s.metadata.sourceBytes === Buffer.byteLength(bBytes)),
      ),
    );
  }
  assert.equal(
    current.snapshots.filter(
      (s) => s.metadata.documentId === b.metadata.documentId,
    ).length,
    5,
  );
  assert.ok(current.snapshots.some((s) => s.file === a.file));
  const latestB = current.snapshots.find(
    (s) =>
      s.metadata.documentId === b.metadata.documentId &&
      s.metadata.generation === b.metadata.generation + 5,
  );
  assert.ok(latestB);
  if (newNotes) assert.equal(latestB.metadata.baseline, null);
  else {
    assert.equal(latestB.metadata.name, originalName);
    assert.equal(latestB.metadata.baseline, a.metadata.baseline);
  }
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: latestB.file,
      })
    ).value.source,
    bBytes,
  );
  assert.equal(
    (
      await invoke('recovery_draft', {
        action: 'restore-version',
        file: a.file,
      })
    ).value.source,
    aBytes,
  );
  assert.equal(await readFile(original, 'utf8'), source);
  console.log(
    'NATIVE_AUTOMATIC_MULTI_BUFFER_INDEPENDENT_RETENTION_AND_UNCHANGED_ORIGINAL_PASS',
  );
  if (newNotes)
    console.log(
      'NATIVE_AUTOMATIC_UNBOUND_NEW_NOTES_NULL_BASELINES_AND_EXACT_CONTENT_PASS',
    );
  const retainedCount = current.snapshots.length;
  await exit(first, true);
  const second = await start();
  assert.notEqual(second, first);
  await button('Pause automatic recovery');
  await wait("(document.querySelector('details').open=true,true)");
  await idle();
  await wait(
    `document.querySelectorAll('select[aria-label="Recovery version"] option').length===${retainedCount}`,
  );
  console.log('NATIVE_AUTOMATIC_DISCOVERY_AFTER_ACTUAL_RESTART_PASS');
  await script(
    `const done=arguments[arguments.length-1];const select=document.querySelector('select[aria-label="Recovery version"]');select.value=arguments[0];select.dispatchEvent(new Event('change',{bubbles:true}));done(true);`,
    [a.file],
  );
  await button('Restore selected version');
  await fileIdle();
  await idle();
  await wait(
    `document.querySelector('[aria-label="Document status"]')?.textContent==='Unsaved changes'`,
  );
  if (extensionCase)
    await wait(
      `document.querySelector('select[aria-label="Source file"]').value.endsWith(${JSON.stringify(originalName)})`,
    );
  await button('Save source');
  dialog(second, 'cancel', 'Save source as');
  await fileIdle();
  assert.equal(await readFile(original, 'utf8'), source);
  await button('Save source');
  dialog(second, 'choose', 'Save source as', copy);
  await fileIdle();
  await wait(
    `document.querySelector('[aria-label="Document status"]')?.textContent==='Saved.' && !document.querySelector('[data-file-error]')`,
  );
  assert.equal(await readFile(copy, 'utf8'), aBytes);
  assert.equal(await readFile(original, 'utf8'), source);
  assert.equal((await stat(original)).mode & 0o777, 0o640);
  assert.equal((await stat(copy)).mode & 0o777, 0o600);
  console.log(
    'NATIVE_AUTOMATIC_RESTORED_PATHS_AND_PERMISSIONS',
    JSON.stringify({
      originalName,
      copyName,
      originalSha256: createHash('sha256')
        .update(await readFile(original))
        .digest('hex'),
      restoredSha256: createHash('sha256')
        .update(await readFile(copy))
        .digest('hex'),
      originalMode: '0640',
      restoredMode: '0600',
      firstDocumentId: a.metadata.documentId,
      secondDocumentId: b.metadata.documentId,
      firstSnapshotName: a.metadata.name,
      latestSnapshotName: latestB.metadata.name,
      baseline: a.metadata.baseline,
    }),
  );
  console.log(
    'NATIVE_AUTOMATIC_RESTORE_UNSAVED_CANCEL_AND_EXPLICIT_EXACT_SAVE_PASS',
  );
  for (let n = retainedCount; n > 0; n--) {
    await button('Delete selected version');
    await idle();
    assert.equal((await list()).snapshots.length, n - 1);
  }
  await exit(second, false);
  console.log('NATIVE_AUTOMATIC_OWNED_VERSIONS_REMOVED_AND_CLEAN_EXIT_PASS');
} finally {
  await close().catch(() => {});
}
