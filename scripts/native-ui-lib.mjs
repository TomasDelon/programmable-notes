import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { script, wd, session } from './native-webdriver-lib.mjs';
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function rootPid() {
  const pid = Number(await readFile(process.env.NATIVE_PID_FILE, 'utf8'));
  assert.ok(pid > 0);
  return pid;
}
export async function button(name) {
  assert.equal(
    await script(
      `const done=arguments[arguments.length-1];const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===arguments[0]);if(!b||b.disabled)return done(false);b.click();done(true);`,
      [name],
    ),
    true,
    `Button unavailable: ${name}`,
  );
}
export async function waitUi(source, seconds = 30) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const value = await wd(`/session/${session}/execute/sync`, {
      script: `return (${source})`,
      args: [],
    });
    if (value) return value;
    await pause(100);
  }
  throw Error(`UI condition failed: ${source}`);
}
export function dialog(pid, action, title, value = '') {
  const result = execFileSync(
    'python3',
    ['scripts/native-dialog.py', String(pid), action, title, value],
    { encoding: 'utf8', timeout: 40000 },
  );
  console.log('NATIVE_DIALOG', result.trim());
}
export function previewUi(pid, name, action = 'click') {
  console.log(
    'NATIVE_UI',
    execFileSync(
      'python3',
      ['scripts/native-atspi.py', String(pid), name, action],
      { encoding: 'utf8', timeout: 65000 },
    ).trim(),
  );
}
export async function appendSource(text) {
  const element = await wd(`/session/${session}/element`, {
    using: 'css selector',
    value: '.cm-content',
  });
  const id = element['element-6066-11e4-a52e-4f735466cecf'];
  await wd(`/session/${session}/element/${id}/click`, {});
  await wd(`/session/${session}/actions`, {
    actions: [
      {
        type: 'key',
        id: 'native-keyboard',
        actions: [
          { type: 'keyDown', value: '\uE009' },
          { type: 'keyDown', value: '\uE010' },
          { type: 'keyUp', value: '\uE010' },
          { type: 'keyUp', value: '\uE009' },
          { type: 'keyDown', value: '\uE007' },
          { type: 'keyUp', value: '\uE007' },
        ],
      },
    ],
  });
  await wd(`/session/${session}/element/${id}/value`, { text });
}
export async function fileIdle() {
  await waitUi(
    `!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save source')?.disabled`,
  );
}
export async function readSourceText() {
  return wd(`/session/${session}/execute/sync`, {
    script: "return document.querySelector('.cm-content')?.innerText",
    args: [],
  });
}

// Busy WebKit can paint a status while withholding its accessibility subtree.
// Require the exact visible allocation marker from the bound native PID/window.
export function visiblePreviewText(pid, text) {
  console.log(
    'NATIVE_VISIBLE_TEXT',
    execFileSync(
      'python3',
      [
        'scripts/native-visible-text.py',
        String(pid),
        text,
        process.env.NATIVE_EVIDENCE_DIR || 'test-results/native',
      ],
      { encoding: 'utf8', timeout: 65000 },
    ).trim(),
  );
}
