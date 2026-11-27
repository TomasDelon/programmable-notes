/** Fixed trusted build only; no authored input, output path, eval or guest action. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from '@mdx-js/mdx';
import { build } from 'esbuild';

const repository = new URL('../../', import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const dependencies = [
  '@mdx-js/mdx',
  'esbuild',
  'react',
  'react-dom',
  'scheduler',
];
const csp =
  "default-src 'none'; script-src 'nonce-inline-react-v1'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const bootstrap = `
import * as React from 'react';
import {createRoot} from 'react-dom/client';
let current = {ready:false,count:0,field:'',focus:''};
let stickyError = '';
const publish = () => {
  const value = JSON.stringify({fixture:'inline-react-v1',...current,error:stickyError});
  document.title = new TextEncoder().encode(value).length <= 256
    ? value : '{"fixture":"inline-react-v1","ready":false,"error":"receipt-overflow"}';
};
globalThis.__pnFixtureReport = next => {
  current = {
    ready: next.ready === true,
    count: Number.isInteger(next.count) && next.count >= 0 && next.count <= 999 ? next.count : 0,
    field: typeof next.field === 'string' ? next.field.slice(0,16) : '',
    focus: next.focus === 'field' || next.focus === 'counter' ? next.focus : '',
  };
  publish();
};
const fail = code => { if (!stickyError) stickyError = code; publish(); };
addEventListener('error', () => fail('runtime-error'));
addEventListener('unhandledrejection', () => fail('unhandled-rejection'));
publish();
createRoot(document.getElementById('preview'),{onUncaughtError:() => fail('react-error')})
  .render(React.createElement(MDXContent));
`;

/** Returns reproducible public artifact bytes; never executes generated code. */
export async function compileFixture(...args) {
  if (args.length) throw Error('Fixed fixture compiler accepts no arguments.');
  const [source, compiler, packageBytes, lockBytes] = await Promise.all([
    readFile(new URL('./document.mdx', import.meta.url)),
    readFile(new URL('./compile.mjs', import.meta.url)),
    readFile(new URL('package.json', repository)),
    readFile(new URL('package-lock.json', repository)),
  ]);
  const project = JSON.parse(packageBytes);
  const lock = JSON.parse(lockBytes);
  const packages = {};
  for (const name of dependencies) {
    const bytes = await readFile(
      new URL(`node_modules/${name}/package.json`, repository),
    );
    const { version } = JSON.parse(bytes);
    const pinned =
      project.dependencies?.[name] ?? project.devDependencies?.[name];
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (
      !locked ||
      version !== locked ||
      (pinned !== undefined && pinned !== version)
    )
      throw Error(
        'Fixed fixture dependency does not match the repository lock.',
      );
    packages[name] = { version, packageJsonSha256: digest(bytes) };
  }
  const compiled = String(
    await compile(
      { value: source.toString('utf8'), path: 'document.mdx' },
      { development: false },
    ),
  );
  const bundled = await build({
    stdin: {
      contents: compiled + bootstrap,
      resolveDir: fileURLToPath(repository),
      loader: 'js',
    },
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    platform: 'browser',
    legalComments: 'inline',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const javascript = bundled.outputFiles[0].text.replace(
    /<\/script/gi,
    '<\\/script',
  );
  const html = Buffer.from(
    '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
      csp +
      '"><style>body{margin:0;font:16px sans-serif}#fixture-row{display:flex;align-items:center;gap:8px;padding:4px}button,input{font:inherit}button{padding:2px 6px}label{display:flex;align-items:center;gap:4px}input{width:110px;min-width:0}</style></head><body><div id="preview"></div><script nonce="inline-react-v1">' +
      javascript +
      '</script></body></html>',
  );
  const manifest = Buffer.from(
    JSON.stringify(
      {
        version: 1,
        profile: 'inline-react-v1',
        scope: 'fixed-fixture-build-only',
        nativeTested: false,
        generatedCodeEvaluatedOnHost: false,
        nodeVersion: process.version,
        inputs: {
          sourceSha256: digest(source),
          compilerSha256: digest(compiler),
          packageJsonSha256: digest(packageBytes),
          packageLockSha256: digest(lockBytes),
        },
        dependencies: packages,
        artifacts: {
          compiledMdxSha256: digest(compiled),
          compiledMdxBytes: Buffer.byteLength(compiled),
          javascriptSha256: digest(javascript),
          javascriptBytes: Buffer.byteLength(javascript),
          htmlSha256: digest(html),
          htmlBytes: html.length,
        },
        receipt: {
          transport: 'document-title',
          maximumUtf8Bytes: 256,
          maximumFieldCodeUnits: 16,
          errorCodes: [
            'runtime-error',
            'unhandled-rejection',
            'react-error',
            'receipt-overflow',
          ],
        },
      },
      null,
      2,
    ) + '\n',
  );
  return { html, manifest };
}
