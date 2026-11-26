import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compile } from '/workspace/programmable-notes/node_modules/@mdx-js/mdx/index.js';
import { build } from '/workspace/programmable-notes/node_modules/esbuild/lib/main.js';
const root = '/tmp/pn-wry-react-pointer-20261126';
const repo = '/workspace/programmable-notes';
const digest = (value) => createHash('sha256').update(value).digest('hex');
// Compile and bundle only. Never eval/import the generated fixture in this privileged process.
const source = await readFile(`${root}/counter.mdx`, 'utf8');
const compiled = String(await compile({ value: source, path: 'counter.mdx' }, { development: false }));
const bootstrap = `
import * as React from 'react';
import {createRoot} from 'react-dom/client';
globalThis.__pnFixtureError='';
const reportError = value => { globalThis.__pnFixtureError=String(value?.message ?? value).slice(0,35); document.title = JSON.stringify({fixtureError:globalThis.__pnFixtureError}); };
addEventListener('error',event => reportError(event.message));
addEventListener('unhandledrejection',event => reportError(event.reason));
createRoot(document.getElementById('preview'),{onUncaughtError:reportError}).render(React.createElement(MDXContent));
`;
const bundle = await build({
  stdin: { contents: compiled + bootstrap, resolveDir: repo, loader: 'js' },
  bundle: true, write: false, minify: true, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-spike\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"></head><body style="margin:0;background:#bbeedd;font:20px sans-serif"><div id="preview"></div><script nonce="spike">' + js + '</script></body></html>';
await writeFile(`${root}/fixture.html`, html);
await writeFile(`${root}/compiled-mdx.js`, compiled);
const dependencies = {};
for (const name of ['@mdx-js/mdx','esbuild','react','react-dom']) {
  const bytes = await readFile(`${repo}/node_modules/${name}/package.json`);
  dependencies[name] = { version: JSON.parse(bytes).version, packageJsonSha256: digest(bytes) };
}
const receipt = { kind:'trusted_compile_only_no_generated_code_evaluation', sourceSha256:digest(source), compiledMdxSha256:digest(compiled), javascriptSha256:digest(js), htmlSha256:digest(html), javascriptBytes:Buffer.byteLength(js), htmlBytes:Buffer.byteLength(html), packageLockSha256:digest(await readFile(`${repo}/package-lock.json`)), dependencies };
await writeFile(`${root}/compile-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
