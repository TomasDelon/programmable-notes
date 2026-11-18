import { useEffect, useRef } from 'react';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyField,
  historyKeymap,
  isolateHistory,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { javascriptLanguage } from '@codemirror/lang-javascript';

import { MarkdownEditor } from './MarkdownEditor';
import { patchMarkdown } from './markdownEdits';

const external = Annotation.define<boolean>();
const historyFields = { history: historyField };

export type EditorHistory = Map<string, { source: string; state: unknown }>;

export function SourceEditor({
  source,
  onChange,
  visual,
  documentKey,
  histories,
}: {
  source: string;
  visual?: boolean;
  documentKey?: string;
  histories?: React.RefObject<EditorHistory>;
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
    const extensions = [
      separator.current.of(
        EditorState.lineSeparator.of(source.includes('\r\n') ? '\r\n' : '\n'),
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
    ];
    const cache = histories?.current;
    const cached =
      documentKey === undefined ? undefined : cache?.get(documentKey);
    const editor = new EditorView({
      parent: element.current!,
      state:
        cached?.source === source
          ? EditorState.fromJSON(cached.state, { extensions }, historyFields)
          : EditorState.create({ doc: source, extensions }),
    });
    view.current = editor;
    return () => {
      if (documentKey !== undefined)
        cache?.set(documentKey, {
          source: editor.state.sliceDoc(),
          state: editor.state.toJSON(historyFields),
        });
      editor.destroy();
    };
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
      <div className="source-editor" ref={element} />
    </div>
  );
}
