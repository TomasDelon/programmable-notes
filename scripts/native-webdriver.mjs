/** Real Tauri/WebKitGTK tests. Missing tools are NOT RUN (exit 2), never PASS. */
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { compile } from '@mdx-js/mdx';
import { build } from 'esbuild';

const binary = resolve(
  process.env.NATIVE_BINARY || 'src-tauri/target/debug/programmable-notes',
);
const base = process.env.WEBDRIVER_URL || 'http://127.0.0.1:4444';
try {
  await access(binary);
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
    throw Error('No graphical display');
  const status = await fetch(`${base}/status`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!status.ok) throw Error('tauri-driver/WebKitWebDriver unavailable');
} catch (error) {
  console.error(`NOT RUN: native WebKitGTK prerequisites: ${error.message}`);
  process.exit(2);
}
let session;
async function wd(path, body, method = 'POST') {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(80000),
  });
  const json = await response.json();
  if (!response.ok || json.value?.error) throw Error(JSON.stringify(json));
  return json.value;
}
async function launch(args = []) {
  const result = await wd('/session', {
    capabilities: {
      alwaysMatch: { 'tauri:options': { application: binary, args } },
    },
  });
  session = result.sessionId;
  await wd(`/session/${session}/timeouts`, { script: 75000 });
}
async function close() {
  if (session) {
    await wd(`/session/${session}`, undefined, 'DELETE');
    session = undefined;
  }
}
async function script(source, args = []) {
  return wd(`/session/${session}/execute/async`, { script: source, args });
}
async function invoke(command, args = {}) {
  return script(
    `const done=arguments[arguments.length-1];
 if(typeof window.__TAURI_INTERNALS__?.invoke!=='function') return done({missingBridge:true});
 window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({ok:false,error:String(error)}));`,
    [command, args],
  );
}
function denied(result) {
  assert.equal(result.ok, false);
  assert.match(
    result.error,
    /not allowed|not permitted|denied|no host capabilities/i,
  );
}
function systemctl(...args) {
  return execFileSync('systemctl', ['--user', ...args], {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
}
async function artifact(source) {
  const compiled = String(await compile(source));
  const result = await build({
    stdin: {
      contents:
        compiled +
        "\nimport * as React from 'react';import {createRoot} from 'react-dom/client'; createRoot(document.getElementById('preview')).render(React.createElement(MDXContent));",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const hash = createHash('sha256').update(js).digest('base64');
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><div id="preview"></div><script>${js}</script>`;
}
const counter = await artifact(
  await readFile('docs/handoff/samples/fixtures/counter.mdx', 'utf8'),
);
try {
  await launch(['--security-editor']);
  assert.deepEqual(await invoke('host_probe'), {
    ok: true,
    value: 'editor-host-only',
  });
  // Stop any initial compiler-produced session before testing a known artifact.
  assert.equal((await invoke('stop_preview')).ok, true);
  const started = await invoke('start_preview', { html: counter });
  assert.equal(started.ok, true, JSON.stringify(started));
  const unit = started.value;
  assert.match(unit, /^programmable-notes-preview-\d+-\d+\.service$/);
  const group = systemctl('show', '--property=ControlGroup', '--value', unit);
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
  assert.equal((await invoke('stop_preview')).ok, true);
  await assert.rejects(access(dir)); // cgroup must be removed, not just launcher PID.
  console.log(
    'PASS: editor positive IPC control, resource-unit limits and full-group Stop',
  );
  await close();
  await launch(['--security-probe']);
  // Commands exist in this very binary; denial is not inferred from missing APIs.
  for (const command of ['host_probe', 'start_preview', 'stop_preview'])
    denied(await invoke(command, { html: counter }));
  for (const command of [
    'plugin:fs|read_file',
    'plugin:shell|execute',
    'plugin:http|fetch',
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
  const boundary = await script(
    `const done=arguments[arguments.length-1];const result={};for(const [key,fn] of Object.entries({parent:()=>parent.document.title,storage:()=>parent.localStorage.getItem('secret')})){try{fn();result[key]='allowed';}catch{result[key]='denied';}}done(result);`,
  );
  assert.deepEqual(boundary, { parent: 'denied', storage: 'denied' });
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
