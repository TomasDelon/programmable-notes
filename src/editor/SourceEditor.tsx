import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type EditorSelection,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyField,
  historyKeymap,
  isolateHistory,
  undo,
  redo,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import 'katex/dist/katex.min.css';
import type { LinkResolution } from '../links';
import { MarkdownEditor } from './MarkdownEditor';
import { patchMarkdown } from './markdownEdits';
import { RawSourceMap } from './live/sourceCoordinates';
import {
  explicitRawSource,
  rawAfterTransaction,
  rawSource,
  rawSourceField,
  rawSourceHistory,
} from './live/rawSource';
import { liveDataChanged, livePreview } from './live/livePreview';
import { compositionHistory } from './live/compositionHistory';
import { MathEditor, type MathDraft } from './math/MathEditor';
import { planMathReplacement } from './math/mathSource';
import './live/live.css';

const external = Annotation.define<boolean>();
const EMPTY_WIKILINKS: readonly LinkResolution[] = Object.freeze([]);
export type EditorCommands = {
  undo: () => void;
  redo: () => void;
  revealSource: (offset: number, expectedSource: string) => void;
  insertText: (text: string) => boolean;
} | null;

// Preserve the real immutable history field, not its JSON serialization:
// CodeMirror intentionally omits custom inverse effects when serializing JSON.
export type EditorHistory = Map<
  string,
  { source: string; history: unknown; selection: EditorSelection }
>;

export function SourceEditor({
  source,
  onChange,
  visual,
  live = false,
  documentKey,
  histories,
  commandsRef,
  busy,
  onPendingChange,
  onShowSource,
  acceptChange,
  wikilinks = EMPTY_WIKILINKS,
  onOpenNote,
}: {
  commandsRef?: React.RefObject<EditorCommands>;
  source: string;
  visual?: boolean;
  live?: boolean;
  documentKey?: string;
  histories?: React.RefObject<EditorHistory>;
  onChange: (value: string) => void;
  busy?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onShowSource?: (offset: number, snapshot: string) => void;
  acceptChange?: (source: string) => boolean;
  wikilinks?: readonly LinkResolution[];
  onOpenNote?: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const presentation = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const change = useRef(onChange);
  const accept = useRef(acceptChange);
  const latestLinks = useRef(wikilinks);
  const navigate = useRef(onOpenNote);
  const isBusy = useRef(busy);
  const pending = useRef(onPendingChange);
  const draftRef = useRef<MathDraft | null>(null);
  const legacyPending = useRef(false);
  const [draft, setDraft] = useState<MathDraft | null>(null);
  const path = documentKey ?? 'note.mdx';

  useEffect(() => {
    change.current = onChange;
    accept.current = acceptChange;
    latestLinks.current = wikilinks;
    navigate.current = onOpenNote;
    isBusy.current = busy;
    pending.current = onPendingChange;
  }, [onChange, acceptChange, wikilinks, onOpenNote, busy, onPendingChange]);

  function setMathDraft(next: MathDraft | null) {
    draftRef.current = next;
    setDraft(next);
    pending.current?.(Boolean(next) || legacyPending.current);
  }

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (draftRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  // All host-originated exact raw edits share the same revision guard, projected
  // transaction, source budget and CodeMirror undo event.
  function applyRaw(
    editor: EditorView,
    expected: string,
    next: string,
    range?: { from: number; to: number; insert: string },
    sourceInput = false,
  ): boolean {
    if (
      rawSource(editor.state) !== expected ||
      (isBusy.current && !sourceInput)
    )
      return false;
    if (next === expected) return true;
    if (accept.current?.(next) === false) return false;
    const map = new RawSourceMap(expected);
    let changes: TransactionSpec['changes'];
    if (range) {
      const from = map.toDisplay(range.from),
        to = map.toDisplay(range.to);
      if (from === null || to === null) return false;
      changes = { from, to, insert: new RawSourceMap(range.insert).display };
    } else
      changes = {
        from: 0,
        to: editor.state.doc.length,
        insert: new RawSourceMap(next).display,
      };
    editor.dispatch({
      changes,
      annotations: [explicitRawSource.of(next), isolateHistory.of('full')],
      userEvent: 'input',
    });
    return rawSource(editor.state) === next;
  }

  useEffect(() => {
    const cache = histories?.current;
    const cached =
      documentKey === undefined ? undefined : cache?.get(documentKey);
    const initial = new RawSourceMap(source);
    const extensions = [
      rawSourceField.init(() => source),
      rawSourceHistory,
      compositionHistory(),
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ defaultCodeLanguage: javascriptLanguage }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'MDX source' }),
      presentation.current.of([]),
      // Pending file/save I/O does not lock raw source. The document model
      // retains edits made during that operation; only unapplied math drafts
      // temporarily protect the source surface from concurrent editing.
      editable.current.of(EditorState.readOnly.of(false)),
      EditorState.transactionFilter.of((transaction) => {
        if (
          !transaction.docChanged &&
          transaction.annotation(explicitRawSource) === undefined
        )
          return transaction;
        const next = rawAfterTransaction(transaction);
        if (next === null) return [];
        return !transaction.annotation(external) &&
          accept.current?.(next) === false
          ? []
          : transaction;
      }),
      EditorView.updateListener.of((update) => {
        if (
          update.transactions.some(
            (transaction) =>
              !transaction.annotation(external) &&
              rawSource(transaction.startState) !==
                rawSource(transaction.state),
          )
        )
          change.current(rawSource(update.state));
      }),
      EditorView.domEventHandlers({
        copy: (event, editor) => {
          if (
            !event.clipboardData ||
            editor.state.selection.ranges.every((selection) => selection.empty)
          )
            return false;
          const raw = rawSource(editor.state),
            map = new RawSourceMap(raw);
          event.clipboardData.setData(
            'text/plain',
            editor.state.selection.ranges
              .map((selection) =>
                raw.slice(map.toRaw(selection.from)!, map.toRaw(selection.to)!),
              )
              .join('\n'),
          );
          event.preventDefault();
          return true;
        },
        cut: (event, editor) => {
          if (
            !event.clipboardData ||
            draftRef.current ||
            editor.state.selection.ranges.every((selection) => selection.empty)
          )
            return false;
          const raw = rawSource(editor.state),
            map = new RawSourceMap(raw);
          event.clipboardData.setData(
            'text/plain',
            editor.state.selection.ranges
              .map((selection) =>
                raw.slice(map.toRaw(selection.from)!, map.toRaw(selection.to)!),
              )
              .join('\n'),
          );
          editor.dispatch(editor.state.replaceSelection(''));
          event.preventDefault();
          return true;
        },
        paste: (event, editor) => {
          if (
            !event.clipboardData ||
            event.clipboardData.files.length ||
            draftRef.current
          )
            return false;
          const text = event.clipboardData.getData('text/plain');
          if (!text || editor.state.selection.ranges.length !== 1) return false;
          const raw = rawSource(editor.state),
            map = new RawSourceMap(raw),
            selection = editor.state.selection.main;
          const from = map.toRaw(selection.from)!,
            to = map.toRaw(selection.to)!;
          applyRaw(
            editor,
            raw,
            raw.slice(0, from) + text + raw.slice(to),
            { from, to, insert: text },
            true,
          );
          event.preventDefault();
          return true;
        },
      }),
    ];
    if (cached?.source === source)
      extensions.push(historyField.init(() => cached.history));
    const editor = new EditorView({
      parent: element.current!,
      state: EditorState.create({
        doc: initial.display,
        extensions,
        ...(cached?.source === source ? { selection: cached.selection } : {}),
      }),
    });
    view.current = editor;
    if (commandsRef)
      commandsRef.current = {
        undo: () => {
          if (!draftRef.current) undo(editor);
        },
        redo: () => {
          if (!draftRef.current) redo(editor);
        },
        revealSource: (offset, expectedSource) => {
          if (rawSource(editor.state) !== expectedSource || draftRef.current)
            return;
          const anchor = new RawSourceMap(expectedSource).toDisplay(offset);
          if (anchor === null) return;
          editor.dispatch({ selection: { anchor }, scrollIntoView: true });
          editor.focus();
        },
        insertText: (text) => {
          if (draftRef.current) return false;
          const raw = rawSource(editor.state),
            map = new RawSourceMap(raw),
            selection = editor.state.selection.main;
          const from = map.toRaw(selection.from),
            to = map.toRaw(selection.to);
          if (from === null || to === null) return false;
          const next = raw.slice(0, from) + text + raw.slice(to);
          if (!applyRaw(editor, raw, next, { from, to, insert: text }, true))
            return false;
          const anchor = new RawSourceMap(next).toDisplay(from + text.length);
          if (anchor !== null)
            editor.dispatch({ selection: { anchor }, scrollIntoView: true });
          editor.focus();
          return true;
        },
      };
    return () => {
      if (documentKey !== undefined)
        cache?.set(documentKey, {
          source: rawSource(editor.state),
          history: editor.state.field(historyField),
          selection: editor.state.selection,
        });
      if (commandsRef) commandsRef.current = null;
      view.current = null;
      editor.destroy();
    };
    // The immutable document identity owns one EditorView. Updates below are transactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && rawSource(editor.state) !== source)
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: new RawSourceMap(source).display,
        },
        annotations: [
          external.of(true),
          explicitRawSource.of(source),
          isolateHistory.of('full'),
        ],
      });
  }, [source]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({
      effects: presentation.current.reconfigure(
        live
          ? livePreview({
              path,
              getLinks: () => latestLinks.current,
              openMath: (snapshot, span) => {
                if (
                  rawSource(editor.state) !== snapshot ||
                  isBusy.current ||
                  draftRef.current ||
                  legacyPending.current
                )
                  return;
                setMathDraft({
                  source: snapshot,
                  span,
                  value: span.originalInner,
                  error: '',
                });
              },
              openLink: (snapshot, link) => {
                if (
                  rawSource(editor.state) !== snapshot ||
                  isBusy.current ||
                  draftRef.current ||
                  legacyPending.current ||
                  link.status !== 'resolved' ||
                  !link.targetId
                )
                  return;
                const current = latestLinks.current.find(
                  (item) =>
                    item.span.from === link.span.from &&
                    item.span.raw === link.span.raw &&
                    item.targetId === link.targetId &&
                    item.status === 'resolved',
                );
                if (current) navigate.current?.(link.targetId);
              },
            })
          : [],
      ),
      annotations: Transaction.addToHistory.of(false),
    });
    // Callbacks read current refs and the immutable editor instance.
  }, [live, path]);

  useEffect(() => {
    const editor = view.current;
    if (!live || !editor) return;
    let frame: number | null = null;
    let active = true;
    const schedule = () => {
      if (frame !== null) return;
      // Firefox can finish composition before CodeMirror has read its DOM
      // insertion. A passive React effect must not redraw that pending text.
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!active || view.current !== editor || editor.compositionStarted)
          return;
        editor.dispatch({
          effects: liveDataChanged.of(null),
          annotations: Transaction.addToHistory.of(false),
        });
      });
    };
    // No polling while an IME is active. Its end event resumes pending work.
    editor.contentDOM.addEventListener('compositionend', schedule);
    schedule();
    return () => {
      active = false;
      if (frame !== null) cancelAnimationFrame(frame);
      editor.contentDOM.removeEventListener('compositionend', schedule);
    };
  }, [wikilinks, live]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure(
        EditorState.readOnly.of(Boolean(draft)),
      ),
      annotations: Transaction.addToHistory.of(false),
    });
  }, [draft]);

  return (
    <div className="editor-pane">
      <div hidden={!visual}>
        <MarkdownEditor
          busy={busy || Boolean(draft)}
          onPendingChange={(value) => {
            legacyPending.current = value;
            pending.current?.(value || Boolean(draftRef.current));
          }}
          onShowSource={onShowSource}
          active={visual === true}
          source={source}
          apply={(snapshot, range, replacement) => {
            const editor = view.current;
            if (!editor || source !== snapshot) return false;
            const next = patchMarkdown(snapshot, range, replacement);
            if (next === null) return false;
            return applyRaw(editor, snapshot, next, {
              from: range.from,
              to: range.to,
              insert: next.slice(
                range.from,
                next.length - (snapshot.length - range.to),
              ),
            });
          }}
        />
      </div>
      <div hidden={visual}>
        <div className="pane-title">{live ? 'Live Preview' : 'Source'}</div>
        {live && (
          <p className="live-editor-hint">
            Move the cursor to reveal source. Click an equation to edit LaTeX.
          </p>
        )}
        <div className="source-editor" ref={element} />
      </div>
      {draft &&
        createPortal(
          <MathEditor
            draft={draft}
            onChange={(value) => setMathDraft({ ...draft, value, error: '' })}
            onCancel={() => {
              setMathDraft(null);
              view.current?.focus();
            }}
            onApply={() => {
              const editor = view.current;
              if (!editor) return;
              const planned = planMathReplacement(
                rawSource(editor.state),
                draft.source,
                draft.span,
                draft.value,
                path,
              );
              if (!planned.ok) {
                setMathDraft({ ...draft, error: planned.reason });
                return;
              }
              if (
                !applyRaw(editor, draft.source, planned.source, {
                  from: draft.span.innerFrom,
                  to: draft.span.innerTo,
                  insert: planned.replacement,
                })
              ) {
                setMathDraft({
                  ...draft,
                  error:
                    'The edit exceeds the document limit or the source changed. Your draft is preserved.',
                });
                return;
              }
              setMathDraft(null);
              editor.focus();
            }}
          />,
          document.body,
        )}
    </div>
  );
}
