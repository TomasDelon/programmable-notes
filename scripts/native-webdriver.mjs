/** Real Tauri/WebKitGTK tests. Missing tools are NOT RUN (exit 2), never PASS. */
import assert from 'node:assert/strict';
import { access, readFile, readlink, writeFile, mkdir } from 'node:fs/promises';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  wd,
  script,
  invoke,
  systemctl,
  artifact,
  session,
  binary,
} from './native-webdriver-lib.mjs';
await preflight();
function denied(result) {
  console.log('IPC_DENIED', JSON.stringify(result));
  assert.equal(result.ok, false);
  assert.match(
    result.error,
    /not allowed|not permitted|denied|no host capabilities/i,
  );
}
const counter = await artifact(
  await readFile('docs/handoff/samples/fixtures/counter.mdx', 'utf8'),
);
try {
  const production = Boolean(process.env.NATIVE_PREVIEW_WRAPPER);
  await launch(production ? [] : ['--security-editor']);
  if (production)
    await script(
      `const done=arguments[arguments.length-1];const timer=setInterval(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Stop preview');if(b){clearInterval(timer);b.click();done(true)}},100);`,
    );
  const hostResult = await invoke('host_probe');
  console.log('IPC_EDITOR', JSON.stringify(hostResult));
  assert.deepEqual(hostResult, {
    ok: true,
    value: 'editor-host-only',
  });
  await wd(`/session/${session}/execute/sync`, {
    script:
      "localStorage.setItem('pn-native-validation-secret','editor-only-marker'); return true;",
    args: [],
  });
  // Stop any initial compiler-produced session before testing a known artifact.
  assert.equal((await invoke('stop_preview')).ok, true);
  const started = await invoke('start_preview', { html: counter });
  assert.equal(started.ok, true, JSON.stringify(started));
  const unit = started.value;
  assert.match(unit, /^programmable-notes-preview-\d+-\d+\.service$/);
  const group = systemctl('show', '--property=ControlGroup', '--value', unit);
  const pid = systemctl('show', '--property=MainPID', '--value', unit);
  const environment = (await readFile(`/proc/${pid}/environ`, 'utf8')).split(
    '\0',
  );
  assert.ok(environment.includes('TAURI_WEBVIEW_AUTOMATION=false'));
  assert.ok(
    !environment.some((value) =>
      value.startsWith('WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS='),
    ),
  );
  const editorNetwork = await readlink('/proc/self/ns/net');
  const previewNetwork = await readlink(`/proc/${pid}/ns/net`);
  assert.notEqual(
    previewNetwork,
    editorNetwork,
    'PrivateNetwork did not create an independent network namespace',
  );
  assert.match(
    await readFile(`/proc/${pid}/status`, 'utf8'),
    /NoNewPrivs:\s+1/,
  );
  console.log(
    'NATIVE_OS_POLICY',
    JSON.stringify({ editorNetwork, previewNetwork, noNewPrivileges: true }),
  );
  console.log(
    'PRODUCTION_AUTOMATION',
    JSON.stringify({
      pid,
      automation: 'false',
      sandboxDisableVariableAbsent: true,
    }),
  );
  const dir = `/sys/fs/cgroup${group}`;
  assert.ok(group.startsWith('/user.slice/'));
  assert.ok(
    Number((await readFile(`${dir}/memory.max`, 'utf8')).trim()) <= 536870912,
  );
  assert.equal((await readFile(`${dir}/memory.swap.max`, 'utf8')).trim(), '0');
  assert.ok(Number((await readFile(`${dir}/pids.max`, 'utf8')).trim()) <= 128);
  const [quota, period] = (await readFile(`${dir}/cpu.max`, 'utf8'))
    .trim()
    .split(/\s+/)
    .map(Number);
  assert.ok(quota > 0 && quota <= period / 4);
  console.log(
    'EFFECTIVE_LIMITS',
    JSON.stringify({
      unit,
      group,
      memoryMax: (await readFile(`${dir}/memory.max`, 'utf8')).trim(),
      swapMax: (await readFile(`${dir}/memory.swap.max`, 'utf8')).trim(),
      cpuMax: `${quota} ${period}`,
      pidsMax: (await readFile(`${dir}/pids.max`, 'utf8')).trim(),
    }),
  );
  assert.equal((await invoke('stop_preview')).ok, true);
  await assert.rejects(access(dir)); // cgroup must be removed, not just launcher PID.
  console.log(
    'PASS: editor positive IPC control, resource-unit limits and full-group Stop',
  );
  await close();
  await launch(
    production ? [] : ['--security-probe'],
    process.env.NATIVE_PREVIEW_WRAPPER || binary,
  );
  const isolatedStorage = await wd(`/session/${session}/execute/sync`, {
    script: "return localStorage.getItem('pn-native-validation-secret');",
    args: [],
  });
  assert.equal(isolatedStorage, null);
  console.log('PRIVATE_STORAGE', 'editor canary absent from incognito preview');
  // Commands exist in this very binary; denial is not inferred from missing APIs.
  for (const command of [
    'host_probe',
    'start_preview',
    'stop_preview',
    'open_documents',
    'save_document',
    'save_document_as',
    'reopen_document',
    'close_document',
    'confirm_discard',
    'set_documents_dirty',
    'recovery_draft',
  ])
    denied(
      await invoke(command, {
        html: counter,
        action: 'restore',
        id: 'forged',
        revision: 'forged',
        source: 'malicious overwrite',
        name: 'note.mdx',
        dirty: false,
        busy: false,
      }),
    );
  for (const action of [
    'list',
    'append',
    'restore-version',
    'delete-version',
    'migrate',
  ]) {
    denied(
      await invoke('recovery_draft', {
        action,
        file: '../original.mdx',
        input: {
          documentId: 'a'.repeat(32),
          name: 'note.mdx',
          parent: null,
          baseline: null,
          source: 'must never reach recovery storage',
        },
      }),
    );
  }
  for (const command of [
    'plugin:fs|read_file',
    'plugin:shell|execute',
    'plugin:http|fetch',
    'plugin:dialog|open',
  ]) {
    const result = await invoke(command, {
      path: '/etc/passwd',
      program: 'sh',
      url: 'http://127.0.0.1',
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /not allowed|denied|not found|unknown/i);
  }
  const interaction = await script(
    `const done=arguments[arguments.length-1];
 const frame=document.querySelector('iframe');frame.srcdoc=arguments[0];
 let attempts=0;const timer=setInterval(()=>{try{frame.contentWindow.document;clearInterval(timer);done({parentAccessible:true});}catch{if(++attempts>10){clearInterval(timer);done({parentAccessible:false});}}},100);`,
    [counter],
  );
  assert.equal(interaction.parentAccessible, false);
  // WebDriver switches into the real sandbox, without relaxing sandbox flags.
  const element = await wd(`/session/${session}/element`, {
    using: 'css selector',
    value: 'iframe',
  });
  await wd(`/session/${session}/frame`, { id: element });
  const count = await script(
    `const done=arguments[arguments.length-1];let n=0;const timer=setInterval(()=>{const b=document.querySelector('button');if(b){clearInterval(timer);b.click();b.click();setTimeout(()=>done(b.textContent),50);}else if(++n>100){clearInterval(timer);done('NO COUNTER');}},100);`,
  );
  assert.equal(count, 'Count: 2');
  console.log('WEBKIT_COUNTER', count);
  if (process.env.NATIVE_EVIDENCE_DIR) {
    await mkdir(process.env.NATIVE_EVIDENCE_DIR, { recursive: true });
    const png = await wd(`/session/${session}/screenshot`, undefined, 'GET');
    await writeFile(
      `${process.env.NATIVE_EVIDENCE_DIR}/webkit-counter.png`,
      Buffer.from(png, 'base64'),
    );
  }
  const boundary = await script(
    `const done=arguments[arguments.length-1];const result={};for(const [key,fn] of Object.entries({parent:()=>parent.document.title,storage:()=>parent.localStorage.getItem('secret')})){try{fn();result[key]='allowed';}catch{result[key]='denied';}}done(result);`,
  );
  assert.deepEqual(boundary, { parent: 'denied', storage: 'denied' });
  const fetchBoundary = await script(
    `const done=arguments[arguments.length-1];const violations=[];
 const listener=e=>violations.push({directive:e.effectiveDirective,blocked:e.blockedURI});
 addEventListener('securitypolicyviolation',listener);
 Promise.all(['http://127.0.0.1:9/native-security-probe','file:///etc/passwd'].map(async url=>{
   try { const r=await fetch(url);return {url,denied:false,text:await r.text()}; }
   catch { return {url,denied:true}; }
 })).then(results=>setTimeout(()=>{removeEventListener('securitypolicyviolation',listener);done({results,violations});},200));`,
  );
  assert.ok(
    fetchBoundary.results.every((result) => result.denied),
    'Author context fetched network or local filesystem content',
  );
  assert.ok(
    fetchBoundary.violations.some((value) => value.directive === 'connect-src'),
    'No actual WebKit connect-src violation observed',
  );
  console.log('WEBKIT_AUTHOR_FETCH_DENIED', JSON.stringify(fetchBoundary));

  console.log(
    'PASS: preview native ACL denial, absent privileged plugins, real WebKitGTK React counter and iframe DOM/storage denial',
  );
  await close();
  console.log(
    'Native IPC/WebKitGTK suite passed. Resource stress/lifetime gates remain separate; follow docs/NATIVE_SECURITY.md.',
  );
} finally {
  await close();
}
