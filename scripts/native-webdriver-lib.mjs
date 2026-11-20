// Shared real WebKitGTK protocol harness; no simulated native operations.
import { access } from 'node:fs/promises';
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
async function preflight() {
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
  if (!response.ok) throw Error(JSON.stringify(json));
  return json.value;
}
async function launch(args = [], application = binary) {
  const result = await wd('/session', {
    capabilities: {
      alwaysMatch: { 'tauri:options': { application, args } },
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
    minify: true,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const hash = createHash('sha256').update(js).digest('base64');
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><div id="preview"></div><script>${js}</script>`;
}
export {
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
};
