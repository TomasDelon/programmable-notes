import { useEffect, useRef } from 'react';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { javascriptLanguage } from '@codemirror/lang-javascript';

import { MarkdownEditor } from './MarkdownEditor';
import { patchMarkdown } from './markdownEdits';
import { isolateHistory } from '@codemirror/commands';

const external = Annotation.define<boolean>();

export function SourceEditor({
  source,
  onChange,
  visual,
}: {
  source: string;
  visual?: boolean;
  onChange: (value: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const separator = useRef(new Compartment());
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const editor = new EditorView({
      parent: element.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          separator.current.of(
            EditorState.lineSeparator.of(
              source.includes('\r\n') ? '\r\n' : '\n',
            ),
          ),
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ defaultCodeLanguage: javascriptLanguage }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'MDX source' }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(external))
            )
              change.current(update.state.sliceDoc());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
    // The initial buffer is applied once; subsequent changes are transactions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.sliceDoc() !== source)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: source },
        annotations: external.of(true),
        effects: separator.current.reconfigure(
          EditorState.lineSeparator.of(source.includes('\r\n') ? '\r\n' : '\n'),
        ),
      });
  }, [source]);
  return (
    <div>
      <div className="source-editor" ref={element} />
      {visual && (
        <MarkdownEditor
          source={source}
          apply={(snapshot, range, replacement) => {
            const editor = view.current;
            if (
              !editor ||
              source !== snapshot ||
              editor.state.sliceDoc() !== snapshot
            )
              return false;
            const next = patchMarkdown(snapshot, range, replacement);
            if (next === null) return false;
            if (next !== snapshot) {
              const separator = editor.state.lineBreak;
              const from = snapshot
                .slice(0, range.from)
                .split(separator)
                .join('\n').length;
              editor.dispatch({
                changes: {
                  from,
                  to: from + range.text.length,
                  insert: replacement,
                },
                annotations: isolateHistory.of('full'),
              });
              editor.focus();
            }
            return true;
          }}
        />
      )}
    </div>
  );
}
