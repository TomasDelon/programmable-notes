import { act, fireEvent, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { isolateHistory, redo, undo } from '@codemirror/commands';
import { describe, expect, it } from 'vitest';
import { SourceEditor } from '../../src/editor/SourceEditor';
import { explicitRawSource, rawSource } from '../../src/editor/live/rawSource';

function editorFor(source: string) {
  const ui = render(<SourceEditor source={source} onChange={() => {}} />);
  return EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
}

describe('composition undo boundaries', () => {
  it('undoes an insertion after Redo without undoing the redone visual change', () => {
    const editor = editorFor('Last paragraph.');
    act(() =>
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: 'Last changed.',
        },
        annotations: [
          explicitRawSource.of('Last changed.'),
          isolateHistory.of('full'),
        ],
        userEvent: 'input',
      }),
    );
    act(() => undo(editor));
    act(() => redo(editor));
    fireEvent.compositionStart(editor.contentDOM);
    act(() =>
      editor.dispatch({
        changes: { from: editor.state.doc.length, insert: ' Tail.' },
        userEvent: 'input.type.compose',
      }),
    );
    fireEvent.compositionEnd(editor.contentDOM);
    expect(rawSource(editor.state)).toBe('Last changed. Tail.');
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe('Last changed.');
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe('Last paragraph.');
  });

  it('keeps the deletion and insertion of one replacement together with exact original bytes', () => {
    const original = '\uFEFF# Original\r\n\r\nText 🧠\nTail\r';
    const editor = editorFor(original);
    act(() =>
      editor.dispatch({
        selection: { anchor: 0, head: editor.state.doc.length },
      }),
    );
    // CodeMirror itself removes this multiline selection in its built-in
    // compositionstart observer, before plugin event handlers run.
    fireEvent.compositionStart(editor.contentDOM);
    expect(editor.state.doc.length).toBe(0);
    act(() =>
      editor.dispatch({
        changes: { from: 0, insert: '# Replacement\n\nText' },
        userEvent: 'input.type.compose',
      }),
    );
    fireEvent.compositionEnd(editor.contentDOM);
    expect(rawSource(editor.state)).toBe('# Replacement\r\n\r\nText');
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe(original);
    act(() => redo(editor));
    expect(rawSource(editor.state)).toBe('# Replacement\r\n\r\nText');
  });

  it('keeps adjacent but separate composition sessions independently undoable', () => {
    const editor = editorFor('Start');
    for (const text of [' one', ' two']) {
      fireEvent.compositionStart(editor.contentDOM);
      act(() =>
        editor.dispatch({
          changes: { from: editor.state.doc.length, insert: text },
          userEvent: 'input.type.compose',
        }),
      );
      fireEvent.compositionEnd(editor.contentDOM);
    }
    expect(rawSource(editor.state)).toBe('Start one two');
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe('Start one');
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe('Start');
  });
});
