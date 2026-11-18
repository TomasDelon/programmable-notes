import { compile } from '@mdx-js/mdx';
import * as esbuild from 'esbuild-wasm';
import { resolveFile } from './resolve';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';

const packages: Record<string, string> = {
  react: `const R=globalThis.__PN.React; export default R; ${Object.keys(React)
    .filter((k) => k !== 'default' && k !== '__esModule')
    .map((k) => `export const ${k}=R.${k};`)
    .join('')}`,
  'react/jsx-runtime': `${Object.keys(jsx)
    .filter((k) => k !== 'default')
    .map((k) => `export const ${k}=globalThis.__PN.jsx.${k};`)
    .join('')}`,
  clsx: 'export default globalThis.__PN.clsx; export const clsx=globalThis.__PN.clsx;',
};
self.onmessage = async ({
  data,
}: MessageEvent<{
  wasmModule: WebAssembly.Module;
  id: number;
  files: Record<string, string>;
  entry: string;
}>) => {
  const { id, files, entry } = data;
  try {
    await esbuild.initialize({ wasmModule: data.wasmModule, worker: false });
    const result = await esbuild.build({
      stdin: {
        contents: `import Doc from ${JSON.stringify('./' + entry)}; globalThis.__PN.mount(Doc);`,
        resolveDir: '/',
        loader: 'js',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      sourcemap: 'inline',
      sourcesContent: true,
      plugins: [
        {
          name: 'memory-only',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (Object.hasOwn(packages, args.path))
                return { path: args.path, namespace: 'package' };
              return {
                path: resolveFile(
                  args.path,
                  args.importer || 'entry.js',
                  files,
                ),
                namespace: 'workspace',
              };
            });
            build.onLoad({ filter: /.*/, namespace: 'package' }, (args) => ({
              contents: packages[args.path],
              loader: 'js',
            }));
            build.onLoad(
              { filter: /.*/, namespace: 'workspace' },
              async (args) => {
                const source = files[args.path]!;
                if (/\.mdx?$/.test(args.path)) {
                  try {
                    const compiled = await compile(
                      { value: source, path: args.path },
                      { development: false },
                    );
                    return { contents: String(compiled), loader: 'js' };
                  } catch (error) {
                    const diagnostic = error as {
                      message?: string;
                      line?: number;
                      column?: number;
                    };
                    return {
                      errors: [
                        {
                          text: diagnostic.message || String(error),
                          location: diagnostic.line
                            ? {
                                file: args.path,
                                line: diagnostic.line,
                                column: Math.max(
                                  0,
                                  (diagnostic.column ?? 1) - 1,
                                ),
                              }
                            : undefined,
                        },
                      ],
                    };
                  }
                }
                return {
                  contents: source,
                  loader: args.path.endsWith('tsx')
                    ? 'tsx'
                    : args.path.endsWith('ts')
                      ? 'ts'
                      : 'jsx',
                };
              },
            );
          },
        },
      ],
    });
    self.postMessage({ id, code: result.outputFiles[0]!.text });
  } catch (error) {
    const failure = error as Partial<esbuild.BuildFailure>;
    const errors = failure.errors?.slice(0, 8).map(({ text, location }) => {
      const file = location?.file.replace(/^workspace:/, '') || entry;
      return location?.line
        ? `${file}:${location.line}:${location.column + 1}: ${text}`
        : `${file}: ${text}`;
    });
    self.postMessage({
      id,
      error: (
        errors?.join('\n') || `${entry}: ${failure.message || String(error)}`
      ).slice(0, 8000),
    });
  }
};
