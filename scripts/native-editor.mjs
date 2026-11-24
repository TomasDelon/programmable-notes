/** Native editor availability under a governed WebKit JavaScript attack. */
import assert from 'node:assert/strict';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  rootPid,
  dialog,
  fileIdle,
  appendSource,
  visiblePreviewText,
} from './native-ui-lib.mjs';
import {
  preflight,
  launch,
  close,
  script,
  invoke,
  artifact,
  systemctl,
  wd,
  session,
} from './native-webdriver-lib.mjs';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pressure = process.argv.includes('--pressure');
if (pressure) {
  try {
    const languages = execFileSync('tesseract', ['--list-langs'], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(languages, /^eng\r?$/m);
  } catch {
    console.error(
      'NOT RUN: heap observation requires tesseract-ocr and English language data',
    );
    process.exit(2);
  }
}
await preflight();
const source = await readFile(
  'docs/handoff/samples/fixtures/counter.mdx',
  'utf8',
);
const attack = await artifact(
  pressure
    ? `import {useEffect,useState} from 'react'\n\nexport function Pressure() { const [active,setActive]=useState(false);useEffect(()=>{const retained=[];const timer=setInterval(()=>{const block=new Uint8Array(16*1024*1024);block.fill(1);retained.push(block);if(retained.length===2)setActive(true)},500);return()=>clearInterval(timer)},[]);return <button disabled>{active?'Heap pressure active':'Starting heap pressure'}</button> }\n\n<Pressure />`
    : `import {useState} from 'react'\n\nexport function Loop() { const [armed,setArmed]=useState(false); return <button onClick={()=>{setArmed(true);setTimeout(()=>{while(true){}},3000)}}>{armed?'CPU loop armed':'Arm CPU loop'}</button> }\n\n<Loop />`,
);
function ui(pid, name, action = 'click') {
  console.log(
    'NATIVE_UI',
    execFileSync(
      'python3',
      ['scripts/native-atspi.py', String(pid), name, action],
      { encoding: 'utf8', timeout: 65000 },
    ).trim(),
  );
}
async function button(name) {
  await script(
    `const done=arguments[arguments.length-1];const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===arguments[0]);if(!b)return done(false);b.click();done(true);`,
    [name],
  ).then((value) => assert.equal(value, true));
}
// The only grant comes from the real native picker. Verify actual disk bytes.
const file = join(process.env.NATIVE_FIXTURE_DIR || '', 'attack-edit.mdx');
assert.ok(process.env.NATIVE_FIXTURE_DIR, 'Run native-test-setup first');
async function savedSource() {
  await button('Save source');
  await fileIdle();
  return readFile(file, 'utf8');
}
async function empty(root) {
  for (let i = 0; i < 50; i++) {
    try {
      if (!(await readFile(`${root}/cgroup.procs`, 'utf8')).trim()) return;
    } catch (error) {
      if (error.code === 'ENOENT') return;
      if (error.code === 'ENODEV') {
        await pause(100); // Indeterminate teardown read; require a fresh proof.
        continue;
      }
      throw error;
    }
    await pause(100);
  }
  throw Error('Preview cgroup still populated after UI Stop');
}
try {
  console.log('NATIVE_EDITOR_LAUNCH');
  await launch();
  console.log('NATIVE_EDITOR_CONNECTED');
  const initial = await script(
    `const done=arguments[arguments.length-1];const deadline=Date.now()+30000;const timer=setInterval(()=>{const status=document.querySelector('[role=status]')?.textContent;if(document.querySelector('.cm-content')&&status&&!/Waiting|Compiling/.test(status)||Date.now()>deadline){clearInterval(timer);done({status,alert:document.querySelector('[role=alert]')?.textContent||null,editor:!!document.querySelector('.cm-content')});}},100);`,
  );
  console.log('NATIVE_EDITOR_INITIAL', JSON.stringify(initial));
  assert.equal(initial.editor, true);
  const compiled = initial.status?.startsWith('Compiled') && !initial.alert;
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  await writeFile(file, source);
  await button('Open files');
  dialog(await rootPid(), 'choose', 'Open documents and modules', file);
  await fileIdle();
  assert.equal(await savedSource(), source);
  const reply = await invoke('start_preview', { html: attack });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  const editorPid = reply.value.match(/^programmable-notes-preview-(\d+)-/)[1];
  const unit = reply.value,
    pid = Number(systemctl('show', '--property=MainPID', '--value', unit));
  const group = systemctl('show', '--property=ControlGroup', '--value', unit),
    root = `/sys/fs/cgroup${group}`;
  console.log(
    'NATIVE_ATTACK_STARTED',
    JSON.stringify({
      unit,
      pid,
      root,
      mode: pressure ? 'heap' : 'CPU',
      time: Date.now(),
    }),
  );
  if (pressure) {
    // This marker is set only after two retained, touched allocations; browser
    // startup RSS alone is not proof that the author pressure fixture executed.
    visiblePreviewText(pid, 'Heap pressure active');
    const deadline = Date.now() + 55000;
    while (
      Number(await readFile(`${root}/memory.current`, 'utf8')) <
      128 * 1024 * 1024
    ) {
      assert.ok(
        Date.now() < deadline,
        'WebKit heap pressure did not start within lifetime',
      );
      await pause(100);
    }
  } else {
    ui(pid, 'Arm CPU loop');
    ui(pid, 'CPU loop armed', 'find');
    await pause(4000);
  }
  const memoryBefore = Number(await readFile(`${root}/memory.current`, 'utf8'));
  const before = await readFile(`${root}/cpu.stat`, 'utf8');
  const begin = Date.now();
  const element = await wd(`/session/${session}/element`, {
    using: 'css selector',
    value: '.cm-content',
  });
  const id = element['element-6066-11e4-a52e-4f735466cecf'];
  await wd(`/session/${session}/element/${id}/click`, {});
  const marker = '\nNATIVE_SOURCE_SURVIVES';
  // Use explicit modifier key-up events. A combined WebKit element/value
  // sequence retained Control through the text and generated clipboard shortcuts.
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
  await wd(`/session/${session}/element/${id}/value`, {
    text: marker.slice(1),
  });
  await pause(100);
  assert.equal(await savedSource(), source + marker);
  const responseMs = Date.now() - begin;
  assert.ok(
    responseMs < 5000,
    `Editor edit/native disk save stalled ${responseMs}ms`,
  );
  const after = await readFile(`${root}/cpu.stat`, 'utf8');
  const memoryAfter = Number(await readFile(`${root}/memory.current`, 'utf8'));
  if (pressure) {
    assert.ok(
      memoryAfter > memoryBefore,
      'No heap growth during edit/native disk save',
    );
    assert.ok(memoryAfter <= 536870912, 'Memory limit exceeded');
  }
  const stats = (value) =>
    Object.fromEntries(
      value
        .trim()
        .split('\n')
        .map((line) => {
          const [key, value] = line.split(' ');
          return [key, Number(value)];
        }),
    );
  assert.ok(
    stats(after).usage_usec > stats(before).usage_usec,
    'No busy-loop CPU consumption during source edit',
  );
  assert.ok(
    stats(after).nr_throttled > stats(before).nr_throttled,
    'No real throttling during source edit',
  );
  console.log(
    'EDITOR_EDIT_SAVE_DISK',
    JSON.stringify({
      unit,
      mode: pressure ? 'retained heap pressure' : 'CPU loop',
      memoryBefore,
      memoryAfter,
      responseMs,
      before,
      after,
      exactSource: true,
      nativeDiskWriteTested: true,
    }),
  );
  await button('Stop preview');
  // The controlled attack was started through IPC while the UI was already stopped;
  // explicitly invoke the same Stop handler as a positive native termination control.
  assert.equal((await invoke('stop_preview')).ok, true);
  await empty(root);
  assert.equal(await savedSource(), source + marker);
  console.log('EDITOR_SOURCE_RETAINED_AFTER_STOP');
  await appendSource('<button>NATIVE_UNSAVED_REBUILD</button>');
  assert.equal(await readFile(file, 'utf8'), source + marker);
  await button('Rebuild preview');
  const rebuilt = await script(
    `const done=arguments[arguments.length-1];const deadline=Date.now()+30000;const timer=setInterval(()=>{const status=document.querySelector('[role=status]')?.textContent;if(status?.startsWith('Compiled')||status==='Build timed out'||status==='Build failed'||Date.now()>deadline){clearInterval(timer);done({status,alert:document.querySelector('[role=alert]')?.textContent||null});}},100);`,
  );
  console.log('NATIVE_EDITOR_REBUILD', JSON.stringify(rebuilt));
  assert.equal(
    compiled,
    true,
    'Initial native browser-WASM compile did not succeed',
  );
  assert.ok(
    rebuilt.status?.startsWith('Compiled') && !rebuilt.alert,
    'Native source rebuild did not succeed',
  );
  // NativePreview starts asynchronously after the compiler status update.
  let units;
  for (let i = 0; i < 100; i++) {
    units = systemctl(
      'list-units',
      '--all',
      '--no-legend',
      '--plain',
      `programmable-notes-preview-${editorPid}-*`,
    );
    if (/active\s+running/.test(units)) break;
    await pause(100);
  }
  const active = units
    .split('\n')
    .find((line) => /active\s+running/.test(line));
  assert.ok(active, `No actual source-built native preview: ${units}`);
  const rebuiltUnit = active.trim().split(/\s+/)[0],
    rebuiltPid = Number(
      systemctl('show', '--property=MainPID', '--value', rebuiltUnit),
    );
  ui(rebuiltPid, 'Count: 0');
  ui(rebuiltPid, 'Count: 1');
  ui(rebuiltPid, 'Count: 2', 'find');
  ui(rebuiltPid, 'NATIVE_UNSAVED_REBUILD', 'find');
  assert.equal(await readFile(file, 'utf8'), source + marker);
  const rebuiltGroup = systemctl(
    'show',
    '--property=ControlGroup',
    '--value',
    rebuiltUnit,
  );
  await button('Stop preview');
  await empty(`/sys/fs/cgroup${rebuiltGroup}`);
  assert.equal(await readFile(file, 'utf8'), source + marker);
  // Explicitly discard only this disposable unsaved fixture after proving it
  // rendered without a disk write, so normal dirty-close protection stays on.
  await button('Reopen source');
  dialog(await rootPid(), 'button', 'Unsaved source', 'OK');
  await fileIdle();
  console.log(
    'NATIVE_EDITOR_PASS',
    pressure ? 'heap pressure' : 'CPU loop',
    'compiler, unsaved rebuild, governed counter, source edit/native disk save under attack',
  );
} finally {
  try {
    await invoke('stop_preview');
  } catch {
    /* Preserve the original failure. */
  }
  await close();
}
