import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  RenderedRuntime,
  type RenderedRuntimeContext,
  type RenderedRuntimeProps,
} from '../../src/editor/rendered/RenderedRuntime';
import { useWebPreview } from '../../src/web/useWebPreview';
import { WebRenderedRuntime } from '../../src/web/WebRenderedRuntime';

const previewOutput = vi.hoisted(() => ({
  html: '<p>Browser runtime</p>',
  error: '',
}));

vi.mock('../../src/web/useWebPreview', () => ({
  useWebPreview: vi.fn(() => ({
    ...previewOutput,
    reportRuntimeError: vi.fn(),
  })),
}));
beforeEach(() => {
  vi.clearAllMocks();
  previewOutput.html = '<p>Browser runtime</p>';
  previewOutput.error = '';
});

const context: RenderedRuntimeContext = {
  files: { 'note.mdx': 'export const Counter = () => 1\n\n<Counter />' },
  entry: 'note.mdx',
  theme: 'light',
  images: [],
  stopped: false,
};

it('keeps shared runtime execution imports limited to React, including unused imports', () => {
  const source = ts.createSourceFile(
    'RenderedRuntime.tsx',
    readFileSync('src/editor/rendered/RenderedRuntime.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const executionImports = source.statements
    .filter(ts.isImportDeclaration)
    .filter((statement) => !statement.importClause?.isTypeOnly)
    .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
  // Context type imports must not load browser execution, compiler workers or IPC.
  expect(executionImports).toEqual(['react']);
});

it('defaults visibly unavailable without invoking browser execution or creating an iframe', () => {
  const onError = vi.fn();
  const ui = render(
    <RenderedRuntime context={context} raw="<Counter />" onError={onError} />,
  );
  expect(screen.getByText('React preview is unavailable.')).toBeVisible();
  expect(ui.container.querySelector('iframe')).toBeNull();
  expect(useWebPreview).not.toHaveBeenCalled();
  expect(onError).toHaveBeenLastCalledWith('');
  ui.rerender(
    <RenderedRuntime
      context={{ ...context, stopped: true }}
      raw="<Counter />"
      onError={onError}
    />,
  );
  expect(screen.getByText('React preview is unavailable.')).toBeVisible();
  expect(useWebPreview).not.toHaveBeenCalled();
  ui.unmount();
  expect(onError).toHaveBeenLastCalledWith('');
});

it('passes exact compilation inputs to an explicitly supplied trusted renderer and preserves its lifetime', () => {
  const received = vi.fn();
  const mounted = vi.fn();
  const disposed = vi.fn();
  function Adapter(props: RenderedRuntimeProps) {
    received(props);
    useEffect(() => {
      mounted();
      return disposed;
    }, []);
    return <p>{props.context.stopped ? 'Adapter paused' : props.raw}</p>;
  }
  const supplied = { ...context, renderer: Adapter };
  const onError = vi.fn();
  const ui = render(
    <RenderedRuntime context={supplied} raw="<Counter />" onError={onError} />,
  );
  expect(received).toHaveBeenLastCalledWith({
    context: supplied,
    raw: '<Counter />',
    onError,
  });
  expect(mounted).toHaveBeenCalledOnce();
  ui.rerender(
    <RenderedRuntime
      context={{ ...supplied, stopped: true }}
      raw="<Counter count={2} />"
      onError={onError}
    />,
  );
  expect(screen.getByText('Adapter paused')).toBeVisible();
  expect(mounted).toHaveBeenCalledOnce();
  expect(disposed).not.toHaveBeenCalled();
  ui.rerender(
    <RenderedRuntime context={context} raw="<Counter />" onError={onError} />,
  );
  expect(disposed).toHaveBeenCalledOnce();
  expect(screen.getByText('React preview is unavailable.')).toBeVisible();
  expect(useWebPreview).not.toHaveBeenCalled();
  ui.unmount();
});

it('keeps browser error reporting, paused compilation and unmount cleanup behind the explicit adapter', () => {
  const supplied = { ...context, renderer: WebRenderedRuntime };
  const onError = vi.fn();
  const ui = render(
    <RenderedRuntime context={supplied} raw="<Counter />" onError={onError} />,
  );
  expect(screen.getByTitle('Document preview')).toBeVisible();
  expect(useWebPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      enabled: true,
      trackWorkspaceDependencies: true,
      showComponentSource: false,
    }),
  );
  previewOutput.error = 'synthetic compile failure';
  previewOutput.html = '';
  ui.rerender(
    <RenderedRuntime
      context={supplied}
      raw="<Counter changed />"
      onError={onError}
    />,
  );
  expect(onError).toHaveBeenLastCalledWith('synthetic compile failure');
  expect(screen.queryByText('Preparing component…')).toBeNull();
  ui.rerender(
    <RenderedRuntime
      context={{ ...supplied, stopped: true }}
      raw="<Counter changed />"
      onError={onError}
    />,
  );
  expect(screen.getByText('React preview is paused.')).toBeVisible();
  expect(useWebPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false }),
  );
  expect(screen.queryByTitle('Document preview')).toBeNull();
  expect(onError).toHaveBeenLastCalledWith('');
  onError.mockClear();
  ui.unmount();
  expect(onError).toHaveBeenCalledWith('');
});
