import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  DocumentRuntime,
  type DocumentRuntimeInput,
  type DocumentRuntimeProps,
  type DocumentRuntimeSession,
} from '../../src/preview/DocumentRuntime';
import { useWebPreview } from '../../src/web/useWebPreview';
import { WebDocumentRuntime } from '../../src/web/WebDocumentRuntime';

const fixture = vi.hoisted(() => ({
  preview: {
    html: '<button>Whole component</button>',
    status: 'Preview ready',
    error: '',
    locations: [] as {
      file: string;
      line: number;
      offset: number;
      source: string;
    }[],
    stopped: false,
    stop: vi.fn(),
    rebuild: vi.fn(),
    reportRuntimeError: vi.fn(),
  },
}));
vi.mock('../../src/web/useWebPreview', () => ({
  useWebPreview: vi.fn(() => fixture.preview),
}));
beforeEach(() => {
  vi.clearAllMocks();
  fixture.preview.html = '<button>Whole component</button>';
  fixture.preview.status = 'Preview ready';
  fixture.preview.error = '';
  fixture.preview.locations = [];
  fixture.preview.stopped = false;
});
const input: DocumentRuntimeInput = {
  files: { 'note.mdx': '# Whole\r\n<Component />' },
  entry: 'note.mdx',
  theme: 'light',
  images: [],
  enabled: true,
};

it('defaults to unavailable presentation/actions without invoking browser compilation or creating an iframe', () => {
  let observed: DocumentRuntimeSession | undefined;
  const ui = render(
    <DocumentRuntime input={input}>
      {(session) => {
        observed = session;
        return <>{session.presentation}</>;
      }}
    </DocumentRuntime>,
  );
  expect(screen.getByText('React preview is unavailable.')).toBeVisible();
  expect(observed).toMatchObject({
    available: false,
    locations: [],
    error: '',
    status: 'React preview unavailable',
    stopped: true,
  });
  observed!.stop();
  observed!.rebuild();
  expect(useWebPreview).not.toHaveBeenCalled();
  expect(ui.container.querySelector('iframe')).toBeNull();
});

it('uses an explicit stable renderer without remounting it or its presentation across mode/theme changes', () => {
  const received = vi.fn();
  const mounted = vi.fn();
  const disposed = vi.fn();
  function Adapter({ input, children }: DocumentRuntimeProps) {
    received(input);
    const [count, setCount] = useState(0);
    useEffect(() => {
      mounted();
      return disposed;
    }, []);
    return children({
      available: true,
      presentation: (
        <button onClick={() => setCount(count + 1)}>Count {count}</button>
      ),
      status: 'Preview ready',
      error: '',
      locations: [],
      stopped: false,
      stop: vi.fn(),
      rebuild: vi.fn(),
    });
  }
  const draw = (request: DocumentRuntimeInput, visible: boolean) => (
    <DocumentRuntime input={request} renderer={Adapter}>
      {(session) => <div hidden={!visible}>{session.presentation}</div>}
    </DocumentRuntime>
  );
  const ui = render(draw(input, true));
  fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
  ui.rerender(draw({ ...input, theme: 'dark' }, false));
  ui.rerender(draw({ ...input, theme: 'dark' }, true));
  expect(screen.getByRole('button', { name: 'Count 1' })).toBeVisible();
  expect(received).toHaveBeenLastCalledWith({ ...input, theme: 'dark' });
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(disposed).not.toHaveBeenCalled();
  expect(useWebPreview).not.toHaveBeenCalled();
  ui.unmount();
  expect(disposed).toHaveBeenCalledTimes(1);
});

it('keeps browser compiler/frame imports out of the boundary and presentation body', () => {
  const imports = (path: string) =>
    ts
      .createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      .statements.filter(ts.isImportDeclaration)
      .filter((node) => !node.importClause?.isTypeOnly)
      .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
  expect(imports('src/preview/DocumentRuntime.tsx')).toEqual([]);
  const workspaceImports = imports('src/web/WebApp.tsx');
  expect(workspaceImports).not.toContain('./useWebPreview');
  expect(workspaceImports).not.toContain('./WebPreview');
});

it('keeps the existing browser iframe/key while modes hide it, forwards theme and controls without a state mirror', () => {
  let current: DocumentRuntimeSession | undefined;
  const draw = (request: DocumentRuntimeInput, visible: boolean) => (
    <DocumentRuntime renderer={WebDocumentRuntime} input={request}>
      {(session) => {
        current = session;
        return <div hidden={!visible}>{session.presentation}</div>;
      }}
    </DocumentRuntime>
  );
  const ui = render(draw(input, true));
  const frame = screen.getByTitle('Document preview');
  const browsingContext = (frame as HTMLIFrameElement).contentWindow;
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(useWebPreview).toHaveBeenLastCalledWith(input);
  current!.stop();
  current!.rebuild();
  expect(fixture.preview.stop).toHaveBeenCalledOnce();
  expect(fixture.preview.rebuild).toHaveBeenCalledOnce();
  ui.rerender(draw({ ...input, theme: 'dark' }, false));
  expect(ui.getByTitle('Document preview')).toBe(frame);
  ui.rerender(draw({ ...input, theme: 'dark' }, true));
  expect(screen.getByTitle('Document preview')).toBe(frame);
  expect((frame as HTMLIFrameElement).contentWindow).toBe(browsingContext);
  fixture.preview.html = '<button>Changed executable</button>';
  ui.rerender(draw({ ...input, files: { 'note.mdx': '# Changed' } }, true));
  expect(screen.getByTitle('Document preview')).not.toBe(frame);
});

it('withdraws retired diagnostics/presentation in the same render as the adapter result and passes stopped state directly', () => {
  const commits: {
    error: string;
    locations: DocumentRuntimeSession['locations'];
  }[] = [];
  const draw = (request: DocumentRuntimeInput) => (
    <DocumentRuntime renderer={WebDocumentRuntime} input={request}>
      {(session) => {
        commits.push({ error: session.error, locations: session.locations });
        return (
          <>
            {session.presentation}
            <output>{session.status}</output>
          </>
        );
      }}
    </DocumentRuntime>
  );
  fixture.preview.html = '';
  fixture.preview.error = 'Old compile failure';
  fixture.preview.locations = [
    {
      file: input.entry,
      line: 1,
      offset: 0,
      source: input.files[input.entry]!,
    },
  ];
  const ui = render(draw(input));
  expect(commits.at(-1)!.error).toBe('Old compile failure');
  fixture.preview.error = '';
  fixture.preview.locations = [];
  fixture.preview.status = 'Compiling';
  const before = commits.length;
  ui.rerender(draw({ ...input, files: { 'note.mdx': '# Fresh source' } }));
  expect(commits.slice(before)).toEqual([{ error: '', locations: [] }]);
  expect(screen.queryByTitle('Document preview')).toBeNull();
  fixture.preview.stopped = true;
  fixture.preview.status = 'Preview stopped';
  ui.rerender(draw({ ...input, enabled: false }));
  expect(screen.getByText('Preview stopped')).toBeVisible();
  expect(useWebPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false }),
  );
});
