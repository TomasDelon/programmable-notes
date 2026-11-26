import { Activity, useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWebPreview } from '../../src/web/useWebPreview';
import { RenderedRuntime } from '../../src/editor/rendered/RenderedRuntime';
import { WebRenderedRuntime } from '../../src/web/WebRenderedRuntime';
import { WebPreview } from '../../src/web/WebPreview';

type Inputs = Parameters<typeof useWebPreview>[0];
type Preview = ReturnType<typeof useWebPreview>;
const fixture = vi.hoisted(() => ({
  requests: [] as {
    files: Inputs['files'];
    trackWorkspaceDependencies?: boolean;
  }[],
  replies: [] as ((data: Record<string, unknown>) => void)[],
  prepare: vi.fn<(code: string) => Promise<string>>(),
}));
vi.mock('../../src/compiler/compiler.worker?worker&inline', () => ({
  default: class {
    onmessage?: (message: MessageEvent) => void;
    terminate() {}
    postMessage(request: {
      id: number;
      files: Inputs['files'];
      trackWorkspaceDependencies?: boolean;
    }) {
      const { id } = request;
      fixture.requests.push(request);
      fixture.replies.push((data) =>
        this.onmessage?.(
          new MessageEvent('message', { data: { id, ...data } }),
        ),
      );
    }
  },
}));
vi.mock('../../src/web/previewDocument', () => ({
  webPreviewDocument: fixture.prepare,
}));

beforeEach(() => {
  vi.useFakeTimers();
  fixture.prepare.mockImplementation(async (code) => `<p>${code}</p>`);
  const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
  vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(
    new WebAssembly.Module(bytes),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fixture.replies.length = 0;
  fixture.requests.length = 0;
  fixture.prepare.mockReset();
});

const first: Inputs = {
  files: { 'a.mdx': '# A', 'b.mdx': '# B' },
  entry: 'a.mdx',
  theme: 'light',
};

function observe(initial: Inputs = first) {
  const commits: Preview[] = [];
  function Host(props: Inputs) {
    const preview = useWebPreview(props);
    useLayoutEffect(() => {
      commits.push(preview);
    });
    return preview.html ? (
      <WebPreview html={preview.html} onError={preview.reportRuntimeError} />
    ) : null;
  }
  const view = render(<Host {...initial} />);
  return {
    commits,
    current: () => commits.at(-1)!,
    update: (props: Inputs) => view.rerender(<Host {...props} />),
    frame: () => view.queryByTitle('Document preview'),
  };
}

async function compile(index: number, result: Record<string, unknown>) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
    fixture.replies[index]!(result);
  });
}

const pending = { status: 'Compiling', html: '', error: '', locations: [] };

it('withholds the prior iframe on every commit while resuming on another note', async () => {
  const view = observe();
  await compile(0, { code: 'A' });
  expect(view.frame()).toHaveAttribute('srcdoc', '<p>A</p>');
  const reportFromA = view.current().reportRuntimeError;
  act(() => reportFromA('A crashed'));

  view.update({ ...first, enabled: false });
  const next = { ...first, entry: 'b.mdx' };
  view.update({ ...next, enabled: false });
  expect(view.frame()).toBeNull();
  const start = view.commits.length;
  view.update(next);
  expect(view.commits.slice(start)).not.toHaveLength(0);
  for (const commit of view.commits.slice(start))
    expect(commit).toMatchObject(pending);
  expect(view.frame()).toBeNull();

  let finish!: (html: string) => void;
  fixture.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await compile(1, { code: 'B' });
  expect(view.frame()).toBeNull();
  expect(view.current()).toMatchObject({
    ...pending,
    status: 'Preparing preview',
  });
  await act(async () => finish('<p>B</p>'));
  expect(view.frame()).toHaveAttribute('srcdoc', '<p>B</p>');
  act(() => reportFromA('late error from A'));
  expect(view.current()).toMatchObject({ status: 'Preview ready', error: '' });
});

const sourceChange: Inputs = {
  ...first,
  files: { ...first.files, 'a.mdx': '# Changed' },
};
it.each<[string, Inputs]>([
  ['source', sourceChange],
  ['entry', { ...first, entry: 'b.mdx' }],
  [
    'images',
    {
      ...first,
      images: [
        {
          id: 'sha256:' + 'a'.repeat(64),
          name: 'a.png',
          mime: 'image/png',
          base64: 'AA==',
          byteLength: 1,
        },
      ],
    },
  ],
  ['mathematics', { ...first, corePlugins: { mathematics: false } }],
  ['source visibility', { ...first, showComponentSource: true }],
])(
  'withdraws errors and source locations on the first commit after changing %s',
  async (_, next) => {
    const view = observe();
    await compile(0, {
      error: 'bad A',
      locations: [{ file: 'a.mdx', offset: 1, line: 1 }],
    });
    expect(view.current()).toMatchObject({
      status: 'Build failed',
      error: 'bad A',
      locations: [{ file: 'a.mdx', offset: 1, line: 1, source: '# A' }],
    });
    const start = view.commits.length;
    view.update(next);
    expect(view.commits[start]).toMatchObject(pending);
  },
);

it('retires diagnostics when disabled and starts fresh after enabling or rebuilding the same source', async () => {
  const view = observe();
  await compile(0, {
    error: 'bad A',
    locations: [{ file: 'a.mdx', offset: 0, line: 1 }],
  });
  view.update({ ...first, enabled: false });
  expect(view.current()).toMatchObject({
    ...pending,
    status: 'Preview stopped',
  });
  let start = view.commits.length;
  view.update(first);
  expect(view.commits[start]).toMatchObject(pending);
  await compile(1, { code: 'valid' });
  const reportBeforeRebuild = view.current().reportRuntimeError;
  start = view.commits.length;
  act(() => view.current().rebuild());
  expect(view.commits[start]).toMatchObject(pending);
  await compile(2, { code: 'rebuilt' });
  act(() => reportBeforeRebuild('late error after Rebuild'));
  expect(view.current()).toMatchObject({
    html: '<p>rebuilt</p>',
    status: 'Preview ready',
    error: '',
  });
});

const island: Inputs = {
  entry: 'note.mdx',
  theme: 'light',
  trackWorkspaceDependencies: true,
  files: {
    'note.mdx': "import Counter from './Counter'\n\n<Counter />",
    'Counter.tsx': "export {default} from './value'",
    'value.js': 'export default 4',
    'unused.md': 'unrelated',
  },
};
const dependencies = {
  reads: ['note.mdx', 'Counter.tsx', 'value.js'],
  resolutions: [
    { specifier: './note.mdx', importer: '<stdin>', path: 'note.mdx' },
    { specifier: './Counter', importer: 'note.mdx', path: 'Counter.tsx' },
    { specifier: './value', importer: 'Counter.tsx', path: 'value.js' },
  ],
};
const editedSibling = { ...island.files, 'unused.md': 'updated' };

it('keeps the same live island iframe after an unused group edit and replaces it for a transitive import change', async () => {
  const onError = vi.fn();
  const component = (files: Inputs['files']) => (
    <RenderedRuntime
      raw="<Counter />"
      onError={onError}
      context={{
        renderer: WebRenderedRuntime,
        files,
        entry: island.entry,
        theme: 'light',
        images: [],
        stopped: false,
      }}
    />
  );
  const ui = render(component(island.files));
  await compile(0, { code: 'initial counter', dependencies });
  const frame = ui.getByTitle('Document preview') as HTMLIFrameElement;
  const browsingContext = frame.contentWindow;
  ui.rerender(component(editedSibling));
  expect(ui.queryByTitle('Document preview')).toBe(frame);
  expect(frame.contentWindow).toBe(browsingContext);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(fixture.replies).toHaveLength(1);
  ui.rerender(component({ ...editedSibling, 'value.js': 'export default 9' }));
  expect(ui.queryByTitle('Document preview')).toBeNull();
  await compile(1, { code: 'changed counter', dependencies });
  expect(fixture.requests[1]).toMatchObject({
    trackWorkspaceDependencies: true,
    files: { 'unused.md': 'updated', 'value.js': 'export default 9' },
  });
  expect(ui.getByTitle('Document preview')).toHaveAttribute(
    'srcdoc',
    '<p>changed counter</p>',
  );
});

it('replays extension resolution and falls back to the full group when a shadow appears or an import goes missing', async () => {
  const view = observe(island);
  await compile(0, { code: 'js value', dependencies });
  const withShadow = { ...editedSibling, 'value.tsx': 'export default 5' };
  view.update({ ...island, files: withShadow });
  expect(view.frame()).toBeNull();
  const shadowReceipt = {
    reads: ['note.mdx', 'Counter.tsx', 'value.tsx'],
    resolutions: [
      ...dependencies.resolutions.slice(0, -1),
      { specifier: './value', importer: 'Counter.tsx', path: 'value.tsx' },
    ],
  };
  await compile(1, { code: 'tsx value', dependencies: shadowReceipt });
  view.update({ ...island, files: editedSibling });
  expect(view.frame()).toBeNull();
  await compile(2, { code: 'fallback js value', dependencies });
  const missing: Inputs['files'] = { ...editedSibling };
  delete missing['value.js'];
  view.update({ ...island, files: missing });
  expect(view.frame()).toBeNull();
  await compile(3, { error: 'Missing workspace module', dependencies });
  expect(view.current().error).toBe('Missing workspace module');
  view.update({ ...island, files: editedSibling });
  expect(view.current()).toMatchObject(pending);
  await compile(4, { code: 'recovered', dependencies });
  expect(view.frame()).toHaveAttribute('srcdoc', '<p>recovered</p>');
});

it('validates the entire group budget before retaining an island', async () => {
  const view = observe(island);
  await compile(0, { code: 'valid', dependencies });
  view.update({
    ...island,
    files: { ...island.files, 'unused.md': 'é'.repeat(250001) },
  });
  expect(view.frame()).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(view.current()).toMatchObject({ status: 'Build blocked', html: '' });
  expect(fixture.replies).toHaveLength(1);
});

it.each([
  ['absent', undefined],
  ['unknown receipt fields', { ...dependencies, extra: true }],
  [
    'unknown resolution fields',
    {
      ...dependencies,
      resolutions: dependencies.resolutions.map((edge) => ({
        ...edge,
        extra: true,
      })),
    },
  ],
  [
    'missing entry resolution',
    { ...dependencies, resolutions: dependencies.resolutions.slice(1) },
  ],
  [
    'missing target read',
    { ...dependencies, reads: ['note.mdx', 'Counter.tsx'] },
  ],
  ['invalid edge', { ...dependencies, resolutions: [null] }],
  [
    'over budget',
    {
      ...dependencies,
      resolutions: Array(1000).fill(dependencies.resolutions[0]),
    },
  ],
])('rebuilds for unproven, %s dependency evidence', async (_, receipt) => {
  const view = observe(island);
  await compile(0, { code: 'valid', dependencies: receipt });
  view.update({ ...island, files: editedSibling });
  expect(view.current()).toMatchObject(pending);
});
it('requires a current successful island, and retires a stopped, rebuilt, or failed runtime', async () => {
  const view = observe(island);
  await compile(0, { code: 'first', dependencies });
  view.update({ ...island, files: editedSibling });
  expect(view.current().status).toBe('Preview ready');
  act(() => view.current().reportRuntimeError('current iframe failure'));
  expect(view.current()).toMatchObject({
    status: 'Runtime error',
    error: 'current iframe failure',
  });
  const other = {
    ...island,
    files: { ...editedSibling, 'unused.md': 'changed again' },
  };
  view.update(other);
  expect(view.current()).toMatchObject(pending);
  await compile(1, { code: 'recovered', dependencies });
  act(() => view.current().stop());
  expect(view.frame()).toBeNull();
  act(() => view.current().rebuild());
  expect(view.current()).toMatchObject(pending);
  await compile(2, { code: 'resumed', dependencies });
  act(() => view.current().rebuild());
  expect(view.current()).toMatchObject(pending);
  await compile(3, { code: 'restarted', dependencies });
  view.update({ ...other, enabled: false });
  view.update(other);
  expect(view.current()).toMatchObject(pending);
});
it('keeps full document builds conservative even when a worker returns a receipt', async () => {
  const full = { ...island, trackWorkspaceDependencies: false };
  const view = observe(full);
  await compile(0, { code: 'whole doc', dependencies });
  view.update({ ...full, files: editedSibling });
  expect(view.current()).toMatchObject(pending);
});

it('rejects a late preparation receipt after an unused edit retires an unproven request', async () => {
  const view = observe(island);
  let finish!: (html: string) => void;
  fixture.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await compile(0, { code: 'old', dependencies });
  expect(view.current().status).toBe('Preparing preview');
  view.update({ ...island, files: editedSibling });
  await act(async () => finish('<p>retired result</p>'));
  expect(view.current()).toMatchObject(pending);
  await compile(1, { code: 'new without proof' });
  view.update({
    ...island,
    files: { ...editedSibling, 'unused.md': 'another edit' },
  });
  expect(view.current()).toMatchObject(pending);
});

it.each<[string, Partial<Inputs>]>([
  ['entry', { entry: 'unused.md' }],
  [
    'transformed source',
    { files: { ...island.files, 'note.mdx': '<Changed />' } },
  ],
  ['images', { images: [] }],
  ['math plugin', { corePlugins: { mathematics: false } }],
  ['source visibility', { showComponentSource: true }],
])(
  'keeps %s changes authoritative after a proven unused edit',
  async (_, change) => {
    const view = observe(island);
    await compile(0, { code: 'running', dependencies });
    view.update({ ...island, files: editedSibling });
    expect(view.frame()).not.toBeNull();
    view.update({ ...island, files: editedSibling, ...change });
    expect(view.current()).toMatchObject(pending);
  },
);

it('retires the proof when React disconnects the compiler effect while preserving island state', async () => {
  const onError = vi.fn();
  const renderIsland = (mode: 'visible' | 'hidden', files: Inputs['files']) => (
    <Activity mode={mode}>
      <RenderedRuntime
        raw="<Counter />"
        onError={onError}
        context={{
          renderer: WebRenderedRuntime,
          files,
          entry: island.entry,
          theme: 'light',
          images: [],
          stopped: false,
        }}
      />
    </Activity>
  );
  const ui = render(renderIsland('visible', island.files));
  await compile(0, { code: 'retired', dependencies });
  expect(ui.queryByTitle('Document preview')).not.toBeNull();
  ui.rerender(renderIsland('hidden', island.files));
  ui.rerender(renderIsland('visible', editedSibling));
  expect(ui.queryByTitle('Document preview')).toBeNull();
  await compile(1, { code: 'fresh', dependencies });
  expect(ui.getByTitle('Document preview')).toHaveAttribute(
    'srcdoc',
    '<p>fresh</p>',
  );
});
