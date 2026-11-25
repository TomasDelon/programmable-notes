import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { EditorView } from '@codemirror/view';
import { undo, redo, isolateHistory } from '@codemirror/commands';
import { describe, expect, it, vi } from 'vitest';
import {
  SourceEditor,
  type EditorCommands,
  type EditorHistory,
} from '../../src/editor/SourceEditor';
import { rawSource } from '../../src/editor/live/rawSource';
import { RawSourceMap } from '../../src/editor/live/sourceCoordinates';
import {
  collectLiveMath,
  planMathReplacement,
  preserveMathBreaks,
} from '../../src/editor/math/mathSource';
import { liveTokens } from '../../src/editor/live/livePreview';

function view(container: HTMLElement): EditorView {
  return EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
}

describe('real editor raw source bridge', () => {
  it('ignores an obsolete React echo while preserving newer canonical edits and exact history', () => {
    let owned = 'First.\r\n';
    const onChange = (next: string) => {
      owned = next;
    };
    const sourceIsCurrent = (snapshot: string) => snapshot === owned;
    const renderEditor = (snapshot: string) => (
      <SourceEditor
        source={snapshot}
        onChange={onChange}
        sourceIsCurrent={sourceIsCurrent}
      />
    );
    const ui = render(renderEditor(owned));
    const editor = view(ui.container);
    act(() =>
      editor.dispatch({
        changes: { from: 0, insert: 'A' },
        annotations: isolateHistory.of('full'),
      }),
    );
    const earlier = owned;
    act(() =>
      editor.dispatch({
        changes: { from: 0, insert: 'B' },
        annotations: isolateHistory.of('full'),
      }),
    );
    const latest = owned;
    ui.rerender(renderEditor(earlier));
    expect(rawSource(editor.state)).toBe(latest);
    ui.rerender(renderEditor(latest));
    act(() => undo(editor));
    expect(owned).toBe(earlier);
    act(() => redo(editor));
    expect(owned).toBe(latest);
    owned = '\uFEFFExternal.\r\n';
    ui.rerender(renderEditor(owned));
    expect(rawSource(editor.state)).toBe(owned);
  });

  it('preserves mixed CRLF, LF, CR, BOM and Unicode through edit, grouped undo and redo', () => {
    const original = '\uFEFF# Title\r\nfirst 🧠\nsecond\rlast';
    const change = vi.fn();
    const ui = render(<SourceEditor source={original} onChange={change} />);
    const editor = view(ui.container),
      map = new RawSourceMap(original);
    const from = map.toDisplay(original.indexOf('first'))!;
    const to = map.toDisplay(original.indexOf('last'))!;
    act(() =>
      editor.dispatch({
        changes: { from, to, insert: 'replacement\n' },
        userEvent: 'input.type',
        annotations: isolateHistory.of('full'),
      }),
    );
    const edited = '\uFEFF# Title\r\nreplacement\r\nlast';
    expect(rawSource(editor.state)).toBe(edited);
    expect(change).toHaveBeenLastCalledWith(edited);
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe(original);
    expect(change).toHaveBeenLastCalledWith(original);
    act(() => redo(editor));
    expect(rawSource(editor.state)).toBe(edited);
    act(() => undo(editor));
    act(() =>
      editor.dispatch({
        changes: { from: editor.state.doc.length, insert: 'a' },
        userEvent: 'input.type',
      }),
    );
    act(() =>
      editor.dispatch({
        changes: { from: editor.state.doc.length, insert: 'b' },
        userEvent: 'input.type',
      }),
    );
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe(original);
  });

  it('retains raw inverse history when switching away from and back to a note', () => {
    const original = 'one\r\ntwo\nthree\rfour';
    const histories = { current: new Map() as EditorHistory };
    let ui = render(
      <SourceEditor
        source={original}
        documentKey="one.md"
        histories={histories}
        onChange={() => {}}
      />,
    );
    const editor = view(ui.container);
    act(() =>
      editor.dispatch({
        changes: { from: 2, to: 12, insert: '!' },
        annotations: isolateHistory.of('full'),
      }),
    );
    const edited = rawSource(editor.state);
    ui.unmount();
    ui = render(
      <SourceEditor
        source={edited}
        documentKey="one.md"
        histories={histories}
        onChange={() => {}}
      />,
    );
    act(() => undo(view(ui.container)));
    expect(rawSource(view(ui.container).state)).toBe(original);
    act(() => redo(view(ui.container)));
    expect(rawSource(view(ui.container).state)).toBe(edited);
  });

  it('inserts attachment/source text atomically without changing existing bytes and rejects over-budget inserts', () => {
    const commands = createRef<EditorCommands>();
    const original = '\uFEFFone\r\ntwo\nthree';
    const change = vi.fn();
    const ui = render(
      <SourceEditor
        source={original}
        onChange={change}
        commandsRef={commands}
        acceptChange={(value) => value.length < 100}
      />,
    );
    const editor = view(ui.container);
    act(() =>
      editor.dispatch({ selection: { anchor: editor.state.doc.length } }),
    );
    act(() =>
      expect(commands.current!.insertText('\n![image](asset:abc)\r\n')).toBe(
        true,
      ),
    );
    expect(rawSource(editor.state)).toBe(
      original + '\n![image](asset:abc)\r\n',
    );
    act(() => commands.current!.undo());
    expect(rawSource(editor.state)).toBe(original);
    act(() =>
      expect(commands.current!.insertText('x'.repeat(200))).toBe(false),
    );
    expect(rawSource(editor.state)).toBe(original);
  });

  it('keeps the same CodeMirror document and history across Source and Live', () => {
    const original = '# Title\r\n\r\n**bold** and $x$.\n';
    const change = vi.fn();
    const ui = render(<SourceEditor source={original} onChange={change} />);
    const editor = view(ui.container);
    ui.rerender(<SourceEditor source={original} onChange={change} live />);
    expect(view(ui.container)).toBe(editor);
    expect(rawSource(editor.state)).toBe(original);
    expect(
      screen.getByRole('button', { name: 'Edit inline equation: x' }),
    ).toBeInTheDocument();
    ui.rerender(
      <SourceEditor source={original} onChange={change} live={false} />,
    );
    expect(view(ui.container)).toBe(editor);
    expect(change).not.toHaveBeenCalled();
  });
});

describe('math and Live syntax ownership', () => {
  it('uses real parser spans and keeps math inside code, frontmatter and JSX opaque', () => {
    const source =
      '\uFEFF---\r\ntitle: $metadata$\r\n---\r\n\r\n# Note\r\n\r\n$x^2$ and `$code$` and \\$escaped\\$.\n\n```md\n$blocked$\n```\n\n<div>$jsx$</div>\n\n$$\r\ny^2\r\n$$';
    const spans = collectLiveMath(source, 'note.mdx');
    expect(spans.map((span) => span.originalInner.trim())).toEqual([
      'x^2',
      'y^2',
    ]);
    expect(
      spans.every(
        (span) => source.slice(span.from, span.to) === span.originalOuter,
      ),
    ).toBe(true);
  });

  it('rejects stale, delimiter-changing and malformed syntax math commits without altering source', () => {
    const original = 'before $x$ after';
    const span = collectLiveMath(original)[0]!;
    expect(
      planMathReplacement(original + '!', original, span, 'z'),
    ).toMatchObject({ ok: false });
    expect(
      planMathReplacement(original, original, span, 'z$ and $q'),
    ).toMatchObject({ ok: false });
    expect(planMathReplacement(original, original, span, 'x^2')).toEqual({
      ok: true,
      source: 'before $x^2$ after',
      replacement: 'x^2',
    });
    expect(preserveMathBreaks('\r\na\nb\r\n', '\na\nB\n')).toBe('\r\na\nB\r\n');
  });

  it('keeps literal MD braces and unsafe malformed MDX as source while formatting real Markdown', () => {
    expect(
      liveTokens('# Header\n\nA **strong** and *emphasized* value.'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ className: 'cm-live-heading cm-live-h1' }),
        expect.objectContaining({ className: 'cm-live-strong' }),
        expect.objectContaining({ className: 'cm-live-emphasis' }),
      ]),
    );
    expect(
      liveTokens('# Header\n\n{x: x > 0} **bold**', 'note.md'),
    ).toHaveLength(2);
    expect(liveTokens('# Header\n\n<unclosed', 'note.mdx')).toEqual([]);
  });

  it('edits original LaTeX with an immediate render and an exact undoable raw transaction', () => {
    const original = '\uFEFF# Note\r\n\r\nValue $x^2$ here.\n';
    const change = vi.fn(),
      pending = vi.fn();
    const ui = render(
      <SourceEditor
        source={original}
        onChange={change}
        onPendingChange={pending}
        live
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit inline equation: x^2' }),
    );
    expect(pending).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'LaTeX source' }), {
      target: { value: 'x^3' },
    });
    expect(
      screen.getByLabelText('Equation preview').querySelector('.katex'),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apply equation' }));
    expect(rawSource(view(ui.container).state)).toBe(
      original.replace('x^2', 'x^3'),
    );
    expect(pending).toHaveBeenLastCalledWith(false);
    act(() => undo(view(ui.container)));
    expect(rawSource(view(ui.container).state)).toBe(original);
  });

  it('keeps rejected and invalid drafts readable and makes cancel source-neutral', () => {
    const original = '# Note\n\n$x$';
    const change = vi.fn(),
      pending = vi.fn();
    const ui = render(
      <SourceEditor
        source={original}
        onChange={change}
        onPendingChange={pending}
        live
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit inline equation: x' }),
    );
    const field = screen.getByRole('textbox', { name: 'LaTeX source' });
    fireEvent.change(field, { target: { value: '\\unknowncommand' } });
    expect(
      screen.getByRole('button', { name: 'Apply equation' }),
    ).toBeDisabled();
    expect(rawSource(view(ui.container).state)).toBe(original);
    fireEvent.change(field, { target: { value: 'x^4' } });
    ui.rerender(
      <SourceEditor
        source={original + '\nnew external source'}
        onChange={change}
        onPendingChange={pending}
        live
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply equation' }));
    expect(screen.getByRole('alert')).toHaveTextContent('source changed');
    expect(field).toHaveValue('x^4');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(rawSource(view(ui.container).state)).toBe(
      original + '\nnew external source',
    );
    expect(change).not.toHaveBeenCalled();
    expect(pending).toHaveBeenLastCalledWith(false);
  });
});

describe('multiline math physical line endings', () => {
  it.each(['\r\n', '\r', '\n'])(
    'adds a mathematical source line without changing the document physical breaks (%j)',
    (ending) => {
      const source = [
        '# Original',
        '',
        '$$',
        'x^2',
        '$$',
        '',
        '<span>Opaque</span>',
        '',
      ].join(ending);
      const span = collectLiveMath(source)[0]!;
      expect(span).toBeDefined();
      const next = source.replace(`x^2${ending}`, `x^2${ending}+ y^2${ending}`);
      expect(
        planMathReplacement(source, source, span, '\nx^2\n+ y^2\n'),
      ).toEqual({
        ok: true,
        source: next,
        replacement: `${ending}x^2${ending}+ y^2${ending}`,
      });
      expect(collectLiveMath(next)).toHaveLength(1);
    },
  );
});
