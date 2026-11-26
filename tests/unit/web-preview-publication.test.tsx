import { useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWebPreview } from '../../src/web/useWebPreview';
import { WebPreview } from '../../src/web/WebPreview';

type Inputs = Parameters<typeof useWebPreview>[0];
type Preview = ReturnType<typeof useWebPreview>;
const fixture = vi.hoisted(() => ({
  replies: [] as ((data: Record<string, unknown>) => void)[],
  prepare: vi.fn<(code: string) => Promise<string>>(),
}));
vi.mock('../../src/compiler/compiler.worker?worker&inline', () => ({
  default: class {
    onmessage?: (message: MessageEvent) => void;
    terminate() {}
    postMessage({ id }: { id: number }) {
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
  fixture.prepare.mockReset();
});

const first: Inputs = {
  files: { 'a.mdx': '# A', 'b.mdx': '# B' },
  entry: 'a.mdx',
  theme: 'light',
};

function observe() {
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
  const view = render(<Host {...first} />);
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
