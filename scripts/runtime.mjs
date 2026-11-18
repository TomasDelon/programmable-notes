import process from 'node:process';
import { build } from 'esbuild';
await build({
  stdin: {
    contents: `import * as React from 'react'; import * as jsx from 'react/jsx-runtime'; import {createRoot} from 'react-dom/client'; import clsx from 'clsx'; globalThis.__PN={React,jsx,createRoot,clsx};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: '.cache/runtime.js',
});
