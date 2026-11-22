import { act, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { expect, it, vi } from 'vitest';
import { SourceEditor } from '../../src/editor/SourceEditor';
import { rawSource } from '../../src/editor/live/rawSource';

it('rejects a web edit before it can diverge from the recoverable source', () => {
  const change = vi.fn();
  const accept = vi.fn((source: string) => source.length <= 12);
  const result = render(
    <SourceEditor source="Keep me" onChange={change} acceptChange={accept} />,
  );
  const editor = EditorView.findFromDOM(
    result.container.querySelector('.cm-editor')!,
  )!;
  act(() =>
    editor.dispatch({
      changes: { from: 0, to: 7, insert: 'A rejected large paste' },
    }),
  );
  expect(editor.state.sliceDoc()).toBe('Keep me');
  expect(change).not.toHaveBeenCalled();
  act(() => editor.dispatch({ changes: { from: 7, insert: ' safe' } }));
  expect(editor.state.sliceDoc()).toBe('Keep me safe');
  expect(change).toHaveBeenLastCalledWith('Keep me safe');
});

it('allows an external restore and passes exact line separators to the budget check', () => {
  const accept = vi.fn(() => false);
  const change = vi.fn();
  const result = render(
    <SourceEditor
      source={'First\r\nsecond'}
      onChange={change}
      acceptChange={accept}
    />,
  );
  const editor = EditorView.findFromDOM(
    result.container.querySelector('.cm-editor')!,
  )!;
  act(() =>
    editor.dispatch({
      changes: { from: editor.state.doc.length, insert: '!' },
    }),
  );
  expect(accept).toHaveBeenLastCalledWith('First\r\nsecond!');
  expect(editor.state.sliceDoc()).toBe('First\nsecond');
  expect(rawSource(editor.state)).toBe('First\r\nsecond');
  accept.mockClear();
  result.rerender(
    <SourceEditor
      source="Restored from backup"
      onChange={change}
      acceptChange={accept}
    />,
  );
  expect(editor.state.sliceDoc()).toBe('Restored from backup');
  expect(accept).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
});
