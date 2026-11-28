import { isMdxSource, javascriptLoader } from '../sourceTypes';
import { compileDocumentSource } from './compileDocumentSource';
import * as esbuild from 'esbuild-wasm';
import { resolveFile } from './resolve';
import { WorkspaceDependencyTracker } from './workspaceDependencies';
import { sourceLineOffset } from './sourceLocation';
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
  webMode?: boolean;
  trackWorkspaceDependencies?: boolean;
  mathematics?: boolean;
  showComponentSource?: boolean;
}>) => {
  const { id, files, entry } = data;
  const tracker =
    data.webMode === true && data.trackWorkspaceDependencies === true
      ? new WorkspaceDependencyTracker()
      : undefined;
  const sourceLocations: { file: string; line: number; offset: number }[] = [];
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
              const importer = args.importer || 'entry.js';
              const path = resolveFile(args.path, importer, files);
              tracker?.resolved(args.path, importer, path);
              return { path, namespace: 'workspace' };
            });
            build.onLoad({ filter: /.*/, namespace: 'package' }, (args) => ({
              contents: packages[args.path],
              loader: 'js',
            }));
            build.onLoad(
              { filter: /.*/, namespace: 'workspace' },
              async (args) => {
                const source = files[args.path]!;
                tracker?.read(args.path);
                if (isMdxSource(args.path)) {
                  try {
                    const compiled = await compileDocumentSource(
                      source,
                      args.path,
                      data.webMode === true,
                      data.mathematics !== false,
                      data.showComponentSource === true,
                    );
                    return { contents: String(compiled), loader: 'js' };
                  } catch (error) {
                    const diagnostic = error as {
                      message?: string;
                      line?: number;
                      column?: number;
                    };
                    if (typeof diagnostic.line === 'number') {
                      const offset = sourceLineOffset(source, diagnostic.line);
                      if (offset !== null)
                        sourceLocations.push({
                          file: args.path,
                          line: diagnostic.line,
                          offset,
                        });
                    }
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
                  loader: javascriptLoader(args.path),
                };
              },
            );
          },
        },
      ],
    });
    self.postMessage({
      id,
      code: result.outputFiles[0]!.text,
      ...(tracker?.dependencies && { dependencies: tracker.dependencies }),
    });
  } catch (error) {
    const failure = error as Partial<esbuild.BuildFailure>;
    // MDX compilation reports original locations above. Esbuild locations in
    // generated MDX JavaScript are not original-source mappings; omit those.
    const locations = [
      ...sourceLocations,
      ...(failure.errors ?? []).flatMap(({ location }) => {
        const file = location?.file.replace(/^workspace:/, '');
        if (
          !file ||
          !Object.hasOwn(files, file) ||
          !/\.[jt]sx?$/.test(file) ||
          !location
        )
          return [];
        const offset = sourceLineOffset(files[file]!, location.line, true);
        return offset === null ? [] : [{ file, line: location.line, offset }];
      }),
    ].slice(0, 8);
    const errors = failure.errors?.slice(0, 8).map(({ text, location }) => {
      const file = location?.file.replace(/^workspace:/, '') || entry;
      return location?.line
        ? `${file}:${location.line}:${location.column + 1}: ${text}`
        : `${file}: ${text}`;
    });
    self.postMessage({
      id,
      locations,
      error: (
        errors?.join('\n') || `${entry}: ${failure.message || String(error)}`
      ).slice(0, 8000),
    });
  }
};
