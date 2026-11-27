/** Actual installed shared editor, synthetic vault only. No React/security acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

assert.equal(process.platform, 'linux', 'Linux required');
assert.equal(
  process.env.NATIVE_DISPOSABLE_PROFILE,
  '1',
  'Disposable profile required',
);
assert.equal(process.getuid(), process.geteuid(), 'No elevated test identity');
assert.notEqual(
  process.getuid(),
  0,
  'Run as an ordinary disposable desktop user',
);
assert.equal(process.argv.length, 2, 'No command-line options');
const installed = '/usr/bin/programmable-notes';
const evidence = resolve(
  process.env.NATIVE_SHARED_EVIDENCE ?? '.cache/native-shared-editor.json',
);
const fixture = await mkdtemp('/tmp/pn-native-shared-');
await chmod(fixture, 0o700);
const vault = join(fixture, 'vault');
await mkdir(vault, { mode: 0o700 });
const file = join(vault, 'primary.mdx');
const original =
  '\uFEFFimport React from "react"\r\n\r\n{/* synthetic retained comment */}\n<NeverExecute value={{ text: "Café 😀" }} />\r\n\r\n# Shared editor\r\n\r\nBody.\r\n';
const appended = 'Appended.';
const saved = original + appended;
const visualSaved = saved.replace('Appended.', 'Appended.&#32;Visual.');
const invalid = '$unfinished <Broken';
await writeFile(file, original, { mode: 0o640, flag: 'wx' });
const wrapper = join(fixture, 'editor-driver');
const pidFile = join(fixture, 'editor.pid');
await writeFile(
  wrapper,
  `#!/bin/sh\nprintf '%s\\n' "$$" > '${pidFile}'\nexec ${installed} "$@"\n`,
  { mode: 0o700 },
);
// Import after binding the existing protocol harness to this fixed installed binary.
process.env.NATIVE_BINARY = wrapper;
process.env.NATIVE_PID_FILE = pidFile;
const protocol = await import('./native-webdriver-lib.mjs');
const { dialog, pause, rootPid } = await import('./native-ui-lib.mjs');
const owned = new Map();
const checkpoints = [];
let stage = 'preflight';
let passed = false;
let forcedCleanup = false;
let cleanupVerified = false;
let binarySha256;
const absence = (error) => error.code === 'ENOENT' || error.code === 'ESRCH';
async function identity(pid) {
  try {
    const text = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
    return { parent: Number(fields[1]), start: fields[19] };
  } catch (error) {
    if (absence(error)) return null;
    throw error;
  }
}
async function capture(pid) {
  const root = await identity(pid);
  if (!root) return;
  if (owned.has(pid) && owned.get(pid) !== root.start) return;
  if (!owned.has(pid))
    assert.equal(await readlink(`/proc/${pid}/exe`), installed);
  owned.set(pid, root.start);
  const all = new Map();
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const id = Number(name);
    const value = await identity(id);
    if (value) all.set(id, value);
  }
  let changed;
  do {
    changed = false;
    for (const [id, value] of all) {
      const parent = all.get(value.parent);
      if (
        !owned.has(id) &&
        parent &&
        owned.get(value.parent) === parent.start
      ) {
        owned.set(id, value.start);
        changed = true;
      }
    }
  } while (changed);
}
async function liveOwned() {
  const live = [];
  for (const [pid, start] of owned) {
    if ((await identity(pid))?.start === start) live.push(pid);
  }
  return live;
}
async function teardown() {
  try {
    await capture(await rootPid());
  } catch (error) {
    if (!absence(error)) throw error;
  }
  for (const pid of await liveOwned()) {
    forcedCleanup = true;
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (!absence(error)) throw error;
    }
  }
  await pause(500);
  for (const pid of await liveOwned()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if (!absence(error)) throw error;
    }
  }
  await protocol.close().catch(() => {});
  await waitFor(async () => (await liveOwned()).length === 0, 5);
  cleanupVerified = true;
}
async function waitFor(observe, seconds = 15) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (await observe()) return;
    await pause(100);
  }
  throw Error('observation_deadline');
}
const deadline = setTimeout(() => {
  for (const [pid, start] of owned) {
    try {
      const text = execFileSync('/bin/cat', [`/proc/${pid}/stat`], {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (text.slice(text.lastIndexOf(')') + 2).split(' ')[19] === start)
        process.kill(pid, 'SIGKILL');
    } catch {
      /* Deadline cannot extend for an already absent process. */
    }
  }
  console.error('NATIVE_SHARED_EDITOR_FAILED stage=deadline');
  process.exit(1);
}, 180_000);
async function sync(script, args = []) {
  return protocol.wd(`/session/${protocol.session}/execute/sync`, {
    script,
    args,
  });
}
async function click(reference) {
  const id = reference?.['element-6066-11e4-a52e-4f735466cecf'];
  assert.equal(typeof id, 'string', 'Expected real WebDriver element');
  await protocol.wd(`/session/${protocol.session}/element/${id}/click`, {});
}
async function clickButton(name) {
  let reference;
  await waitFor(async () => {
    reference = await sync(
      `return [...document.querySelectorAll('button')].find(b => !b.disabled && !b.closest('[inert]') && b.getClientRects().length && (b.textContent.trim() === arguments[0] || b.getAttribute('aria-label') === arguments[0])) ?? null`,
      [name],
    );
    return reference !== null;
  });
  await click(reference);
}
async function keys(values) {
  await protocol.wd(`/session/${protocol.session}/actions`, {
    actions: [{ type: 'key', id: 'shared-editor-keyboard', actions: values }],
  });
}
const down = (value) => ({ type: 'keyDown', value });
const up = (value) => ({ type: 'keyUp', value });
const control = '\uE009';
async function chord(key, shift = false) {
  await keys([
    down(control),
    ...(shift ? [down('\uE008')] : []),
    down(key),
    up(key),
    ...(shift ? [up('\uE008')] : []),
    up(control),
  ]);
}
async function type(text) {
  await keys(
    [...text].flatMap((character) => [down(character), up(character)]),
  );
}
async function source() {
  const reference = await sync(
    `return document.querySelector('[aria-label="MDX source"]')`,
  );
  await click(reference);
}
async function bytes(expected) {
  await waitFor(async () =>
    (await readFile(file)).equals(Buffer.from(expected)),
  );
  assert.equal(
    (await stat(file)).mode & 0o777,
    0o640,
    'Original mode preserved',
  );
  await waitFor(() =>
    sync(
      `return document.querySelector('[aria-label="Document save status"]')?.textContent === 'Saved to file'`,
    ),
  );
}
async function sourceShows(expected) {
  await waitFor(() =>
    sync(
      `return [...document.querySelectorAll('[aria-label="MDX source"] .cm-line')].map(line => line.textContent).join('\\n') === arguments[0]`,
      [expected.replaceAll('\r\n', '\n')],
    ),
  );
}
async function closeSession() {
  try {
    await protocol.close();
  } catch (error) {
    let kind;
    try {
      kind = JSON.parse(error.message)?.value?.error;
    } catch {
      /* Not a known closed-session response. */
    }
    if (kind !== 'invalid session id' && kind !== 'no such window') throw error;
  }
}
async function checkpoint(name) {
  checkpoints.push(name);
  await capture(await rootPid());
}
async function screenshot(name) {
  const encoded = await protocol.wd(
    `/session/${protocol.session}/screenshot`,
    undefined,
    'GET',
  );
  assert.equal(typeof encoded, 'string');
  assert(encoded.length <= 7_000_000, 'Screenshot bounded');
  const png = Buffer.from(encoded, 'base64');
  assert(png.length <= 5 * 1024 * 1024, 'Screenshot bounded');
  assert(
    png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'PNG required',
  );
  await mkdir(dirname(evidence), { recursive: true });
  await writeFile(join(dirname(evidence), name), png, {
    mode: 0o600,
    flag: 'wx',
  });
}
async function chooseAndOpen() {
  await clickButton('Choose local vault');
  dialog(await rootPid(), 'choose-folder', 'Choose local vault', vault);
  // Successful vault acquisition opens navigation. Wait for that acknowledgement
  // rather than racing its async completion with a second toggle.
  await waitFor(() =>
    sync(
      `return document.querySelector('[aria-label="Close navigation"]')?.getAttribute('aria-expanded') === 'true' && [...document.querySelectorAll('[aria-label="Open primary.mdx"]')].some(button => !button.closest('[inert]') && button.getClientRects().length > 0)`,
    ),
  );
  await clickButton('Open primary.mdx');
  await waitFor(() =>
    sync(`return Boolean(document.querySelector('[aria-label="MDX source"]'))`),
  );
}
async function start() {
  await protocol.launch();
  const pid = await rootPid();
  assert.equal(await readlink(`/proc/${pid}/exe`), installed);
  await capture(pid);
  await waitFor(() =>
    sync(
      `return document.documentElement.dataset.runtime === 'native' && Boolean(document.querySelector('[aria-label="Document workspace"]'))`,
    ),
  );
  return pid;
}
async function mode(name) {
  const expanded = await sync(
    `return document.querySelector('[aria-label="Show document modes"]')?.getAttribute('aria-expanded') === 'true'`,
  );
  if (!expanded) await clickButton('Show document modes');
  await clickButton(name);
  await waitFor(() =>
    sync(
      `return document.querySelector('[aria-label="Document mode"] button[aria-pressed="true"]')?.textContent === arguments[0]`,
      [name],
    ),
  );
}
try {
  binarySha256 = createHash('sha256')
    .update(await readFile(installed))
    .digest('hex');
  assert(
    process.env.DISPLAY || process.env.WAYLAND_DISPLAY,
    'Graphical display required',
  );
  assert(
    (
      await fetch(
        `${process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'}/status`,
        { signal: AbortSignal.timeout(3000) },
      )
    ).ok,
    'WebDriver required',
  );
  stage = 'installed_startup';
  const first = await start();
  stage = 'authorized_vault_chooser';
  await chooseAndOpen();
  await sourceShows(original);
  await checkpoint('actual-vault-chooser-and-shared-source');
  stage = 'source_autosave';
  await source();
  await chord('\uE010');
  await type(appended);
  await bytes(saved);
  await checkpoint('automatic-exact-bom-mixed-ending-jsx-bytes');
  stage = 'undo_redo';
  await chord('z');
  await bytes(original);
  await chord('z', true);
  await bytes(saved);
  await checkpoint('actual-source-keyboard-undo-redo-autosave');
  stage = 'invalid_source_autosave';
  await chord('\uE010');
  await type(invalid);
  await bytes(saved + invalid);
  await chord('z');
  await bytes(saved);
  await checkpoint('invalid-source-autosave-and-undo-to-valid');
  stage = 'source_preview_switch';
  await mode('Preview');
  await waitFor(() =>
    sync(
      `return Boolean(document.querySelector('[aria-label="Editable document"]'))`,
    ),
  );
  stage = 'preview_caret_autosave';
  await click(
    await sync(
      `return [...document.querySelectorAll('[aria-label="Editable document"] p')].at(-1) ?? null`,
    ),
  );
  await chord('\uE010');
  await type(' Visual.');
  await bytes(visualSaved);
  await waitFor(() =>
    sync(
      `return document.querySelector('[aria-label="Editable document"]')?.textContent.includes('Appended. Visual.') === true`,
    ),
  );
  await checkpoint('actual-preview-paragraph-caret-autosave-exact-bytes');
  stage = 'preview_undo_redo';
  await chord('z');
  await bytes(saved);
  await chord('z', true);
  await bytes(visualSaved);
  await checkpoint('actual-preview-keyboard-undo-redo-autosave');
  await screenshot('screenshot-preview.png');
  await mode('Source');
  await sourceShows(visualSaved);
  await bytes(visualSaved);
  await screenshot('screenshot-source.png');
  await checkpoint('source-preview-switch-preserves-real-file');
  stage = 'document_close_reopen';
  await chord('k');
  await click(
    await sync(
      `return document.querySelector('[aria-label="Search commands and notes"]')`,
    ),
  );
  await type('Close document');
  await keys([down('\uE007'), up('\uE007')]);
  await waitFor(() =>
    sync(`return !document.querySelector('[aria-label="MDX source"]')`),
  );
  await clickButton('Open primary.mdx');
  await sourceShows(visualSaved);
  await bytes(visualSaved);
  await checkpoint('document-close-reopen-exact-disk');
  stage = 'os_close';
  await capture(first);
  execFileSync('python3', ['scripts/native-close-window.py', String(first)], {
    timeout: 10_000,
    stdio: 'ignore',
  });
  await waitFor(async () => !(await identity(first)));
  await closeSession();
  await waitFor(async () => (await liveOwned()).length === 0);
  assert.deepEqual(await readFile(file), Buffer.from(visualSaved));
  checkpoints.push('actual-wm-close-and-observed-process-exit');
  stage = 'fresh_launch_reopen';
  const second = await start();
  assert.notEqual(second, first);
  await chooseAndOpen();
  await sourceShows(visualSaved);
  await bytes(visualSaved);
  await checkpoint('fresh-process-chooser-reopen-exact-file');
  stage = 'final_os_close';
  execFileSync('python3', ['scripts/native-close-window.py', String(second)], {
    timeout: 10_000,
    stdio: 'ignore',
  });
  await waitFor(async () => !(await identity(second)));
  await closeSession();
  await waitFor(async () => (await liveOwned()).length === 0);
  passed = true;
} catch {
  // Never expose arbitrary page source, framework replies, file contents or paths.
  console.error(`NATIVE_SHARED_EDITOR_FAILED stage=${stage}`);
  process.exitCode = 1;
} finally {
  try {
    await teardown();
  } catch {
    process.exitCode = 1;
  }
  clearTimeout(deadline);
  if (forcedCleanup || !cleanupVerified) {
    passed = false;
    process.exitCode = 1;
  }
  await mkdir(dirname(evidence), { recursive: true });
  await writeFile(
    evidence,
    JSON.stringify(
      {
        schema: 1,
        result: passed ? 'passed' : 'failed',
        stage,
        binarySha256,
        checkpoints,
        cleanupVerified,
        forcedCleanup,
        scope:
          'Installed shared editor, real chooser/keyboard/autosave/close/reopen; no React or containment acceptance',
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  await rm(fixture, { recursive: true, force: true });
}
if (passed) console.log('NATIVE_SHARED_EDITOR_PASS');
