/** Native editor availability under a governed WebKit JavaScript attack. */
import assert from 'node:assert/strict';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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
await preflight();
const source = await readFile(
  'docs/handoff/samples/fixtures/counter.mdx',
  'utf8',
);
const pressure = process.argv.includes('--pressure');
const attack = await artifact(
  pressure
    ? `import {useEffect} from 'react'\n\nexport function Pressure() { useEffect(()=>{const retained=[];const timer=setInterval(()=>{const block=new Uint8Array(16*1024*1024);block.fill(1);retained.push(block)},500);return()=>clearInterval(timer)},[]);return <p>Native memory pressure</p> }\n\n<Pressure />`
    : `import {useState} from 'react'\n\nexport function Loop() { const [armed,setArmed]=useState(false); return <button onClick={()=>{setArmed(true);setTimeout(()=>{while(true){}},3000)}}>{armed?'CPU loop armed':'Arm CPU loop'}</button> }\n\n<Loop />`,
);
function ui(pid, name, action = 'click') {
  console.log(
    'NATIVE_UI',
    execFileSync(
      'python3',
      ['scripts/native-atspi.py', String(pid), name, action],
      { encoding: 'utf8', timeout: 50000 },
    ).trim(),
  );
}
async function button(name) {
  await script(
    `const done=arguments[arguments.length-1];const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===arguments[0]);if(!b)return done(false);b.click();done(true);`,
    [name],
  ).then((value) => assert.equal(value, true));
}
// Observe the real Save source handler's exact Blob, without inventing a native
// filesystem permission or treating an intercepted download as a disk-write test.
async function savedBlob() {
  return script(
    `const done=arguments[arguments.length-1];const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob;try{URL.createObjectURL=value=>{blob=value;return 'blob:native-validation'};HTMLAnchorElement.prototype.click=()=>{};Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save source').click();}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}if(!blob)return done({error:'No source Blob'});blob.text().then(done);`,
  );
}
async function empty(root) {
  for (let i = 0; i < 50; i++) {
    try {
      if (!(await readFile(`${root}/cgroup.procs`, 'utf8')).trim()) return;
    } catch (error) {
      if (error.code === 'ENOENT') return;
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
  assert.equal(await savedBlob(), source);
  const reply = await invoke('start_preview', { html: attack });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  const editorPid = reply.value.match(/^programmable-notes-preview-(\d+)-/)[1];
  const unit = reply.value,
    pid = Number(systemctl('show', '--property=MainPID', '--value', unit));
  const group = systemctl('show', '--property=ControlGroup', '--value', unit),
    root = `/sys/fs/cgroup${group}`;
  if (pressure) {
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
  assert.equal(await savedBlob(), source + marker);
  const responseMs = Date.now() - begin;
  assert.ok(responseMs < 5000, `Editor edit/Save Blob stalled ${responseMs}ms`);
  const after = await readFile(`${root}/cpu.stat`, 'utf8');
  const memoryAfter = Number(await readFile(`${root}/memory.current`, 'utf8'));
  if (pressure) {
    assert.ok(
      memoryAfter > memoryBefore,
      'No heap growth during edit/Save Blob',
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
    'EDITOR_EDIT_SAVE_BLOB',
    JSON.stringify({
      unit,
      mode: pressure ? 'retained heap pressure' : 'CPU loop',
      memoryBefore,
      memoryAfter,
      responseMs,
      before,
      after,
      exactSource: true,
      nativeDiskWriteTested: false,
    }),
  );
  await button('Stop preview');
  // The controlled attack was started through IPC while the UI was already stopped;
  // explicitly invoke the same Stop handler as a positive native termination control.
  assert.equal((await invoke('stop_preview')).ok, true);
  await empty(root);
  assert.equal(await savedBlob(), source + marker);
  console.log('EDITOR_SOURCE_RETAINED_AFTER_STOP');
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
  const rebuiltGroup = systemctl(
    'show',
    '--property=ControlGroup',
    '--value',
    rebuiltUnit,
  );
  await button('Stop preview');
  await empty(`/sys/fs/cgroup${rebuiltGroup}`);
  assert.equal(await savedBlob(), source + marker);
  console.log(
    'NATIVE_EDITOR_PASS',
    pressure ? 'heap pressure' : 'CPU loop',
    'compiler, unsaved rebuild, governed counter, source edit/Save Blob under attack',
  );
} finally {
  try {
    await invoke('stop_preview');
  } catch {
    /* Preserve the original failure. */
  }
  await close();
}
