import {
  EditorState,
  type Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import { history, isolateHistory, redo, undo } from '@codemirror/commands';
import { describe, expect, it } from 'vitest';
import {
  explicitRawSource,
  rawSource,
  rawSourceField,
  rawSourceHistory,
} from '../../src/editor/live/rawSource';
import {
  RawSourceMap,
  type PhysicalBreak,
} from '../../src/editor/live/sourceCoordinates';

function document(raw: string) {
  let state = EditorState.create({
    doc: new RawSourceMap(raw).display,
    extensions: [rawSourceField.init(() => raw), rawSourceHistory, history()],
  });
  const target = {
    get state() {
      return state;
    },
    dispatch(transaction: Transaction) {
      state = transaction.state;
    },
  };
  return {
    get state() {
      return state;
    },
    update(spec: TransactionSpec) {
      target.dispatch(state.update(spec));
    },
    undo: () => undo(target),
    redo: () => redo(target),
  };
}

describe('physical ending preference across split source input', () => {
  it.each<PhysicalBreak>(['\r\n', '\r', '\n'])(
    'retains %j when composition deletes all source before inserting its LF projection',
    (ending) => {
      const editor = document(`\uFEFFfirst${ending}second\nthird`);
      editor.update({
        changes: { from: 0, to: editor.state.doc.length },
        userEvent: 'input.type.compose.start',
      });
      expect(rawSource(editor.state)).toBe('');
      editor.update({
        changes: { from: 0, insert: '\uFEFFchanged\nnext\n' },
        userEvent: 'input.type.compose',
      });
      expect(rawSource(editor.state)).toBe(
        `\uFEFFchanged${ending}next${ending}`,
      );
      expect(editor.state.doc.toString()).toBe('\uFEFFchanged\nnext\n');
    },
  );

  it('restores exact mixed endings through Undo and Redo of a split composition', () => {
    const original = '\uFEFFfirst\r\nsecond\nthird\rfourth';
    const editor = document(original);
    editor.update({
      changes: { from: 0, to: editor.state.doc.length },
      userEvent: 'input.type.compose.start',
    });
    editor.update({
      changes: { from: 0, insert: 'replacement\nnext' },
      userEvent: 'input.type.compose',
    });
    expect(rawSource(editor.state)).toBe('replacement\r\nnext');
    expect(editor.undo()).toBe(true);
    expect(rawSource(editor.state)).toBe(original);
    expect(editor.redo()).toBe(true);
    expect(rawSource(editor.state)).toBe('replacement\r\nnext');
  });

  it('honors explicit raw bytes and restores the former preference when Undo returns to empty source', () => {
    const editor = document('one\r\ntwo');
    editor.update({
      changes: { from: 0, to: editor.state.doc.length },
      annotations: isolateHistory.of('full'),
    });
    const imported = 'explicit\nlines\rremain';
    editor.update({
      changes: { from: 0, insert: new RawSourceMap(imported).display },
      annotations: [explicitRawSource.of(imported), isolateHistory.of('full')],
    });
    expect(rawSource(editor.state)).toBe(imported);
    expect(editor.undo()).toBe(true);
    expect(rawSource(editor.state)).toBe('');
    editor.update({ changes: { from: 0, insert: 'new\nline' } });
    expect(rawSource(editor.state)).toBe('new\r\nline');
  });
});
