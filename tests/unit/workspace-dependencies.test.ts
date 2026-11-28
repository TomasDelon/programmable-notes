// @vitest-environment node
import type { BuildOptions } from 'esbuild';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  verifiedDependencies,
  workspaceDependenciesMatch,
} from '../../src/compiler/workspaceDependencies';

// Use the actual compiler plugin and module graph with the Node esbuild driver.
// The worker normally runs these same onResolve/onLoad callbacks against WASM.
vi.mock('esbuild-wasm', async () => {
  const { build } = await vi.importActual<typeof import('esbuild')>('esbuild');
  return {
    initialize: async () => {},
    build: (options: BuildOptions) => build({ ...options, logLevel: 'silent' }),
  };
});
// Node exposes a synthetic "module.exports" namespace key absent in the browser bundle.
vi.mock('react/jsx-runtime', async () => {
  const { jsx, jsxs, Fragment } =
    await vi.importActual<typeof import('react/jsx-runtime')>(
      'react/jsx-runtime',
    );
  return { jsx, jsxs, Fragment };
});

const worker = {
  postMessage: vi.fn(),
  onmessage: undefined as
    undefined | ((event: { data: Record<string, unknown> }) => Promise<void>),
};
beforeAll(async () => {
  vi.stubGlobal('self', worker);
  await import('../../src/compiler/compiler.worker');
});
afterAll(() => vi.unstubAllGlobals());

const files = {
  'notes/entry.mdx': "import Counter from './Counter'\n\n<Counter />",
  'notes/Counter.tsx':
    "import {value} from '../lib/value'; export default function Counter(){return <b>{value}</b>}",
  'lib/value.js': 'export const value = 4',
  'notes/unused.md': 'unrelated',
};
const request = { id: 17, files, entry: 'notes/entry.mdx', webMode: true };
async function run(data: Record<string, unknown>) {
  worker.postMessage.mockClear();
  await worker.onmessage!({ data });
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  return worker.postMessage.mock.calls[0]![0];
}

it('records the workspace loads and resolver decisions of a successful transitive MDX build', async () => {
  const answer = await run({ ...request, trackWorkspaceDependencies: true });
  expect(answer.error).toBeUndefined();
  expect(answer.id).toBe(17);
  expect(answer.code).toContain('globalThis.__PN.mount');
  expect(answer.dependencies?.reads.toSorted()).toEqual([
    'lib/value.js',
    'notes/Counter.tsx',
    'notes/entry.mdx',
  ]);
  expect(answer.dependencies?.resolutions).toEqual([
    {
      specifier: './notes/entry.mdx',
      importer: '<stdin>',
      path: 'notes/entry.mdx',
    },
    {
      specifier: './Counter',
      importer: 'notes/entry.mdx',
      path: 'notes/Counter.tsx',
    },
    {
      specifier: '../lib/value',
      importer: 'notes/Counter.tsx',
      path: 'lib/value.js',
    },
  ]);
});

it('omits dependency evidence for ordinary builds, compiler errors, and graphs beyond the receipt budget', async () => {
  const ordinary = await run(request);
  expect(ordinary.code).toBeTypeOf('string');
  expect(ordinary).not.toHaveProperty('dependencies');
  const missing = await run({
    ...request,
    trackWorkspaceDependencies: true,
    files: { 'notes/entry.mdx': files['notes/entry.mdx'] },
  });
  expect(missing.error).toContain('Missing workspace module');
  expect(missing).not.toHaveProperty('dependencies');
  const longName = 'x'.repeat(2000) + '.js';
  const overflow = await run({
    ...request,
    trackWorkspaceDependencies: true,
    files: {
      'notes/entry.mdx': "import a from '../" + longName + "'\n\n{a}",
      [longName]: 'export default 1',
    },
  });
  expect(overflow.code).toBeTypeOf('string');
  expect(overflow).not.toHaveProperty('dependencies');
});

it('uses own file keys even when an import names a property on Object.prototype', async () => {
  const group = {
    'note.mdx': "import value from './constructor'\n\n{value}",
    constructor: 'export default 4',
    'unused.md': 'unused',
  };
  const answer = await run({
    ...request,
    entry: 'note.mdx',
    files: group,
    trackWorkspaceDependencies: true,
  });
  const receipt = verifiedDependencies(answer.dependencies, 'note.mdx', group);
  expect(receipt).toBeDefined();
  expect(
    workspaceDependenciesMatch(receipt!, group, {
      ...group,
      'unused.md': 'changed',
    }),
  ).toBe(true);
  expect(
    workspaceDependenciesMatch(receipt!, group, {
      'note.mdx': group['note.mdx'],
      'unused.md': 'changed',
    }),
  ).toBe(false);
});
