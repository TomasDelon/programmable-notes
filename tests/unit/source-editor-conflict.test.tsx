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
import { explicitRawSource, rawSource } from '../../src/editor/live/rawSource';

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

for (const via of ['commands', 'keyboard'] as const) {
  it.each(['undo', 'redo'] as const)(
    'retains both history branches when the current model refuses ' +
      via +
      ' %s before a read-only prop update',
    (direction) => {
      const original = '\ufeff# One\r\n';
      const edited = '\ufeff# Two\r\n';
      let authoritative = original;
      let allowed = true;
      const accept = vi.fn<(source: string) => boolean>(() => allowed);
      const changed = vi.fn((next: string) => {
        if (allowed) authoritative = next;
      });
      const commands = createRef<EditorCommands>();
      const ui = render(
        <SourceEditor
          source={original}
          readOnly={false}
          acceptChange={accept}
          onChange={changed}
          commandsRef={commands}
        />,
      );
      const cm = EditorView.findFromDOM(
        ui.container.querySelector('.cm-editor')!,
      )!;
      act(() =>
        cm.dispatch({
          changes: { from: 3, to: 6, insert: 'Two' },
          userEvent: 'input',
        }),
      );
      expect(authoritative).toBe(edited);
      if (direction === 'redo') act(() => commands.current!.undo());
      const before = authoritative;
      const desired = direction === 'undo' ? original : edited;
      const history = cm.state.field(historyField);
      changed.mockClear();
      accept.mockClear();
      allowed = false;
      const invoke = () => {
        if (via === 'commands') act(() => commands.current![direction]());
        else
          fireEvent.keyDown(cm.contentDOM, {
            key: 'z',
            code: 'KeyZ',
            ctrlKey: true,
            shiftKey: direction === 'redo',
          });
      };
      invoke();
      expect(rawSource(cm.state)).toBe(before);
      expect(cm.state.field(historyField)).toBe(history);
      expect(authoritative).toBe(before);
      expect(accept.mock.calls).toEqual([[desired]]);
      expect(changed).not.toHaveBeenCalled();
      allowed = true;
      invoke();
      expect(rawSource(cm.state)).toBe(desired);
      expect(authoritative).toBe(desired);
    },
  );
}

it('checks a physical-ending-only inverse without authorizing selection or external restoration', () => {
  const original = '\ufeffPlain\r\n';
  const differentEnding = '\ufeffPlain\n';
  const accept = vi.fn<(source: string) => boolean>(() => true);
  const changed = vi.fn();
  const commands = createRef<EditorCommands>();
  const ui = render(
    <SourceEditor
      source={original}
      acceptChange={accept}
      onChange={changed}
      commandsRef={commands}
    />,
  );
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  act(() =>
    cm.dispatch({ annotations: explicitRawSource.of(differentEnding) }),
  );
  expect(rawSource(cm.state)).toBe(differentEnding);
  expect(cm.state.doc.toString()).toBe(differentEnding);
  const history = cm.state.field(historyField);
  accept.mockClear().mockReturnValue(false);
  changed.mockClear();
  act(() => commands.current!.undo());
  expect(rawSource(cm.state)).toBe(differentEnding);
  expect(cm.state.field(historyField)).toBe(history);
  expect(accept.mock.calls).toEqual([[original]]);
  expect(changed).not.toHaveBeenCalled();
  accept.mockClear();
  act(() => cm.dispatch({ selection: { anchor: 2 } }));
  const restored = '\ufeffRestored\r\n';
  ui.rerender(
    <SourceEditor
      source={restored}
      acceptChange={accept}
      onChange={changed}
      commandsRef={commands}
    />,
  );
  expect(rawSource(cm.state)).toBe(restored);
  expect(accept).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it('preflights every source change before publishing any part of a transaction batch', () => {
  const allow = vi.fn((next: string) => next !== 'ABC');
  const changed = vi.fn();
  const ui = render(
    <SourceEditor source="A" acceptChange={allow} onChange={changed} />,
  );
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  const before = cm.state;
  const first = before.update({
    changes: { from: 1, insert: 'B' },
    filter: false,
  });
  const second = first.state.update({
    changes: { from: 2, insert: 'C' },
    filter: false,
  });
  act(() => cm.dispatch([first, second]));
  expect(cm.state).toBe(before);
  expect(rawSource(cm.state)).toBe('A');
  expect(allow.mock.calls).toEqual([['AB'], ['ABC']]);
  expect(changed).not.toHaveBeenCalled();
});
