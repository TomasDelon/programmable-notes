import { act, fireEvent, render } from '@testing-library/react';
import {
  historyField,
  isolateHistory,
  redoDepth,
  undoDepth,
} from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { createRef } from 'react';
import { expect, it, vi } from 'vitest';
import {
  SourceEditor,
  type EditorCommands,
} from '../../src/editor/SourceEditor';
import { rawSource } from '../../src/editor/live/rawSource';

for (const via of ['keyboard', 'commands', 'selection history'] as const) {
  it(`freezes exact source and both history branches across a conflict for ${via}`, () => {
    const commands = createRef<EditorCommands>();
    const changed = vi.fn();
    const original = '\ufeffBase\r\n';
    const draw = (locked: boolean) => (
      <SourceEditor
        source={original}
        onChange={changed}
        acceptChange={() => !locked}
        readOnly={locked}
        commandsRef={commands}
      />
    );
    const ui = render(draw(false));
    const cm = EditorView.findFromDOM(
      ui.container.querySelector('.cm-editor')!,
    )!;
    const add = (insert: string) =>
      act(() =>
        cm.dispatch({
          changes: { from: cm.state.doc.length, insert },
          annotations: isolateHistory.of('full'),
          userEvent: 'input',
        }),
      );
    add('First');
    add(' second');
    act(() => commands.current!.undo());
    const before = rawSource(cm.state);
    expect(before).toBe(original + 'First');
    expect([undoDepth(cm.state), redoDepth(cm.state)]).toEqual([1, 1]);
    const history = cm.state.field(historyField);
    ui.rerender(draw(true));
    changed.mockClear();
    const sendHistory = (redo: boolean) => {
      if (via === 'commands') {
        act(() => {
          if (redo) commands.current!.redo();
          else commands.current!.undo();
        });
      } else {
        const selectionOnly = via === 'selection history';
        fireEvent.keyDown(cm.contentDOM, {
          key: selectionOnly ? 'u' : 'z',
          code: selectionOnly ? 'KeyU' : 'KeyZ',
          ctrlKey: !selectionOnly || !redo,
          shiftKey: !selectionOnly && redo,
          altKey: selectionOnly && redo,
        });
      }
    };
    for (const redo of [false, true]) {
      sendHistory(redo);
      expect(rawSource(cm.state)).toBe(before);
      expect(cm.state.field(historyField)).toBe(history);
    }
    act(() => expect(commands.current!.insertText('Refused')).toBe(false));
    expect(changed).not.toHaveBeenCalled();
    expect(cm.contentDOM).toHaveAttribute('contenteditable', 'false');
    ui.rerender(draw(false));
    act(() => commands.current!.redo());
    expect(rawSource(cm.state)).toBe(original + 'First second');
    act(() => {
      commands.current!.undo();
      commands.current!.undo();
    });
    expect(rawSource(cm.state)).toBe(original);
  });
}

it('keeps ordinary raw input and undo available during existing file I/O', () => {
  const commands = createRef<EditorCommands>();
  const ui = render(
    <SourceEditor
      busy
      source="Original"
      onChange={() => {}}
      commandsRef={commands}
    />,
  );
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  act(() => expect(commands.current!.insertText('New ')).toBe(true));
  expect(rawSource(cm.state)).toBe('New Original');
  act(() => commands.current!.undo());
  expect(rawSource(cm.state)).toBe('Original');
});
