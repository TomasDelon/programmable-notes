/** Preview opening must preserve editor keyboard focus; explicit preview focus works. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  script,
  systemctl,
  artifact,
} from './native-webdriver-lib.mjs';
import { rootPid, button, waitUi } from './native-ui-lib.mjs';

await preflight();
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
const html = await artifact(
  await readFile('docs/handoff/samples/fixtures/counter.mdx', 'utf8'),
);
function x(...args) {
  return execFileSync('xdotool', args, {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
}
function windows(pid) {
  const found = x('search', '--onlyvisible', '--pid', String(pid)).split(/\s+/);
  assert.equal(found.length, 1);
  return found[0];
}
function activePid() {
  return Number(x('getwindowpid', x('getactivewindow')));
}
function preview(pid, name, action = 'find') {
  console.log(
    'NATIVE_FOCUS_UI',
    execFileSync(
      'python3',
      ['scripts/native-atspi.py', String(pid), name, action],
      { encoding: 'utf8', timeout: 65000 },
    ).trim(),
  );
}
try {
  await launch();
  await waitUi("Boolean(document.querySelector('.cm-content'))");
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  await button('Pause automatic recovery');
  await button('Source');
  const root = await rootPid(),
    rootWindow = windows(root);
  x('windowactivate', '--sync', rootWindow);
  const before = await script(
    'const done=arguments[arguments.length-1];const e=document.querySelector(".cm-content");e.focus();done(e.textContent);',
  );
  assert.equal(activePid(), root);
  const reply = await invoke('start_preview', { html });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  assert.match(reply.value, /^programmable-notes-preview-\d+-\d+\.service$/);
  const child = Number(
    systemctl('show', '--property=MainPID', '--value', reply.value),
  );
  assert.ok(child > 0);
  preview(child, 'Count: 0');
  const focused = activePid();
  console.log(
    'NATIVE_FOCUS_OBSERVATION',
    JSON.stringify({ root, child, active: focused, unit: reply.value }),
  );
  assert.equal(
    focused,
    root,
    'Automatic preview creation must not steal source keyboard focus',
  );
  // Do not reactivate or refocus the editor here: actual keyboard input must
  // still reach its original focused source after the new preview appears.
  x('key', '--clearmodifiers', 'ctrl+End');
  x('type', '--clearmodifiers', '--delay', '1', 'FOCUS_RETAINED');
  await waitUi(
    "document.querySelector('.cm-content')?.textContent.includes('FOCUS_RETAINED')",
  );
  x('windowactivate', '--sync', windows(child));
  assert.equal(activePid(), child);
  preview(child, 'Count: 0', 'focus');
  x('key', '--clearmodifiers', 'space');
  preview(child, 'Count: 1');
  console.log('NATIVE_EXPLICIT_PREVIEW_KEYBOARD_INTERACTION_PASS');
  x('windowactivate', '--sync', rootWindow);
  await button('Undo');
  await waitUi(
    `document.querySelector('.cm-content')?.textContent===${JSON.stringify(before)}`,
  );
  assert.equal((await invoke('stop_preview')).ok, true);
  console.log('NATIVE_EDITOR_FOCUS_PRESERVATION_AND_EXACT_UNDO_PASS');
} finally {
  await invoke('stop_preview').catch(() => {});
  await close().catch(() => {});
}
